export type VaultCondition = 
  | 'MINT' 
  | 'NEAR_MINT' 
  | 'EXCELLENT' 
  | 'GOOD' 
  | 'FAIR' 
  | 'POOR' 
  | 'DAMAGED';

export type VaultBoxCondition = 
  | 'SEALED' 
  | 'OPEN_BOX' 
  | 'DAMAGED_BOX' 
  | 'NO_BOX' 
  | 'ACRYLIC_CASE';

export type VaultStatus = 
  | 'OWNED' 
  | 'WISHLIST' 
  | 'ORDERED' 
  | 'PREORDERED' 
  | 'WANTED' 
  | 'SOLD' 
  | 'TRADED';

export type VaultVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';

export interface VaultExternalItem {
  id: string;
  user_id: string;
  name: string;
  brand_name?: string | null;
  license_name?: string | null;
  category_name?: string | null;
  scale?: string | null;
  character?: string | null;
  release_year?: number | null;
  image_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultItem {
  id: string;
  user_id: string;
  product_id?: string | null;
  external_item_id?: string | null;
  status: VaultStatus;
  condition: VaultCondition;
  box_condition: VaultBoxCondition;
  quantity: number;
  purchase_price?: number | null;
  purchase_currency?: string | null;
  purchase_date?: string | null;
  purchase_store?: string | null;
  notes?: string | null;
  custom_image_url?: string | null;
  edition_number?: string | null;
  visibility: VaultVisibility;
  created_at: string;
  updated_at: string;
  // Joins
  product?: any;
  external_item?: VaultExternalItem | null;
}

export interface VaultCollection {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_image?: string | null;
  visibility: VaultVisibility;
  sort_order: number;
  created_at: string;
  updated_at: string;
  items_count?: number;
}

export interface VaultUserProfile {
  user_id: string;
  handle: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  is_public: boolean;
  show_stats: boolean;
  created_at: string;
  updated_at: string;
}

export interface VaultStats {
  total_items: number;
  owned_count: number;
  wishlist_count: number;
  ordered_count: number;
  preordered_count: number;
  wanted_count: number;
  sold_count: number;
  traded_count: number;
  collections_count: number;
  brands_count: number;
  licenses_count: number;
  categories_count: number;
  amount_spent: number | null;
  brand_distribution?: Record<string, number>;
  license_distribution?: Record<string, number>;
}

export interface VaultPublicShowcaseItem {
  id: string;
  title: string;
  brand_name: string | null;
  license_name: string | null;
  character: string | null;
  scale: string | null;
  condition: VaultCondition;
  box_condition: VaultBoxCondition;
  image_url: string;
  edition_number: string | null;
  is_catalog: boolean;
  slug?: string;
}
