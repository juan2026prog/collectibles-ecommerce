export type AcademyContentType = 
  | 'ARTICLE' 
  | 'GUIDE' 
  | 'BRAND_GUIDE' 
  | 'SCALE_GUIDE' 
  | 'MATERIAL_GUIDE' 
  | 'FAQ';

export type AcademyContentStatus = 
  | 'DRAFT' 
  | 'REVIEW' 
  | 'AI_DRAFT' 
  | 'PUBLISHED' 
  | 'ARCHIVED';

export interface AcademyArticle {
  id: string;
  type: AcademyContentType;
  title: string;
  slug: string;
  excerpt?: string | null;
  body: string;
  status: AcademyContentStatus;
  category_id?: string | null;
  featured_image?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  published_at?: string | null;
  created_at: string;
  category?: { id: string; name: string };
  products?: any[];
}

export interface AcademyGlossaryTerm {
  id: string;
  term: string;
  slug: string;
  definition: string;
  aliases: string[];
  category: string;
  status: string;
}

export interface AcademyScale {
  id: string;
  scale_key: string;
  label: string;
  ratio: string;
  approx_height_cm: string;
  description: string;
}

export interface AcademyMaterial {
  id: string;
  material_key: string;
  name: string;
  description: string;
  common_uses?: string | null;
  care?: string | null;
}
