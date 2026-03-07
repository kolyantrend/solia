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

// Binance symbols to track (symbol -> display name)
const TRACKED_COINS: { symbol: string; name: string; binance: string }[] = [
  { symbol: 'btc', name: 'Bitcoin', binance: 'BTCUSDT' },
  { symbol: 'eth', name: 'Ethereum', binance: 'ETHUSDT' },
  { symbol: 'sol', name: 'Solana', binance: 'SOLUSDT' },
  { symbol: 'bnb', name: 'BNB', binance: 'BNBUSDT' },
  { symbol: 'xrp', name: 'XRP', binance: 'XRPUSDT' },
  { symbol: 'ada', name: 'Cardano', binance: 'ADAUSDT' },
  { symbol: 'doge', name: 'Dogecoin', binance: 'DOGEUSDT' },
  { symbol: 'avax', name: 'Avalanche', binance: 'AVAXUSDT' },
  { symbol: 'dot', name: 'Polkadot', binance: 'DOTUSDT' },
  { symbol: 'matic', name: 'Polygon', binance: 'MATICUSDT' },
];

export const CryptoTicker: FC = () => {
  const FALLBACK: CoinData[] = TRACKED_COINS.map((c) => ({
    id: c.symbol, symbol: c.symbol, name: c.name, image: '',
    current_price: 0, price_change_percentage_24h: 0,
  }));

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
    const RETRY_BACKOFF = 5 * 60_000;
    let failedAt = 0;

    const fetchPrices = async () => {
      if (failedAt && Date.now() - failedAt < RETRY_BACKOFF) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const symbols = TRACKED_COINS.map((c) => `"${c.binance}"`).join(',');
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const tickers: { symbol: string; lastPrice: string; priceChangePercent: string }[] = await res.json();
        const data: CoinData[] = TRACKED_COINS.map((c) => {
          const t = tickers.find((tk) => tk.symbol === c.binance);
          return {
            id: c.symbol, symbol: c.symbol, name: c.name, image: '',
            current_price: t ? parseFloat(t.lastPrice) : 0,
            price_change_percentage_24h: t ? parseFloat(t.priceChangePercent) : 0,
          };
        });
        setCoins(data);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
        failedAt = 0;
      } catch {
        failedAt = Date.now();
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
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
