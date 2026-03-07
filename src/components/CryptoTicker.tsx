import { FC, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useI18n } from '../i18n';

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export const CryptoTicker: FC = () => {
  const FALLBACK: CoinData[] = [
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '', current_price: 97500, price_change_percentage_24h: 2.1 },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', image: '', current_price: 3450, price_change_percentage_24h: -0.5 },
    { id: 'tether', symbol: 'usdt', name: 'Tether', image: '', current_price: 1.0, price_change_percentage_24h: 0.01 },
    { id: 'solana', symbol: 'sol', name: 'Solana', image: '', current_price: 195, price_change_percentage_24h: 3.4 },
    { id: 'binancecoin', symbol: 'bnb', name: 'BNB', image: '', current_price: 650, price_change_percentage_24h: 1.2 },
    { id: 'ripple', symbol: 'xrp', name: 'XRP', image: '', current_price: 2.35, price_change_percentage_24h: -1.1 },
    { id: 'usd-coin', symbol: 'usdc', name: 'USDC', image: '', current_price: 1.0, price_change_percentage_24h: 0.0 },
    { id: 'cardano', symbol: 'ada', name: 'Cardano', image: '', current_price: 0.98, price_change_percentage_24h: 4.2 },
    { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', image: '', current_price: 0.32, price_change_percentage_24h: -2.3 },
    { id: 'avalanche-2', symbol: 'avax', name: 'Avalanche', image: '', current_price: 38.5, price_change_percentage_24h: 1.8 },
  ];

  // Show cached or fallback data immediately — never block render
  const getInitialCoins = (): CoinData[] => {
    try {
      const cached = sessionStorage.getItem('solia_crypto_cache');
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 10 * 60_000) return data;
      }
    } catch {}
    return FALLBACK;
  };

  const [coins, setCoins] = useState<CoinData[]>(getInitialCoins);

  useEffect(() => {
    const CACHE_KEY = 'solia_crypto_cache';
    const RETRY_BACKOFF = 15 * 60_000;
    let failedAt = 0;

    const fetchPrices = async () => {
      if (failedAt && Date.now() - failedAt < RETRY_BACKOFF) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h',
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data: CoinData[] = await res.json();
        setCoins(data);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
        failedAt = 0;
      } catch {
        failedAt = Date.now();
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(4)}`;
  };

  // Double the items for seamless loop
  const tickerItems = [...coins, ...coins];

  return (
    <div className="w-full overflow-hidden bg-zinc-900/50 border border-zinc-800/30 rounded-xl py-2">
      <div className="flex animate-scroll-x gap-6 w-max">
        {tickerItems.map((coin, idx) => (
          <div key={`${coin.id}-${idx}`} className="flex items-center gap-2 shrink-0 px-2">
            {coin.image && (
              <img src={coin.image} alt={coin.symbol} className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
            )}
            <span className="text-xs font-semibold text-zinc-300 uppercase">{coin.symbol}</span>
            <span className="text-xs text-zinc-100 font-medium">{formatPrice(coin.current_price)}</span>
            <span className={`flex items-center gap-0.5 text-[10px] font-medium ${
              coin.price_change_percentage_24h >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {coin.price_change_percentage_24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {Math.abs(coin.price_change_percentage_24h).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
