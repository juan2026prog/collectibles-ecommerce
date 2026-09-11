/**
 * SOURCING INTELLIGENCE — FASE 4 — ADAPTIVE SOURCING TYPES
 * Collectibles 2026
 */

import type { RetailerSource, SourceOffer, ConditionNormalized, AvailabilityNormalized } from './sourcing';

export type DemandSignalType =
  | 'ZERO_RESULT_SEARCH'
  | 'LOW_RESULT_SEARCH'
  | 'REPEATED_SEARCH'
  | 'HIGH_INTENT_SEARCH'
  | 'WISHLIST_INTENT'
  | 'RADAR_CLICK'
  | 'COMPARE_INTENT'
  | 'VAULT_INTENT'
  | 'RELEASE_CALENDAR_INTENT';

export type AdaptiveEntityType =
  | 'SKU'
  | 'PRODUCT'
  | 'CHARACTER'
  | 'PRODUCT_LINE'
  | 'FRANCHISE'
  | 'BRAND'
  | 'CATEGORY'
  | 'ATTRIBUTE_COMBINATION';

export type GapStatus =
  | 'DETECTED'
  | 'QUALIFYING'
  | 'SEARCHING'
  | 'SOURCES_FOUND'
  | 'NO_SOURCE'
  | 'QUALIFIED'
  | 'REJECTED'
  | 'DISMISSED'
  | 'EXPIRED';

export type AdaptiveOpportunityStatus =
  | 'DETECTED'
  | 'QUALIFYING'
  | 'SEARCHING'
  | 'SOURCES_FOUND'
  | 'NO_SOURCE'
  | 'MATCH_REVIEW'
  | 'QUALIFIED'
  | 'REJECTED'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'DISMISSED'
  | 'EXPIRED'
  | 'PROVIDER_ERROR';

export type ProfitabilityStatus =
  | 'VIABLE'
  | 'MARGINAL'
  | 'NOT_VIABLE'
  | 'NEEDS_REVIEW';

export type OpportunityReasonCodeType =
  // Positive Reasons
  | 'HIGH_ZERO_RESULT_SEARCH'
  | 'RAPID_DEMAND_GROWTH'
  | 'HIGH_WISHLIST_INTEREST'
  | 'RADAR_TRAFFIC'
  | 'UPCOMING_RELEASE'
  | 'CATALOG_GAP'
  | 'STRONG_MARGIN'
  | 'MULTIPLE_RELIABLE_SOURCES'
  | 'LOW_COMPETITION'
  | 'PRICE_ADVANTAGE'
  // Negative Reasons
  | 'LOW_MARGIN'
  | 'UNRELIABLE_SELLER'
  | 'AUTHENTICITY_RISK'
  | 'NO_STOCK'
  | 'PRICE_VOLATILITY'
  | 'POOR_MATCH_CONFIDENCE'
  | 'HIGH_IMPORT_COST';

export interface OpportunityReasonCode {
  code: OpportunityReasonCodeType;
  label: string;
  type: 'positive' | 'negative';
  weight?: number;
}

export interface DemandSignal {
  id?: string;
  user_id?: string | null;
  session_id?: string | null;
  signal_type: DemandSignalType;
  query?: string;
  interpreted_query?: {
    brand?: string;
    license?: string;
    franchise?: string;
    line?: string;
    character?: string;
    scale?: string;
    category?: string;
    priceMin?: number;
    priceMax?: number;
    [key: string]: any;
  };
  results_count?: number;
  entity_type?: AdaptiveEntityType;
  entity_id?: string;
  weight?: number;
  source?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface CatalogGap {
  id: string;
  gap_key: string;
  franchise?: string;
  character?: string;
  brand?: string;
  line?: string;
  scale?: string;
  category?: string;
  keywords: string[];
  search_count: number;
  zero_result_count: number;
  unique_users: number;
  wishlist_interest: number;
  radar_interest: number;
  comparison_interest: number;
  product_views: number;
  demand_score: number; // 0 - 100
  trend_velocity: number; // Acceleration / growth metric
  status: GapStatus;
  last_evaluated_at: string;
  created_at: string;
  updated_at: string;
}

export interface SourcingOpportunity {
  id: string;
  gap_id?: string;
  canonical_sku: string;
  canonical_product_id?: string;
  title: string;
  brand: string;
  franchise: string;
  character?: string;
  line?: string;
  scale?: string;
  image_url: string;
  demand_score: number; // 0 - 100
  opportunity_score: number; // 0 - 100
  best_source?: RetailerSource;
  best_source_url?: string;
  best_source_seller?: string;
  best_source_price_usd: number;
  source_candidates: SourceOffer[];
  landed_cost_usd: number;
  suggested_sell_price_usd: number;
  expected_margin_percent: number;
  profitability_status: ProfitabilityStatus;
  match_confidence: number; // 0.00 - 1.00
  availability: 'IN_STOCK' | 'IMPORT_ON_DEMAND' | 'PREORDER' | 'UNAVAILABLE';
  trend_velocity: number;
  price_volatility_score: number;
  reason_codes: OpportunityReasonCode[];
  status: AdaptiveOpportunityStatus;
  feedback_reason?: 'TOO_EXPENSIVE' | 'LOW_MARGIN' | 'BAD_PRODUCT_MATCH' | 'UNTRUSTED_SOURCE' | 'NOT_RELEVANT' | 'ALREADY_HAVE_PRODUCT' | 'SEASONAL' | 'DUPLICATE' | 'OTHER';
  imported_product_id?: string;
  last_evaluated_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdaptiveSettings {
  enabled: boolean;
  minimum_demand_score: number;
  minimum_opportunity_score: number;
  minimum_unique_users: number;
  minimum_search_count: number;
  zero_result_weight: number;
  wishlist_weight: number;
  radar_weight: number;
  comparison_weight: number;
  release_weight: number;
  time_decay_half_life_days: number;
  discovery_budget_daily: number;
  retailer_sources: RetailerSource[];
  source_revalidation_hours: number;
}
