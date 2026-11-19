// supabase/functions/_shared/market-engine/index.ts

import { MarketConfiguration, SkyPostalLogisticsMode, SkyPostalMarketStatus } from '../skypostal/skypostal-types.ts';

export interface MarketResolutionResult {
  countryCode: string;
  countryName: string;
  currency: string;
  logisticsMode: SkyPostalLogisticsMode;
  marketStatus: SkyPostalMarketStatus;
  provider: string;
  canCheckout: boolean;
  canBrowse: boolean;
  isPreview: boolean;
  isLive: boolean;
  isDisabled: boolean;
  metadata?: Record<string, any>;
}

/**
 * Fail-closed fallback catalog when database connection is not available.
 * SECURITY INVARIANT: Non-UY markets MUST NEVER default to LIVE or checkoutEnabled=true.
 */
const DEFAULT_MARKET_MAP: Record<string, Partial<MarketConfiguration>> = {
  UY: { countryName: 'Uruguay', currency: 'UYU', logisticsMode: 'IMPORT_HUB', marketStatus: 'LIVE', publicEnabled: true, checkoutEnabled: true, provider: 'import_hub' },
  AR: { countryName: 'Argentina', currency: 'ARS', logisticsMode: 'IMPORT_HUB', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'import_hub' },
  CL: { countryName: 'Chile', currency: 'CLP', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  PE: { countryName: 'Perú', currency: 'PEN', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  BR: { countryName: 'Brasil', currency: 'BRL', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  CO: { countryName: 'Colombia', currency: 'COP', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  EC: { countryName: 'Ecuador', currency: 'USD', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  MX: { countryName: 'México', currency: 'MXN', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' }
};

/**
 * Resolves market configuration for a given destination country code.
 * Fail-closed: any database error or kill_switch disables checkout immediately.
 */
export async function resolveMarketForCountry(
  supabaseClient: any,
  rawCountryCode?: string
): Promise<MarketResolutionResult> {
  const countryCode = (rawCountryCode || 'UY').toUpperCase().trim();

  let marketRecord: any = null;
  let dbQueryFailed = false;

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('international_markets')
        .select('*')
        .eq('country_code', countryCode)
        .maybeSingle();
      if (error) {
        dbQueryFailed = true;
        console.warn('[MarketEngine] DB query returned error, failing closed:', error.message);
      } else {
        marketRecord = data;
      }
    } catch (e) {
      dbQueryFailed = true;
      console.warn('[MarketEngine] DB query threw exception, failing closed:', e);
    }
  } else {
    dbQueryFailed = true;
  }

  const fallback = DEFAULT_MARKET_MAP[countryCode] || {
    countryName: countryCode,
    currency: 'USD',
    logisticsMode: 'IMPORT_HUB',
    marketStatus: 'DISABLED',
    publicEnabled: false,
    checkoutEnabled: false,
    provider: 'import_hub'
  };

  // Fail-closed rule: on DB error, never enable checkout for non-UY markets
  if (dbQueryFailed && countryCode !== 'UY') {
    return {
      countryCode,
      countryName: fallback.countryName || countryCode,
      currency: fallback.currency || 'USD',
      logisticsMode: (fallback.logisticsMode || 'IMPORT_HUB') as SkyPostalLogisticsMode,
      marketStatus: 'DISABLED',
      provider: fallback.provider || 'import_hub',
      canCheckout: false,
      canBrowse: false,
      isPreview: false,
      isLive: false,
      isDisabled: true,
      metadata: { fail_closed_reason: 'db_unavailable' }
    };
  }

  const status: SkyPostalMarketStatus = (marketRecord?.market_status || fallback.marketStatus || 'DISABLED') as SkyPostalMarketStatus;
  const logisticsMode: SkyPostalLogisticsMode = (marketRecord?.logistics_mode || fallback.logisticsMode || 'IMPORT_HUB') as SkyPostalLogisticsMode;
  const isKillSwitched = marketRecord?.metadata?.kill_switch === true;
  const isPreview = status === 'PREVIEW';
  const isLive = status === 'LIVE';
  const isDisabled = status === 'DISABLED' || isKillSwitched;
  const canCheckout = Boolean((marketRecord?.checkout_enabled ?? fallback.checkoutEnabled) && isLive && !isKillSwitched);
  const canBrowse = Boolean(!isKillSwitched && ((marketRecord?.public_enabled ?? fallback.publicEnabled) || isPreview));

  return {
    countryCode,
    countryName: marketRecord?.country_name || fallback.countryName || countryCode,
    currency: marketRecord?.currency || fallback.currency || 'USD',
    logisticsMode,
    marketStatus: status,
    provider: marketRecord?.provider || fallback.provider || (logisticsMode === 'SKYPOSTAL' ? 'skypostal' : 'import_hub'),
    canCheckout,
    canBrowse,
    isPreview,
    isLive,
    isDisabled,
    metadata: marketRecord?.metadata || fallback.metadata || {}
  };
}
