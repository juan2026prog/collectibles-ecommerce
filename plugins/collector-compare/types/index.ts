export type AttributeDataType = 'text' | 'number' | 'dimension' | 'scale' | 'boolean' | 'currency';
export type AttributePriority = 'critical' | 'high' | 'medium' | 'low';

export interface AttributeDefinition {
  attribute_key: string;
  label: string;
  category_scope: string; // 'all', 'figuras-de-accion', 'estatuas', etc.
  data_type: AttributeDataType;
  unit?: string | null;
  priority: AttributePriority;
  sort_order: number;
  is_visible: boolean;
  description?: string | null;
}

export interface ComparedProduct {
  id: string;
  title: string;
  slug: string;
  base_price: number;
  compare_at_price?: number | null;
  status: string;
  condition: string;
  weight_kg?: number | null;
  dimensions?: {
    height?: number;
    width?: number;
    length?: number;
    unit?: string;
  } | null;
  metadata?: Record<string, any> | null;
  ml_attributes?: Array<{ id: string; name: string; value_name: string }> | null;
  primary_image?: string | null;
  brand_name?: string | null;
  license_name?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  seller_store_name?: string | null;
  is_international?: boolean;
  intl_base_price_usd?: number | null;
  intl_final_price_usd?: number | null;
  intl_courier_estimate_usd?: number | null;
  intl_weight_grams?: number | null;
  // Normalized attributes map for comparison table
  normalized_attributes?: Record<string, NormalizedAttributeValue>;
}

export interface NormalizedAttributeValue {
  raw: any;
  display: string;
  numeric_value?: number | null;
  unit?: string | null;
  is_informed: boolean;
  highlight?: boolean;
}

export interface DeterministicFacts {
  lowest_price_product_id?: string | null;
  highest_price_product_id?: string | null;
  largest_height_product_id?: string | null;
  smallest_height_product_id?: string | null;
  most_accessories_product_id?: string | null;
  most_articulated_product_id?: string | null;
  available_locally_ids: string[];
  in_stock_ids: string[];
  international_ids: string[];
  confirmed_scales: Record<string, string>; // productId -> normalized scale
}

export interface CollectorVerdict {
  summary: string;
  key_findings: string[];
  badges_by_product: Record<string, string[]>;
  generated_at: string;
}

export type CompatibilityStatus = 
  | 'COMPATIBLE' 
  | 'APPROXIMATELY_COMPATIBLE' 
  | 'NOT_RECOMMENDED' 
  | 'UNKNOWN';

export interface CompatibilityResult {
  status: CompatibilityStatus;
  label: string;
  reason: string;
  details: string[];
}
