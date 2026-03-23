import { supabase, isSupabaseConfigured } from './supabase';
import { convertToWebP, addWatermark } from './utils';

// ========================
// PROFILES
// ========================

// Profile cache (2 min TTL) to reduce DB requests
const profileCache = new Map<string, { profile: Profile; ts: number }>();
const CACHE_TTL = 2 * 60 * 1000;
function getCached(wallet: string): Profile | null {
  const entry = profileCache.get(wallet);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.profile;
  return null;
}
function setCache(p: Profile) { profileCache.set(p.wallet, { profile: p, ts: Date.now() }); }
export function invalidateProfileCache(wallet: string) { profileCache.delete(wallet); }

export interface Profile {
  wallet: string;
  avatar_url: string | null;
  twitter: string;
  telegram: string;
  youtube: string;
  ref_code: string | null;
  verified: boolean;
  verification_code: string | null;
  display_name: string | null;
  created_at: string;
}

export async function getProfile(wallet: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;
  const cached = getCached(wallet);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet', wallet)
      .maybeSingle();
    if (data) setCache(data as Profile);
    return data;
  } catch (e) { console.warn('getProfile:', e); return null; }
}

export async function getProfilesBatch(wallets: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  if (!isSupabaseConfigured || wallets.length === 0) return map;
  try {
    const unique = [...new Set(wallets)];
    // Return cached profiles, only fetch missing ones
    const missing: string[] = [];
    for (const w of unique) {
      const cached = getCached(w);
      if (cached) map.set(w, cached);
      else missing.push(w);
    }
    if (missing.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('wallet', missing);
      for (const p of data || []) {
        const prof = p as Profile;
        setCache(prof);
        map.set(prof.wallet, prof);
      }
    }
  } catch (e) { console.warn('getProfilesBatch:', e); }
  return map;
}

export async function upsertProfile(profile: Partial<Profile> & { wallet: string }) {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'wallet' });
    if (error) console.error('upsertProfile error:', error);
    invalidateProfileCache(profile.wallet);
  } catch (e) { console.warn('upsertProfile:', e); }
}

// Generate and store a verification code for Twitter bio check
export async function getOrCreateVerificationCode(wallet: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    // Check if code already exists
    const { data } = await supabase
      .from('profiles')
      .select('verification_code')
      .eq('wallet', wallet)
      .maybeSingle();
    if (data?.verification_code) return data.verification_code;

    // Generate new code
    const code = 'SOLIA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase
      .from('profiles')
      .update({ verification_code: code })
      .eq('wallet', wallet);
    return code;
  } catch { return null; }
}

// Mark profile as verified and store display name
export async function markProfileVerified(wallet: string, displayName: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ verified: true, display_name: displayName })
      .eq('wallet', wallet);
    return !error;
  } catch { return false; }
}

// Update display name from Twitter
export async function updateDisplayName(wallet: string, displayName: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('wallet', wallet);
  } catch {}
}

// ========================
// RATE LIMITING (Gemini API protection)
// ========================

const DAILY_GEN_LIMIT = 50; // max generations per user per day
const GEN_COOLDOWN_MS = 15_000; // 15 seconds between generations

// In-memory cooldown map (per browser session)
const lastGenTime = new Map<string, number>();

export async function checkGenerationLimit(wallet: string): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  // Check cooldown
  const lastTime = lastGenTime.get(wallet) || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < GEN_COOLDOWN_MS) {
    const waitSec = Math.ceil((GEN_COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, reason: `Please wait ${waitSec}s before generating again` };
  }

  if (!isSupabaseConfigured) return { allowed: true, remaining: DAILY_GEN_LIMIT };

  try {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author', wallet)
      .gte('created_at', `${today}T00:00:00Z`);

    const used = count || 0;
    if (used >= DAILY_GEN_LIMIT) {
      return { allowed: false, reason: `Daily limit reached (${DAILY_GEN_LIMIT} generations). Try again tomorrow.`, remaining: 0 };
    }
    return { allowed: true, remaining: DAILY_GEN_LIMIT - used };
  } catch {
    return { allowed: true, remaining: DAILY_GEN_LIMIT };
  }
}

export function markGenerationUsed(wallet: string) {
  lastGenTime.set(wallet, Date.now());
}

// ========================
// POSTS
// ========================

export interface DbPost {
  id: string;
  author: string;
  image_url: string;
  original_url?: string;
  prompt: string;
  category: string;
  aspect_ratio: string;
  likes_count: number;
  created_at: string;
}

// Feed cache (3 min TTL) to reduce DB requests
const feedCache = new Map<string, { data: DbPost[]; ts: number }>();
const FEED_CACHE_TTL = 3 * 60 * 1000;

// Hot score: likes decay over time so posts rotate naturally
function hotScore(post: DbPost): number {
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3_600_000;
  return (post.likes_count + 1) / Math.pow(ageHours + 2, 1.5);
}

// Trend score: wider window, engagement-weighted, slower decay
function trendScore(post: DbPost): number {
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3_600_000;
  return (post.likes_count + 1) / Math.pow(ageHours + 4, 1.1);
}

export async function getPosts(options: {
  sort: 'new' | 'hot' | 'trends';
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<DbPost[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { sort, category, limit = 20, offset = 0 } = options;

    // For new: simple DB sort with pagination
    if (sort === 'new') {
      const cacheKey = `new:${category || 'all'}:${offset}:${limit}`;
      const cached = feedCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < FEED_CACHE_TTL) return cached.data;

      let query = supabase.from('posts').select('*');
      if (category && category !== 'Main') query = query.eq('category', category);
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      const { data } = await query;
      const result = data || [];
      feedCache.set(cacheKey, { data: result, ts: Date.now() });
      return result;
    }

    // For hot/trends: fetch wider window, score & sort client-side, then paginate
    const windowHours = sort === 'hot' ? 6 : 24;
    const scoreFn = sort === 'hot' ? hotScore : trendScore;
    const poolKey = `${sort}:${category || 'all'}:pool`;

    let pool: DbPost[];
    const cachedPool = feedCache.get(poolKey);
    if (cachedPool && Date.now() - cachedPool.ts < FEED_CACHE_TTL) {
      pool = cachedPool.data;
    } else {
      const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
      let query = supabase.from('posts').select('*').gte('created_at', since);
      if (category && category !== 'Main') query = query.eq('category', category);
      // Fetch up to 200 posts for scoring pool (single request)
      query = query.order('likes_count', { ascending: false }).range(0, 199);
      const { data } = await query;
      pool = data || [];
      feedCache.set(poolKey, { data: pool, ts: Date.now() });
    }

    // Score, sort, and paginate client-side
    const scored = pool.map((p) => ({ post: p, score: scoreFn(p) }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(offset, offset + limit).map((s) => s.post);
  } catch (e) { console.warn('getPosts:', e); return []; }
}

export async function getUserPosts(wallet: string): Promise<DbPost[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('author', wallet)
      .order('created_at', { ascending: false });
    return data || [];
  } catch (e) { console.warn('getUserPosts:', e); return []; }
}

export async function createPost(post: {
  author: string;
  image_url: string;
  original_url?: string;
  prompt: string;
  category: string;
  aspect_ratio: string;
}): Promise<DbPost | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert(post)
      .select()
      .single();
    if (error) console.error('createPost error:', error);
    return data;
  } catch (e) { console.warn('createPost:', e); return null; }
}

// ========================
// LIKES
// ========================

export async function hasUserLikedPost(wallet: string, postId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('user_wallet', wallet)
      .eq('post_id', postId)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function getUserLikedPostIds(wallet: string): Promise<Set<string>> {
  if (!isSupabaseConfigured) return new Set();
  try {
    const { data } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_wallet', wallet);
    return new Set((data || []).map((l: { post_id: string }) => l.post_id));
  } catch { return new Set(); }
}

export async function likePost(wallet: string, postId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('likes')
      .insert({ user_wallet: wallet, post_id: postId });
    return !error;
  } catch { return false; }
}

export async function unlikePost(wallet: string, postId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_wallet', wallet)
      .eq('post_id', postId);
    return !error;
  } catch { return false; }
}

// ========================
// DAILY LIKES (Bot Protection)
// ========================

const BASE_DAILY_LIKES = 2;

export async function getDailyLikes(wallet: string): Promise<{ used: number; bonus: number; remaining: number }> {
  if (!isSupabaseConfigured) return { used: 0, bonus: 0, remaining: BASE_DAILY_LIKES };
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_likes')
      .select('*')
      .eq('user_wallet', wallet)
      .eq('date', today)
      .maybeSingle();

    if (!data) {
      return { used: 0, bonus: 0, remaining: BASE_DAILY_LIKES };
    }
    const total = BASE_DAILY_LIKES + (data.bonus_count || 0);
    const remaining = Math.max(0, total - (data.used_count || 0));
    return { used: data.used_count || 0, bonus: data.bonus_count || 0, remaining };
  } catch { return { used: 0, bonus: 0, remaining: BASE_DAILY_LIKES }; }
}

export async function consumeDailyLike(wallet: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('daily_likes')
      .select('*')
      .eq('user_wallet', wallet)
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase
        .from('daily_likes')
        .insert({ user_wallet: wallet, date: today, used_count: 1, bonus_count: 0 });
      return !error;
    }

    const total = BASE_DAILY_LIKES + (existing.bonus_count || 0);
    if (existing.used_count >= total) return false;

    const { error } = await supabase
      .from('daily_likes')
      .update({ used_count: existing.used_count + 1 })
      .eq('user_wallet', wallet)
      .eq('date', today);
    return !error;
  } catch { return false; }
}

export async function refundDailyLike(wallet: string) {
  if (!isSupabaseConfigured) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('daily_likes')
      .select('*')
      .eq('user_wallet', wallet)
      .eq('date', today)
      .maybeSingle();

    if (existing && existing.used_count > 0) {
      await supabase
        .from('daily_likes')
        .update({ used_count: existing.used_count - 1 })
        .eq('user_wallet', wallet)
        .eq('date', today);
    }
  } catch (e) { console.warn('refundDailyLike:', e); }
}

export async function grantBonusLikes(wallet: string, bonus: number = 10) {
  if (!isSupabaseConfigured) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('daily_likes')
      .select('*')
      .eq('user_wallet', wallet)
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from('daily_likes')
        .insert({ user_wallet: wallet, date: today, used_count: 0, bonus_count: bonus });
    } else {
      await supabase
        .from('daily_likes')
        .update({ bonus_count: (existing.bonus_count || 0) + bonus })
        .eq('user_wallet', wallet)
        .eq('date', today);
    }
  } catch (e) { console.warn('grantBonusLikes:', e); }
}

// ========================
// COMMENTS
// ========================

export interface DbComment {
  id: string;
  user_wallet: string;
  post_id: string;
  text: string;
  created_at: string;
}

export async function getComments(postId: string): Promise<DbComment[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    return data || [];
  } catch { return []; }
}

export async function addComment(wallet: string, postId: string, text: string): Promise<DbComment | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({ user_wallet: wallet, post_id: postId, text })
      .select()
      .single();
    if (error) console.error('addComment error:', error);
    return data;
  } catch { return null; }
}

// ========================
// PURCHASES
// ========================

export async function hasUserPurchasedPost(wallet: string, postId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data } = await supabase
      .from('purchases')
      .select('id')
      .eq('buyer_wallet', wallet)
      .eq('post_id', postId)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function getUserPurchasedPostIds(wallet: string): Promise<Set<string>> {
  if (!isSupabaseConfigured) return new Set();
  try {
    const { data } = await supabase
      .from('purchases')
      .select('post_id')
      .eq('buyer_wallet', wallet);
    return new Set((data || []).map((p: { post_id: string }) => p.post_id));
  } catch { return new Set(); }
}

export async function purchasePost(wallet: string, postId: string, txSignature: string = ''): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('purchases')
      .insert({ buyer_wallet: wallet, post_id: postId, tx_signature: txSignature });
    if (error) { console.warn('purchasePost error:', error); return false; }
    return true;
  } catch (e) { console.warn('purchasePost:', e); return false; }
}

export async function getPurchasedPosts(wallet: string): Promise<DbPost[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data: purchases, error: purchErr } = await supabase
      .from('purchases')
      .select('post_id')
      .eq('buyer_wallet', wallet)
      .order('created_at', { ascending: false });

    if (purchErr) { console.warn('getPurchasedPosts purchases query:', purchErr); return []; }
    if (!purchases || purchases.length === 0) return [];

    const postIds = purchases.map((p: { post_id: string }) => p.post_id);
    const { data: posts, error: postsErr } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (postsErr) { console.warn('getPurchasedPosts posts query:', postsErr); return []; }
    return posts || [];
  } catch (e) { console.warn('getPurchasedPosts:', e); return []; }
}

// ========================
// FOLLOWS
// ========================

export async function getFollowers(wallet: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('follows')
      .select('follower_wallet')
      .eq('following_wallet', wallet);
    return (data || []).map((f: { follower_wallet: string }) => f.follower_wallet);
  } catch { return []; }
}

export async function getFollowing(wallet: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('follows')
      .select('following_wallet')
      .eq('follower_wallet', wallet);
    return (data || []).map((f: { following_wallet: string }) => f.following_wallet);
  } catch { return []; }
}

export async function followUser(follower: string, following: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_wallet: follower, following_wallet: following });
    return !error;
  } catch { return false; }
}

export async function unfollowUser(follower: string, following: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_wallet', follower)
      .eq('following_wallet', following);
    return !error;
  } catch { return false; }
}

// ========================
// LEADERBOARD
// ========================

export async function getLeaderboard(): Promise<{ wallet: string; generations: number; total_likes: number; avatar_url: string | null; twitter: string; verified: boolean; display_name: string | null }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('posts')
      .select('author, likes_count');

    if (!data) return [];

    const map = new Map<string, { generations: number; total_likes: number }>();
    for (const p of data) {
      const existing = map.get(p.author) || { generations: 0, total_likes: 0 };
      existing.generations += 1;
      existing.total_likes += p.likes_count || 0;
      map.set(p.author, existing);
    }

    const top = Array.from(map.entries())
      .map(([wallet, stats]) => ({ wallet, ...stats }))
      .sort((a, b) => b.generations - a.generations)
      .slice(0, 20);

    // Fetch avatars for leaderboard users
    const wallets = top.map((t) => t.wallet);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('wallet, avatar_url, twitter, verified, display_name')
      .in('wallet', wallets);

    const profileMap = new Map<string, { avatar_url: string | null; twitter: string; verified: boolean; display_name: string | null }>();
    for (const p of profiles || []) {
      profileMap.set(p.wallet, { avatar_url: p.avatar_url, twitter: p.twitter || '', verified: !!p.verified, display_name: p.display_name || null });
    }

    return top.map((t) => ({
      ...t,
      avatar_url: profileMap.get(t.wallet)?.avatar_url || null,
      twitter: profileMap.get(t.wallet)?.twitter || '',
      verified: profileMap.get(t.wallet)?.verified || false,
      display_name: profileMap.get(t.wallet)?.display_name || null,
    }));
  } catch { return []; }
}

// ========================
// TOP GENERATORS (12h)
// ========================

export async function getTopGenerators12h(): Promise<{ wallet: string; count: number; avatar_url: string | null; twitter: string; verified: boolean; display_name: string | null }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('posts')
      .select('author')
      .gte('created_at', twelveHoursAgo);

    if (!data || data.length === 0) return [];

    const map = new Map<string, number>();
    for (const p of data) {
      map.set(p.author, (map.get(p.author) || 0) + 1);
    }

    const top = Array.from(map.entries())
      .map(([wallet, count]) => ({ wallet, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Fetch avatars for top creators
    const wallets = top.map((t) => t.wallet);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('wallet, avatar_url, twitter, verified, display_name')
      .in('wallet', wallets);

    const profileMap = new Map<string, { avatar_url: string | null; twitter: string; verified: boolean; display_name: string | null }>();
    for (const p of profiles || []) {
      profileMap.set(p.wallet, { avatar_url: p.avatar_url, twitter: p.twitter || '', verified: !!p.verified, display_name: p.display_name || null });
    }

    return top.map((t) => ({
      ...t,
      avatar_url: profileMap.get(t.wallet)?.avatar_url || null,
      twitter: profileMap.get(t.wallet)?.twitter || '',
      verified: profileMap.get(t.wallet)?.verified || false,
      display_name: profileMap.get(t.wallet)?.display_name || null,
    }));
  } catch { return []; }
}

// ========================
// REFERRALS
// ========================

function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function getOrCreateRefCode(wallet: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('ref_code')
      .eq('wallet', wallet)
      .maybeSingle();
    if (profile?.ref_code) return profile.ref_code;

    // Generate a unique code
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRefCode();
      const { error } = await supabase
        .from('profiles')
        .upsert({ wallet, ref_code: code }, { onConflict: 'wallet' });
      if (!error) return code;
    }
    return null;
  } catch { return null; }
}

export async function resolveRefCode(code: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('wallet')
      .eq('ref_code', code)
      .maybeSingle();
    return data?.wallet || null;
  } catch { return null; }
}

export async function saveReferral(referrerWallet: string, referredWallet: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('referrals')
      .insert({ referrer_wallet: referrerWallet, referred_wallet: referredWallet });
    if (error && error.code !== '23505') { console.error('saveReferral:', error); return false; }
    // Grant 5 bonus likes to referrer per invited user (skip for system/treasury referrer)
    const TREASURY = 'GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA';
    if (referrerWallet !== TREASURY) {
      await grantBonusLikes(referrerWallet, 5);
    }
    return true;
  } catch { return false; }
}

export async function getReferrer(wallet: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('referrals')
      .select('referrer_wallet')
      .eq('referred_wallet', wallet)
      .maybeSingle();
    return data?.referrer_wallet || null;
  } catch { return null; }
}

export interface ReferralEntry {
  wallet: string;
  created_at: string;
  is_creator: boolean;
}

export async function getReferrals(
  referrerWallet: string,
  filter: 'all' | 'user' | 'creator',
  page: number,
  pageSize = 10,
): Promise<{ items: ReferralEntry[]; total: number; totalAll: number; totalUsers: number; totalCreators: number }> {
  if (!isSupabaseConfigured) return { items: [], total: 0, totalAll: 0, totalUsers: 0, totalCreators: 0 };
  try {
    // Get all referrals for this referrer
    const { data: refs } = await supabase
      .from('referrals')
      .select('referred_wallet, created_at')
      .eq('referrer_wallet', referrerWallet)
      .order('created_at', { ascending: false });

    if (!refs || refs.length === 0) return { items: [], total: 0, totalAll: 0, totalUsers: 0, totalCreators: 0 };

    // Get wallets that have at least one post (= creators)
    const wallets = refs.map((r) => r.referred_wallet);
    const { data: creatorPosts } = await supabase
      .from('posts')
      .select('author')
      .in('author', wallets);

    const creatorSet = new Set((creatorPosts || []).map((p) => p.author));

    const allEntries: ReferralEntry[] = refs.map((r) => ({
      wallet: r.referred_wallet,
      created_at: r.created_at,
      is_creator: creatorSet.has(r.referred_wallet),
    }));

    const totalAll = allEntries.length;
    const totalCreators = allEntries.filter((e) => e.is_creator).length;
    const totalUsers = totalAll - totalCreators;

    let entries = allEntries;
    if (filter === 'creator') entries = entries.filter((e) => e.is_creator);
    if (filter === 'user') entries = entries.filter((e) => !e.is_creator);

    const total = entries.length;
    const items = entries.slice(page * pageSize, (page + 1) * pageSize);
    return { items, total, totalAll, totalUsers, totalCreators };
  } catch { return { items: [], total: 0, totalAll: 0, totalUsers: 0, totalCreators: 0 }; }
}

export async function getTopReferrersCreators(): Promise<{ wallet: string; creator_count: number }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data: refs } = await supabase
      .from('referrals')
      .select('referrer_wallet, referred_wallet');

    if (!refs || refs.length === 0) return [];

    // Find which referred wallets are creators
    const allReferred = refs.map((r) => r.referred_wallet);
    const { data: creatorPosts } = await supabase
      .from('posts')
      .select('author')
      .in('author', allReferred);

    const creatorSet = new Set((creatorPosts || []).map((p) => p.author));

    // Count creator referrals per referrer
    const map = new Map<string, number>();
    for (const r of refs) {
      if (creatorSet.has(r.referred_wallet)) {
        map.set(r.referrer_wallet, (map.get(r.referrer_wallet) || 0) + 1);
      }
    }

    return Array.from(map.entries())
      .map(([wallet, creator_count]) => ({ wallet, creator_count }))
      .sort((a, b) => b.creator_count - a.creator_count)
      .slice(0, 20);
  } catch { return []; }
}

// ========================
// IMAGE UPLOAD (Supabase Storage)
// ========================

export async function uploadImage(file: Blob, fileName: string): Promise<{ publicUrl: string; originalUrl: string } | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const timestamp = Date.now();
    const baseName = fileName.replace(/\.[^.]+$/, '');
    
    // Upload watermarked version (public)
    const watermarkedBlob = await addWatermark(file);
    const webpWatermarked = await convertToWebP(watermarkedBlob, 0.65);
    const ext = webpWatermarked.type === 'image/webp' ? '.webp' : '.png';
    const publicPath = `posts/${timestamp}_${baseName}${ext}`;
    const { error: publicError } = await supabase.storage
      .from('images')
      .upload(publicPath, webpWatermarked, { contentType: webpWatermarked.type, cacheControl: '3600' });

    if (publicError) {
      console.error('Upload error (public):', publicError);
      return null;
    }

    // Upload original version (for owners)
    const webpOriginal = await convertToWebP(file, 0.65);
    const originalPath = `posts/${timestamp}_${baseName}_original${ext}`;
    const { error: originalError } = await supabase.storage
      .from('images')
      .upload(originalPath, webpOriginal, { contentType: webpOriginal.type, cacheControl: '3600' });

    if (originalError) {
      console.warn('Upload error (original):', originalError);
    }

    const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(publicPath);
    const { data: originalUrlData } = supabase.storage.from('images').getPublicUrl(originalPath);

    return {
      publicUrl: publicUrlData.publicUrl,
      originalUrl: originalError ? publicUrlData.publicUrl : originalUrlData.publicUrl,
    };
  } catch (e) { console.warn('uploadImage:', e); return null; }
}

export async function uploadAvatar(wallet: string, file: Blob): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const webpBlob = await convertToWebP(file, 0.85);
    const ext = webpBlob.type === 'image/webp' ? '.webp' : '.png';
    const path = `avatars/${wallet}_${Date.now()}${ext}`;
    const { error } = await supabase.storage
      .from('images')
      .upload(path, webpBlob, { contentType: webpBlob.type, cacheControl: '3600', upsert: true });

    if (error) {
      console.error('Avatar upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(path);

    return urlData.publicUrl;
  } catch (e) { console.warn('uploadAvatar:', e); return null; }
}

// ========================
// TRANSACTION HISTORY
// ========================

export interface TransactionRecord {
  signature: string;
  from_wallet: string;
  type: 'generation' | 'purchase';
  total_amount: number;
  treasury_amount: number;
  creator_wallet?: string;
  creator_amount?: number;
  referrer_wallet?: string;
  referrer_amount?: number;
  post_id?: string;
}

export interface TransactionHistoryEntry {
  id: string;
  signature: string;
  from_wallet: string;
  type: string;
  total_amount: number;
  treasury_amount: number;
  creator_wallet: string | null;
  creator_amount: number | null;
  referrer_wallet: string | null;
  referrer_amount: number | null;
  post_id: string | null;
  created_at: string;
}

// ========================
// ANALYTICS / STATS
// ========================

export type StatsPeriod = 'day' | 'week' | 'month' | 'all';

export interface PlatformStats {
  totalSkrVolume: number;
  creatorEarnings: number;
  imagesGenerated: number;
  activeWallets: number;
  totalPurchases: number;
  verifiedCreators: number;
  totalLikes: number;
  totalComments: number;
  topCategory: string;
  topByFollowers: { wallet: string; count: number; display_name: string | null; twitter: string; verified: boolean; avatar_url: string | null }[];
}

// Stats cache (5 min TTL)
const statsCache = new Map<string, { stats: PlatformStats; ts: number }>();
const STATS_CACHE_TTL = 5 * 60 * 1000;

function getPeriodDate(period: StatsPeriod): string | null {
  if (period === 'all') return null;
  const ms = period === 'day' ? 24 * 60 * 60 * 1000
    : period === 'week' ? 7 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export async function getStats(period: StatsPeriod = 'all'): Promise<PlatformStats> {
  const empty: PlatformStats = { totalSkrVolume: 0, creatorEarnings: 0, imagesGenerated: 0, activeWallets: 0, totalPurchases: 0, verifiedCreators: 0, totalLikes: 0, totalComments: 0, topCategory: '—', topByFollowers: [] };
  if (!isSupabaseConfigured) return empty;

  const cached = statsCache.get(period);
  if (cached && Date.now() - cached.ts < STATS_CACHE_TTL) return cached.stats;

  try {
    const since = getPeriodDate(period);

    // Run all queries in parallel
    let txQuery = supabase.from('transactions').select('total_amount, creator_amount');
    let postsQuery = supabase.from('posts').select('author, category');
    let purchasesQuery = supabase.from('purchases').select('id', { count: 'exact', head: true });
    let likesQuery = supabase.from('likes').select('id', { count: 'exact', head: true });
    let commentsQuery = supabase.from('comments').select('id', { count: 'exact', head: true });

    if (since) {
      txQuery = txQuery.gte('created_at', since);
      postsQuery = postsQuery.gte('created_at', since);
      purchasesQuery = purchasesQuery.gte('created_at', since);
      likesQuery = likesQuery.gte('created_at', since);
      commentsQuery = commentsQuery.gte('created_at', since);
    }

    const [txRes, postsRes, purchasesRes, likesRes, commentsRes, verifiedRes, followsRes] = await Promise.all([
      txQuery,
      postsQuery,
      purchasesQuery,
      likesQuery,
      commentsQuery,
      supabase.from('profiles').select('wallet', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('follows').select('following_wallet'),
    ]);

    // SKR volume & creator earnings
    let totalSkrVolume = 0;
    let creatorEarnings = 0;
    for (const tx of txRes.data || []) {
      totalSkrVolume += tx.total_amount || 0;
      creatorEarnings += tx.creator_amount || 0;
    }

    // Images & active wallets & top category
    const posts = postsRes.data || [];
    const walletSet = new Set<string>();
    const catCount = new Map<string, number>();
    for (const p of posts) {
      walletSet.add(p.author);
      const cat = p.category || 'Main';
      catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }
    let topCategory = '—';
    let maxCatCount = 0;
    catCount.forEach((count, cat) => { if (count > maxCatCount) { maxCatCount = count; topCategory = cat; } });

    // Top by followers (top 10) - fill with top generators if < 10
    const follows = followsRes.data || [];
    const followerCount = new Map<string, number>();
    for (const f of follows) {
      followerCount.set(f.following_wallet, (followerCount.get(f.following_wallet) || 0) + 1);
    }
    let topFollowerWallets = Array.from(followerCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // If < 10 followers, fill with top generators
    if (topFollowerWallets.length < 10) {
      const generatorCount = new Map<string, number>();
      for (const p of posts) {
        generatorCount.set(p.author, (generatorCount.get(p.author) || 0) + 1);
      }
      const topGenerators = Array.from(generatorCount.entries())
        .filter(([w]) => !followerCount.has(w)) // exclude already in followers
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10 - topFollowerWallets.length);
      topFollowerWallets = [...topFollowerWallets, ...topGenerators];
    }

    const topFollowerProfiles = topFollowerWallets.length > 0
      ? await getProfilesBatch(topFollowerWallets.map(([w]) => w))
      : new Map<string, Profile>();
    const topFollowers: PlatformStats['topByFollowers'] = topFollowerWallets.map(([wallet, count]) => {
      const profile = topFollowerProfiles.get(wallet);
      return {
        wallet,
        count,
        display_name: profile?.display_name || null,
        twitter: profile?.twitter || '',
        verified: !!profile?.verified,
        avatar_url: profile?.avatar_url || null,
      };
    });

    const stats: PlatformStats = {
      totalSkrVolume: Math.round(totalSkrVolume * 100) / 100,
      creatorEarnings: Math.round(creatorEarnings * 100) / 100,
      imagesGenerated: posts.length,
      activeWallets: walletSet.size,
      totalPurchases: purchasesRes.count || 0,
      verifiedCreators: verifiedRes.count || 0,
      totalLikes: likesRes.count || 0,
      totalComments: commentsRes.count || 0,
      topCategory,
      topByFollowers: topFollowers,
    };

    statsCache.set(period, { stats, ts: Date.now() });
    return stats;
  } catch (e) { console.warn('getStats:', e); return empty; }
}

export async function recordTransaction(record: TransactionRecord): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('transactions')
      .insert({
        signature: record.signature,
        from_wallet: record.from_wallet,
        type: record.type,
        total_amount: record.total_amount,
        treasury_amount: record.treasury_amount,
        creator_wallet: record.creator_wallet || null,
        creator_amount: record.creator_amount || null,
        referrer_wallet: record.referrer_wallet || null,
        referrer_amount: record.referrer_amount || null,
        post_id: record.post_id || null,
      });
    if (error) { console.warn('recordTransaction:', error); return false; }
    return true;
  } catch { return false; }
}

export async function getTransactionHistory(
  wallet: string,
  limit = 20,
  offset = 0,
): Promise<{ items: TransactionHistoryEntry[]; total: number }> {
  if (!isSupabaseConfigured) return { items: [], total: 0 };
  try {
    // Get transactions where user is sender, creator, or referrer
    const { data, count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .or(`from_wallet.eq.${wallet},creator_wallet.eq.${wallet},referrer_wallet.eq.${wallet}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) { console.warn('getTransactionHistory:', error); return { items: [], total: 0 }; }
    return { items: (data || []) as TransactionHistoryEntry[], total: count || 0 };
  } catch (e) { console.warn('getTransactionHistory:', e); return { items: [], total: 0 }; }
}
