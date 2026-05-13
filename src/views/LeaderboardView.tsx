import { FC, useEffect, useState } from 'react';
import { Trophy, Medal, Award, Heart, Users, Link2, Loader2, BadgeCheck, Download, ShoppingCart, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n';
import { useUnifiedWallet } from '../hooks/useUnifiedWallet';
import { TREASURY_WALLET } from '../lib/solana';
import * as db from '../lib/database';
import { SolanaAvatar } from '../components/SolanaAvatar';
import { getTwitterAvatarUrl, extractTwitterUsername, getProfileDisplayName } from '../lib/utils';
import { BannerCarousel } from '../components/BannerCarousel';
import { PROMO_BANNERS } from '../config/banners';

const TREASURY = 'GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA';

interface LeaderboardUser {
  rank: number;
  address: string;
  generations: number;
  totalLikes: number;
  avatar_url: string | null;
  twitter: string;
  telegram: string;
  youtube: string;
  verified: boolean;
  verified_org: boolean;
  display_name: string | null;
}

type LeaderboardTab = 'generations' | 'likes' | 'creators' | 'followers' | 'purchased';
type TimePeriod = '24h' | '7d' | '30d' | 'all';

const PERIOD_HOURS: Record<TimePeriod, number | undefined> = {
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
  'all': undefined,
};

function shortAddr(addr: string) {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

export const LeaderboardView: FC<{ onViewProfile?: (address: string) => void }> = ({ onViewProfile }) => {
  const { t } = useI18n();
  const { publicKey } = useUnifiedWallet();
  const isAdmin = publicKey?.toBase58() === TREASURY_WALLET.toBase58();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('generations');
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [topReferrers, setTopReferrers] = useState<{ wallet: string; creator_count: number }[]>([]);
  const [topFollowers, setTopFollowers] = useState<{ wallet: string; follower_count: number }[]>([]);
  const [topPurchasers, setTopPurchasers] = useState<{ wallet: string; purchase_count: number }[]>([]);
  const [purchaserProfiles, setPurchaserProfiles] = useState<Map<string, { twitter: string; display_name: string | null; avatar_url: string | null; verified: boolean; verified_org: boolean; post_count?: number }>>(new Map());
  const [followerProfiles, setFollowerProfiles] = useState<Map<string, { twitter: string; display_name: string | null; avatar_url: string | null; verified: boolean; verified_org: boolean; post_count?: number }>>(new Map());
  const [referrerProfiles, setReferrerProfiles] = useState<Map<string, { twitter: string; telegram: string; youtube: string; display_name: string | null; avatar_url: string | null; post_count?: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const hours = PERIOD_HOURS[period];
    Promise.all([
      db.getLeaderboard(hours),
      db.getTopReferrersCreators(hours),
      db.getTopByFollowers(50),
    ]).then(async ([data, refs, followers]) => {
      setLeaderboard(data.map((u, i) => ({
        rank: i + 1,
        address: u.wallet,
        generations: u.generations,
        totalLikes: u.total_likes,
        avatar_url: u.avatar_url,
        twitter: u.twitter,
        telegram: u.telegram,
        youtube: u.youtube,
        verified: u.verified,
        verified_org: !!u.verified_org || u.wallet === TREASURY,
        display_name: u.display_name,
      })));
      setTopReferrers(refs);

      // Fetch profiles for referrers
      if (refs.length > 0) {
        try {
          const profiles = await db.getProfilesBatch(refs.map(r => r.wallet));
          const counts = await db.getPostCountsBatch(refs.map(r => r.wallet));
          const map = new Map<string, { twitter: string; telegram: string; youtube: string; display_name: string | null; avatar_url: string | null; post_count?: number }>();
          profiles.forEach((p, wallet) => {
            map.set(wallet, { twitter: p.twitter || '', telegram: p.telegram || '', youtube: p.youtube || '', display_name: p.display_name || null, avatar_url: p.avatar_url || null, post_count: counts.get(wallet) ?? 0 });
          });
          setReferrerProfiles(map);
        } catch {}
      }

      setTopFollowers(followers);
      // Fetch profiles for top followers
      if (followers.length > 0) {
        try {
          const fProfiles = await db.getProfilesBatch(followers.map(f => f.wallet));
          const fCounts = await db.getPostCountsBatch(followers.map(f => f.wallet));
          const fMap = new Map<string, { twitter: string; display_name: string | null; avatar_url: string | null; verified: boolean; verified_org: boolean; post_count?: number }>();
          fProfiles.forEach((p, wallet) => {
            fMap.set(wallet, { twitter: p.twitter || '', display_name: p.display_name || null, avatar_url: p.avatar_url || null, verified: !!p.verified, verified_org: !!p.verified_org || wallet === TREASURY, post_count: fCounts.get(wallet) ?? 0 });
          });
          setFollowerProfiles(fMap);
        } catch {}
      }

      // Load top purchasers
      try {
        const purchasers = await db.getTopPurchasers(50);
        setTopPurchasers(purchasers);
        if (purchasers.length > 0) {
          const pProfiles = await db.getProfilesBatch(purchasers.map(p => p.wallet));
          const pCounts = await db.getPostCountsBatch(purchasers.map(p => p.wallet));
          const pMap = new Map<string, { twitter: string; display_name: string | null; avatar_url: string | null; verified: boolean; verified_org: boolean; post_count?: number }>();
          pProfiles.forEach((p, wallet) => {
            pMap.set(wallet, { twitter: p.twitter || '', display_name: p.display_name || null, avatar_url: p.avatar_url || null, verified: !!p.verified, verified_org: !!p.verified_org || wallet === TREASURY, post_count: pCounts.get(wallet) ?? 0 });
          });
          setPurchaserProfiles(pMap);
        }
      } catch {}

      setLoading(false);
    });
  }, [period]);

  const treasuryAddr = TREASURY_WALLET.toBase58();
  const filteredReferrers = topReferrers.filter(r => r.wallet !== treasuryAddr);

  const sortedLeaderboard = [...leaderboard]
    .sort((a, b) => {
      if (activeTab === 'generations') return b.generations - a.generations;
      return b.totalLikes - a.totalLikes;
    })
    .map((user, idx) => ({ ...user, rank: idx + 1 }));

  const [showExportMenu, setShowExportMenu] = useState(false);

  const downloadCsv = (tab: LeaderboardTab) => {
    let csv = '';
    if (tab === 'followers') {
      csv = 'Rank,Wallet,Twitter,Display Name,Followers\n';
      topFollowers.forEach((item, idx) => {
        const prof = followerProfiles.get(item.wallet);
        csv += `${idx + 1},${item.wallet},${prof?.twitter ? extractTwitterUsername(prof.twitter) || prof.twitter : ''},${prof?.display_name || ''},${item.follower_count}\n`;
      });
    } else if (tab === 'creators') {
      csv = 'Rank,Wallet,Twitter,Display Name,Creators Invited\n';
      filteredReferrers.forEach((ref, idx) => {
        const prof = referrerProfiles.get(ref.wallet);
        csv += `${idx + 1},${ref.wallet},${prof?.twitter ? extractTwitterUsername(prof.twitter) || prof.twitter : ''},${prof?.display_name || ''},${ref.creator_count}\n`;
      });
    } else if (tab === 'purchased') {
      csv = 'Rank,Wallet,Twitter,Display Name,Purchases\n';
      topPurchasers.forEach((item, idx) => {
        const prof = purchaserProfiles.get(item.wallet);
        csv += `${idx + 1},${item.wallet},${prof?.twitter ? extractTwitterUsername(prof.twitter) || prof.twitter : ''},${prof?.display_name || ''},${item.purchase_count}\n`;
      });
    } else if (tab === 'likes') {
      csv = 'Rank,Wallet,Twitter,Display Name,Likes\n';
      [...leaderboard].sort((a, b) => b.totalLikes - a.totalLikes).forEach((user, idx) => {
        csv += `${idx + 1},${user.address},${user.twitter ? extractTwitterUsername(user.twitter) || user.twitter : ''},${user.display_name || ''},${user.totalLikes}\n`;
      });
    } else {
      csv = 'Rank,Wallet,Twitter,Display Name,Generations,Likes\n';
      sortedLeaderboard.forEach((user) => {
        csv += `${user.rank},${user.address},${user.twitter ? extractTwitterUsername(user.twitter) || user.twitter : ''},${user.display_name || ''},${user.generations},${user.totalLikes}\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solia_top_${tab}_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  return (
    <div className="flex flex-col gap-6 p-4 pb-24 max-w-md lg:max-w-2xl mx-auto w-full">
      <BannerCarousel banners={PROMO_BANNERS} />

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">{t('lb.title')}</h2>
        <p className="text-zinc-400 text-sm">
          {t('lb.desc')}
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5 bg-zinc-900/50 p-1 rounded-2xl border border-zinc-800/50">
          {([
            { key: 'generations', label: 'Creators', icon: <Users size={14} />, color: 'bg-indigo-500 shadow-indigo-500/20' },
            { key: 'purchased', label: 'Purchased', icon: <ShoppingCart size={14} />, color: 'bg-amber-500 shadow-amber-500/20' },
            { key: 'creators', label: 'Referrals', icon: <Link2 size={14} />, color: 'bg-emerald-500 shadow-emerald-500/20' },
          ] as const).map(({ key, label, icon, color }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setShowSubMenu(false); }}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === key ? `${color} text-white shadow-lg` : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {icon}{label}
            </button>
          ))}
          {/* Social tab — relative для дропдауна */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowSubMenu(v => !v)}
              className={`w-full flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'likes' || activeTab === 'followers'
                  ? 'bg-pink-500 shadow-lg shadow-pink-500/20 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Heart size={14} />
              Social
              <ChevronDown size={12} className={`transition-transform ${showSubMenu ? 'rotate-180' : ''}`} />
            </button>
            {/* Dropdown прямо под кнопкой */}
            {showSubMenu && (
              <div className="absolute right-0 top-full mt-1.5 z-30 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl min-w-[140px]">
                <button
                  onClick={() => { setActiveTab('followers'); setShowSubMenu(false); }}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'followers' ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Users size={14} className={activeTab === 'followers' ? 'text-purple-400' : 'text-zinc-500'} />
                  Followers
                </button>
                <div className="h-px bg-zinc-800 mx-3" />
                <button
                  onClick={() => { setActiveTab('likes'); setShowSubMenu(false); }}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'likes' ? 'text-pink-400 bg-pink-500/10' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Heart size={14} className={activeTab === 'likes' ? 'text-pink-400' : 'text-zinc-500'} />
                  By Likes
                </button>
              </div>
            )}
          </div>
        </div>
        {showSubMenu && <div className="fixed inset-0 z-20" onClick={() => setShowSubMenu(false)} />}
      </div>

      {/* Time Period Filter + Export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['24h', '7d', '30d', 'all'] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {p === 'all' ? 'All' : p.toUpperCase()}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 text-[11px] sm:text-xs font-medium transition-colors"
            >
              <Download size={12} />
              CSV
              <ChevronDown size={11} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 z-30 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl min-w-[160px]">
                {([
                  { key: 'generations', label: 'Creators' },
                  { key: 'purchased', label: 'Purchased' },
                  { key: 'creators', label: 'Referrals' },
                  { key: 'followers', label: 'Followers' },
                  { key: 'likes', label: 'By Likes' },
                ] as const).map(({ key, label }, i, arr) => (
                  <div key={key}>
                    <button
                      onClick={() => downloadCsv(key)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Download size={13} className="text-zinc-500" />
                      {label}
                    </button>
                    {i < arr.length - 1 && <div className="h-px bg-zinc-800 mx-3" />}
                  </div>
                ))}
              </div>
            )}
            {showExportMenu && <div className="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />}
          </div>
        )}
      </div>

      {activeTab === 'followers' ? (
        /* Top by Followers */
        <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('lb.rankCreator')}</span>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('lb.tabFollowers')}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
            ) : topFollowers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No followers data yet</div>
            ) : topFollowers.map((item, idx) => {
              const prof = followerProfiles.get(item.wallet);
              const xAvatar = prof?.twitter ? getTwitterAvatarUrl(prof.twitter) : null;
              const src = xAvatar || prof?.avatar_url;
              return (
                <div key={item.wallet} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => onViewProfile?.(item.wallet)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      idx === 0 ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' :
                      idx === 1 ? 'bg-zinc-300 text-zinc-800 shadow-lg shadow-zinc-300/20' :
                      idx === 2 ? 'bg-amber-700 text-amber-100 shadow-lg shadow-amber-700/20' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {idx === 0 ? <Trophy size={16} /> :
                       idx === 1 ? <Medal size={16} /> :
                       idx === 2 ? <Award size={16} /> :
                       idx + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      {src ? (
                        <img src={src} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                      ) : (
                        <SolanaAvatar size={24} />
                      )}
                      <span className="font-mono text-sm text-zinc-200">{getProfileDisplayName(prof ? { ...prof, wallet: item.wallet } : null, item.wallet)}</span>
                      {(() => {
                        const _gold = prof?.verified_org || item.wallet === TREASURY;
                        const _purple = ((prof as any)?.post_count ?? 0) >= 20 && !_gold;
                        const _blue = prof?.verified && !_gold && !_purple;
                        return _gold ? <BadgeCheck size={16} className="fill-yellow-400 text-zinc-950 shrink-0" />
                          : _purple ? <BadgeCheck size={16} className="fill-violet-500 text-zinc-950 shrink-0" />
                          : _blue ? <BadgeCheck size={16} className="fill-blue-500 text-zinc-950 shrink-0" />
                          
                          : null;
                      })()}
                      {prof?.twitter && (
                        <a href={prof.twitter.startsWith('http') ? prof.twitter : `https://x.com/${prof.twitter}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>
                      )}
                      {prof?.telegram && (
                        <a href={prof.telegram.startsWith('http') ? prof.telegram : `https://t.me/${prof.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        </a>
                      )}
                      {prof?.youtube && (
                        <a href={prof.youtube.startsWith('http') ? prof.youtube : `https://youtube.com/${prof.youtube}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-red-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="font-bold text-purple-400">{item.follower_count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'creators' ? (
        /* Creators referral leaderboard */
        <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Referrer</span>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Creators invited</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
            ) : filteredReferrers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No referrers yet</div>
            ) : filteredReferrers.map((ref, idx) => {
              const prof = referrerProfiles.get(ref.wallet);
              const xAvatar = prof?.twitter ? getTwitterAvatarUrl(prof.twitter) : null;
              return (
                <div key={ref.wallet} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => onViewProfile?.(ref.wallet)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      idx === 0 ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' :
                      idx === 1 ? 'bg-zinc-300 text-zinc-800 shadow-lg shadow-zinc-300/20' :
                      idx === 2 ? 'bg-amber-700 text-amber-100 shadow-lg shadow-amber-700/20' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {idx === 0 ? <Trophy size={16} /> :
                       idx === 1 ? <Medal size={16} /> :
                       idx === 2 ? <Award size={16} /> :
                       idx + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      {xAvatar ? (
                        <img src={xAvatar} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                      ) : (
                        <SolanaAvatar size={24} />
                      )}
                      <span className="font-mono text-sm text-zinc-200">{getProfileDisplayName(prof ? { ...prof, wallet: ref.wallet } : null, ref.wallet)}</span>
                      {prof?.twitter && (
                        <a href={prof.twitter.startsWith('http') ? prof.twitter : `https://x.com/${prof.twitter}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>
                      )}
                      {prof?.telegram && (
                        <a href={prof.telegram.startsWith('http') ? prof.telegram : `https://t.me/${prof.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        </a>
                      )}
                      {prof?.youtube && (
                        <a href={prof.youtube.startsWith('http') ? prof.youtube : `https://youtube.com/${prof.youtube}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-red-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="font-bold text-emerald-400">{ref.creator_count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'purchased' ? (
        <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Buyer</span>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Purchases</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
            ) : topPurchasers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No purchases yet</div>
            ) : topPurchasers.map((item, idx) => {
              const prof = purchaserProfiles.get(item.wallet);
              const xAvatar = prof?.twitter ? getTwitterAvatarUrl(prof.twitter) : null;
              const src = xAvatar || prof?.avatar_url;
              return (
                <div key={item.wallet} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => onViewProfile?.(item.wallet)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      idx === 0 ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' :
                      idx === 1 ? 'bg-zinc-300 text-zinc-800 shadow-lg shadow-zinc-300/20' :
                      idx === 2 ? 'bg-amber-700 text-amber-100 shadow-lg shadow-amber-700/20' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {idx === 0 ? <Trophy size={16} /> : idx === 1 ? <Medal size={16} /> : idx === 2 ? <Award size={16} /> : idx + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      {src ? <img src={src} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" /> : <SolanaAvatar size={24} />}
                      <span className="font-mono text-sm text-zinc-200">{getProfileDisplayName(prof ? { ...prof, wallet: item.wallet } : null, item.wallet)}</span>
                      {(() => {
                        const _gold = prof?.verified_org || item.wallet === TREASURY;
                        const _purple = ((prof as any)?.post_count ?? 0) >= 20 && !_gold;
                        const _blue = prof?.verified && !_gold && !_purple;
                        return _gold ? <BadgeCheck size={16} className="fill-yellow-400 text-zinc-950 shrink-0" />
                          : _purple ? <BadgeCheck size={16} className="fill-violet-500 text-zinc-950 shrink-0" />
                          : _blue ? <BadgeCheck size={16} className="fill-blue-500 text-zinc-950 shrink-0" />
                          
                          : null;
                      })()}
                      {prof?.twitter && (
                        <a href={prof.twitter.startsWith('http') ? prof.twitter : `https://x.com/${prof.twitter}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="font-bold text-amber-400">{item.purchase_count}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">bought</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Generations / Likes leaderboard */
        <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('lb.rankCreator')}</span>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {activeTab === 'generations' ? t('lb.generations') : t('lb.likes')}
            </span>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
            ) : sortedLeaderboard.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No creators yet</div>
            ) : sortedLeaderboard.map((user) => (
              <div key={user.address} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => onViewProfile?.(user.address)}>
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    user.rank === 1 ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' :
                    user.rank === 2 ? 'bg-zinc-300 text-zinc-800 shadow-lg shadow-zinc-300/20' :
                    user.rank === 3 ? 'bg-amber-700 text-amber-100 shadow-lg shadow-amber-700/20' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {user.rank === 1 ? <Trophy size={16} /> :
                     user.rank === 2 ? <Medal size={16} /> :
                     user.rank === 3 ? <Award size={16} /> :
                     user.rank}
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const xAvatar = getTwitterAvatarUrl(user.twitter);
                      const src = xAvatar || user.avatar_url;
                      return src ? (
                        <img src={src} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                      ) : (
                        <SolanaAvatar size={24} />
                      );
                    })()}
                    <span className="font-mono text-sm text-zinc-200">{getProfileDisplayName({ display_name: user.display_name, twitter: user.twitter, wallet: user.address })}</span>
                    {(() => {
                      const _gold = user.verified_org || user.address === TREASURY;
                      const _purple = user.generations >= 20 && !_gold;
                      const _blue = user.verified && !_gold && !_purple;
                      return _gold ? <BadgeCheck size={16} className="fill-yellow-400 text-zinc-950 shrink-0" />
                        : _purple ? <BadgeCheck size={16} className="fill-violet-500 text-zinc-950 shrink-0" />
                          : _blue ? <BadgeCheck size={16} className="fill-blue-500 text-zinc-950 shrink-0" />
                        
                        : null;
                    })()}
                    {user.twitter && (
                      <a href={user.twitter.startsWith('http') ? user.twitter : `https://x.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      </a>
                    )}
                    {user.telegram && (
                      <a href={user.telegram.startsWith('http') ? user.telegram : `https://t.me/${user.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                      </a>
                    )}
                    {user.youtube && (
                      <a href={user.youtube.startsWith('http') ? user.youtube : `https://youtube.com/${user.youtube}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-red-400 transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`font-bold ${activeTab === 'generations' ? 'text-indigo-400' : 'text-pink-400'}`}>
                    {activeTab === 'generations'
                      ? user.generations.toLocaleString()
                      : user.totalLikes.toLocaleString()
                    }
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {activeTab === 'generations' ? t('lb.skrSpent') : t('lb.totalLikes')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
