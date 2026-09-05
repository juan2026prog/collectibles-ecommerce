export type ReleasePrecision = 'EXACT_DATE' | 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR' | 'TBA';

export type ReleaseStatus = 
  | 'RUMORED' 
  | 'ANNOUNCED' 
  | 'REVEALED' 
  | 'PREORDER_SOON' 
  | 'PREORDER_OPEN' 
  | 'COMING_SOON' 
  | 'SHIPPING' 
  | 'RELEASED' 
  | 'DELAYED' 
  | 'CANCELLED' 
  | 'SOLD_OUT' 
  | 'RESTOCKED';

export type MilestoneType = 'ANNOUNCEMENT' | 'PREORDER' | 'RELEASE' | 'RESTOCK' | 'SHIPPING' | 'OTHER';

export interface ReleaseMilestone {
  id: string;
  release_event_id: string;
  type: MilestoneType;
  date_start?: string | null;
  date_end?: string | null;
  precision: ReleasePrecision;
  date_text?: string | null;
  status: string;
}

export interface ReleaseEvent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  summary?: string | null;
  brand_id?: string | null;
  license_id?: string | null;
  character?: string | null;
  product_line?: string | null;
  manufacturer?: string | null;
  status: ReleaseStatus;
  msrp?: number | null;
  currency: string;
  region: string;
  announcement_date?: string | null;
  preorder_date?: string | null;
  release_date_start?: string | null;
  release_date_end?: string | null;
  release_precision: ReleasePrecision;
  date_display_text?: string | null;
  catalog_product_id?: string | null;
  official_image_url?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  is_verified: boolean;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
  milestones?: ReleaseMilestone[];
  brand?: { id: string; name: string };
  license?: { id: string; name: string };
}
