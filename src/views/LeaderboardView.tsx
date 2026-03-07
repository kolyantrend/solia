import { FC, useEffect, useState } from 'react';
import { Trophy, Medal, Award, Heart, Users, Link2, Loader2, BadgeCheck, Twitter } from 'lucide-react';
import { useI18n } from '../i18n';
import * as db from '../lib/database';
import { SolanaAvatar } from '../components/SolanaAvatar';
import { getTwitterAvatarUrl, getProfileDisplayName, extractTwitterUsername } from '../lib/utils';
import { BannerCarousel } from '../components/BannerCarousel';
import { PROMO_BANNERS } from '../config/banners';

interface LeaderboardUser {
  rank: number;
  address: string;
  generations: number;
  totalLikes: number;
  avatar_url: string | null;
  twitter: string;
  verified: boolean;
  display_name: string | null;
}

type LeaderboardTab = 'generations' | 'likes' | 'creators';

function shortAddr(addr: string) {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

export const LeaderboardView: FC<{ onViewProfile?: (address: string) => void }> = ({ onViewProfile }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('generations');
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [topReferrers, setTopReferrers] = useState<{ wallet: string; creator_count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      db.getLeaderboard(),
      db.getTopReferrersCreators(),
    ]).then(([data, refs]) => {
      setLeaderboard(data.map((u, i) => ({
        rank: i + 1,
        address: u.wallet,
        generations: u.generations,
        totalLikes: u.total_likes,
        avatar_url: u.avatar_url,
        twitter: u.twitter,
        verified: u.verified,
        display_name: u.display_name,
      })));
      setTopReferrers(refs);
      setLoading(false);
    });
  }, []);

  const sortedLeaderboard = [...leaderboard]
    .sort((a, b) => {
      if (activeTab === 'generations') return b.generations - a.generations;
      return b.totalLikes - a.totalLikes;
    })
    .map((user, idx) => ({ ...user, rank: idx + 1 }));

  return (
    <div className="flex flex-col gap-6 p-4 pb-24 max-w-md mx-auto w-full">
      <BannerCarousel banners={PROMO_BANNERS} />

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">{t('lb.title')}</h2>
        <p className="text-zinc-400 text-sm">
          {t('lb.desc')}
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1.5 sm:gap-2 bg-zinc-900/50 p-1 rounded-2xl border border-zinc-800/50">
        <button
          onClick={() => setActiveTab('generations')}
          className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'generations'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users size={14} className="shrink-0" />
          Creators
        </button>
        <button
          onClick={() => setActiveTab('likes')}
          className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'likes'
              ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Heart size={14} className="shrink-0" />
          {t('lb.tabLikes')}
        </button>
        <button
          onClick={() => setActiveTab('creators')}
          className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === 'creators'
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Link2 size={14} className="shrink-0" />
          Referrals
        </button>
      </div>

      {activeTab === 'creators' ? (
        /* Creators referral leaderboard */
        <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/80">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Referrer</span>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Creators invited</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" size={24} /></div>
            ) : topReferrers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No referrers yet</div>
            ) : topReferrers.map((ref, idx) => (
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
                    <SolanaAvatar size={24} />
                    <span className="font-mono text-sm text-zinc-200">{shortAddr(ref.wallet)}</span>
                  </div>
                </div>
                <span className="font-bold text-emerald-400">{ref.creator_count}</span>
              </div>
            ))}
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
                    <span className="font-mono text-sm text-zinc-200">{user.display_name || (user.twitter ? (extractTwitterUsername(user.twitter) || shortAddr(user.address)) : shortAddr(user.address))}</span>
                    {user.verified && <BadgeCheck size={14} className="text-blue-400 shrink-0" />}
                    {user.twitter && (
                      <a href={user.twitter.startsWith('http') ? user.twitter : `https://x.com/${user.twitter}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-zinc-500 hover:text-blue-400 transition-colors">
                        <Twitter size={12} />
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
