/**
 * SKR/USDT price fetcher with caching.
 * Uses Jupiter aggregator price API (free, no key needed).
 */

const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const CACHE_TTL_MS = 5 * 60_000; // 5 minute cache
const ERROR_BACKOFF_MS = 30 * 60_000; // 30 min backoff on repeated failures

let cachedPrice: number | null = null;
let cachedAt = 0;
let errorAt = 0;

/**
 * Fetches the current SKR price in USDT.
 * Tries Jupiter first, then DexScreener as backup.
 * Falls back to a hardcoded price if both fail.
 */
export async function getSkrPriceUsd(): Promise<number> {
  const now = Date.now();

  // Return cache if fresh
  if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  // Skip API calls during error backoff period
  if (errorAt && now - errorAt < ERROR_BACKOFF_MS) {
    return cachedPrice ?? 0.02305;
  }

  // Skip Jupiter (401 errors), use DexScreener directly (5s timeout)
  try {
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 5000);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SKR_MINT}`, { signal: c2.signal });
    clearTimeout(t2);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const price = parseFloat(json.pairs?.[0]?.priceUsd);
    if (!price || isNaN(price) || price <= 0) throw new Error('Invalid price');
    cachedPrice = price;
    cachedAt = now;
    errorAt = 0;
    return price;
  } catch {
    // Both APIs failed — enter backoff
    errorAt = now;
    return cachedPrice ?? 0.02305;
  }
}

/**
 * Calculate how many SKR tokens are needed for a given USDT amount.
 * Returns the amount rounded up to 1 decimal.
 */
export async function usdtToSkr(usdtAmount: number): Promise<number> {
  const price = await getSkrPriceUsd();
  const skrAmount = usdtAmount / price;
  return Math.ceil(skrAmount * 10) / 10; // round up to 1 decimal
}

/** Generation cost: 0.4 USDT equivalent in SKR */
export async function getGenerationCostSkr(): Promise<number> {
  return usdtToSkr(0.4);
}

/** Purchase cost: 1 USDT equivalent in SKR */
export async function getPurchaseCostSkr(): Promise<number> {
  return usdtToSkr(1.0);
}
