-- Migration: 20261231040000_release_radar_core.sql
-- Module 02: Collectibles Radar & Release Calendar Engine

-- 1. Precision & Status Enums/Types
DO $$ BEGIN
    CREATE TYPE public.release_precision_type AS ENUM ('EXACT_DATE', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'TBA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.release_status_type AS ENUM (
        'RUMORED', 'ANNOUNCED', 'REVEALED', 'PREORDER_SOON', 
        'PREORDER_OPEN', 'COMING_SOON', 'SHIPPING', 'RELEASED', 
        'DELAYED', 'CANCELLED', 'SOLD_OUT', 'RESTOCKED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.release_milestone_type AS ENUM (
        'ANNOUNCEMENT', 'PREORDER', 'RELEASE', 'RESTOCK', 'SHIPPING', 'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Release Events Table
CREATE TABLE IF NOT EXISTS public.release_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    subtitle text,
    description text,
    summary text,
    brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
    license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
    theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    character text,
    product_line text,
    manufacturer text,
    status release_status_type NOT NULL DEFAULT 'ANNOUNCED',
    msrp numeric(10, 2),
    currency text NOT NULL DEFAULT 'USD',
    region text NOT NULL DEFAULT 'GLOBAL',
    announcement_date date,
    preorder_date date,
    release_date_start date,
    release_date_end date,
    release_precision release_precision_type NOT NULL DEFAULT 'TBA',
    date_display_text text, -- ej: 'Q1 2027', 'Noviembre 2026'
    catalog_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    source_name text,
    source_url text,
    source_type text DEFAULT 'official_website',
    official_image_url text,
    confidence_score integer DEFAULT 90 CHECK (confidence_score BETWEEN 0 AND 100),
    is_verified boolean NOT NULL DEFAULT true,
    is_featured boolean NOT NULL DEFAULT false,
    is_published boolean NOT NULL DEFAULT true,
    published_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Release Milestones Table
CREATE TABLE IF NOT EXISTS public.release_milestones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    release_event_id uuid NOT NULL REFERENCES public.release_events(id) ON DELETE CASCADE,
    type release_milestone_type NOT NULL DEFAULT 'RELEASE',
    date_start date,
    date_end date,
    precision release_precision_type NOT NULL DEFAULT 'TBA',
    date_text text,
    status text NOT NULL DEFAULT 'SCHEDULED',
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 4. Inmutable Status History
CREATE TABLE IF NOT EXISTS public.release_status_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    release_event_id uuid NOT NULL REFERENCES public.release_events(id) ON DELETE CASCADE,
    old_status release_status_type,
    new_status release_status_type NOT NULL,
    reason text,
    source text DEFAULT 'admin_manual',
    changed_at timestamptz DEFAULT now() NOT NULL
);

-- 5. Inmutable Date Change History
CREATE TABLE IF NOT EXISTS public.release_date_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    release_event_id uuid NOT NULL REFERENCES public.release_events(id) ON DELETE CASCADE,
    date_type text NOT NULL, -- 'release_date', 'preorder_date'
    old_value text,
    new_value text NOT NULL,
    reason text,
    source text DEFAULT 'admin_manual',
    changed_at timestamptz DEFAULT now() NOT NULL
);

-- 6. User Release Subscriptions / Alerts
CREATE TABLE IF NOT EXISTS public.release_alerts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    release_event_id uuid NOT NULL REFERENCES public.release_events(id) ON DELETE CASCADE,
    alert_type text NOT NULL DEFAULT 'RELEASE_DATE', -- 'PREORDER_OPEN', 'DELAYED', 'AVAILABLE_AT_COLLECTIBLES'
    channel text NOT NULL DEFAULT 'IN_APP',
    enabled boolean NOT NULL DEFAULT true,
    last_sent_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, release_event_id, alert_type)
);

-- RLS Policies
ALTER TABLE public.release_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_date_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_alerts ENABLE ROW LEVEL SECURITY;

-- Public can view published release events and milestones
DROP POLICY IF EXISTS "Public can view published release events" ON public.release_events;
CREATE POLICY "Public can view published release events" ON public.release_events
FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Public can view milestones of published releases" ON public.release_milestones;
CREATE POLICY "Public can view milestones of published releases" ON public.release_milestones
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.release_events re WHERE re.id = release_milestones.release_event_id AND re.is_published = true)
);

-- Users manage their own alerts
DROP POLICY IF EXISTS "Users can manage own release alerts" ON public.release_alerts;
CREATE POLICY "Users can manage own release alerts" ON public.release_alerts
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admins full access
DROP POLICY IF EXISTS "Admins full access to releases" ON public.release_events;
CREATE POLICY "Admins full access to releases" ON public.release_events
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins full access to milestones" ON public.release_milestones;
CREATE POLICY "Admins full access to milestones" ON public.release_milestones
FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Seed Initial Releases
INSERT INTO public.release_events 
(slug, title, subtitle, description, summary, status, msrp, release_precision, date_display_text, is_featured, is_published)
VALUES 
('hot-toys-batman-the-dark-knight-armory', 'Batman Armory (The Dark Knight)', 'Hot Toys Movie Masterpiece 1:6', 'Figura articulada con armería iluminada por LED y set completo de accesorios.', 'Lanzamiento esperado para Q1 2027.', 'PREORDER_OPEN', 365.00, 'QUARTER', 'Q1 2027', true, true),
('neca-predator-feral-camo-edition', 'Feral Predator Camo Edition', 'NECA Ultimate 7-inch Scale', 'Versión translúcida con acabado camuflaje y máscara alternativa.', 'Lanzamiento previsto en Noviembre 2026.', 'ANNOUNCED', 42.00, 'MONTH', 'Noviembre 2026', false, true)
ON CONFLICT (slug) DO NOTHING;
