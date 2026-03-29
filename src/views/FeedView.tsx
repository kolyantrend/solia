import { FC, useState, useRef, useEffect, useCallback, memo } from 'react';
import { Heart, Share2, MessageCircle, Flame, Clock, TrendingUp, X, ShoppingCart, Monitor, Smartphone, Square, Send, Loader2, BadgeCheck, Download, Copy, Check } from 'lucide-react';
import { BannerCarousel } from '../components/BannerCarousel';
import { CryptoTicker } from '../components/CryptoTicker';
import { TopCreatorsTicker } from '../components/TopCreatorsTicker';
import { SolanaAvatar } from '../components/SolanaAvatar';
import { useI18n } from '../i18n';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { PublicKey } from '@solana/web3.js';
import * as db from '../lib/database';
import { transferSkrSplit, TREASURY_WALLET, MwaTimeoutError, buildPhantomBrowseUrl } from '../lib/solana';
import { getPurchaseCostSkr } from '../lib/price';
import { getTwitterAvatarUrl, getProfileDisplayName } from '../lib/utils';

export interface Post {
  id: string;
  imageUrl: string;
  prompt: string;
  author: string;
  likes: number;
  category?: string;
  aspectRatio?: string;
  createdAt?: string;
}

const CATEGORIES = [
  'Main', 'Solana', 'Animals', 'Tech', 'Car', '3D', 'Camera', 
  'Anime', 'Crypto', 'Fantasy', 'Cyberpunk', 'Abstract', 
  'Characters', 'People', 'Portrait', 'Games', 'Nature', 
  'Cities', 'Space'
];

type FormatFilter = 'all' | '16:9' | '9:16' | '1:1';
type SortMode = 'new' | 'hot' | 'trends';

const PAGE_SIZE = 20;

function isLandscape(ratio?: string) {
  if (!ratio) return false;
  return ['16:9', '4:3', '4:1', '8:1'].includes(ratio);
}
function isPortrait(ratio?: string) {
  if (!ratio) return false;
  return ['9:16', '3:4', '1:4', '1:8'].includes(ratio);
}
function isSquare(ratio?: string) {
  return ratio === '1:1';
}

function shortAddr(addr: string) {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

export const FeedView: FC<{ posts: Post[]; onViewProfile?: (address: string) => void }> = ({ posts, onViewProfile }) => {
  const { t } = useI18n();
  const { publicKey } = useUnifiedWallet();
  const wallet = publicKey?.toBase58() || '';
  const [activeSort, setActiveSort] = useState<SortMode>('new');
  const [activeCategory, setActiveCategory] = useState('Main');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [dbPosts, setDbPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [authorProfiles, setAuthorProfiles] = useState<Map<string, db.Profile>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [sharedBuyCost, setSharedBuyCost] = useState<number>(43);
  const [sharedRemaining, setSharedRemaining] = useState<number>(0);

  // Load shared data once (not per card)
  useEffect(() => {
    getPurchaseCostSkr().then(setSharedBuyCost);
  }, []);
  useEffect(() => {
    if (!wallet) return;
    db.getDailyLikes(wallet).then((d) => setSharedRemaining(d.remaining));
  }, [wallet]);

  // Load liked + purchased post IDs in batch (not per card)
  useEffect(() => {
    if (!wallet) return;
    db.getUserLikedPostIds(wallet).then(setLikedIds);
    db.getUserPurchasedPostIds(wallet).then(setPurchasedIds);
  }, [wallet]);

  // Load posts from Supabase
  const loadPosts = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offset;
    if (reset) { setLoading(true); setHasMore(true); }
    else setLoadingMore(true);

    try {
      const data = await db.getPosts({
        sort: activeSort,
        category: activeCategory === 'Main' ? undefined : activeCategory,
        limit: PAGE_SIZE,
        offset: newOffset,
      });

      const mapped: Post[] = data.map((p) => ({
        id: p.id,
        imageUrl: p.image_url,
        prompt: p.prompt,
        author: p.author,
        likes: p.likes_count,
        category: p.category,
        aspectRatio: p.aspect_ratio,
        createdAt: p.created_at,
      }));

      // Batch-fetch author profiles in one query (don't block if it fails)
      try {
        const authors = mapped.map((p) => p.author);
        const profiles = await db.getProfilesBatch(authors);
        setAuthorProfiles((prev) => {
          const next = new Map(prev);
          profiles.forEach((v, k) => next.set(k, v));
          return next;
        });
      } catch {}

      if (reset) {
        setDbPosts(mapped);
        setOffset(mapped.length);
      } else {
        setDbPosts((prev) => [...prev, ...mapped]);
        setOffset((prev) => prev + mapped.length);
      }
      if (mapped.length < PAGE_SIZE) setHasMore(false);
    } catch {
      // Supabase down — show empty state instead of infinite loading
      if (reset) setDbPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeSort, activeCategory, offset]);

  // Reload on sort/category change
  useEffect(() => {
    setOffset(0);
    loadPosts(true);
  }, [activeSort, activeCategory]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingMore) loadPosts(false);
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loadPosts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Merge locally generated posts with DB posts, deduplicate by ID
  const seen = new Set<string>();
  const allPosts = [...posts, ...dbPosts].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const filteredPosts = allPosts.filter(post => {
    if (formatFilter === '16:9' && !isLandscape(post.aspectRatio)) return false;
    if (formatFilter === '9:16' && !isPortrait(post.aspectRatio)) return false;
    if (formatFilter === '1:1' && !isSquare(post.aspectRatio)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Banner Carousel */}
      <div className="px-4 pt-4">
        <BannerCarousel />
      </div>

      {/* Crypto Ticker */}
      <div className="px-4 pt-3">
        <CryptoTicker />
      </div>

      {/* Top Creators Ticker */}
      <div className="px-4 pt-2">
        <TopCreatorsTicker onViewProfile={onViewProfile} />
      </div>

      {/* Filters Section */}
      <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50 pb-3 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
            <button 
              onClick={() => setActiveSort('new')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${activeSort === 'new' ? 'bg-indigo-500 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Clock size={14} />
              {t('feed.new')}
            </button>
            <button 
              onClick={() => setActiveSort('hot')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${activeSort === 'hot' ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Flame size={14} />
              {t('feed.hots')}
            </button>
            <button 
              onClick={() => setActiveSort('trends')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${activeSort === 'trends' ? 'bg-emerald-500 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <TrendingUp size={14} />
              {t('feed.trends')}
            </button>
          </div>

          {/* Pyramid Filter Button — format + categories */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-2 rounded-full transition-colors flex-shrink-0 ${
                isFilterOpen || formatFilter !== 'all' || activeCategory !== 'Main'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="3" width="16" height="2.8" rx="1.4" fill="#9945FF" />
                <rect x="4.5" y="8.2" width="11" height="2.8" rx="1.4" fill="#14F195" />
                <rect x="7" y="13.4" width="6" height="2.8" rx="1.4" fill="#E839F6" />
              </svg>
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl z-50 p-3 space-y-3">
                {/* Format section */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5 px-1">Format</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([['all', null, t('feed.allFormats')], ['16:9', Monitor, '16:9'], ['9:16', Smartphone, '9:16'], ['1:1', Square, '1:1']] as const).map(([val, Icon, label]) => (
                      <button
                        key={val}
                        onClick={() => setFormatFilter(val as FormatFilter)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          formatFilter === val ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                      >
                        {Icon && <Icon size={12} />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-800/50" />

                {/* Categories section */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5 px-1">Category</p>
                  <div className="max-h-40 overflow-y-auto hide-scrollbar grid grid-cols-2 gap-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setActiveCategory(cat);
                          setIsFilterOpen(false);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors text-left truncate ${
                          activeCategory === cat
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex flex-col gap-6 p-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-zinc-500" size={32} /></div>
        ) : filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <MemoPostCard key={post.id} post={post} onViewProfile={onViewProfile} isLiked={likedIds.has(post.id)} isPurchased={purchasedIds.has(post.id)} wallet={wallet} authorProfile={authorProfiles.get(post.author)} sharedBuyCost={sharedBuyCost} sharedRemaining={sharedRemaining} onRemainingChange={setSharedRemaining} />
          ))
        ) : (
          <div className="text-center py-12 text-zinc-500">
            {t('feed.noPosts')}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && !loading && <div ref={sentinelRef} className="h-4" />}
        {loadingMore && (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
        )}
      </div>
    </div>
  );
};

// ========== PostCard ==========

const PostCard: FC<{
  post: Post;
  onViewProfile?: (address: string) => void;
  isLiked: boolean;
  isPurchased: boolean;
  wallet: string;
  authorProfile?: db.Profile | null;
  sharedBuyCost?: number;
  sharedRemaining?: number;
  onRemainingChange?: (r: number | ((prev: number) => number)) => void;
}> = ({ post, onViewProfile, isLiked: initialLiked, isPurchased: initialPurchased, wallet, authorProfile, sharedBuyCost = 43, sharedRemaining = 0, onRemainingChange }) => {
  const { t } = useI18n();
  const { sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(post.likes);
  const [purchased, setPurchased] = useState(initialPurchased);

  // Sync liked/purchased when parent loads data async (after wallet reconnects)
  useEffect(() => { setLiked(initialLiked); }, [initialLiked]);
  useEffect(() => { setPurchased(initialPurchased); }, [initialPurchased]);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [phantomRedirectUrl, setPhantomRedirectUrl] = useState<string | null>(null);
  const buyCostSkr = sharedBuyCost;
  const [likeError, setLikeError] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<db.DbComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(0);
  const remaining = sharedRemaining;
  const setRemaining = onRemainingChange || (() => {});

  // Author profile: use batch-fetched data, fallback to individual fetch
  const [fetchedProfile, setFetchedProfile] = useState<db.Profile | null>(null);
  const profile = authorProfile || fetchedProfile;
  const authorVerified = !!profile?.verified;
  const authorDisplayName = profile?.display_name || null;
  const authorAvatar = (() => {
    if (!profile) return null;
    const xAvatar = getTwitterAvatarUrl(profile.twitter);
    return xAvatar || profile.avatar_url || null;
  })();

  // Sync purchased state from parent
  useEffect(() => { setPurchased(initialPurchased); }, [initialPurchased]);

  // Fallback: fetch profile individually if not in batch
  useEffect(() => {
    if (!authorProfile) {
      db.getProfile(post.author).then((p) => { if (p) setFetchedProfile(p); });
    }
  }, [post.author, authorProfile]);

  const loadComments = async () => {
    const data = await db.getComments(post.id);
    setComments(data);
    setCommentCount(data.length);
  };

  // Comment count loaded lazily on first expand only

  const handleToggleComments = () => {
    if (!showComments) loadComments();
    setShowComments(!showComments);
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !wallet) return;
    const result = await db.addComment(wallet, post.id, commentText.trim());
    if (result) {
      setComments((prev) => [...prev, result]);
      setCommentCount((c) => c + 1);
      setCommentText('');
    }
  };

  const handleLike = async () => {
    if (!wallet) return;
    if (liked) {
      const ok = await db.unlikePost(wallet, post.id);
      if (ok) {
        setLikes((l) => l - 1);
        setLiked(false);
        setLikeError('');
        db.refundDailyLike(wallet);
        setRemaining((r) => r + 1);
      }
    } else {
      if (remaining <= 0) {
        setLikeError(t('likes.noLikes'));
        setTimeout(() => setLikeError(''), 3000);
        return;
      }
      const canConsume = await db.consumeDailyLike(wallet);
      if (!canConsume) {
        setLikeError(t('likes.noLikes'));
        setTimeout(() => setLikeError(''), 3000);
        return;
      }
      const ok = await db.likePost(wallet, post.id);
      if (ok) {
        setLikes((l) => l + 1);
        setLiked(true);
        setRemaining((r) => r - 1);
        setLikeError('');
      }
    }
  };

  const handleBuy = async () => {
    if (!wallet || buyLoading) return;
    setBuyLoading(true);
    setBuyError('');
    try {
      // Build referral split
      const referrerWallet = await db.getReferrer(wallet);
      const recipients: { wallet: PublicKey; amount: number }[] = [];
      const isSystemRef = !referrerWallet || referrerWallet === TREASURY_WALLET.toBase58();

      if (!isSystemRef) {
        // With real referrer: 80% creator + 10% referrer + 10% treasury
        const creatorAmount = Math.round(buyCostSkr * 0.80 * 10) / 10;
        const referrerAmount = Math.round(buyCostSkr * 0.10 * 10) / 10;
        const treasuryAmount = Math.round(buyCostSkr * 0.10 * 10) / 10;
        recipients.push({ wallet: new PublicKey(post.author), amount: creatorAmount });
        recipients.push({ wallet: new PublicKey(referrerWallet!), amount: referrerAmount });
        recipients.push({ wallet: TREASURY_WALLET, amount: treasuryAmount });
      } else {
        // System referral / no referrer: 80% creator + 20% treasury
        const creatorAmount = Math.round(buyCostSkr * 0.80 * 10) / 10;
        const treasuryAmount = Math.round(buyCostSkr * 0.20 * 10) / 10;
        recipients.push({ wallet: new PublicKey(post.author), amount: creatorAmount });
        recipients.push({ wallet: TREASURY_WALLET, amount: treasuryAmount });
      }

      const sig = await transferSkrSplit({
        fromWallet: new PublicKey(wallet),
        recipients,
        sendTransaction,
        signTransaction: signTransaction ?? undefined,
        connection,
      });

      // Record transaction history
      await db.recordTransaction({
        signature: sig,
        from_wallet: wallet,
        type: 'purchase',
        total_amount: buyCostSkr,
        treasury_amount: isSystemRef ? Math.round(buyCostSkr * 0.20 * 10) / 10 : Math.round(buyCostSkr * 0.10 * 10) / 10,
        creator_wallet: post.author,
        creator_amount: Math.round(buyCostSkr * 0.80 * 10) / 10,
        referrer_wallet: !isSystemRef ? referrerWallet! : undefined,
        referrer_amount: !isSystemRef ? Math.round(buyCostSkr * 0.10 * 10) / 10 : undefined,
        post_id: post.id,
      });

      // Grant bonus likes: +10 to buyer
      db.grantBonusLikes(wallet, 10);
      // Grant bonus likes: +15 to referrer when referral purchases
      if (!isSystemRef) {
        db.grantBonusLikes(referrerWallet!, 15);
      }

      // Record purchase in DB
      const ok = await db.purchasePost(wallet, post.id, sig);
      if (ok) setPurchased(true);
      setShowBuyModal(false);
    } catch (err: any) {
      console.error('Purchase failed:', err);
      if (err instanceof MwaTimeoutError) {
        setBuyError('Wallet did not respond. Try opening in Phantom browser.');
        setPhantomRedirectUrl(buildPhantomBrowseUrl());
      } else {
        setBuyError(err.message || 'Transaction failed');
      }
    } finally {
      setBuyLoading(false);
    }
  };

  const [showShareMenu, setShowShareMenu] = useState(false);
  const [refLink, setRefLink] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);

  const buildRefLink = async () => {
    let refParam = '';
    if (wallet) {
      try {
        const code = await db.getOrCreateRefCode(wallet);
        if (code) refParam = `?ref=${code}`;
      } catch {}
    }
    return `https://solia.live${refParam}`;
  };

  const handleOpenShareMenu = async () => {
    const link = await buildRefLink();
    setRefLink(link);
    setCopiedRef(false);
    setShowShareMenu(true);
  };

  const handleDownload = async () => {
    try {
      const resp = await fetch(post.imageUrl);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `solia_${post.id}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: open in new tab
      window.open(post.imageUrl, '_blank');
    }
  };

  const handleCopyRefLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {}
  };

  const handleShareToX = () => {
    const text = `Turn your ideas into images with @SoliaLive AI and monetize your art.\n${refLink}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setShowShareMenu(false);
  };

  // Responsive image: cap 9:16 images so they don't take over the whole screen
  const getImageStyle = () => {
    if (post.aspectRatio === '16:9') return { aspectRatio: '16/9' };
    if (post.aspectRatio === '9:16') return { aspectRatio: '9/16', maxHeight: '70vh' };
    if (post.aspectRatio === '1:1') return { aspectRatio: '1/1' };
    return { aspectRatio: '3/4', maxHeight: '70vh' };
  };

  return (
    <div className="bg-zinc-900/50 rounded-3xl overflow-hidden border border-zinc-800/50 shadow-xl backdrop-blur-sm">
      <div className="p-3 sm:p-4 flex items-center justify-between gap-2">
        <button
          onClick={() => onViewProfile?.(post.author)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1"
        >
          {authorAvatar ? (
            <img src={authorAvatar} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <SolanaAvatar size={28} />
          )}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs sm:text-sm text-zinc-300 truncate max-w-[120px] sm:max-w-[180px]">{getProfileDisplayName(profile, post.author)}</span>
            {authorVerified && <BadgeCheck size={14} className="text-blue-400 shrink-0" />}
            {profile?.twitter && (
              <a
                href={profile.twitter.startsWith('http') ? profile.twitter : `https://x.com/${profile.twitter.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            )}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {post.createdAt && (
            <span className="text-[9px] sm:text-[10px] text-zinc-600 whitespace-nowrap">
              {new Date(post.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{' '}
              {new Date(post.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {post.category && (
            <span className="text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-zinc-800 text-zinc-300 whitespace-nowrap">
              {post.category}
            </span>
          )}
        </div>
      </div>
      
      <div
        className="protected-image-wrapper relative w-full bg-zinc-950 flex items-center justify-center overflow-hidden"
        style={getImageStyle()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img 
          src={post.imageUrl} 
          alt={post.prompt} 
          className="protected-image w-full h-full object-cover"
          draggable={false}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>

      <div className="p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={handleLike} className={`flex items-center gap-1 sm:gap-1.5 transition-colors ${liked ? 'text-pink-500' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <Heart size={20} className={`sm:w-[22px] sm:h-[22px] ${liked ? 'fill-current' : ''}`} />
              <span className="font-medium text-xs sm:text-sm">{likes}</span>
            </button>
            <button onClick={handleToggleComments} className={`flex items-center gap-1 sm:gap-1.5 transition-colors ${showComments ? 'text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <MessageCircle size={20} className="sm:w-[22px] sm:h-[22px]" />
              <span className="font-medium text-xs sm:text-sm">{commentCount || t('feed.reply')}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {wallet && !purchased ? (
              <button
                onClick={() => setShowBuyModal(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] sm:text-xs font-medium hover:bg-emerald-500/25 transition-colors whitespace-nowrap"
              >
                <ShoppingCart size={12} className="sm:w-[14px] sm:h-[14px]" />
                Buy {buyCostSkr} SKR
              </button>
            ) : purchased ? (
              <span className="text-[10px] sm:text-xs text-emerald-400 font-medium">{t('buy.purchased')}</span>
            ) : null}
            <button onClick={handleOpenShareMenu} className="text-zinc-400 hover:text-indigo-400 transition-colors">
              <Share2 size={20} className="sm:w-[22px] sm:h-[22px]" />
            </button>
          </div>
        </div>

        {likeError && (
          <p className="text-xs text-red-400 text-center">{likeError}</p>
        )}
        {wallet && !liked && (
          <p className="text-[10px] text-zinc-500 text-center">
            {t('likes.remaining', { count: remaining })}
          </p>
        )}
        
        <p className="text-sm text-zinc-500 italic">
          {t('feed.promptHidden')}
        </p>

        {/* Comments Section */}
        {showComments && (
          <div className="border-t border-zinc-800/50 pt-3 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{t('comments.title')}</h4>
            
            {comments.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto hide-scrollbar">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <button
                      onClick={() => onViewProfile?.(c.user_wallet)}
                      className="shrink-0 hover:scale-110 transition-transform"
                    >
                      <SolanaAvatar size={24} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-zinc-300">{shortAddr(c.user_wallet)}</span>
                        <span className="text-[9px] text-zinc-600">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-zinc-400 break-words">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-2">{t('comments.empty')}</p>
            )}

            {wallet && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder={t('comments.placeholder')}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim()}
                  className="p-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Menu Modal */}
      {showShareMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowShareMenu(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xs w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Share</h3>
              <button onClick={() => setShowShareMenu(false)} className="text-zinc-500 hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            {/* Preview */}
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <img src={post.imageUrl} alt="" className="w-full max-h-44 object-cover" referrerPolicy="no-referrer" />
            </div>
            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleDownload}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <Download size={18} className="text-indigo-400 shrink-0" />
                <span className="text-sm text-zinc-200 font-medium">Download</span>
              </button>
              <button
                onClick={handleCopyRefLink}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                {copiedRef ? <Check size={18} className="text-emerald-400 shrink-0" /> : <Copy size={18} className="text-indigo-400 shrink-0" />}
                <span className="text-sm text-zinc-200 font-medium">{copiedRef ? 'Copied!' : 'Copy referral link'}</span>
              </button>
              <button
                onClick={handleShareToX}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400 shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                <span className="text-sm text-zinc-200 font-medium">Share to X</span>
              </button>
            </div>
            {/* Close button */}
            <button
              onClick={() => setShowShareMenu(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800/50 text-zinc-400 text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Buy Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowBuyModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-xs w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-center">{t('buy.confirmTitle')}</h3>
            <p className="text-sm text-zinc-400 text-center">{t('buy.priceNote')}</p>
            <p className="text-xs text-zinc-500 text-center">({buyCostSkr} SKR)</p>
            {buyError && (
              <div className="bg-red-500/10 rounded-lg p-2 space-y-1.5">
                <p className="text-xs text-red-400 text-center">{buyError}</p>
                {phantomRedirectUrl && (
                  <a
                    href={phantomRedirectUrl}
                    className="block text-center text-xs font-medium text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Open in Phantom browser →
                  </a>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowBuyModal(false); setBuyError(''); }}
                disabled={buyLoading}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleBuy}
                disabled={buyLoading}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {buyLoading ? <><Loader2 className="animate-spin" size={14} /> Paying...</> : t('buy.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MemoPostCard = memo(PostCard);
