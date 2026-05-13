import { FC, useState, useEffect, useRef } from 'react';
import { BadgeCheck } from 'lucide-react';
import { getTopGenerators12h } from '../lib/database';
const TREASURY = 'GqQ41MPh9b1HEt9V5FWnKZfPjdhjgnaPjPLCRcLsuprA';
import { SolanaAvatar } from './SolanaAvatar';
import { getTwitterAvatarUrl, getProfileDisplayName } from '../lib/utils';

interface TopCreator {
  wallet: string;
  count: number;
  avatar_url: string | null;
  twitter: string;
  verified: boolean;
  verified_org: boolean;
  display_name: string | null;
  post_count?: number;
}

function shortAddr(addr: string) {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

// Placeholder entries shown when no real creators exist yet
const PLACEHOLDERS: TopCreator[] = Array.from({ length: 6 }, (_, i) => ({
  wallet: `Creator${i + 1}...`,
  count: 0,
  avatar_url: null,
  twitter: '',
  verified: false,
  verified_org: false,
  display_name: null,
}));

export const TopCreatorsTicker: FC<{ onViewProfile?: (address: string) => void }> = ({ onViewProfile }) => {
  const [creators, setCreators] = useState<TopCreator[]>(() => {
    try {
      const cached = sessionStorage.getItem('solia_top_creators');
      if (!cached) return [];
      const parsed = JSON.parse(cached) as TopCreator[];
      // Invalidate cache if missing verified_org field
      if (parsed.length > 0 && parsed[0].verified_org === undefined) return [];
      return parsed;
    } catch { return []; }
  });

  useEffect(() => {
    const load = () => getTopGenerators12h().then(data => {
      setCreators(data);
      try { sessionStorage.setItem('solia_top_creators', JSON.stringify(data)); } catch {}
    }).catch(() => {});
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, []);

  // Pad real creators with placeholders to fill at least 6 slots
  const items: TopCreator[] = creators.length > 0
    ? [...creators, ...PLACEHOLDERS.slice(0, Math.max(0, 6 - creators.length))]
    : PLACEHOLDERS;

  // Double items for seamless loop
  const tickerItems = [...items, ...items];

  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    // Pause animation on touch
    if (scrollRef.current) scrollRef.current.style.animationPlayState = 'paused';
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    scrollRef.current.style.transform = `translateX(${diff}px)`;
  };
  const handleTouchEnd = () => {
    if (!scrollRef.current) return;
    scrollRef.current.style.transform = '';
    scrollRef.current.style.animationPlayState = 'running';
  };

  return (
    <div
      className="w-full overflow-hidden bg-zinc-900/50 border border-zinc-800/30 rounded-xl py-1"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div ref={scrollRef} className="flex animate-scroll-x-reverse gap-4 w-max">
        {tickerItems.map((creator, idx) => {
          const isReal = creators.length > 0;
          return (
            <button
              key={`${creator.wallet}-${idx}`}
              onClick={() => isReal && onViewProfile?.(creator.wallet)}
              className={`flex items-center gap-2 shrink-0 px-2 py-0.5 rounded-lg transition-colors ${isReal ? 'hover:bg-zinc-800/50 cursor-pointer' : 'cursor-default opacity-60'}`}
            >
              {(() => {
                const xAvatar = getTwitterAvatarUrl(creator.twitter);
                const src = xAvatar || creator.avatar_url;
                return src ? (
                  <img
                    src={src}
                    alt="avatar"
                    className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <SolanaAvatar size={28} />
                );
              })()}
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-0.5">
                  <span className="text-[11px] font-semibold text-zinc-200 leading-tight">{getProfileDisplayName(creator)}</span>
                  {(() => {
                    const _gold = creator.verified_org || creator.wallet === TREASURY;
                    const _purple = (creator.post_count ?? creator.count ?? 0) >= 20 && !_gold;
                    const _blue = creator.verified && !_gold && !_purple;
                    return _gold ? <BadgeCheck size={16} className="fill-yellow-400 text-zinc-950 shrink-0" />
                      : _purple ? <BadgeCheck size={16} className="fill-violet-500 text-zinc-950 shrink-0" />
                          : _blue ? <BadgeCheck size={16} className="fill-blue-500 text-zinc-950 shrink-0" />
                      
                      : null;
                  })()}
                </div>
                <span className="text-[9px] text-indigo-400 font-medium leading-tight">
                  {isReal ? `${creator.count} gen` : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
