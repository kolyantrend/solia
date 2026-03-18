import { FC, useState, useEffect } from 'react';
import { Save, Twitter, Send, Youtube, Users, ChevronLeft, ChevronRight, ImageIcon, Pencil, X, Monitor, Smartphone, Square, Loader2, Link2, Copy, Check, Download, UserPlus, UserMinus, ShoppingBag, History, ExternalLink, BadgeCheck, Shield } from 'lucide-react';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { useI18n } from '../i18n';
import * as db from '../lib/database';
import { SolanaAvatar } from '../components/SolanaAvatar';
import { getTwitterAvatarUrl, fetchTwitterDisplayName, extractTwitterUsername, verifyTwitterBio } from '../lib/utils';

interface WorkItem {
  id: string;
  imageUrl: string;
  originalUrl?: string;
  prompt: string;
  category: string;
  aspectRatio?: string;
}

const WORKS_PER_PAGE = 6;

type WorksFormatFilter = 'all' | '16:9' | '9:16' | '1:1';

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

type ProfileTab = 'works' | 'purchased' | 'history';

export const ProfileView: FC<{ viewAddress?: string; onViewProfile?: (address: string) => void }> = ({ viewAddress, onViewProfile }) => {
  const { t } = useI18n();
  const { publicKey } = useUnifiedWallet();

  const walletAddr = publicKey?.toBase58() || '';
  const profileAddr = viewAddress || walletAddr;
  const isOwnProfile = !viewAddress || viewAddress === walletAddr;

  const [avatar, setAvatar] = useState<string | null>(null);
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [purchased, setPurchased] = useState<WorkItem[]>([]);
  const [profileTab, setProfileTab] = useState<ProfileTab>('works');
  const [worksPage, setWorksPage] = useState(0);
  const [worksFormat, setWorksFormat] = useState<WorksFormatFilter>('all');
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [viewingWork, setViewingWork] = useState<WorkItem | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [downloadCopied, setDownloadCopied] = useState(false);
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null);
  const [followListProfiles, setFollowListProfiles] = useState<Map<string, db.Profile>>(new Map());
  const [followListStatuses, setFollowListStatuses] = useState<Map<string, boolean>>(new Map());

  // Verification
  const [verified, setVerified] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'success' | 'fail' | null>(null);
  const [tweetUrl, setTweetUrl] = useState('');

  // Transaction history
  const [txHistory, setTxHistory] = useState<db.TransactionHistoryEntry[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);

  // Referrals
  const [refTab, setRefTab] = useState<'user' | 'creator'>('creator');
  const [refPage, setRefPage] = useState(0);
  const [refItems, setRefItems] = useState<db.ReferralEntry[]>([]);
  const [refTotal, setRefTotal] = useState(0);
  const [refCopied, setRefCopied] = useState(false);
  const [refProfiles, setRefProfiles] = useState<Map<string, db.Profile>>(new Map());

  // Temp state for edit modal
  const [tempTwitter, setTempTwitter] = useState('');
  const [tempTelegram, setTempTelegram] = useState('');
  const [tempYoutube, setTempYoutube] = useState('');

  // Load profile from Supabase
  useEffect(() => {
    if (!profileAddr) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      db.getProfile(profileAddr),
      db.getUserPosts(profileAddr),
      db.getFollowers(profileAddr),
      db.getFollowing(profileAddr),
      db.getPurchasedPosts(profileAddr),
    ]).then(async ([profile, posts, frs, fng, purch]) => {
      if (profile) {
        setAvatar(profile.avatar_url);
        setTwitter(profile.twitter);
        setTelegram(profile.telegram);
        setYoutube(profile.youtube);
        setVerified(!!profile.verified);
        setDisplayName(profile.display_name || null);

        // Fetch Twitter display name if not stored yet
        if (profile.twitter && !profile.display_name) {
          const name = await fetchTwitterDisplayName(profile.twitter);
          if (name) {
            setDisplayName(name);
            db.updateDisplayName(profileAddr, name);
          }
        }
      }
      setWorks(posts.map((p) => ({
        id: p.id,
        imageUrl: p.image_url,
        originalUrl: p.original_url,
        prompt: p.prompt,
        category: p.category,
        aspectRatio: p.aspect_ratio,
      })));
      setPurchased(purch.map((p) => ({
        id: p.id,
        imageUrl: p.image_url,
        originalUrl: p.original_url,
        prompt: p.prompt,
        category: p.category,
        aspectRatio: p.aspect_ratio,
      })));
      setFollowers(frs);
      setFollowing(fng);
      setLoading(false);
    });
    // Check if current user follows this profile
    if (walletAddr && profileAddr !== walletAddr) {
      db.getFollowing(walletAddr).then((fng) => {
        setIsFollowing(fng.includes(profileAddr));
      });
    }
  }, [profileAddr, walletAddr]);

  // Load ref code for own profile
  useEffect(() => {
    if (!isOwnProfile || !walletAddr) return;
    db.getOrCreateRefCode(walletAddr).then(setRefCode);
  }, [isOwnProfile, walletAddr]);

  // Load referrals
  useEffect(() => {
    if (!profileAddr) return;
    db.getReferrals(profileAddr, refTab, refPage, 10).then(({ items, total }) => {
      setRefItems(items);
      setRefTotal(total);
      // Batch-fetch profiles for avatars
      if (items.length > 0) {
        db.getProfilesBatch(items.map(r => r.wallet)).then(setRefProfiles);
      } else {
        setRefProfiles(new Map());
      }
    });
  }, [profileAddr, refTab, refPage]);

  // Load transaction history
  useEffect(() => {
    if (!profileAddr || profileTab !== 'history') return;
    db.getTransactionHistory(profileAddr, 10, txPage * 10).then(({ items, total }) => {
      setTxHistory(items);
      setTxTotal(total);
    });
  }, [profileAddr, profileTab, txPage]);
  const txTotalPages = Math.max(1, Math.ceil(txTotal / 10));

  const referralLink = refCode ? `${window.location.origin}?ref=${refCode}` : '';
  const copyRefLink = () => {
    navigator.clipboard.writeText(referralLink);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };
  const refTotalPages = Math.max(1, Math.ceil(refTotal / 10));

  const handleFollow = async () => {
    if (!walletAddr || isOwnProfile) return;
    if (isFollowing) {
      const ok = await db.unfollowUser(walletAddr, profileAddr);
      if (ok) { setIsFollowing(false); setFollowers((f) => f.filter((a) => a !== walletAddr)); }
    } else {
      const ok = await db.followUser(walletAddr, profileAddr);
      if (ok) { setIsFollowing(true); setFollowers((f) => [...f, walletAddr]); }
    }
  };

  const openFollowList = async (type: 'followers' | 'following') => {
    setShowFollowList(type);
    const list = type === 'followers' ? followers : following;
    if (list.length === 0) return;
    const profiles = await db.getProfilesBatch(list);
    setFollowListProfiles(profiles);
    // Load follow statuses for current user
    if (walletAddr) {
      const myFollowing = await db.getFollowing(walletAddr);
      const statuses = new Map<string, boolean>();
      list.forEach(addr => statuses.set(addr, myFollowing.includes(addr)));
      setFollowListStatuses(statuses);
    }
  };

  const toggleFollowInList = async (addr: string) => {
    if (!walletAddr || addr === walletAddr) return;
    const currentlyFollowing = followListStatuses.get(addr) || false;
    if (currentlyFollowing) {
      const ok = await db.unfollowUser(walletAddr, addr);
      if (ok) {
        setFollowListStatuses(prev => { const m = new Map(prev); m.set(addr, false); return m; });
        if (addr === profileAddr) { setIsFollowing(false); setFollowers(f => f.filter(a => a !== walletAddr)); }
      }
    } else {
      const ok = await db.followUser(walletAddr, addr);
      if (ok) {
        setFollowListStatuses(prev => { const m = new Map(prev); m.set(addr, true); return m; });
        if (addr === profileAddr) { setIsFollowing(true); setFollowers(f => [...f, walletAddr]); }
      }
    }
  };

  const handleDownload = async (work: WorkItem) => {
    const fileName = `solia_${work.prompt.slice(0, 20).replace(/\s+/g, '_')}.webp`;
    const downloadUrl = work.originalUrl || work.imageUrl;

    // In-app browsers (Phantom/Solflare) block downloads — clipboard fallback only
    const isInAppBrowser = 'solana' in window || 'phantom' in window || 'solflare' in window;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && isInAppBrowser) {
      try { await navigator.clipboard.writeText(downloadUrl); } catch {}
      setDownloadCopied(true);
      setTimeout(() => setDownloadCopied(false), 3000);
      return;
    }

    // Chrome (mobile & desktop): standard blob download
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(downloadUrl, '_blank');
    }
  };


  const openEditModal = () => {
    setTempTwitter(twitter);
    setTempTelegram(telegram);
    setTempYoutube(youtube);
    setShowEditModal(true);
  };

  const handleSaveModal = async () => {
    setTwitter(tempTwitter);
    setTelegram(tempTelegram);
    setYoutube(tempYoutube);

    // Auto-fetch display name from Twitter if changed and not already set
    let newDisplayName = displayName;
    if (tempTwitter && tempTwitter !== twitter) {
      const fetched = await fetchTwitterDisplayName(tempTwitter);
      if (fetched) {
        newDisplayName = fetched;
        setDisplayName(fetched);
      }
    }

    await db.upsertProfile({
      wallet: walletAddr,
      twitter: tempTwitter,
      telegram: tempTelegram,
      youtube: tempYoutube,
      ...(newDisplayName && !displayName ? { display_name: newDisplayName } : {}),
    });
    setShowEditModal(false);
  };

  const applyFormatFilter = (w: WorkItem) => {
    if (worksFormat === '16:9') return isLandscape(w.aspectRatio);
    if (worksFormat === '9:16') return isPortrait(w.aspectRatio);
    if (worksFormat === '1:1') return isSquare(w.aspectRatio);
    return true;
  };

  const filteredWorks = works.filter(applyFormatFilter);
  const totalPages = Math.max(1, Math.ceil(filteredWorks.length / WORKS_PER_PAGE));
  const pagedWorks = filteredWorks.slice(worksPage * WORKS_PER_PAGE, (worksPage + 1) * WORKS_PER_PAGE);

  const filteredPurchased = purchased.filter(applyFormatFilter);
  const purchasedTotalPages = Math.max(1, Math.ceil(filteredPurchased.length / WORKS_PER_PAGE));
  const pagedPurchased = filteredPurchased.slice(worksPage * WORKS_PER_PAGE, (worksPage + 1) * WORKS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" size={32} /></div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('prof.title')}</h2>
        {isOwnProfile && (
          <button
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
          >
            <Pencil size={12} />
            {t('prof.edit')}
          </button>
        )}
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center space-y-4">
        <div 
          className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center cursor-pointer group"
          onClick={() => isOwnProfile && openEditModal()}
        >
          {(() => {
            const xAvatar = getTwitterAvatarUrl(twitter);
            const src = xAvatar || avatar;
            return src ? (
              <img src={src} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <SolanaAvatar size={128} />
            );
          })()}
          {isOwnProfile && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil size={20} className="text-white" />
            </div>
          )}
        </div>
        <div className="text-center">
          {/* Display name + verified badge */}
          {displayName && (
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="text-base font-bold text-zinc-100">{displayName}</span>
              {verified && <BadgeCheck size={18} className="text-blue-400 shrink-0" />}
            </div>
          )}
          <p className="text-sm text-zinc-400 font-mono">
            {shortAddr(profileAddr) || t('prof.walletNotConnected')}
          </p>
          {/* Verify button (own profile, has twitter, not yet verified) */}
          {isOwnProfile && twitter && !verified && (
            <button
              onClick={async () => {
                const code = await db.getOrCreateVerificationCode(walletAddr);
                setVerifyCode(code);
                setVerifyResult(null);
                setShowVerifyModal(true);
              }}
              className="mt-2 flex items-center justify-center gap-1.5 mx-auto px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
            >
              <Shield size={12} />
              Verify Profile
            </button>
          )}
          {/* Social icons inline */}
          {(twitter || telegram || youtube) && (
            <div className="flex items-center justify-center gap-3 mt-2">
              {twitter && (
                <a href={twitter.startsWith('http') ? twitter : `https://x.com/${twitter.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400 transition-colors">
                  <Twitter size={16} />
                </a>
              )}
              {telegram && (
                <a href={telegram} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-500 transition-colors">
                  <Send size={16} />
                </a>
              )}
              {youtube && (
                <a href={youtube} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-red-500 transition-colors">
                  <Youtube size={16} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Follow / Unfollow Button */}
        {!isOwnProfile && walletAddr && (
          <button
            onClick={handleFollow}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              isFollowing
                ? 'bg-zinc-800 text-zinc-300 hover:bg-red-500/20 hover:text-red-400'
                : 'bg-indigo-500 text-white hover:bg-indigo-600'
            }`}
          >
            {isFollowing ? <><UserMinus size={16} /> {t('prof.unfollow')}</> : <><UserPlus size={16} /> {t('prof.follow')}</>}
          </button>
        )}

        {/* Stats */}
        <div className="flex gap-8 mt-2">
          <button className="flex flex-col items-center hover:opacity-80 transition-opacity" onClick={() => openFollowList('followers')}>
            <span className="text-lg font-bold text-zinc-100">{followers.length}</span>
            <span className="text-xs text-zinc-500">{t('prof.followers')}</span>
          </button>
          <button className="flex flex-col items-center hover:opacity-80 transition-opacity" onClick={() => openFollowList('following')}>
            <span className="text-lg font-bold text-zinc-100">{following.length}</span>
            <span className="text-xs text-zinc-500">{t('prof.following')}</span>
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-zinc-100">{works.length}</span>
            <span className="text-xs text-zinc-500">{t('prof.myWorks')}</span>
          </div>
        </div>
      </div>

      {/* Works / Purchased Tabs */}
      <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
        {/* Tab Switcher */}
        <div className="flex gap-1.5 sm:gap-2 mb-4">
          <button
            onClick={() => { setProfileTab('works'); setWorksPage(0); }}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
              profileTab === 'works' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800'
            }`}
          >
            <ImageIcon size={14} className="shrink-0" />
            <span className="truncate">{t('prof.myWorks')} ({works.length})</span>
          </button>
          <button
            onClick={() => { setProfileTab('purchased'); setWorksPage(0); }}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
              profileTab === 'purchased' ? 'bg-emerald-500 text-white' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800'
            }`}
          >
            <ShoppingBag size={14} className="shrink-0" />
            <span className="truncate">Purchased ({purchased.length})</span>
          </button>
          <button
            onClick={() => { setProfileTab('history'); setTxPage(0); }}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
              profileTab === 'history' ? 'bg-amber-500 text-white' : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800'
            }`}
          >
            <History size={14} className="shrink-0" />
            <span className="truncate">History</span>
          </button>
        </div>

        {/* Shared Format Filter (hide on history tab) */}
        {profileTab !== 'history' && <div className="flex items-center gap-1.5 mb-4">
          {([['all', null, t('feed.allFormats')], ['16:9', Monitor, '16:9'], ['9:16', Smartphone, '9:16'], ['1:1', Square, '1:1']] as const).map(([val, Icon, label]) => (
            <button
              key={val}
              onClick={() => { setWorksFormat(val as WorksFormatFilter); setWorksPage(0); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${worksFormat === val ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
            >
              {Icon && <Icon size={10} />}
              {label}
            </button>
          ))}
        </div>}

        {profileTab === 'works' ? (
          <>
            {filteredWorks.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {pagedWorks.map((work) => (
                    <div
                      key={work.id}
                      className="protected-image-wrapper relative aspect-square rounded-xl overflow-hidden border border-zinc-800 group cursor-pointer"
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => setViewingWork(work)}
                    >
                      <img src={work.imageUrl} alt={work.prompt} className="protected-image w-full h-full object-cover" draggable={false} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                        <ImageIcon size={24} className="text-white/80" />
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button onClick={() => setWorksPage(Math.max(0, worksPage - 1))} disabled={worksPage === 0} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                    <span className="text-xs text-zinc-400">{t('prof.page')} {worksPage + 1} / {totalPages}</span>
                    <button onClick={() => setWorksPage(Math.min(totalPages - 1, worksPage + 1))} disabled={worksPage >= totalPages - 1} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-zinc-500 text-sm">{t('prof.noWorks')}</div>
            )}
          </>
        ) : profileTab === 'purchased' ? (
          filteredPurchased.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {pagedPurchased.map((work) => (
                  <div
                    key={work.id}
                    className="relative aspect-square rounded-xl overflow-hidden border border-zinc-800 group cursor-pointer"
                    onClick={() => setViewingWork(work)}
                  >
                    <img src={work.imageUrl} alt={work.prompt} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                      <ImageIcon size={24} className="text-white/80" />
                    </div>
                  </div>
                ))}
              </div>
              {purchasedTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={() => setWorksPage(Math.max(0, worksPage - 1))} disabled={worksPage === 0} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                  <span className="text-xs text-zinc-400">{t('prof.page')} {worksPage + 1} / {purchasedTotalPages}</span>
                  <button onClick={() => setWorksPage(Math.min(purchasedTotalPages - 1, worksPage + 1))} disabled={worksPage >= purchasedTotalPages - 1} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">No purchased images yet</div>
          )
        ) : profileTab === 'history' ? (
          /* Transaction History tab */
          txHistory.length > 0 ? (
            <>
              <div className="space-y-2">
                {txHistory.map((tx) => {
                  const isGen = tx.type === 'generation';
                  const isSender = tx.from_wallet === profileAddr;
                  const isCreator = tx.creator_wallet === profileAddr;
                  const isReferrer = tx.referrer_wallet === profileAddr;

                  let role = 'Sender';
                  let amountDisplay = `-${tx.total_amount}`;
                  let amountColor = 'text-red-400';
                  if (isCreator && !isSender) {
                    role = 'Creator';
                    amountDisplay = `+${tx.creator_amount}`;
                    amountColor = 'text-emerald-400';
                  } else if (isReferrer && !isSender) {
                    role = 'Referral';
                    amountDisplay = `+${tx.referrer_amount}`;
                    amountColor = 'text-purple-400';
                  }

                  return (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-zinc-950/50 border border-zinc-800/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isGen ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {isGen ? <ImageIcon size={14} /> : <ShoppingBag size={14} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-zinc-200">{isGen ? 'Generation' : 'Purchase'}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              role === 'Referral' ? 'bg-purple-500/20 text-purple-300' :
                              role === 'Creator' ? 'bg-emerald-500/20 text-emerald-300' :
                              'bg-zinc-800 text-zinc-500'
                            }`}>{role}</span>
                          </div>
                          <span className="text-[10px] text-zinc-600">{new Date(tx.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-semibold ${amountColor}`}>{amountDisplay} SKR</span>
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
              {txTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button onClick={() => setTxPage(Math.max(0, txPage - 1))} disabled={txPage === 0} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                  <span className="text-xs text-zinc-400">{txPage + 1} / {txTotalPages}</span>
                  <button onClick={() => setTxPage(Math.min(txTotalPages - 1, txPage + 1))} disabled={txPage >= txTotalPages - 1} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">No transactions yet</div>
          )
        ) : null}
      </div>

      {/* Referrals Section */}
      {isOwnProfile && (
        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-indigo-400" />
              <h3 className="text-lg font-semibold">Referrals</h3>
            </div>
          </div>

          {/* Referral Link */}
          <div className="flex items-center gap-2 mb-4">
            <input
              readOnly
              value={referralLink}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-mono truncate"
            />
            <button
              onClick={copyRefLink}
              className={`p-2 rounded-xl border transition-colors ${
                refCopied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {refCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          {/* Referral bonus info */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 mb-4 space-y-2">
            <p className="text-xs font-semibold text-indigo-200">Referral Rewards</p>
            <div className="text-[11px] text-indigo-300/80 leading-relaxed space-y-1">
              <p><span className="text-indigo-200 font-medium">Generation:</span> 15% of cost goes to you + 10 bonus likes</p>
              <p><span className="text-indigo-200 font-medium">Purchase:</span> 15% of cost goes to you + 15 bonus likes</p>
              <p><span className="text-indigo-200 font-medium">Bonus:</span> +5 likes for each invited user</p>
            </div>
            <p className="text-[10px] text-indigo-400/60 italic">More referral bonuses coming soon!</p>
          </div>

          {/* User / Creator tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setRefTab('user'); setRefPage(0); }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                refTab === 'user' ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => { setRefTab('creator'); setRefPage(0); }}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                refTab === 'creator' ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              Creators
            </button>
          </div>

          {/* Referral list */}
          {refItems.length > 0 ? (
            <>
              <div className="space-y-2">
                {refItems.map((r) => (
                  <div key={r.wallet} className="flex items-center justify-between py-2 px-3 rounded-xl bg-zinc-950/50 border border-zinc-800/30">
                    <button onClick={() => onViewProfile?.(r.wallet)} className="flex items-center gap-2 hover:opacity-80">
                      {(() => {
                        const rp = refProfiles.get(r.wallet);
                        const av = rp ? (getTwitterAvatarUrl(rp.twitter) || rp.avatar_url) : null;
                        return av ? <img src={av} className="w-6 h-6 rounded-full object-cover" alt="" /> : <SolanaAvatar size={24} />;
                      })()}
                      <span className="text-xs font-mono text-zinc-300">{shortAddr(r.wallet)}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.is_creator ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {r.is_creator ? 'Creator' : 'User'}
                      </span>
                      <span className="text-[10px] text-zinc-600">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              {refTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-3">
                  <button
                    onClick={() => setRefPage(Math.max(0, refPage - 1))}
                    disabled={refPage === 0}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-zinc-400">{refPage + 1} / {refTotalPages}</span>
                  <button
                    onClick={() => setRefPage(Math.min(refTotalPages - 1, refPage + 1))}
                    disabled={refPage >= refTotalPages - 1}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-zinc-500 text-sm">
              {refTab === 'creator' ? 'No creator referrals yet' : 'No user referrals yet'}
            </div>
          )}
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingWork && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => { setViewingWork(null); setPromptCopied(false); }}>
          <div className="relative max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => { setViewingWork(null); setPromptCopied(false); }}
              className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            {/* Image */}
            <div className="rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-950 flex-shrink-0">
              <img
                src={viewingWork.imageUrl}
                alt={viewingWork.prompt}
                className="w-full max-h-[60vh] object-contain"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>

            {/* Prompt + Actions */}
            <div className="mt-3 bg-zinc-900/90 rounded-xl border border-zinc-800 p-4 space-y-3">
              <p className="text-sm text-zinc-300 leading-relaxed line-clamp-4">
                <span className="font-semibold text-zinc-100 mr-2">{t('feed.prompt')}</span>
                {viewingWork.prompt}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewingWork.prompt);
                    setPromptCopied(true);
                    setTimeout(() => setPromptCopied(false), 2000);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    promptCopied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                  }`}
                >
                  {promptCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Prompt</>}
                </button>
                <button
                  onClick={() => handleDownload(viewingWork)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    downloadCopied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-500 text-white hover:bg-indigo-600'
                  }`}
                >
                  {downloadCopied ? <><Check size={16} /> Link Copied!</> : <><Download size={16} /> Download</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verify Twitter Modal */}
      {showVerifyModal && verifyCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowVerifyModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Shield size={20} className="text-blue-400" />
                Verify Profile
              </h3>
              <button onClick={() => setShowVerifyModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-zinc-400">1. Post a tweet with your verification code:</p>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Verifying my Solia profile: ${verifyCode}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                <Twitter size={16} />
                Post Verification Tweet
              </a>
              <p className="text-sm text-zinc-400 mt-2">2. Paste the tweet URL here:</p>
              <input
                type="text"
                placeholder="https://x.com/username/status/..."
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-500">You can delete the tweet after verification.</p>
            </div>

            {verifyResult === 'success' && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <BadgeCheck size={18} className="text-emerald-400" />
                <span className="text-sm text-emerald-300 font-medium">Profile verified!</span>
              </div>
            )}
            {verifyResult === 'fail' && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                <X size={18} className="text-red-400" />
                <span className="text-sm text-red-300 font-medium">Code not found in tweet or username mismatch. Check the URL.</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                disabled={verifyLoading || !tweetUrl.trim()}
                onClick={async () => {
                  setVerifyLoading(true);
                  setVerifyResult(null);
                  try {
                    const username = extractTwitterUsername(twitter);
                    if (!username || !verifyCode) { setVerifyResult('fail'); setVerifyLoading(false); return; }

                    // Verify via Twitter oEmbed API (public, CORS-friendly)
                    const url = tweetUrl.trim().replace('x.com', 'twitter.com');
                    console.log('[verify] Checking tweet via oEmbed:', url);
                    const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`, {
                      signal: AbortSignal.timeout(10000),
                    });

                    if (!res.ok) {
                      console.log('[verify] oEmbed HTTP', res.status);
                      setVerifyResult('fail');
                      return;
                    }

                    const data = await res.json();
                    console.log('[verify] oEmbed response:', data);

                    // Check that tweet contains verification code
                    const tweetHtml = data.html || '';
                    const authorUrl = (data.author_url || '').toLowerCase();
                    const authorName = data.author_name || '';

                    const codeFound = tweetHtml.includes(verifyCode);
                    const usernameMatch = authorUrl.includes(`/${username.toLowerCase()}`);

                    console.log('[verify] Code found:', codeFound, 'Username match:', usernameMatch);

                    if (codeFound && usernameMatch) {
                      const name = authorName || displayName || username;
                      await db.markProfileVerified(walletAddr, name);
                      setVerified(true);
                      if (authorName) setDisplayName(authorName);
                      setVerifyResult('success');
                      setTimeout(() => setShowVerifyModal(false), 1500);
                    } else {
                      setVerifyResult('fail');
                    }
                  } catch (err) {
                    console.log('[verify] Error:', err);
                    setVerifyResult('fail');
                  } finally {
                    setVerifyLoading(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {verifyLoading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                Check Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t('prof.editTitle')}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <Twitter className="text-zinc-400 shrink-0" size={20} />
                  <input 
                    type="text" 
                    placeholder="@username or https://x.com/username" 
                    value={tempTwitter}
                    onChange={(e) => setTempTwitter(e.target.value)}
                    className="bg-transparent border-none outline-none flex-1 text-sm text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1 px-1">+ used as your profile avatar</p>
              </div>
              <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                <Send className="text-zinc-400 shrink-0" size={20} />
                <input 
                  type="text" 
                  placeholder={t('prof.tgLink')} 
                  value={tempTelegram}
                  onChange={(e) => setTempTelegram(e.target.value)}
                  className="bg-transparent border-none outline-none flex-1 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                <Youtube className="text-zinc-400 shrink-0" size={20} />
                <input 
                  type="text" 
                  placeholder={t('prof.ytLink')} 
                  value={tempYoutube}
                  onChange={(e) => setTempYoutube(e.target.value)}
                  className="bg-transparent border-none outline-none flex-1 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveModal}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Followers / Following Modal */}
      {showFollowList && (
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowFollowList(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header with tabs */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => openFollowList('followers')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${showFollowList === 'followers' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-500'}`}
              >
                {t('prof.followers')} ({followers.length})
              </button>
              <button
                onClick={() => openFollowList('following')}
                className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${showFollowList === 'following' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-500'}`}
              >
                {t('prof.following')} ({following.length})
              </button>
              <button onClick={() => setShowFollowList(null)} className="px-3 text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-2">
              {(showFollowList === 'followers' ? followers : following).length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-8">No {showFollowList} yet</p>
              ) : (
                (showFollowList === 'followers' ? followers : following).map(addr => {
                  const prof = followListProfiles.get(addr);
                  const isMe = addr === walletAddr;
                  const amFollowing = followListStatuses.get(addr) || false;
                  const avatarUrl = prof ? getTwitterAvatarUrl(prof.twitter) || prof.avatar_url : null;
                  const name = prof?.display_name || shortAddr(addr);
                  return (
                    <div key={addr} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800/50 transition-colors">
                      <button onClick={() => { setShowFollowList(null); onViewProfile?.(addr); }} className="shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                        ) : (
                          <SolanaAvatar size={40} />
                        )}
                      </button>
                      <button onClick={() => { setShowFollowList(null); onViewProfile?.(addr); }} className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium text-zinc-100 truncate">{name}</div>
                        <div className="text-xs text-zinc-500 truncate">{shortAddr(addr)}</div>
                      </button>
                      {walletAddr && !isMe && (
                        <button
                          onClick={() => toggleFollowInList(addr)}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            amFollowing ? 'bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-400' : 'bg-indigo-500 text-white hover:bg-indigo-600'
                          }`}
                        >
                          {amFollowing ? 'Unfollow' : 'Follow'}
                        </button>
                      )}
                      {isMe && (
                        <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-500">You</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
