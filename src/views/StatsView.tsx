import { FC, useState, useEffect, useRef } from 'react';
import { BarChart3, Image, Wallet, ShoppingCart, BadgeCheck, Heart, MessageCircle, Tag, Users, Crown, Loader2 } from 'lucide-react';
import * as db from '../lib/database';
import { BannerCarousel } from '../components/BannerCarousel';
import { BANNERS } from '../config/banners';
import { SolanaAvatar } from '../components/SolanaAvatar';
import { getTwitterAvatarUrl, extractTwitterUsername } from '../lib/utils';

const PERIODS: { key: db.StatsPeriod; label: string }[] = [
  { key: 'day', label: '24h' },
  { key: 'week', label: '7d' },
  { key: 'month', label: '30d' },
  { key: 'all', label: 'All' },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export const StatsView: FC<{ onViewProfile?: (address: string) => void }> = ({ onViewProfile }) => {
  const [period, setPeriod] = useState<db.StatsPeriod>('all');
  const [stats, setStats] = useState<db.PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    db.getStats(period).then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, [period]);

  const cards = stats ? [
    { icon: <BarChart3 size={20} />, label: 'Total SKR Volume', value: formatNumber(stats.totalSkrVolume) + ' SKR', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    { icon: <Wallet size={20} />, label: 'Creator Earnings', value: formatNumber(stats.creatorEarnings) + ' SKR', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { icon: <Image size={20} />, label: 'Images Generated', value: formatNumber(stats.imagesGenerated), color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { icon: <Users size={20} />, label: 'Active Wallets', value: formatNumber(stats.activeWallets), color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { icon: <ShoppingCart size={20} />, label: 'Total Purchases', value: formatNumber(stats.totalPurchases), color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { icon: <BadgeCheck size={20} />, label: 'Verified Creators', value: formatNumber(stats.verifiedCreators), color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { icon: <Heart size={20} />, label: 'Total Likes', value: formatNumber(stats.totalLikes), color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
    { icon: <MessageCircle size={20} />, label: 'Total Comments', value: formatNumber(stats.totalComments), color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    { icon: <Tag size={20} />, label: 'Top Category', value: stats.topCategory, color: 'text-lime-400', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
  ] : [];

  const topFollowers = stats?.topByFollowers || [];

  // Auto-scroll through top followers
  const [followerIdx, setFollowerIdx] = useState(0);
  useEffect(() => {
    if (topFollowers.length === 0) return;
    setFollowerIdx(0);
    if (topFollowers.length === 1) return;
    
    const id = setInterval(() => {
      setFollowerIdx((prev) => (prev + 1) % topFollowers.length);
    }, 3000);
    return () => clearInterval(id);
  }, [topFollowers.length, period]);

  const currentFollower = topFollowers[followerIdx] || null;

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 pb-24">
      {/* Banner */}
      <BannerCarousel banners={BANNERS} />

      {/* Header + Period Switcher */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2">
          <BarChart3 size={18} className="text-indigo-400 shrink-0" />
          Analytics
        </h2>
        <div className="flex bg-zinc-800/50 rounded-xl p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
                period === p.key
                  ? 'bg-indigo-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-zinc-500" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className={`${card.bg} border ${card.border} rounded-2xl p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2`}
            >
              <div className={`${card.color} flex items-center gap-1`}>
                {card.icon}
                <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400 truncate">{card.label}</span>
              </div>
              <span className={`text-base sm:text-lg font-bold ${card.color} truncate`}>{card.value}</span>
            </div>
          ))}

          {/* 10th card: Top By Followers (auto-scrolling) */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-2 overflow-hidden">
            <div className="text-amber-400 flex items-center gap-1.5">
              <Crown size={20} />
              <span className="text-[11px] font-medium text-zinc-400">Top Followers</span>
            </div>
            {currentFollower ? (
              <button
                key={currentFollower.wallet}
                onClick={() => onViewProfile?.(currentFollower.wallet)}
                className="flex items-center gap-2 hover:opacity-80 min-h-[28px] animate-[fadeIn_0.4s_ease-in-out]"
              >
                <span className="text-[10px] font-bold text-amber-400/60 w-3 shrink-0">#{followerIdx + 1}</span>
                {(() => {
                  const xAvatar = getTwitterAvatarUrl(currentFollower.twitter);
                  const src = xAvatar || currentFollower.avatar_url;
                  return src ? (
                    <img src={src} alt="" className="w-6 h-6 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <SolanaAvatar size={24} />
                  );
                })()}
                <div className="flex flex-col items-start min-w-0">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs font-semibold text-zinc-200 truncate">
                      {currentFollower.display_name || (currentFollower.twitter ? extractTwitterUsername(currentFollower.twitter) : currentFollower.wallet.slice(0, 4) + '...' + currentFollower.wallet.slice(-4))}
                    </span>
                    {currentFollower.verified && <BadgeCheck size={12} className="text-blue-400 shrink-0" />}
                  </div>
                  <span className="text-[10px] text-amber-400 font-medium">{currentFollower.count} followers</span>
                </div>
              </button>
            ) : (
              <span className="text-lg font-bold text-amber-400">—</span>
            )}
            {topFollowers.length > 1 && (
              <div className="flex gap-0.5 mt-auto">
                {topFollowers.map((_, i) => (
                  <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${i === followerIdx ? 'bg-amber-400' : 'bg-zinc-700'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
