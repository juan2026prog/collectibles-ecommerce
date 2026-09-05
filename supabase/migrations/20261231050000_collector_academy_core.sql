-- Migration: 20261231050000_collector_academy_core.sql
-- Module 05: Collector Academy (Editorial, Glossary, Scales & Materials)

-- 1. Academy Categories Table
CREATE TABLE IF NOT EXISTS public.academy_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    sort_order integer DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Academy Content Table
CREATE TABLE IF NOT EXISTS public.academy_content (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL DEFAULT 'ARTICLE', -- 'ARTICLE', 'GUIDE', 'BRAND_GUIDE', 'SCALE_GUIDE', 'MATERIAL_GUIDE', 'FAQ'
    title text NOT NULL,
    slug text NOT NULL UNIQUE,
    excerpt text,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'REVIEW', 'AI_DRAFT', 'PUBLISHED', 'ARCHIVED'
    category_id uuid REFERENCES public.academy_categories(id) ON DELETE SET NULL,
    author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    featured_image text,
    seo_title text,
    seo_description text,
    source_notes text,
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Academy Glossary Table
CREATE TABLE IF NOT EXISTS public.academy_glossary (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    term text NOT NULL,
    slug text NOT NULL UNIQUE,
    definition text NOT NULL,
    aliases text[] DEFAULT '{}',
    category text DEFAULT 'GENERAL',
    status text NOT NULL DEFAULT 'PUBLISHED',
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Academy Scales Table
CREATE TABLE IF NOT EXISTS public.academy_scales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    scale_key text NOT NULL UNIQUE, -- '1:4', '1:6', '1:10', '1:12', '1:18', '1:24', '1:43', '1:64'
    label text NOT NULL,
    ratio text NOT NULL,
    approx_height_cm text NOT NULL,
    description text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 5. Academy Materials Table
CREATE TABLE IF NOT EXISTS public.academy_materials (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    material_key text NOT NULL UNIQUE, -- 'PVC', 'ABS', 'RESIN', 'POLYSTONE', 'VINYL', 'DIECAST'
    name text NOT NULL,
    description text NOT NULL,
    common_uses text,
    care text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 6. Content to Products Mapping (Live Catalog link)
CREATE TABLE IF NOT EXISTS public.academy_content_products (
    content_id uuid NOT NULL REFERENCES public.academy_content(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    relation_type text DEFAULT 'RECOMMENDED',
    sort_order integer DEFAULT 0,
    PRIMARY KEY (content_id, product_id)
);

-- RLS
ALTER TABLE public.academy_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_glossary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_content_products ENABLE ROW LEVEL SECURITY;

-- Public can read published content and reference tables
DROP POLICY IF EXISTS "Public can view published academy content" ON public.academy_content;
CREATE POLICY "Public can view published academy content" ON public.academy_content
FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS "Public can view academy categories" ON public.academy_categories;
CREATE POLICY "Public can view academy categories" ON public.academy_categories FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Public can view academy glossary" ON public.academy_glossary;
CREATE POLICY "Public can view academy glossary" ON public.academy_glossary FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS "Public can view academy scales" ON public.academy_scales;
CREATE POLICY "Public can view academy scales" ON public.academy_scales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view academy materials" ON public.academy_materials;
CREATE POLICY "Public can view academy materials" ON public.academy_materials FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view academy product relations" ON public.academy_content_products;
CREATE POLICY "Public can view academy product relations" ON public.academy_content_products FOR SELECT USING (true);

-- Admins full access
DROP POLICY IF EXISTS "Admins full access to academy content" ON public.academy_content;
CREATE POLICY "Admins full access to academy content" ON public.academy_content
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RPC for AI Search to query published academy content
CREATE OR REPLACE FUNCTION public.get_academy_articles_for_search(p_query text)
RETURNS TABLE (
    content_id uuid,
    title text,
    excerpt text,
    url text,
    type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ac.id,
        ac.title,
        ac.excerpt,
        ('/academy/' || ac.slug) as url,
        ac.type
    FROM academy_content ac
    WHERE ac.status = 'PUBLISHED'
      AND (ac.title ILIKE '%' || p_query || '%' OR ac.excerpt ILIKE '%' || p_query || '%')
    LIMIT 5;
END;
$$;

-- Seed Scales
INSERT INTO public.academy_scales (scale_key, label, ratio, approx_height_cm, description)
VALUES 
('1:6', 'Escala 1/6 (Sixth Scale)', '1:6', '28 - 32 cm', 'El estándar clásico de alta gama para figuras de acción (Hot Toys, Sideshow, Damtoys).'),
('1:12', 'Escala 1/12 (Six Inch / One:12)', '1:12', '15 - 18 cm', 'El formato rey de figuras articuladas coleccionables (Marvel Legends, Mafex, SH Figuarts, Mezco).'),
('1:4', 'Escala 1/4 (Quarter Scale)', '1:4', '45 - 55 cm', 'Grandes piezas de museo y estatuas de colección de alto impacto visual.'),
('1:18', 'Escala 1/18 (3.75 - 4 pulgadas)', '1:18', '9.5 - 10.5 cm', 'Escala histórica de figuras vintage y vehículos detallados (Star Wars Vintage Collection, JoyToy).')
ON CONFLICT (scale_key) DO NOTHING;

-- Seed Glossary
INSERT INTO public.academy_glossary (term, slug, definition, category, status)
VALUES
('Chase', 'chase', 'Variante más rara o limitada de una figura de tirada estándar distribuida aleatoriamente en cajas.', 'TERMINOLOGY', 'PUBLISHED'),
('MISB', 'misb', 'Mint In Sealed Box: Pieza completamente nueva, sin abrir y con precinto de fábrica original intacto.', 'GRADING', 'PUBLISHED'),
('Loose', 'loose', 'Figura fuera de su empaque original, completa o sin accesorios, ideal para exhibición en vitrina.', 'GRADING', 'PUBLISHED'),
('KO / Bootleg', 'ko-bootleg', 'Copia no autorizada o falsificación que no cuenta con la licencia oficial de la marca.', 'AUTHENTICITY', 'PUBLISHED')
ON CONFLICT (slug) DO NOTHING;

-- Seed Sample Guide
INSERT INTO public.academy_content (title, slug, excerpt, body, status, published_at)
VALUES
('Guía de Escalas en Figuras de Colección: De 1:12 a 1:6', 'guia-de-escalas-coleccionables', 'Aprende las diferencias reales de tamaño, articulación y compatibilidad de vitrinas entre escalas.', 'La escala de una figura determina la proporción respecto a la estatura real humana. En esta guía repasamos cómo elegir la escala adecuada para tu vitrina.', 'PUBLISHED', now())
ON CONFLICT (slug) DO NOTHING;
