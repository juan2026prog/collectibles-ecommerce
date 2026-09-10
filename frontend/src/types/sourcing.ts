/**
 * SOURCING & IMPORTACIÓN MULTIFUENTE V2 — DOMAIN TYPES
 * Collectibles.uy / Collectibles2026
 * FASE 1: Sourcing Intelligence — Canonical Product Graph + Multi-Source Offers
 */

export type RetailerSource = 
  | 'amazon' 
  | 'ebay' 
  | 'bestbuy' 
  | 'walmart' 
  | 'target' 
  | 'entertainmentearth' 
  | 'bbts' 
  | 'custom';

// ── Fase 1: Normalized Condition ──────────────────────────────────────────────
export type ConditionNormalized =
  | 'NEW'
  | 'USED'
  | 'OPEN_BOX'
  | 'REFURBISHED'
  | 'UNKNOWN';

// ── Fase 1: Normalized Availability ──────────────────────────────────────────
export type AvailabilityNormalized =
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'PREORDER'
  | 'BACKORDER'
  | 'UNKNOWN';

// ── Fase 1: Freshness Status ──────────────────────────────────────────────────
export type FreshnessStatus =
  | 'LIVE'      // Verified in the last 15 minutes
  | 'FRESH'     // Verified in the last 6 hours
  | 'STALE'     // Older than 6 hours
  | 'UNKNOWN';  // Never verified or unknown age

// ── Fase 1: Retailer Capability Status ───────────────────────────────────────
export type RetailerCapabilityStatus =
  | 'LIVE'           // Active and working
  | 'ADAPTER_READY'  // Code exists, credentials/config pending
  | 'NOT_CONFIGURED' // No credentials or not enabled
  | 'ERROR';         // Attempted but failing

// ── Fase 1: Data Source Status ────────────────────────────────────────────────
export type DataSourceStatus =
  | 'LIVE'
  | 'CACHE'
  | 'RESEARCH_DATA'
  | 'NOT_CONFIGURED'
  | 'ERROR';

// ── Fase 1: Authenticity Product Status ──────────────────────────────────────
export type AuthenticityProductStatus =
  | 'VERIFIED'
  | 'LIKELY_VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'REJECTED'
  | 'UNKNOWN';

export type AuthenticityStatus = 
  | 'VERIFIED_OFFICIAL' 
  | 'NEEDS_VERIFICATION' 
  | 'UNLICENSED' 
  | 'BOOTLEG' 
  | 'REPLICA' 
  | 'UNBRANDED' 
  | 'REJECTED';

export type ProductType = 
  | 'TRENDING' 
  | 'NEW_RELEASE' 
  | 'PREORDER' 
  | 'EVERGREEN' 
  | 'RETRO' 
  | 'NOSTALGIA' 
  | 'CULT' 
  | 'CATALOG_GAP' 
  | 'URUGUAY_OPPORTUNITY' 
  | 'COLLECTIBLES_PICK' 
  | 'MANUAL';

export type CatalogStatus = 
  | 'NOT_IN_CATALOG' 
  | 'ALREADY_IN_CATALOG' 
  | 'POSSIBLE_MATCH';

export type ProfitProtectionStatus = 
  | 'PASS' 
  | 'WARNING' 
  | 'BLOCKED';

export type ResearchPackStatus = 
  | 'UPLOADED' 
  | 'PROCESSING' 
  | 'RESOLVING' 
  | 'NORMALIZING' 
  | 'VERIFYING' 
  | 'PRICING' 
  | 'URUGUAY_CHECK' 
  | 'READY' 
  | 'PARTIAL' 
  | 'FAILED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXCEEDED'
  | 'PENDING_CREDENTIAL'
  | 'MODEL_UNAVAILABLE'
  | 'FEATURE_DISABLED';

export type UruguayMatchType = 
  | 'EXACT_MATCH' 
  | 'PROBABLE_MATCH' 
  | 'SIMILAR_PRODUCT' 
  | 'NOT_FOUND' 
  | 'ERROR';

export type SourceOfferStatus = 
  | 'LIVE' 
  | 'CACHE' 
  | 'RESEARCH_ONLY' 
  | 'PENDING_CREDENTIAL' 
  | 'PENDING_API' 
  | 'ERROR';

export type MarketPositionType = 
  | 'CHEAPER' 
  | 'SIMILAR' 
  | 'MORE_EXPENSIVE' 
  | 'NO_EXACT_COMPETITION';

export interface SourceOffer {
  id: string;
  normalized_product_id?: string;
  source: RetailerSource;
  source_product_id: string; // ASIN, ItemID, SKU
  url: string;
  seller: string;
  seller_rating?: number;       // 0-100 — Fase 1
  seller_reviews?: number;      // Fase 1
  seller_verified?: boolean;    // Fase 1
  fulfilled_by_retailer?: boolean; // Fase 1
  sold_by_retailer?: boolean;   // Fase 1
  price: number;
  currency: string;
  domestic_shipping: number;
  usa_shipping_usd?: number;    // Fase 1: explicit USA domestic shipping to Miami
  availability: 'in_stock' | 'preorder' | 'limited' | 'out_of_stock' | 'unknown';
  availability_normalized?: AvailabilityNormalized; // Fase 1
  stock?: number | null;
  condition: 'new' | 'refurbished' | 'used';
  condition_normalized?: ConditionNormalized; // Fase 1
  status: SourceOfferStatus;
  data_source?: DataSourceStatus;            // Fase 1
  estimated_delivery?: string;
  delivery_min?: string;        // Fase 1: ISO date — min delivery to Miami
  delivery_max?: string;        // Fase 1: ISO date — max delivery to Miami
  delivery_source?: string;     // Fase 1: origin of delivery data
  estimated_weight_lbs?: number; // Fase 1
  weight_status?: 'KNOWN' | 'UNKNOWN'; // Fase 1
  freshness_status?: FreshnessStatus;  // Fase 1
  is_zinc_compatible: boolean;
  reliability_score: number; // 0 - 100
  last_checked_at: string;
  metadata?: Record<string, any>;
  landed_cost_usd?: number; // Costo puesto con este proveedor
  authenticity_status?: AuthenticityProductStatus; // Fase 1
}

// ── Fase 1: Retailer Capabilities Declaration ─────────────────────────────────
export interface RetailerCapabilities {
  retailer: string;
  search_status: RetailerCapabilityStatus;
  product_status: RetailerCapabilityStatus;
  price_status: RetailerCapabilityStatus;
  stock_status: RetailerCapabilityStatus;
  seller_status: RetailerCapabilityStatus;
  delivery_status: RetailerCapabilityStatus;
  live_check_available: boolean;
  live_check_endpoint?: string;
  last_health_check_at?: string;
  last_error?: string;
  notes?: string;
}

// ── Fase 1: Offer History Entry ───────────────────────────────────────────────
export interface OfferHistoryEntry {
  id: string;
  normalized_product_id: string;
  source: RetailerSource;
  source_product_id: string;
  change_type: 'INITIAL' | 'PRICE_CHANGE' | 'STOCK_CHANGE' | 'SELLER_CHANGE' | 'CONDITION_CHANGE' | 'AVAILABILITY_CHANGE';
  previous_value: Record<string, any>;
  new_value: Record<string, any>;
  price_usd?: number;
  availability_normalized?: AvailabilityNormalized;
  condition_normalized?: ConditionNormalized;
  seller?: string;
  checked_at: string;
  data_source: DataSourceStatus;
  notes?: string;
}

// ── Fase 1: Multi-Source Product View (Canonical + Grouped Offers) ────────────
/**
 * Represents the Canonical Product with offers grouped by source and condition.
 * This is the output structure of the Best Source Selector V1.
 */
export interface CanonicalProductView {
  canonical_id: string;
  canonical_sku: string;
  title: string;
  brand: string;
  manufacturer?: string;
  license: string;
  character?: string;
  line?: string;
  scale?: string;
  // Identifiers
  upc?: string;
  ean?: string;
  gtin?: string;
  mpn?: string;
  asin?: string;
  best_buy_sku?: string;
  ebay_item_id?: string;
  // Match reasoning (auditability)
  match_reason?: string;
  match_confidence?: number; // 0.00 - 1.00
  // Images
  image_url: string;
  gallery_images: string[];
  // Grouped offers
  new_offers: SourceOffer[];   // Fase 1: NEW condition offers
  used_offers: SourceOffer[];  // Fase 1: USED condition offers
  // Best Source V1 selection
  best_source: RetailerSource | null;
  best_source_offer: SourceOffer | null;
  best_source_reason: string;
  // Data status per retailer
  data_status: {
    amazon: DataSourceStatus;
    ebay: DataSourceStatus;
    bestbuy: DataSourceStatus;
    last_sync_at?: string;
  };
  // Freshness
  freshness_status: FreshnessStatus;
  last_checked_at: string;
  // Capabilities
  capabilities?: {
    amazon: RetailerCapabilities;
    ebay: RetailerCapabilities;
    bestbuy: RetailerCapabilities;
  };
}



export interface UruguayMarketSummary {
  source: 'mercado_libre_uy';
  status: UruguayMatchType;
  match_type: UruguayMatchType;
  match_confidence: number; // 0 - 100
  query?: string;
  data_origin: 'LIVE' | 'CACHE' | 'NO_DATA' | 'ERROR';
  exact_match_found: boolean;
  min_price_usd: number | null;
  avg_price_usd: number | null;
  median_price_usd: number | null;
  max_price_usd: number | null;
  total_listings: number;
  sellers_count: number;
  currency?: string;
  sample_url?: string;
  sample_title?: string;
  difference_amount: number | null; // Collectibles - ML
  difference_percent: number | null; // % vs ML
  market_position: MarketPositionType;
  comparison_diff_usd: number | null; // Retrocompatibilidad
  comparison_diff_percent: number | null; // Retrocompatibilidad
  market_verdict: 'MUCHO_MAS_BARATO' | 'COMPETITIVO' | 'PRECIO_SOBRE_MERCADO' | 'SIN_COMPETENCIA' | 'NO_DISPONIBLE';
  last_checked_at: string;
  exact_matches?: any[];
  similar_matches?: any[];
  store_references?: {
    store_name: string;
    domain: string;
    price_usd: number;
    url?: string;
    in_stock: boolean;
  }[];
}

export interface LocalStoreConfig {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  method: 'API' | 'FEED' | 'SCRAPER' | 'MANUAL';
  status: 'ACTIVE' | 'PENDING' | 'ERROR' | 'DISABLED';
  priority: number;
  last_sync_at?: string;
}

export interface AuthenticityEvidence {
  status: AuthenticityStatus;
  score: number; // 0 - 100
  confidence: number; // 0 - 100
  brand_verified: boolean;
  license_verified: boolean;
  official_distributor: boolean;
  has_valid_identifier: boolean; // UPC / EAN / MPN
  verification_method: 'DIRECT_IDENTIFIER_MATCH' | 'AUTHORIZED_RETAILER_DIRECT' | 'MULTI_SIGNAL_HEURISTIC' | 'MANUAL_AUDIT';
  verification_evidence: string[];
  verification_source: string;
  verified_at: string;
  red_flags: string[];
  green_flags: string[];
  reasons: string[];
}

export interface LandedCostBreakdown {
  origin_price_usd: number;
  usa_shipping_usd: number;
  sales_tax_usd: number;
  zinc_fee_usd: number;
  financial_fee_usd: number;
  urubox_courier_usd: number;
  other_costs_usd: number;
  real_cost_puesto_usd: number;
  suggested_sale_price_usd: number;
  current_sale_price_usd: number;
  profit_usd: number;
  margin_percent: number;
  profit_protection_status: ProfitProtectionStatus;
  profit_protection_reason?: string;
}

export interface NormalizedProduct {
  id: string;
  pack_id?: string;
  canonical_sku: string; // e.g. COL-MCFARLANE-DC-BATMAN-89472
  title: string;
  brand: string;
  license: string;
  line?: string;
  character?: string;
  scale?: string; // e.g. 7", 1/6, 6"
  year?: number;
  variant?: string;
  category_name?: string;
  collectibles_category_id?: string;
  collectibles_subcategory_id?: string;
  
  // Standard IDs
  upc?: string;
  ean?: string;
  gtin?: string;
  mpn?: string;
  asin?: string;

  // Media
  image_url: string;
  gallery_images: string[];
  
  // Multiple Source Offers
  offers: SourceOffer[];
  selected_source_id: string; // ID of active offer
  best_source_id: string; // Algorithmically calculated best offer

  // Financial & Cost Puesto
  financials: LandedCostBreakdown;

  // Authenticity & Licensing Gate
  authenticity: AuthenticityEvidence;

  // Uruguay Market Intelligence
  uruguay_market: UruguayMarketSummary;

  // Catalog status
  catalog_status: CatalogStatus;
  matched_catalog_product_id?: string;
  matched_catalog_title?: string;

  // Editorial & Intelligence
  product_type: ProductType;
  tags: string[];
  curation_reason?: string;
  opportunity_score: number; // 0 - 100
  catalog_value_score: number; // 0 - 100
  release_date?: string;

  // Audit timestamps
  created_at: string;
  updated_at: string;
  last_live_check_at?: string;
}

export interface ResearchPackItemInput {
  url: string;
  retailer?: RetailerSource;
  brand?: string;
  license?: string;
  line?: string;
  character?: string;
  scale?: string;
  upc?: string;
  mpn?: string;
  reason?: ProductType | string;
  tags?: string[];
  price?: number;
}

export interface ResearchPack {
  schema_version: string;
  pack_id: string;
  title: string;
  generated_at: string;
  source: 'chatgpt-research' | 'manual-urls' | 'csv-upload' | 'admin-import' | 'openai-research';
  status: ResearchPackStatus;
  items_count: number;
  profitable_count?: number;
  review_count?: number;
  items: ResearchPackItemInput[];
}

export interface ColumnDefinition {
  id: string;
  label: string;
  visible: boolean;
  minWidth?: string;
  category: 'core' | 'costs' | 'market' | 'intelligence' | 'metadata';
}

// ── Fase 2: Canonical Product & Relational Domain Interfaces ──────────────────

export type SellerTrustStatus = 'TRUSTED' | 'ACCEPTABLE' | 'RISKY' | 'UNKNOWN';

export interface SellerTrustEvaluation {
  status: SellerTrustStatus;
  score: number; // 0 - 100
  reasons: string[];
  dataCompleteness: number; // 0.0 - 1.0
}

export type MatchConfidenceLevel = 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNMATCHED';

export type MatchReviewStatus = 'REVIEW_REQUIRED' | 'CONFIRMED' | 'REJECTED' | 'DISCARDED';

export type IdentifierType = 
  | 'UPC' 
  | 'EAN' 
  | 'GTIN' 
  | 'MPN' 
  | 'ASIN' 
  | 'BESTBUY_SKU' 
  | 'EBAY_ITEM_ID' 
  | 'RETAILER_SKU';

export interface ProductIdentifier {
  id?: string;
  canonical_product_id?: string;
  identifier_type: IdentifierType;
  identifier_value: string;
  source?: string;
  verified?: boolean;
}

export interface SourceListing {
  id: string;
  source: RetailerSource;
  external_id: string;
  url: string;
  raw_title: string;
  raw_description?: string;
  raw_brand?: string;
  raw_price: number;
  raw_currency: string;
  raw_condition?: string;
  raw_stock?: number;
  raw_images?: string[];
  seller_external_id?: string;
  raw_payload?: Record<string, any>;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface SourceSeller {
  id: string;
  source: RetailerSource;
  external_seller_id: string;
  seller_name: string;
  rating?: number;
  rating_count?: number;
  positive_percentage?: number;
  seller_status: SellerTrustStatus;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface ProductOffer {
  id: string;
  canonical_product_id: string;
  source_listing_id?: string;
  retailer: RetailerSource;
  seller_id?: string;
  seller_name?: string;
  condition: string;
  condition_normalized: ConditionNormalized;
  price: number;
  currency: string;
  original_price?: number;
  sale_price?: number;
  shipping_us: number;
  shipping_estimated?: number;
  availability: AvailabilityNormalized;
  estimated_delivery_min?: string;
  estimated_delivery_max?: string;
  offer_url: string;
  is_best_new_offer?: boolean;
  is_best_used_offer?: boolean;
  first_seen_at?: string;
  last_seen_at?: string;
  updated_at?: string;
}

export interface ProductFamily {
  id: string;
  name: string;
  franchise: string;
  brand: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalProduct {
  id: string;
  family_id?: string;
  brand: string;
  manufacturer?: string;
  franchise: string;
  series?: string;
  character: string;
  product_name: string;
  canonical_title: string;
  category?: string;
  subcategory?: string;
  scale?: string;
  edition?: string;
  variant?: string;
  color_variant?: string;
  release_year?: number;
  gtin?: string;
  ean?: string;
  upc?: string;
  mpn?: string;
  sku_reference: string;
  primary_image: string;
  additional_images?: string[];
  description?: string;
  specifications?: Record<string, any>;
  package_dimensions?: Record<string, any>;
  package_weight_lbs?: number;
  product_status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'REVIEW_REQUIRED';
  created_at?: string;
  updated_at?: string;
  identifiers?: ProductIdentifier[];
  offers?: ProductOffer[];
}

export interface MatchReview {
  id: string;
  source_listing_id: string;
  suggested_canonical_product_id?: string;
  confidence_score: number;
  reasons: string[];
  status: MatchReviewStatus;
  manual_action?: 'LINK_EXISTING' | 'CREATE_NEW' | 'REJECT';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at?: string;
}

export interface ProductPriceSummary {
  lowest_new_price: number | null;
  lowest_used_price: number | null;
  average_new_price: number | null;
  median_new_price: number | null;
  number_of_new_offers: number;
  number_of_used_offers: number;
  best_new_offer: ProductOffer | null;
  best_used_offer: ProductOffer | null;
  delivery_range_min_days?: number | null;
  delivery_range_max_days?: number | null;
}

