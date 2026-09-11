/**
 * SOURCING INTELLIGENCE FASE 6 — LATAM / MULTI-COUNTRY ENGINE TYPES
 * Collectibles.uy / Collectibles2026
 */

export type CountryCode = 'UY' | 'AR' | 'CL' | 'BR' | 'PE' | 'CO' | 'MX' | 'PY';

export type CurrencyCode = 'USD' | 'UYU' | 'ARS' | 'CLP' | 'BRL' | 'PEN' | 'COP' | 'MXN' | 'PYG';

export type CountryStatus = 'OPERATIVO' | 'CONFIGURADO' | 'NO_CONFIGURADO' | 'NO_VERIFICADO' | 'ERROR';

export type RateFreshnessStatus = 'ACTUALIZADO' | 'DESACTUALIZADO' | 'NO_DISPONIBLE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export type DecisionCode = 'PUBLISH' | 'WATCH' | 'REVIEW' | 'REJECT' | 'BLOCKED';

export interface CountryConfig {
  country_code: CountryCode;
  country_name: string;
  currency: CurrencyCode;
  locale: string;
  timezone: string;
  enabled: boolean;
  sourcing_enabled: boolean;
  publication_enabled: boolean;
  readiness_score: number; // 0 - 100
  updated_at?: string;
}

export interface CountryImportRules {
  country_code: CountryCode;
  max_franchise_value_usd: number;
  max_franchise_weight_lbs: number;
  max_franchise_shipments_per_year: number;
  standard_import_tax_percent: number;
  vat_tax_percent: number;
  customs_handling_fee_usd: number;
  min_target_margin_percent: number;
  prohibited_categories: string[];
  restricted_categories: string[];
  allowed_categories: string[];
  metadata?: Record<string, any>;
}

export interface CountryMarketplaceConfig {
  id: string;
  country_code: CountryCode;
  marketplace_id: string;
  marketplace_name: string;
  adapter_status: CountryStatus;
  api_endpoint?: string;
  fee_percent: number;
  last_health_check_at?: string;
}

export interface ExchangeRate {
  base_currency: 'USD';
  target_currency: CurrencyCode;
  rate: number;
  source: string;
  status: RateFreshnessStatus;
  updated_at: string;
}

export interface MultiCountryLandedCostInput {
  originPriceUsd: number;
  usaShippingUsd?: number;
  weightLbs?: number;
  destinationCountry: CountryCode;
  customsRegime?: 'FRANCHISE' | 'GENERAL_IMPORT' | 'SIMPLIFIED';
  category?: string;
}

export interface MultiCountryLandedCost {
  destination_country: CountryCode;
  origin_price_usd: number;
  usa_shipping_usd: number;
  sales_tax_usd: number;
  international_shipping_usd: number;
  customs_tax_usd: number;
  vat_tax_usd: number;
  courier_fee_usd: number;
  total_landed_cost_usd: number;
  currency: CurrencyCode;
  converted_landed_cost_local: number;
  calculation_confidence: number; // 0 - 100
  is_franchise_eligible: boolean;
  exceeds_weight_limit: boolean;
  exceeds_value_limit: boolean;
  calculation_notes: string[];
}

export interface CountryOpportunityScore {
  country_code: CountryCode;
  opportunity_score: number; // 0 - 100
  confidence_score: number; // 0 - 100
  demand_signal: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  competition_density: 'SATURATED' | 'BALANCED' | 'LOW' | 'NONE';
  landed_cost_usd: number;
  suggested_price_usd: number;
  estimated_margin_percent: number;
  market_gap_score: number; // 0 - 100
  status: CountryStatus;
  reasons: string[];
}

export interface GlobalOpportunityScore {
  canonical_id: string;
  global_opportunity_score: number; // 0 - 100
  confidence_score: number; // 0 - 100
  best_country: CountryCode | null;
  top_countries: CountryOpportunityScore[];
  cross_market_appeal: boolean;
  reasons_summary: string[];
}

export interface BestMarketSelection {
  best_country: CountryCode;
  opportunity_score: number;
  confidence_score: number;
  estimated_landed_cost_usd: number;
  suggested_price_usd: number;
  estimated_margin_percent: number;
  market_gap_score: number;
  estimated_delivery_range: string;
  decision: DecisionCode;
  reason_codes: string[];
  explanation: string[];
}

export interface ProductCountryAvailability {
  id?: string;
  product_id: string;
  country_code: CountryCode;
  available: boolean;
  sellable: boolean;
  importable: boolean;
  best_source?: string;
  landed_cost_usd?: number;
  suggested_price_usd?: number;
  estimated_margin_percent?: number;
  delivery_min_days?: number;
  delivery_max_days?: number;
  opportunity_score: number;
  confidence_score: number;
  market_gap_score: number;
  updated_at: string;
}

export interface CountryReadinessIndicator {
  country_code: CountryCode;
  country_name: string;
  readiness_score: number; // 0 - 100
  status: CountryStatus;
  checks: {
    currency: boolean;
    import_rules: boolean;
    logistics: boolean;
    marketplace: boolean;
    pricing: boolean;
    sourcing: boolean;
    publication: boolean;
  };
  missing_requirements: string[];
}
