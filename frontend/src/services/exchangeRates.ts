export type Currency = 'UYU' | 'USD' | 'ARS' | 'BRL';

export const FALLBACK_RATES: Record<Currency, number> = {
  UYU: 1,
  USD: 1 / 40,   // 1 USD = 40 UYU
  ARS: 28.5,     // 1 UYU = 28.5 ARS
  BRL: 1 / 7,
};

const CACHE_KEY = 'collectibles_unified_exchange_rates';
const CACHE_TS_KEY = 'collectibles_unified_exchange_rates_ts';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

let _inMemoryRates: Record<Currency, number> | null = null;
let _pendingFetch: Promise<Record<Currency, number>> | null = null;
const _listeners = new Set<(rates: Record<Currency, number>) => void>();

function getStoredRates(): Record<Currency, number> | null {
  if (_inMemoryRates) return _inMemoryRates;
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTs = localStorage.getItem(CACHE_TS_KEY);
    if (cached && cachedTs) {
      const ts = parseInt(cachedTs, 10);
      if (Date.now() - ts < CACHE_TTL_MS) {
        _inMemoryRates = JSON.parse(cached);
        return _inMemoryRates;
      }
    }
  } catch (e) {
    console.warn('[ExchangeRates] Failed to parse cached rates', e);
  }
  return null;
}

export function subscribeToExchangeRates(listener: (rates: Record<Currency, number>) => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export async function fetchUnifiedExchangeRates(): Promise<Record<Currency, number>> {
  const stored = getStoredRates();
  if (stored) return stored;
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/UYU');
      const data = await res.json();
      if (data && data.rates) {
        const liveRates: Record<Currency, number> = {
          UYU: 1,
          USD: data.rates.USD || FALLBACK_RATES.USD,
          ARS: data.rates.ARS || FALLBACK_RATES.ARS,
          BRL: data.rates.BRL || FALLBACK_RATES.BRL,
        };
        _inMemoryRates = liveRates;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(liveRates));
            localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
          } catch {}
        }
        _listeners.forEach(fn => fn(liveRates));
        return liveRates;
      }
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn('[ExchangeRates] API unavailable, using fallback rates', err);
      }
    } finally {
      _pendingFetch = null;
    }

    _inMemoryRates = FALLBACK_RATES;
    return FALLBACK_RATES;
  })();

  return _pendingFetch;
}

export function getExchangeRatesSync(): Record<Currency, number> {
  return getStoredRates() || FALLBACK_RATES;
}
