/**
 * SOURCING & IMPORTACIÓN MULTIFUENTE V2 — DOMAIN TYPES
 * Collectibles.uy / Collectibles2026
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
  price: number;
  currency: string;
  domestic_shipping: number;
  availability: 'in_stock' | 'preorder' | 'limited' | 'out_of_stock' | 'unknown';
  stock?: number | null;
  condition: 'new' | 'refurbished' | 'used';
  status: SourceOfferStatus;
  estimated_delivery?: string;
  is_zinc_compatible: boolean;
  reliability_score: number; // 0 - 100
  last_checked_at: string;
  metadata?: Record<string, any>;
  landed_cost_usd?: number; // Costo puesto con este proveedor
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
