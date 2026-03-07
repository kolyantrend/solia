/**
 * Like System with Bot Protection
 * 
 * Rules:
 * - Each user gets 3 free likes per day
 * - Each generation grants +10 bonus likes
 * - Cannot like the same post twice
 * - Likes reset daily at midnight UTC
 */

const DAILY_FREE_LIKES = 3;
const LIKES_PER_GENERATION = 10;

interface LikeData {
  date: string; // YYYY-MM-DD UTC
  usedToday: number;
  bonusLikes: number;
  likedPosts: string[]; // post IDs
}

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function getKey(wallet: string): string {
  return `solia_likes_${wallet}`;
}

function load(wallet: string): LikeData {
  const raw = localStorage.getItem(getKey(wallet));
  if (!raw) {
    return { date: getTodayUTC(), usedToday: 0, bonusLikes: 0, likedPosts: [] };
  }
  try {
    const data: LikeData = JSON.parse(raw);
    // Reset daily counter if new day
    if (data.date !== getTodayUTC()) {
      return { date: getTodayUTC(), usedToday: 0, bonusLikes: data.bonusLikes, likedPosts: data.likedPosts };
    }
    return data;
  } catch {
    return { date: getTodayUTC(), usedToday: 0, bonusLikes: 0, likedPosts: [] };
  }
}

function save(wallet: string, data: LikeData) {
  localStorage.setItem(getKey(wallet), JSON.stringify(data));
}

/** Get remaining likes for today */
export function getRemainingLikes(wallet: string): number {
  const data = load(wallet);
  const totalAvailable = DAILY_FREE_LIKES + data.bonusLikes;
  return Math.max(0, totalAvailable - data.usedToday);
}

/** Check if a post was already liked */
export function hasLikedPost(wallet: string, postId: string): boolean {
  const data = load(wallet);
  return data.likedPosts.includes(postId);
}

/** Try to like a post. Returns true if successful, false if not allowed. */
export function tryLikePost(wallet: string, postId: string): boolean {
  const data = load(wallet);
  
  // Already liked
  if (data.likedPosts.includes(postId)) return false;
  
  // Check remaining
  const totalAvailable = DAILY_FREE_LIKES + data.bonusLikes;
  if (data.usedToday >= totalAvailable) return false;
  
  data.usedToday += 1;
  data.likedPosts.push(postId);
  save(wallet, data);
  return true;
}

/** Unlike a post (refund the like) */
export function unlikePost(wallet: string, postId: string): boolean {
  const data = load(wallet);
  const idx = data.likedPosts.indexOf(postId);
  if (idx === -1) return false;
  
  data.likedPosts.splice(idx, 1);
  data.usedToday = Math.max(0, data.usedToday - 1);
  save(wallet, data);
  return true;
}

/** Grant bonus likes for a generation */
export function grantGenerationLikes(wallet: string): void {
  const data = load(wallet);
  data.bonusLikes += LIKES_PER_GENERATION;
  save(wallet, data);
}

/** Check if a post is purchased by the user */
export function hasPurchasedPost(wallet: string, postId: string): boolean {
  const raw = localStorage.getItem(`solia_purchases_${wallet}`);
  if (!raw) return false;
  try {
    const ids: string[] = JSON.parse(raw);
    return ids.includes(postId);
  } catch { return false; }
}

/** Purchase a post (simulated) */
export function purchasePost(wallet: string, postId: string): void {
  const raw = localStorage.getItem(`solia_purchases_${wallet}`);
  let ids: string[] = [];
  try { ids = JSON.parse(raw || '[]'); } catch { /* ignore */ }
  if (!ids.includes(postId)) {
    ids.push(postId);
    localStorage.setItem(`solia_purchases_${wallet}`, JSON.stringify(ids));
  }
}
