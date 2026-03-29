import { FC, useState, useEffect } from 'react';
import { BadgeCheck } from 'lucide-react';
import { getTopGenerators12h } from '../lib/database';
import { TREASURY_WALLET } from '../lib/solana';
import { SolanaAvatar } from './SolanaAvatar';
import { getTwitterAvatarUrl, extractTwitterUsername } from '../lib/utils';

interface TopCreator {
  wallet: string;
  count: number;
  avatar_url: string | null;
  twitter: string;
  verified: boolean;
  display_name: string | null;
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
  display_name: null,
}));

export const TopCreatorsTicker: FC<{ onViewProfile?: (address: string) => void }> = ({ onViewProfile }) => {
  const [creators, setCreators] = useState<TopCreator[]>([]);

  useEffect(() => {
    const fetch = () => getTopGenerators12h().then(data => setCreators(data)).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 120000);
    return () => clearInterval(interval);
  }, []);

  // Pad real creators with placeholders to fill at least 6 slots
  const items: TopCreator[] = creators.length > 0
    ? [...creators, ...PLACEHOLDERS.slice(0, Math.max(0, 6 - creators.length))]
    : PLACEHOLDERS;

  // Double items for seamless loop
  const tickerItems = [...items, ...items];

  return (
    <div className="w-full overflow-hidden bg-zinc-900/50 border border-zinc-800/30 rounded-xl py-1">
      <div className="flex animate-scroll-x-reverse gap-4 w-max">
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
                  <span className="text-[11px] font-semibold text-zinc-200 leading-tight">{creator.display_name || (creator.twitter ? (extractTwitterUsername(creator.twitter) || shortAddr(creator.wallet)) : shortAddr(creator.wallet))}</span>
                  {creator.verified && <BadgeCheck size={10} className="text-blue-400 shrink-0" />}
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
