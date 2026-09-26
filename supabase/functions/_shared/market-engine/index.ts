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
 * Fallback in-memory catalog when database connection is not available
 */
const DEFAULT_MARKET_MAP: Record<string, Partial<MarketConfiguration>> = {
  UY: { countryName: 'Uruguay', currency: 'UYU', logisticsMode: 'IMPORT_HUB', marketStatus: 'LIVE', publicEnabled: true, checkoutEnabled: true, provider: 'import_hub' },
  AR: { countryName: 'Argentina', currency: 'ARS', logisticsMode: 'IMPORT_HUB', marketStatus: 'LIVE', publicEnabled: true, checkoutEnabled: true, provider: 'import_hub' },
  CL: { countryName: 'Chile', currency: 'CLP', logisticsMode: 'SKYPOSTAL', marketStatus: 'PREVIEW', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  PE: { countryName: 'Perú', currency: 'PEN', logisticsMode: 'SKYPOSTAL', marketStatus: 'PREVIEW', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  BR: { countryName: 'Brasil', currency: 'BRL', logisticsMode: 'SKYPOSTAL', marketStatus: 'PREVIEW', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  CO: { countryName: 'Colombia', currency: 'COP', logisticsMode: 'SKYPOSTAL', marketStatus: 'PREVIEW', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  EC: { countryName: 'Ecuador', currency: 'USD', logisticsMode: 'SKYPOSTAL', marketStatus: 'PREVIEW', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' },
  MX: { countryName: 'México', currency: 'MXN', logisticsMode: 'SKYPOSTAL', marketStatus: 'DISABLED', publicEnabled: false, checkoutEnabled: false, provider: 'skypostal' }
};

/**
 * Resolves market configuration for a given destination country code.
 */
export async function resolveMarketForCountry(
  supabaseClient: any,
  rawCountryCode?: string
): Promise<MarketResolutionResult> {
  const countryCode = (rawCountryCode || 'UY').toUpperCase().trim();

  let marketRecord: any = null;

  if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from('international_markets')
        .select('*')
        .eq('country_code', countryCode)
        .maybeSingle();
      marketRecord = data;
    } catch (e) {
      console.warn('[MarketEngine] DB query failed, using static fallback:', e);
    }
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

  const status: SkyPostalMarketStatus = (marketRecord?.market_status || fallback.marketStatus || 'DISABLED') as SkyPostalMarketStatus;
  const logisticsMode: SkyPostalLogisticsMode = (marketRecord?.logistics_mode || fallback.logisticsMode || 'IMPORT_HUB') as SkyPostalLogisticsMode;
  const isPreview = status === 'PREVIEW';
  const isLive = status === 'LIVE';
  const isDisabled = status === 'DISABLED';
  const canCheckout = (marketRecord?.checkout_enabled ?? fallback.checkoutEnabled) && isLive;
  const canBrowse = (marketRecord?.public_enabled ?? fallback.publicEnabled) || isPreview;

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
