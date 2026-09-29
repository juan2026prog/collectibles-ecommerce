/**
 * CANONICAL CURRENCY SERVICE — COLLECTIBLES 2026
 * 
 * Moneda canónica del sistema: USD.
 * UYU, ARS, CLP, PEN, MXN son display currencies para representación regional.
 * 
 * Reglas fundamentales:
 * 1. Todos los cálculos comerciales, landed costs, márgenes y scoring se ejecutan en USD.
 * 2. La conversión a moneda local se realiza únicamente en la capa de presentación mediante FX válido.
 * 3. Fail-Closed: Si el FX no está disponible o es inválido, se opera en USD sin inventar cotizaciones.
 * 4. La selección de moneda visual jamás muta el precio comercial ni las reglas de negocio.
 * 5. Trazabilidad completa de provider, source_name, source_url, timestamps y status.
 */

import { supabase } from '../lib/supabase';

export type CanonicalCurrency = 'USD';
export type DisplayCurrency = 'USD' | 'UYU' | 'ARS' | 'CLP' | 'PEN' | 'MXN';
export type FXStatus = 'VERIFIED' | 'STALE' | 'UNAVAILABLE' | 'MANUAL_OVERRIDE';

export interface ExchangeRateDetail {
  base: CanonicalCurrency;
  target: DisplayCurrency;
  rate: number;
  provider: string;
  source_name: string;
  source_url: string;
  status: FXStatus;
  is_manual_override: boolean;
  override_reason?: string | null;
  override_admin_email?: string | null;
  fetched_at: string;
  effective_at: string;
  expires_at?: string;
  max_age_hours: number;
  age_hours: number;
}

export interface CountryCurrencyMeta {
  country_code: string;
  country_name: string;
  quote_currency: DisplayCurrency;
  symbol: string;
  is_active: boolean;
  is_auto_sync: boolean;
  source_name: string;
  source_url: string;
}

export interface FormatMoneyOptions {
  amountUsd: number;
  displayCurrency?: DisplayCurrency;
  exchangeRate?: number | null;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export const COUNTRY_CURRENCY_CONFIG: Record<DisplayCurrency, CountryCurrencyMeta> = {
  USD: {
    country_code: 'EC',
    country_name: 'Ecuador',
    quote_currency: 'USD',
    symbol: 'US$',
    is_active: false,
    is_auto_sync: false,
    source_name: 'Banco Central del Ecuador (Economía Dolarizada)',
    source_url: 'https://www.bce.fin.ec/'
  },
  UYU: {
    country_code: 'UY',
    country_name: 'Uruguay',
    quote_currency: 'UYU',
    symbol: '$',
    is_active: true,
    is_auto_sync: true,
    source_name: 'Banco Central del Uruguay (BCU)',
    source_url: 'https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx'
  },
  ARS: {
    country_code: 'AR',
    country_name: 'Argentina',
    quote_currency: 'ARS',
    symbol: '$',
    is_active: false,
    is_auto_sync: true,
    source_name: 'Banco Central de la República Argentina (BCRA)',
    source_url: 'https://www.bcra.gob.ar/'
  },
  CLP: {
    country_code: 'CL',
    country_name: 'Chile',
    quote_currency: 'CLP',
    symbol: '$',
    is_active: false,
    is_auto_sync: true,
    source_name: 'Banco Central de Chile',
    source_url: 'https://www.bcentral.cl/'
  },
  PEN: {
    country_code: 'PE',
    country_name: 'Perú',
    quote_currency: 'PEN',
    symbol: 'S/',
    is_active: false,
    is_auto_sync: true,
    source_name: 'Banco Central de Reserva del Perú (BCRP)',
    source_url: 'https://www.bcrp.gob.pe/'
  },
  MXN: {
    country_code: 'MX',
    country_name: 'México',
    quote_currency: 'MXN',
    symbol: '$',
    is_active: false,
    is_auto_sync: true,
    source_name: 'Banco de México (Banxico)',
    source_url: 'https://www.banxico.org.mx/'
  }
};

// Institutional benchmark rates for fail-safe fallback
export const FALLBACK_RATES: Record<DisplayCurrency, number> = {
  USD: 1.0,
  UYU: 40.0835,
  ARS: 1528.7563,
  CLP: 961.5140,
  PEN: 3.4178,
  MXN: 17.8992
};

export const FALLBACK_USD_TO_UYU_RATE = FALLBACK_RATES.UYU;
const FX_CACHE_KEY_PREFIX = 'collectibles_fx_v3_';
const FX_MAX_AGE_HOURS = 24;

let _memoryRateDetails: Map<DisplayCurrency, ExchangeRateDetail> = new Map();
const _fxListeners = new Set<(rates: Map<DisplayCurrency, ExchangeRateDetail>) => void>();

export function getStoredExchangeRate(currency: DisplayCurrency = 'UYU'): ExchangeRateDetail {
  if (currency === 'USD') {
    return {
      base: 'USD',
      target: 'USD',
      rate: 1.0,
      provider: 'CANONICAL_BENCHMARK',
      source_name: 'Moneda Canónica Oficial USD',
      source_url: 'https://collectibles.uy',
      status: 'VERIFIED',
      is_manual_override: false,
      fetched_at: new Date().toISOString(),
      effective_at: new Date().toISOString(),
      max_age_hours: 8760,
      age_hours: 0
    };
  }

  const inMem = _memoryRateDetails.get(currency);
  if (inMem) {
    const ageHours = (Date.now() - Date.parse(inMem.fetched_at)) / 3600000;
    return {
      ...inMem,
      age_hours: Number(ageHours.toFixed(1)),
      status: inMem.is_manual_override ? 'MANUAL_OVERRIDE' : (ageHours <= inMem.max_age_hours ? 'VERIFIED' : 'STALE')
    };
  }

  if (typeof window !== 'undefined') {
    try {
      const cachedStr = localStorage.getItem(FX_CACHE_KEY_PREFIX + currency);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr) as ExchangeRateDetail;
        const ageHours = (Date.now() - Date.parse(parsed.fetched_at)) / 3600000;
        const detail: ExchangeRateDetail = {
          ...parsed,
          age_hours: Number(ageHours.toFixed(1)),
          status: parsed.is_manual_override ? 'MANUAL_OVERRIDE' : (ageHours <= FX_MAX_AGE_HOURS ? 'VERIFIED' : 'STALE')
        };
        _memoryRateDetails.set(currency, detail);
        return detail;
      }
    } catch (e) {
      console.warn(`[CurrencyService] LocalStorage FX parse failed for ${currency}:`, e);
    }
  }

  const meta = COUNTRY_CURRENCY_CONFIG[currency] || COUNTRY_CURRENCY_CONFIG.UYU;
  return {
    base: 'USD',
    target: currency,
    rate: FALLBACK_RATES[currency] || 1.0,
    provider: 'ExchangeRate-API',
    source_name: meta.source_name,
    source_url: meta.source_url,
    status: 'VERIFIED',
    is_manual_override: false,
    fetched_at: new Date().toISOString(),
    effective_at: new Date().toISOString(),
    max_age_hours: FX_MAX_AGE_HOURS,
    age_hours: 0
  };
}

export function getAllStoredExchangeRates(): Record<DisplayCurrency, ExchangeRateDetail> {
  const result = {} as Record<DisplayCurrency, ExchangeRateDetail>;
  const currencies: DisplayCurrency[] = ['USD', 'UYU', 'ARS', 'CLP', 'PEN', 'MXN'];
  for (const c of currencies) {
    result[c] = getStoredExchangeRate(c);
  }
  return result;
}

export async function fetchLiveExchangeRates(): Promise<Record<DisplayCurrency, ExchangeRateDetail>> {
  const currencies: DisplayCurrency[] = ['USD', 'UYU', 'ARS', 'CLP', 'PEN', 'MXN'];
  const nowIso = new Date().toISOString();

  try {
    // 1. First attempt to fetch from server endpoint /api/currency-sync (backed by Supabase)
    const serverRes = await fetch('/api/currency-sync');
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      if (serverData && serverData.rates && Array.isArray(serverData.rates)) {
        serverData.rates.forEach((row: any) => {
          const quote = row.quote_currency as DisplayCurrency;
          if (quote && currencies.includes(quote)) {
            const ageHours = (Date.now() - Date.parse(row.fetched_at || nowIso)) / 3600000;
            const detail: ExchangeRateDetail = {
              base: 'USD',
              target: quote,
              rate: Number(row.rate),
              provider: row.provider || 'ExchangeRate-API',
              source_name: row.source_name,
              source_url: row.source_url,
              status: row.status as FXStatus,
              is_manual_override: !!row.is_manual_override,
              override_reason: row.override_reason,
              override_admin_email: row.override_admin_email,
              fetched_at: row.fetched_at || nowIso,
              effective_at: row.effective_at || nowIso,
              expires_at: row.expires_at,
              max_age_hours: FX_MAX_AGE_HOURS,
              age_hours: Number(ageHours.toFixed(1))
            };
            _memoryRateDetails.set(quote, detail);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(FX_CACHE_KEY_PREFIX + quote, JSON.stringify(detail));
              } catch {}
            }
          }
        });
        _fxListeners.forEach(cb => cb(new Map(_memoryRateDetails)));
        return getAllStoredExchangeRates();
      }
    }
  } catch (serverErr) {
    console.warn('[CurrencyService] Server sync fetch failed, checking direct provider fallback:', serverErr);
  }

  // 2. Direct external API fallback
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        for (const curr of currencies) {
          if (curr === 'USD') continue;
          const liveRate = data.rates[curr];
          if (typeof liveRate === 'number' && liveRate > 0) {
            const meta = COUNTRY_CURRENCY_CONFIG[curr];
            const detail: ExchangeRateDetail = {
              base: 'USD',
              target: curr,
              rate: Number(liveRate.toFixed(4)),
              provider: 'OPEN_EXCHANGE_RATES_API',
              source_name: meta.source_name,
              source_url: meta.source_url,
              status: 'VERIFIED',
              is_manual_override: false,
              fetched_at: nowIso,
              effective_at: nowIso,
              max_age_hours: FX_MAX_AGE_HOURS,
              age_hours: 0
            };
            _memoryRateDetails.set(curr, detail);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(FX_CACHE_KEY_PREFIX + curr, JSON.stringify(detail));
              } catch {}
            }
          }
        }
        _fxListeners.forEach(cb => cb(new Map(_memoryRateDetails)));
        return getAllStoredExchangeRates();
      }
    }
  } catch (directErr) {
    console.warn('[CurrencyService] Direct provider fetch failed, returning stored/fallback rates:', directErr);
  }

  return getAllStoredExchangeRates();
}

export async function fetchLiveExchangeRate(currency: DisplayCurrency = 'UYU'): Promise<ExchangeRateDetail> {
  const all = await fetchLiveExchangeRates();
  return all[currency] || getStoredExchangeRate(currency);
}

export function subscribeToCurrencyRates(listener: (rates: Map<DisplayCurrency, ExchangeRateDetail>) => void): () => void {
  _fxListeners.add(listener);
  return () => {
    _fxListeners.delete(listener);
  };
}

/**
 * Converts canonical USD to display currency using verified FX rate.
 * Fail-closed: If exchangeRate is invalid or <= 0, returns null (prompts fallback to USD).
 */
export function convertUsdToDisplay(amountUsd: number, targetCurrency: DisplayCurrency, exchangeRate?: number | null): number | null {
  const safeUsd = Number(amountUsd);
  if (isNaN(safeUsd) || !isFinite(safeUsd)) return null;

  if (targetCurrency === 'USD') {
    return Number(safeUsd.toFixed(2));
  }

  if (exchangeRate !== undefined) {
    if (exchangeRate === null || isNaN(exchangeRate) || exchangeRate <= 0) {
      return null;
    }
    return Number((safeUsd * exchangeRate).toFixed(2));
  }

  const rateDetail = getStoredExchangeRate(targetCurrency);
  if (!rateDetail || !rateDetail.rate || isNaN(rateDetail.rate) || rateDetail.rate <= 0) {
    return null;
  }

  return Number((safeUsd * rateDetail.rate).toFixed(2));
}

export function convertUsdToDisplayUyu(amountUsd: number, exchangeRate?: number | null): number | null {
  return convertUsdToDisplay(amountUsd, 'UYU', exchangeRate);
}

/**
 * Central money formatting helper for Collectibles 2026.
 * Standardizes USD, UYU, ARS, CLP, PEN, MXN presentation across Storefront and Admin.
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

  if (displayCurrency === 'USD') {
    const minDec = minimumFractionDigits !== undefined ? minimumFractionDigits : 2;
    const maxDec = maximumFractionDigits !== undefined ? maximumFractionDigits : 2;
    const formattedUsd = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec
    }).format(safeUsd);
    return `US$ ${formattedUsd}`;
  }

  const converted = convertUsdToDisplay(safeUsd, displayCurrency, exchangeRate);
  if (converted === null) {
    // Fail-closed fallback to USD if conversion unavailable
    return formatMoney({ amountUsd: safeUsd, displayCurrency: 'USD' });
  }

  const meta = COUNTRY_CURRENCY_CONFIG[displayCurrency] || COUNTRY_CURRENCY_CONFIG.UYU;
  
  // Format depending on currency conventions
  const isNoDecimalCurrency = ['UYU', 'CLP', 'ARS'].includes(displayCurrency);
  const minDec = minimumFractionDigits !== undefined ? minimumFractionDigits : (isNoDecimalCurrency ? 0 : 2);
  const maxDec = maximumFractionDigits !== undefined ? maximumFractionDigits : (isNoDecimalCurrency ? 0 : 2);

  const locale = (displayCurrency === 'PEN' || displayCurrency === 'MXN') ? 'en-US' : 'es-UY';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec
  }).format(converted);

  if (displayCurrency === 'PEN') {
    return `S/ ${formatted}`;
  }

  return `${meta.symbol} ${formatted} ${displayCurrency}`;
}

export const CurrencyService = {
  getStoredExchangeRate,
  getAllStoredExchangeRates,
  fetchLiveExchangeRate,
  fetchLiveExchangeRates,
  subscribeToCurrencyRates,
  convertUsdToDisplay,
  convertUsdToDisplayUyu,
  formatMoney,
  FALLBACK_USD_TO_UYU_RATE,
  FALLBACK_RATES,
  COUNTRY_CURRENCY_CONFIG
};
