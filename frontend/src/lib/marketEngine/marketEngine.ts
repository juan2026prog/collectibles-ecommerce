// frontend/src/lib/marketEngine/marketEngine.ts

import { MarketRecord, MarketResolution, MarketStatus, LogisticsMode } from './marketTypes';

export const INITIAL_DEFAULT_MARKETS: MarketRecord[] = [
  {
    country_code: 'UY',
    country_name: 'Uruguay',
    currency: 'UYU',
    logistics_mode: 'IMPORT_HUB',
    market_status: 'LIVE',
    public_enabled: true,
    checkout_enabled: true,
    provider: 'import_hub',
    provider_environment: 'production',
    preview_enabled: true,
    sort_order: 1,
    metadata: { flag: '🇺🇾', tax_regime: 'franquicia_uruguay' }
  },
  {
    country_code: 'AR',
    country_name: 'Argentina',
    currency: 'ARS',
    logistics_mode: 'IMPORT_HUB',
    market_status: 'LIVE',
    public_enabled: true,
    checkout_enabled: true,
    provider: 'import_hub',
    provider_environment: 'production',
    preview_enabled: true,
    sort_order: 2,
    metadata: { flag: '🇦🇷', tax_regime: 'franquicia_argentina' }
  },
  {
    country_code: 'CL',
    country_name: 'Chile',
    currency: 'CLP',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'READY_FOR_LIVE',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: true,
    sort_order: 3,
    metadata: {
      flag: '🇨🇱',
      target_tier: 'tier_1',
      lead_market: true,
      certification_phase: 'PHASE_4_CERTIFIED',
      notes: 'SkyPostal Certified Lead Market — Ready for Live activation',
      readiness_checklist: {
        compliance_ready: true,
        rates_ready: true,
        fuel_ready: true,
        pricing_ready: true,
        checkout_ready: true,
        api_ready: true,
        tracking_ready: true,
        security_ready: true,
        financial_ready: true,
        e2e_certified: true,
        kill_switch_available: true
      }
    }
  },
  {
    country_code: 'PE',
    country_name: 'Perú',
    currency: 'PEN',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'PREVIEW',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: true,
    sort_order: 4,
    metadata: { flag: '🇵🇪', target_tier: 'tier_2' }
  },
  {
    country_code: 'BR',
    country_name: 'Brasil',
    currency: 'BRL',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'PREVIEW',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: true,
    sort_order: 5,
    metadata: { flag: '🇧🇷', target_tier: 'tier_2' }
  },
  {
    country_code: 'CO',
    country_name: 'Colombia',
    currency: 'COP',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'PREVIEW',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: true,
    sort_order: 6,
    metadata: { flag: '🇨🇴', target_tier: 'tier_2' }
  },
  {
    country_code: 'EC',
    country_name: 'Ecuador',
    currency: 'USD',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'PREVIEW',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: true,
    sort_order: 7,
    metadata: { flag: '🇪🇨', target_tier: 'tier_2' }
  },
  {
    country_code: 'MX',
    country_name: 'México',
    currency: 'MXN',
    logistics_mode: 'SKYPOSTAL',
    market_status: 'DISABLED',
    public_enabled: false,
    checkout_enabled: false,
    provider: 'skypostal',
    provider_environment: 'test',
    preview_enabled: false,
    sort_order: 8,
    metadata: { flag: '🇲🇽', target_tier: 'tier_3', notes: 'Disabled pending future certification' }
  }
];

const FLAG_FALLBACK_MAP: Record<string, string> = {
  UY: '🇺🇾',
  AR: '🇦🇷',
  CL: '🇨🇱',
  PE: '🇵🇪',
  BR: '🇧🇷',
  CO: '🇨🇴',
  EC: '🇪🇨',
  MX: '🇲🇽'
};

/**
 * Resolves a market from a list of market records or defaults.
 */
export function resolveMarket(
  countryCode: string = 'UY',
  markets: MarketRecord[] = INITIAL_DEFAULT_MARKETS
): MarketResolution {
  const code = (countryCode || 'UY').toUpperCase().trim();
  const found = markets.find(m => m.country_code.toUpperCase() === code);

  if (found) {
    const isPreview = found.market_status === 'PREVIEW';
    const isReadyForLive = found.market_status === 'READY_FOR_LIVE';
    const isLive = found.market_status === 'LIVE';
    const isDisabled = found.market_status === 'DISABLED';
    const canCheckout = found.checkout_enabled && isLive;
    const canBrowse = found.public_enabled || isPreview || isReadyForLive;

    return {
      countryCode: found.country_code,
      countryName: found.country_name,
      currency: found.currency,
      logisticsMode: found.logistics_mode,
      marketStatus: found.market_status,
      provider: found.provider,
      canCheckout,
      canBrowse,
      isPreview,
      isReadyForLive,
      isLive,
      isDisabled,
      flag: found.metadata?.flag || FLAG_FALLBACK_MAP[found.country_code] || '🌐',
      metadata: found.metadata || {}
    };
  }

  // Fallback for unrecognized country
  return {
    countryCode: code,
    countryName: code,
    currency: 'USD',
    logisticsMode: 'IMPORT_HUB',
    marketStatus: 'DISABLED',
    provider: 'import_hub',
    canCheckout: false,
    canBrowse: false,
    isPreview: false,
    isReadyForLive: false,
    isLive: false,
    isDisabled: true,
    flag: FLAG_FALLBACK_MAP[code] || '🌐',
    metadata: {}
  };
}

/**
 * Checks if a given destination operates via SkyPostal.
 */
export function isSkyPostalMarket(market: MarketResolution | MarketRecord): boolean {
  if ('logisticsMode' in market) {
    return market.logisticsMode === 'SKYPOSTAL';
  }
  return market.logistics_mode === 'SKYPOSTAL';
}

/**
 * Checks if a given market is in PREVIEW or READY_FOR_LIVE mode.
 */
export function isMarketInPreview(market: MarketResolution | MarketRecord): boolean {
  if ('marketStatus' in market) {
    return market.marketStatus === 'PREVIEW' || market.marketStatus === 'READY_FOR_LIVE';
  }
  return market.market_status === 'PREVIEW' || market.market_status === 'READY_FOR_LIVE';
}

/**
 * Resolves logistics routing and status for a destination country.
 */
export function resolveMarketRouting(
  countryCode: string,
  markets: MarketRecord[] = INITIAL_DEFAULT_MARKETS
) {
  const resolved = resolveMarket(countryCode, markets);
  const found = markets.find(m => m.country_code.toUpperCase() === (countryCode || '').toUpperCase());

  return {
    countryCode: resolved.countryCode,
    countryName: resolved.countryName,
    logisticsMode: resolved.logisticsMode,
    provider: resolved.provider,
    status: resolved.marketStatus,
    isConfigured: !!found,
    isSkyPostal: resolved.logisticsMode === 'SKYPOSTAL',
    isImportHub: resolved.logisticsMode === 'IMPORT_HUB',
    isReadyForLive: resolved.isReadyForLive,
    canCheckout: resolved.canCheckout,
    canBrowse: resolved.canBrowse
  };
}
