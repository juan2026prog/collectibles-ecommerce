// ============================================================
// COLLECTIBLES 2026 — SOURCING INTELLIGENCE TYPES
// Definición de tipos canónicos para el Centro de Inteligencia Comercial.
// ============================================================

export type SourcingSignalSourceType =
  | 'RETAILER'
  | 'MARKETPLACE'
  | 'OFFICIAL'
  | 'WEB_EDITORIAL'
  | 'COMMUNITY'
  | 'INTERNAL_DATA'
  | 'RADAR'
  | 'RELEASE_CALENDAR';

export type SourcingCandidateStatus =
  | 'NEW'
  | 'PREORDER'
  | 'GROWING'
  | 'TRENDING'
  | 'EMERGING'
  | 'OPPORTUNITY';

export type SourcingDiscoveryOrigin =
  | 'WATCHLIST'
  | 'DISCOVERED_OUTSIDE_WATCHLIST'
  | 'RADAR'
  | 'MANUAL_RESEARCH'
  | 'SEARCH_GAP'
  | 'RETAILER_DISCOVERY';

export type TrendDirection = 'UP' | 'DOWN' | 'STABLE';

export type SourcingConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SourcingSignal {
  id: string;
  source: string; // e.g. 'Amazon US', 'Mercado Libre UY', 'NECA Official', 'Reddit /r/ActionFigures', 'Collectibles AI Search'
  source_type: SourcingSignalSourceType;
  country: string; // 'UY' | 'AR' | 'CL' | 'PE' | 'MX' | 'GLOBAL'
  signal_name: string;
  metric_value?: string | number;
  confidence: number; // 0 - 100
  observed_at: string; // ISO string
  url?: string;
  evidence_text?: string;
  metadata?: Record<string, any>;
}

export interface SourcingTrendCard {
  id: string;
  topic: string; // e.g. "Pokémon TCG", "McFarlane Lara Croft", "NECA Romulus"
  category: string;
  status: SourcingCandidateStatus;
  direction: TrendDirection;
  market_trend_score: number; // 0 - 100 (Observables de mercado)
  collectibles_trend_score: number; // 0 - 100 (Búsquedas, wishlist, conversiones)
  composite_trend_score: number; // 0 - 100
  confidence: SourcingConfidenceLevel;
  drivers: string[];
  subtrends: string[];
  country: string;
  evidence_count: number;
  observed_signals: SourcingSignal[];
  why_summary: string;
  is_following?: boolean;
  active_candidates_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SourcingProductCandidate {
  id: string;
  title: string;
  brand: string;
  franchise: string;
  line?: string;
  character?: string;
  image_url: string;
  gallery_images?: string[];
  category: string;
  status: SourcingCandidateStatus;
  discovered_from: SourcingDiscoveryOrigin;
  trend_score: number; // 0 - 100
  opportunity_score: number; // 0 - 100 (Determinístico oficial)
  confidence_score: number; // 0 - 100
  country_code: string;
  pricing: {
    amazon_price_usd?: number | null;
    ebay_price_usd?: number | null;
    bestbuy_price_usd?: number | null;
    tiendamia_price_usd?: number | null;
    mercadolibre_price_local?: number | null;
    mercadolibre_currency?: string;
    landed_cost_estimated_usd: number;
    suggested_sale_price_usd: number;
    estimated_margin_percent: number;
    currency: string;
  };
  stock_status: 'IN_STOCK' | 'PREORDER' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  retailer_source: string;
  retailer_url: string;
  asin?: string;
  upc?: string;
  sku?: string;
  why_explanation: {
    headline: string;
    local_demand_summary: string;
    market_differential: string;
    stock_verdict: string;
    internal_signals: string;
    evidence_sources: Array<{
      name: string;
      type: SourcingSignalSourceType;
      confidence: number;
      date: string;
    }>;
  };
  raw_evidence: SourcingSignal[];
  created_at: string;
}

export type WatchlistScopeType =
  | 'SKU'
  | 'BRAND'
  | 'MANUFACTURER'
  | 'FRANCHISE'
  | 'LINE'
  | 'CHARACTER'
  | 'CATEGORY';

export interface WatchlistExpandedItem {
  id: string;
  type: WatchlistScopeType;
  name: string;
  value: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  target_country?: string;
  notes?: string;
  created_at: string;
  last_checked_at?: string;
  active_candidates_count?: number;
}

export interface SourcingResearchQueryRequest {
  query: string;
  country: string;
  category?: string;
  period?: '24h' | '7d' | '30d' | '90d';
  research_depth?: 'ECONOMICO' | 'ESTANDAR' | 'PROFUNDO';
  force_refresh?: boolean;
}

export interface SourcingResearchResponse {
  success: boolean;
  query: string;
  country: string;
  trends: SourcingTrendCard[];
  candidates: SourcingProductCandidate[];
  summary: string;
  evidence_count: number;
  latency_ms: number;
  cost_usd: number;
  provider: string;
  model: string;
  cached?: boolean;
  research_depth?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}
