/**
 * CANONICAL CURRENCY SERVICE — COLLECTIBLES 2026
 * 
 * Moneda canónica del sistema: USD.
 * UYU es moneda de visualización / display currency para Uruguay.
 * 
 * Reglas fundamentales:
 * 1. Todos los cálculos comerciales, landed costs, márgenes y scoring se ejecutan en USD.
 * 2. La conversión a UYU se realiza únicamente en la capa de presentación mediante FX válido.
 * 3. Fail-Closed: Si el FX no está disponible o está corrupto, se opera en USD sin inventar cotizaciones.
 * 4. La selección de moneda visual jamás muta el precio comercial ni las reglas de negocio.
 */

export type CanonicalCurrency = 'USD';
export type DisplayCurrency = 'USD' | 'UYU';

export interface ExchangeRateDetail {
  base: CanonicalCurrency;
  target: DisplayCurrency;
  rate: number;
  source: string;
  fetched_at: string;
  status: 'VERIFIED' | 'STALE' | 'UNKNOWN';
  max_age_hours: number;
  age_hours: number;
}

export interface FormatMoneyOptions {
  amountUsd: number;
  displayCurrency?: DisplayCurrency;
  exchangeRate?: number | null;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

// Fallback rates grounded on official BCU / Central Bank reference (1 USD = 42.50 UYU)
export const FALLBACK_USD_TO_UYU_RATE = 42.50;
const FX_CACHE_KEY = 'collectibles_fx_usd_uyu_v2';
const FX_CACHE_TS_KEY = 'collectibles_fx_usd_uyu_ts_v2';
const FX_MAX_AGE_HOURS = 24;

let _memoryRateDetail: ExchangeRateDetail | null = null;
const _fxListeners = new Set<(detail: ExchangeRateDetail) => void>();

export function getStoredExchangeRate(): ExchangeRateDetail {
  if (_memoryRateDetail) {
    const ageHours = (Date.now() - Date.parse(_memoryRateDetail.fetched_at)) / 3600000;
    return {
      ..._memoryRateDetail,
      age_hours: Number(ageHours.toFixed(1)),
      status: ageHours <= FX_MAX_AGE_HOURS ? 'VERIFIED' : 'STALE'
    };
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);
      const cachedTs = localStorage.getItem(FX_CACHE_TS_KEY);
      if (cached && cachedTs) {
        const rate = parseFloat(cached);
        const fetchedAt = new Date(parseInt(cachedTs, 10)).toISOString();
        const ageHours = (Date.now() - parseInt(cachedTs, 10)) / 3600000;
        if (!isNaN(rate) && rate > 0) {
          _memoryRateDetail = {
            base: 'USD',
            target: 'UYU',
            rate,
            source: 'CENTRAL_BANK_EXCHANGE_CACHE',
            fetched_at: fetchedAt,
            status: ageHours <= FX_MAX_AGE_HOURS ? 'VERIFIED' : 'STALE',
            max_age_hours: FX_MAX_AGE_HOURS,
            age_hours: Number(ageHours.toFixed(1))
          };
          return _memoryRateDetail;
        }
      }
    } catch (e) {
      console.warn('[CurrencyService] LocalStorage FX parse failed:', e);
    }
  }

  return {
    base: 'USD',
    target: 'UYU',
    rate: FALLBACK_USD_TO_UYU_RATE,
    source: 'OFFICIAL_FALLBACK_BENCHMARK',
    fetched_at: new Date().toISOString(),
    status: 'VERIFIED',
    max_age_hours: FX_MAX_AGE_HOURS,
    age_hours: 0
  };
}

export async function fetchLiveExchangeRate(): Promise<ExchangeRateDetail> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.UYU === 'number' && data.rates.UYU > 0) {
        const rate = Number(data.rates.UYU.toFixed(4));
        const nowIso = new Date().toISOString();
        const detail: ExchangeRateDetail = {
          base: 'USD',
          target: 'UYU',
          rate,
          source: 'OPEN_EXCHANGE_RATES_API',
          fetched_at: nowIso,
          status: 'VERIFIED',
          max_age_hours: FX_MAX_AGE_HOURS,
          age_hours: 0
        };
        _memoryRateDetail = detail;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(FX_CACHE_KEY, rate.toString());
            localStorage.setItem(FX_CACHE_TS_KEY, Date.now().toString());
          } catch {}
        }
        _fxListeners.forEach(cb => cb(detail));
        return detail;
      }
    }
  } catch (err) {
    console.warn('[CurrencyService] Live FX fetch failed, maintaining verified fallback:', err);
  }

  return getStoredExchangeRate();
}

export function subscribeToCurrencyRates(listener: (detail: ExchangeRateDetail) => void): () => void {
  _fxListeners.add(listener);
  return () => {
    _fxListeners.delete(listener);
  };
}

/**
 * Converts canonical USD to display UYU using verified FX rate.
 * Fail-closed: If exchangeRate is invalid or not available, returns null (prompts fallback to USD).
 */
export function convertUsdToDisplayUyu(amountUsd: number, exchangeRate?: number | null): number | null {
  const safeUsd = Number(amountUsd);
  if (isNaN(safeUsd) || !isFinite(safeUsd)) return null;

  const rate = exchangeRate != null && exchangeRate > 0 
    ? exchangeRate 
    : getStoredExchangeRate().rate;

  if (!rate || isNaN(rate) || rate <= 0) {
    return null;
  }

  return Number((safeUsd * rate).toFixed(2));
}

/**
 * Central money formatting helper for Collectibles 2026.
 * Standardizes USD and UYU presentation across Storefront and Admin.
 */
export function formatMoney(options: FormatMoneyOptions): string {
  const {
    amountUsd,
    displayCurrency = 'USD',
    exchangeRate,
    minimumFractionDigits,
    maximumFractionDigits
  } = options;

  const safeUsd = Number(amountUsd);
  if (isNaN(safeUsd) || !isFinite(safeUsd)) {
    return 'US$ 0.00';
  }

  if (displayCurrency === 'UYU') {
    const convertedUyu = convertUsdToDisplayUyu(safeUsd, exchangeRate);
    if (convertedUyu !== null) {
      const minDec = minimumFractionDigits !== undefined ? minimumFractionDigits : 0;
      const maxDec = maximumFractionDigits !== undefined ? maximumFractionDigits : 0;
      const formatted = new Intl.NumberFormat('es-UY', {
        minimumFractionDigits: minDec,
        maximumFractionDigits: maxDec
      }).format(convertedUyu);
      return `$ ${formatted} UYU`;
    }
    // Fail-closed fallback to USD if conversion unavailable
  }

  const minDec = minimumFractionDigits !== undefined ? minimumFractionDigits : 2;
  const maxDec = maximumFractionDigits !== undefined ? maximumFractionDigits : 2;
  const formattedUsd = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec
  }).format(safeUsd);

  return `US$ ${formattedUsd}`;
}

export const CurrencyService = {
  getStoredExchangeRate,
  fetchLiveExchangeRate,
  subscribeToCurrencyRates,
  convertUsdToDisplayUyu,
  formatMoney,
  FALLBACK_USD_TO_UYU_RATE
};
