// frontend/src/lib/marketEngine/marketTypes.ts

export type MarketStatus = 'DISABLED' | 'PREVIEW' | 'SANDBOX' | 'LIVE';

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
  isLive: boolean;
  isDisabled: boolean;
  flag: string;
  metadata: Record<string, any>;
}
