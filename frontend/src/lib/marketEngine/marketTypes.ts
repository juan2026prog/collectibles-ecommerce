// frontend/src/lib/marketEngine/marketTypes.ts

export type MarketStatus = 'DISABLED' | 'PREVIEW' | 'SANDBOX' | 'READY_FOR_LIVE' | 'LIVE';

export type LogisticsMode = 'IMPORT_HUB' | 'SKYPOSTAL';

export type ProviderEnvironment = 'test' | 'production';

export interface MarketRecord {
  id?: string;
  country_code: string;
  country_name: string;
  currency: string;
  logistics_mode: LogisticsMode;
  market_status: MarketStatus;
  public_enabled: boolean;
  checkout_enabled: boolean;
  provider: string;
  provider_environment: ProviderEnvironment;
  preview_enabled: boolean;
  sort_order: number;
  metadata?: {
    flag?: string;
    target_tier?: string;
    tax_regime?: string;
    notes?: string;
    kill_switch?: boolean;
    lead_market?: boolean;
    certification_phase?: string;
    readiness_checklist?: {
      compliance_ready: boolean;
      rates_ready: boolean;
      fuel_ready: boolean;
      pricing_ready: boolean;
      checkout_ready: boolean;
      api_ready: boolean;
      tracking_ready: boolean;
      security_ready: boolean;
      financial_ready: boolean;
      e2e_certified: boolean;
      kill_switch_available: boolean;
    };
    [key: string]: any;
  };
  created_at?: string;
  updated_at?: string;
}

export interface MarketResolution {
  countryCode: string;
  countryName: string;
  currency: string;
  logisticsMode: LogisticsMode;
  marketStatus: MarketStatus;
  provider: string;
  canCheckout: boolean;
  canBrowse: boolean;
  isPreview: boolean;
  isReadyForLive: boolean;
  isLive: boolean;
  isDisabled: boolean;
  flag: string;
  metadata: Record<string, any>;
}
