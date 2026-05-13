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
  discord: string;
  ref_code: string | null;
  verified: boolean;
  verified_org: boolean;
  verification_code: string | null;
  display_name: string | null;
  post_count?: number;
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

export async function getPostCountsBatch(wallets: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isSupabaseConfigured || wallets.length === 0) return result;
  try {
    const unique = [...new Set(wallets)];
    const { data } = await supabase
      .from('posts')
      .select('author')
      .in('author', unique);
    if (data) {
      for (const row of data) {
        result.set(row.author, (result.get(row.author) || 0) + 1);
      }
    }
  } catch {}
  return result;
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

export async function setVerificationBadge(
  adminWallet: string,
  targetWallet: string,
  type: 'none' | 'blue' | 'gold'
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const TREASURY = 'GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA';
  if (adminWallet !== TREASURY) return false;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        verified: type === 'blue' || type === 'gold',
        verified_org: type === 'gold',
      })
      .eq('wallet', targetWallet);
    invalidateProfileCache(targetWallet);
    return !error;
  } catch { return false; }
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
// RATE LIMITING (API protection)
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
// FREE GENERATION CREDITS (admin-granted)
// ========================

export async function getFreeGenerations(wallet: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const { data } = await supabase
      .from('free_generations')
      .select('credits')
      .eq('wallet', wallet)
      .single();
    return data?.credits || 0;
  } catch { return 0; }
}

export async function grantFreeGenerations(wallet: string, count: number): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const current = await getFreeGenerations(wallet);
    if (current > 0) {
      const { error } = await supabase
        .from('free_generations')
        .update({ credits: current + count })
        .eq('wallet', wallet);
      return !error;
    } else {
      const { error } = await supabase
        .from('free_generations')
        .insert({ wallet, credits: count });
      return !error;
    }
  } catch { return false; }
}

export async function consumeFreeGeneration(wallet: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const current = await getFreeGenerations(wallet);
    if (current <= 0) return false;
    if (current === 1) {
      await supabase.from('free_generations').delete().eq('wallet', wallet);
    } else {
      await supabase.from('free_generations').update({ credits: current - 1 }).eq('wallet', wallet);
    }
    return true;
  } catch { return false; }
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
export function invalidateFeedCache() { feedCache.clear(); }

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

export async function getPostById(id: string): Promise<DbPost | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  } catch (e) { console.warn('getPostById:', e); return null; }
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
// DRAFTS
// ========================

export interface DbDraft {
  id: string;
  author: string;
  image_url: string;
  original_url: string | null;
  prompt: string;
  category: string;
  aspect_ratio: string;
  created_at: string;
}

export async function createDraft(draft: {
  author: string;
  image_url: string;
  original_url?: string;
  prompt: string;
  category: string;
  aspect_ratio: string;
}): Promise<DbDraft | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('drafts')
      .insert(draft)
      .select()
      .single();
    if (error) console.error('createDraft error:', error);
    return data;
  } catch (e) { console.warn('createDraft:', e); return null; }
}

export async function getDrafts(wallet: string): Promise<DbDraft[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('drafts')
      .select('*')
      .eq('author', wallet)
      .order('created_at', { ascending: false });
    return data || [];
  } catch (e) { console.warn('getDrafts:', e); return []; }
}

export async function getAllDrafts(): Promise<DbDraft[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('drafts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 49);
    return data || [];
  } catch (e) { console.warn('getAllDrafts:', e); return []; }
}

export async function deleteDraft(draftId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from('drafts').delete().eq('id', draftId);
    return !error;
  } catch { return false; }
}

export async function publishDraft(draft: DbDraft): Promise<DbPost | null> {
  const post = await createPost({
    author: draft.author,
    image_url: draft.image_url,
    original_url: draft.original_url || undefined,
    prompt: draft.prompt,
    category: draft.category,
    aspect_ratio: draft.aspect_ratio,
  });
  if (post) {
    await deleteDraft(draft.id);
    invalidateFeedCache();
  }
  return post;
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
    const { data } = await supabase
      .from('daily_likes')
      .select('bonus_count, used_count')
      .eq('user_wallet', wallet);

    if (!data || data.length === 0) {
      return { used: 0, bonus: 0, remaining: BASE_DAILY_LIKES };
    }
    let totalBonus = 0;
    let totalUsed = 0;
    for (const row of data) {
      totalBonus += row.bonus_count || 0;
      totalUsed += row.used_count || 0;
    }
    const remaining = Math.max(0, BASE_DAILY_LIKES + totalBonus - totalUsed);
    return { used: totalUsed, bonus: totalBonus, remaining };
  } catch { return { used: 0, bonus: 0, remaining: BASE_DAILY_LIKES }; }
}

export async function consumeDailyLike(wallet: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check global remaining across all days
    const { data: allRows } = await supabase
      .from('daily_likes')
      .select('bonus_count, used_count')
      .eq('user_wallet', wallet);

    let totalBonus = 0;
    let totalUsed = 0;
    for (const row of allRows || []) {
      totalBonus += row.bonus_count || 0;
      totalUsed += row.used_count || 0;
    }
    if (totalUsed >= BASE_DAILY_LIKES + totalBonus) return false;

    // Increment today's used_count (create record if needed)
    const { data: existing } = await supabase
      .from('daily_likes')
      .select('used_count')
      .eq('user_wallet', wallet)
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase
        .from('daily_likes')
        .insert({ user_wallet: wallet, date: today, used_count: 1, bonus_count: 0 });
      return !error;
    }

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
  parent_id?: string | null;
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

export async function getCommentCount(postId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);
    return count || 0;
  } catch { return 0; }
}

export async function getCommentCountsBatch(postIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isSupabaseConfigured || postIds.length === 0) return result;
  try {
    const { data } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds);
    if (data) {
      for (const row of data) {
        result.set(row.post_id, (result.get(row.post_id) || 0) + 1);
      }
    }
  } catch {}
  return result;
}

export async function addComment(wallet: string, postId: string, text: string, parentId?: string | null): Promise<DbComment | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert({ user_wallet: wallet, post_id: postId, text, ...(parentId ? { parent_id: parentId } : {}) })
      .select()
      .single();
    if (error) console.error('addComment error:', error);
    return data;
  } catch { return null; }
}

export async function toggleCommentLike(commentId: string, wallet: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('wallet', wallet)
      .maybeSingle();
    if (existing) {
      await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('wallet', wallet);
      return false;
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, wallet });
      return true;
    }
  } catch { return false; }
}

export async function getCommentLikesBatch(commentIds: string[], myWallet?: string): Promise<Map<string, { count: number; liked: boolean }>> {
  const result = new Map<string, { count: number; liked: boolean }>();
  if (!isSupabaseConfigured || commentIds.length === 0) return result;
  try {
    const { data } = await supabase
      .from('comment_likes')
      .select('comment_id, wallet')
      .in('comment_id', commentIds);
    if (data) {
      for (const row of data) {
        const cur = result.get(row.comment_id) || { count: 0, liked: false };
        cur.count++;
        if (myWallet && row.wallet === myWallet) cur.liked = true;
        result.set(row.comment_id, cur);
      }
    }
  } catch {}
  return result;
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

export async function getTopPurchasers(limit = 50): Promise<{ wallet: string; purchase_count: number }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data } = await supabase
      .from('purchases')
      .select('buyer_wallet');
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const row of data) counts.set(row.buyer_wallet, (counts.get(row.buyer_wallet) || 0) + 1);
    return Array.from(counts.entries())
      .map(([wallet, purchase_count]) => ({ wallet, purchase_count }))
      .sort((a, b) => b.purchase_count - a.purchase_count)
      .slice(0, limit);
  } catch { return []; }
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

export async function getTopByFollowers(limit = 50): Promise<{ wallet: string; follower_count: number }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    // Fetch all follows and count followers per wallet
    let allFollows: { following_wallet: string }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from('follows')
        .select('following_wallet')
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allFollows = allFollows.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const counts = new Map<string, number>();
    for (const f of allFollows) {
      counts.set(f.following_wallet, (counts.get(f.following_wallet) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([wallet, follower_count]) => ({ wallet, follower_count }));
  } catch (e) { console.warn('getTopByFollowers:', e); return []; }
}

// ========================
// LEADERBOARD
// ========================

export async function getLeaderboard(periodHours?: number): Promise<{ wallet: string; generations: number; total_likes: number; avatar_url: string | null; twitter: string; telegram: string; youtube: string; verified: boolean; verified_org: boolean; display_name: string | null }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    // Fetch all verified profiles
    const { data: verifiedProfiles } = await supabase
      .from('profiles')
      .select('wallet, avatar_url, twitter, telegram, youtube, verified, verified_org, display_name')
      .eq('verified', true);

    // Fetch all posts (paginated)
    let allPosts: { author: string; likes_count: number }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      let query = supabase.from('posts').select('author, likes_count');
      if (periodHours) {
        const since = new Date(Date.now() - periodHours * 3_600_000).toISOString();
        query = query.gte('created_at', since);
      }
      const { data } = await query.range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allPosts = allPosts.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const statsMap = new Map<string, { generations: number; total_likes: number }>();
    for (const p of allPosts) {
      const existing = statsMap.get(p.author) || { generations: 0, total_likes: 0 };
      existing.generations += 1;
      existing.total_likes += p.likes_count || 0;
      statsMap.set(p.author, existing);
    }

    // Non-verified authors from posts (not in verified list)
    const verifiedWallets = new Set((verifiedProfiles || []).map(p => p.wallet));
    const nonVerifiedEntries = Array.from(statsMap.entries())
      .filter(([wallet]) => !verifiedWallets.has(wallet))
      .map(([wallet, stats]) => ({ wallet, ...stats, avatar_url: null, twitter: '', telegram: '', youtube: '', verified: false, verified_org: false, display_name: null }));

    // Fetch profiles for non-verified authors
    const nonVerifiedWallets = nonVerifiedEntries.map(e => e.wallet);
    if (nonVerifiedWallets.length > 0) {
      const { data: nvProfiles } = await supabase
        .from('profiles')
        .select('wallet, avatar_url, twitter, telegram, youtube, display_name')
        .in('wallet', nonVerifiedWallets);
      if (nvProfiles) {
        const nvMap = new Map(nvProfiles.map(p => [p.wallet, p]));
        nonVerifiedEntries.forEach(e => {
          const p = nvMap.get(e.wallet);
          if (p) {
            e.avatar_url = p.avatar_url || null;
            e.twitter = p.twitter || '';
            e.telegram = p.telegram || '';
            e.youtube = p.youtube || '';
            e.display_name = p.display_name || null;
          }
        });
      }
    }

    // Verified users: merge with stats (0 if no posts)
    const verifiedEntries = (verifiedProfiles || []).map(p => ({
      wallet: p.wallet,
      generations: statsMap.get(p.wallet)?.generations || 0,
      total_likes: statsMap.get(p.wallet)?.total_likes || 0,
      avatar_url: p.avatar_url || null,
      twitter: p.twitter || '',
      telegram: p.telegram || '',
      youtube: p.youtube || '',
      verified: true,
      verified_org: !!p.verified_org,
      display_name: p.display_name || null,
    }));

    return [...verifiedEntries, ...nonVerifiedEntries]
      .sort((a, b) => b.generations - a.generations)
      .slice(0, 50);
  } catch { return []; }
}

// ========================
// TOP GENERATORS (12h)
// ========================

export async function getTopGenerators12h(): Promise<{ wallet: string; count: number; avatar_url: string | null; twitter: string; verified: boolean; verified_org: boolean; display_name: string | null }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    // Fetch all verified profiles
    const { data: verifiedProfiles } = await supabase
      .from('profiles')
      .select('wallet, avatar_url, twitter, verified, verified_org, display_name')
      .eq('verified', true);

    if (!verifiedProfiles || verifiedProfiles.length === 0) return [];

    // Count posts per verified wallet (all-time)
    const verifiedWallets = verifiedProfiles.map(p => p.wallet);
    const { data: posts } = await supabase
      .from('posts')
      .select('author')
      .in('author', verifiedWallets);

    const countMap = new Map<string, number>();
    for (const p of posts || []) {
      countMap.set(p.author, (countMap.get(p.author) || 0) + 1);
    }

    // Build result: all verified users, sorted by post count desc, 0 if none
    return verifiedProfiles
      .map(p => ({
        wallet: p.wallet,
        count: countMap.get(p.wallet) || 0,
        avatar_url: p.avatar_url || null,
        twitter: p.twitter || '',
        verified: true,
        verified_org: !!p.verified_org,
        display_name: p.display_name || null,
      }))
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count);
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

export async function getTopReferrersCreators(periodHours?: number): Promise<{ wallet: string; creator_count: number }[]> {
  if (!isSupabaseConfigured) return [];
  try {
    let query = supabase.from('referrals').select('referrer_wallet, referred_wallet');
    if (periodHours) {
      const since = new Date(Date.now() - periodHours * 3_600_000).toISOString();
      query = query.gte('created_at', since);
    }
    const { data: refs } = await query;

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

// ========================
// AI CONFIG (admin model switcher)
// ========================

export interface AiConfig {
  primary_provider: 'gemini' | 'replicate';
  primary_model: string;
  secondary_provider: 'gemini' | 'replicate';
  secondary_model: string;
}

const AI_CONFIG_DEFAULTS: AiConfig = {
  primary_provider: 'gemini',
  primary_model: 'gemini-3.1-flash-image-preview',
  secondary_provider: 'replicate',
  secondary_model: 'google/nano-banana-pro',
};

// Cache config for 30s so not every generation hits DB
let aiConfigCache: { config: AiConfig; ts: number } | null = null;
const AI_CONFIG_TTL = 30_000;

export async function getAiConfig(): Promise<AiConfig> {
  if (aiConfigCache && Date.now() - aiConfigCache.ts < AI_CONFIG_TTL) return aiConfigCache.config;
  if (!isSupabaseConfigured) return AI_CONFIG_DEFAULTS;
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'ai_models')
      .maybeSingle();
    const config = data?.value ? { ...AI_CONFIG_DEFAULTS, ...data.value } : AI_CONFIG_DEFAULTS;
    aiConfigCache = { config, ts: Date.now() };
    return config;
  } catch (e) { console.warn('getAiConfig:', e); return AI_CONFIG_DEFAULTS; }
}

export async function setAiConfig(config: AiConfig): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: 'ai_models', value: config }, { onConflict: 'key' });
    if (error) { console.warn('setAiConfig:', error); return false; }
    aiConfigCache = { config, ts: Date.now() };
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

// ========================
// POST VIEWS
// ========================

const viewedPosts = new Set<string>();

export async function recordView(postId: string, viewerWallet?: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const key = `${postId}_${viewerWallet || 'anon'}`;
  if (viewedPosts.has(key)) return;
  viewedPosts.add(key);
  try {
    await supabase.from('post_views').insert({
      post_id: postId,
      viewer_wallet: viewerWallet || null,
    });
  } catch {}
}

export async function getViewCountsBatch(postIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isSupabaseConfigured || postIds.length === 0) return result;
  try {
    const unique = [...new Set(postIds)];
    const counts = await Promise.all(
      unique.map(async (id) => {
        const { count } = await supabase
          .from('post_views')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', id);
        return [id, count ?? 0] as [string, number];
      }),
    );
    for (const [id, count] of counts) {
      result.set(id, count);
    }
  } catch {}
  return result;
}
