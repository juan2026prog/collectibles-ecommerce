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
  image_url: string | null;
  gallery_images?: string[];
  category: string;
  status: SourcingCandidateStatus;
  discovered_from: SourcingDiscoveryOrigin;
  trend_score: number; // 0 - 100
  opportunity_score: number; // 0 - 100 (Determinístico oficial)
  confidence_score: number | null; // Evidence completeness; null means unknown.
  confidence_level?: SourcingConfidenceLevel | 'UNKNOWN';
  validation_version?: number;
  provenance?: Record<string, SourcingDataProvenance>;
  market_presence?: Record<string, { presence: 'PRESENT' | 'VERIFIED_ABSENT' | 'VERIFIED_LOW_SUPPLY' | 'UNKNOWN'; reason?: string; price?: SourcingDataProvenance }>;
  validation_diagnostics?: Array<Record<string, unknown>>;
  country_code: string;
  pricing: {
    origin_price_usd?: number | null;
    amazon_price_usd?: number | null;
    ebay_price_usd?: number | null;
    bestbuy_price_usd?: number | null;
    tiendamia_price_usd?: number | null;
    mercadolibre_price_local?: number | null;
    mercadolibre_currency?: string;
    landed_cost_estimated_usd: number | null;
    suggested_sale_price_usd: number | null;
    estimated_margin_percent: number | null;
    currency: string;
  };
  stock_status: 'IN_STOCK' | 'PREORDER' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  retailer_source: string;
  retailer_url: string;
  asin?: string;
  upc?: string;
  sku?: string;
  commercial_readiness?: 'READY' | 'PARTIAL' | 'BLOCKED';
  why_explanation: {
    opportunity_type?: string;
    confidence_reason?: string;
    local_supply_gap?: string;
    scoring_breakdown?: Record<string, { points: number; max: number; reason: string; confidence: string; evidence: SourcingDataProvenance[] }>;
    headline: string;
    commercial_status?: string;
    commercial_missing_reasons?: string[];
    local_demand_summary: string;
    market_differential: string;
    stock_verdict: string;
    internal_signals: string;
    evidence_sources: Array<{
      name: string;
      type: SourcingSignalSourceType;
      confidence: number | null;
      date: string;
      url?: string;
      field?: string;
      status?: string;
    }>;
  };
  raw_evidence: SourcingSignal[];
  created_at: string;
}

export interface SourcingDataProvenance {
  value: unknown;
  status: 'OBSERVED' | 'DERIVED' | 'UNKNOWN';
  source: string | null;
  source_url: string | null;
  observed_at: string | null;
  verification?: 'AI_DECLARED' | 'SOURCE_EXTRACTED' | 'SOURCE_VERIFIED';
  currency?: string;
  derived_from?: SourcingDataProvenance[];
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

export type CollectiblesProductFamilyId =
  | 'ALL'
  | 'FIGURES'
  | 'STATUES_BUSTS'
  | 'PLUSH'
  | 'COMICS_MANGA'
  | 'TCG_CARDS'
  | 'APPAREL_ACCESSORIES'
  | 'BUILDING_SETS'
  | 'BOARD_GAMES'
  | 'PUZZLES'
  | 'REPLICAS_PROPS'
  | 'VEHICLES'
  | 'OTHER_COLLECTIBLES';

export interface CollectiblesProductFamilyOption {
  id: CollectiblesProductFamilyId;
  label: string;
}

export const COLLECTIBLES_PRODUCT_FAMILIES: readonly CollectiblesProductFamilyOption[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'FIGURES', label: 'Figuras' },
  { id: 'STATUES_BUSTS', label: 'Estatuas y Bustos' },
  { id: 'PLUSH', label: 'Peluches' },
  { id: 'COMICS_MANGA', label: 'Cómics y Manga' },
  { id: 'TCG_CARDS', label: 'TCG y Cartas' },
  { id: 'APPAREL_ACCESSORIES', label: 'Ropa y Accesorios' },
  { id: 'BUILDING_SETS', label: 'Building Sets / LEGO' },
  { id: 'BOARD_GAMES', label: 'Board Games' },
  { id: 'PUZZLES', label: 'Puzzles' },
  { id: 'REPLICAS_PROPS', label: 'Réplicas y Props' },
  { id: 'VEHICLES', label: 'Vehículos' },
  { id: 'OTHER_COLLECTIBLES', label: 'Otros Coleccionables' }
] as const;

export interface SourcingResearchQueryRequest {
  query: string;
  country: string;
  product_family?: string;
  category?: string;
  period?: '24h' | '7d' | '30d' | '90d' | 'all';
  research_depth?: 'ECONOMICO' | 'ESTANDAR' | 'PROFUNDO';
  requested_model?: string;
  result_limit?: 'AUTO' | 10 | 25 | 50 | 100;
  resultLimit?: 'AUTO' | 10 | 25 | 50 | 100;
  force_refresh?: boolean;
}

export interface SourcingResearchResponse {
  success: boolean;
  query: string;
  country: string;
  product_family?: string;
  trends: SourcingTrendCard[];
  candidates: SourcingProductCandidate[];
  summary: string;
  evidence_count: number;
  latency_ms: number;
  cost_usd: number | null;
  provider: string;
  model: string;
  requested_model?: string;
  actual_model?: string;
  automatic_or_manual?: 'AUTO' | 'MANUAL';
  cached?: boolean;
  research_depth?: string;
  result_limit?: 'AUTO' | 10 | 25 | 50 | 100;
  batch_telemetry?: {
    result_limit: string | number;
    batches_planned: number;
    batches_executed: number;
    stop_reason: string;
  };
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  original_input_tokens?: number | null;
  original_output_tokens?: number | null;
  original_total_tokens?: number | null;
  original_cost_usd?: number | null;
  zero_result_reason?: string;
}
