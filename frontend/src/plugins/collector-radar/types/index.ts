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

/**
 * Vocabulario fijo de señales editoriales del Radar.
 * Cada señal tiene una razón objetiva distinta de aparecer en Radar.
 */
export type RadarSignal =
  | 'PREVENTA_CERRANDO'   // Deadline de preventa en ≤ 7 días
  | 'NUEVO_ANUNCIO'       // Anunciado hace ≤ 14 días
  | 'ACABA_DE_SALIR'      // Lanzado al mercado hace ≤ 30 días
  | 'PREVENTA_ABIERTA'    // Pre-order en curso sin urgencia inmediata
  | 'ALTA_DEMANDA'        // Crowdfunding/demanda masiva verificada
  | 'EXCLUSIVO'           // Exclusivo de canal / creator / retailer
  | 'REEDICION'           // Reedición de ítem clásico
  | 'AGOTADO'             // Sin stock disponible actualmente
  | 'VUELVE_A_STOCK'      // Re-stock confirmado
  | 'MERECE_ATENCION';    // Editorial catch-all

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
  brand?: { id: string; name: string; slug?: string };
  license?: { id: string; name: string; slug?: string };
  // Campos editoriales del Radar (añadidos en migración futura)
  radar_signal?: RadarSignal | null;
  radar_why?: string | null;       // Frase editorial: por qué está en Radar
  radar_context?: string | null;   // Datos extra: "23.553 backers · Meta: 10.000"
}
