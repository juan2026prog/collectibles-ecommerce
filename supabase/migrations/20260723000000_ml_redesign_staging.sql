-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: ML Redesign Staging & Normalization Schema
-- Applied: 2026-07-23
-- ══════════════════════════════════════════════════════════════

-- 1. Enable pg_trgm extension for text similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create Cuentas de Vendedor Multi-vendor (ml_seller_accounts)
CREATE TABLE IF NOT EXISTS public.ml_seller_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
    seller_id TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Raw Items table (ml_raw_items)
CREATE TABLE IF NOT EXISTS public.ml_raw_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id TEXT REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE,
    ml_item_id TEXT UNIQUE NOT NULL,
    catalog_product_id TEXT,
    title TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    currency_id TEXT DEFAULT 'UYU',
    available_quantity INTEGER DEFAULT 0,
    permalink TEXT,
    thumbnail TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'ignored')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Matches table (ml_import_matches)
CREATE TABLE IF NOT EXISTS public.ml_import_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_item_id UUID REFERENCES public.ml_raw_items(id) ON DELETE CASCADE,
    matched_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('sku', 'gtin', 'catalog_id', 'title_similarity')),
    confidence_score NUMERIC(3,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Catalog Links table (ml_catalog_links)
CREATE TABLE IF NOT EXISTS public.ml_catalog_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    ml_item_id TEXT UNIQUE NOT NULL,
    seller_id TEXT REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE,
    sync_stock BOOLEAN DEFAULT TRUE,
    sync_price BOOLEAN DEFAULT TRUE,
    last_sync_status TEXT DEFAULT 'synced' CHECK (last_sync_status IN ('synced', 'failed')),
    last_sync_error TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Import Logs table (ml_import_logs)
CREATE TABLE IF NOT EXISTS public.ml_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id TEXT REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create Category Mapping table (ml_category_mapping)
CREATE TABLE IF NOT EXISTS public.ml_category_mapping (
    ml_category_id TEXT PRIMARY KEY,
    ml_category_name TEXT,
    internal_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Create Keyword Rules table (category_keyword_rules)
CREATE TABLE IF NOT EXISTS public.category_keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    keyword TEXT UNIQUE NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Create Sync Queue table (ml_sync_queue)
CREATE TABLE IF NOT EXISTS public.ml_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    ml_item_id TEXT NOT NULL,
    seller_id TEXT REFERENCES public.ml_seller_accounts(seller_id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- 10. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.ml_seller_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_raw_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_import_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_catalog_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_category_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_keyword_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_sync_queue ENABLE ROW LEVEL SECURITY;

-- 11. Define Security Policies

-- ml_seller_accounts Policies
DROP POLICY IF EXISTS "Admins manage all seller accounts" ON public.ml_seller_accounts;
CREATE POLICY "Admins manage all seller accounts" ON public.ml_seller_accounts
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own seller accounts" ON public.ml_seller_accounts;
CREATE POLICY "Vendors manage own seller accounts" ON public.ml_seller_accounts
    FOR ALL USING (vendor_id = auth.uid())
    WITH CHECK (vendor_id = auth.uid());

-- ml_raw_items Policies
DROP POLICY IF EXISTS "Admins manage all raw items" ON public.ml_raw_items;
CREATE POLICY "Admins manage all raw items" ON public.ml_raw_items
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own raw items" ON public.ml_raw_items;
CREATE POLICY "Vendors manage own raw items" ON public.ml_raw_items
    FOR ALL USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- ml_import_matches Policies
DROP POLICY IF EXISTS "Admins manage all matches" ON public.ml_import_matches;
CREATE POLICY "Admins manage all matches" ON public.ml_import_matches
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own matches" ON public.ml_import_matches;
CREATE POLICY "Vendors manage own matches" ON public.ml_import_matches
    FOR ALL USING (
        raw_item_id IN (
            SELECT id FROM public.ml_raw_items
            WHERE seller_id IN (
                SELECT seller_id FROM public.ml_seller_accounts
                WHERE vendor_id = auth.uid()
            )
        )
    );

-- ml_catalog_links Policies
DROP POLICY IF EXISTS "Admins manage all links" ON public.ml_catalog_links;
CREATE POLICY "Admins manage all links" ON public.ml_catalog_links
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own links" ON public.ml_catalog_links;
CREATE POLICY "Vendors manage own links" ON public.ml_catalog_links
    FOR ALL USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- ml_import_logs Policies
DROP POLICY IF EXISTS "Admins manage all import logs" ON public.ml_import_logs;
CREATE POLICY "Admins manage all import logs" ON public.ml_import_logs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors view own import logs" ON public.ml_import_logs;
CREATE POLICY "Vendors view own import logs" ON public.ml_import_logs
    FOR SELECT USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- ml_category_mapping Policies
DROP POLICY IF EXISTS "Admins manage category mappings" ON public.ml_category_mapping;
CREATE POLICY "Admins manage category mappings" ON public.ml_category_mapping
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Public can view category mappings" ON public.ml_category_mapping;
CREATE POLICY "Public can view category mappings" ON public.ml_category_mapping
    FOR SELECT USING (true);

-- category_keyword_rules Policies
DROP POLICY IF EXISTS "Admins manage keyword rules" ON public.category_keyword_rules;
CREATE POLICY "Admins manage keyword rules" ON public.category_keyword_rules
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Public can view keyword rules" ON public.category_keyword_rules;
CREATE POLICY "Public can view keyword rules" ON public.category_keyword_rules
    FOR SELECT USING (true);

-- ml_sync_queue Policies
DROP POLICY IF EXISTS "Admins manage sync queue" ON public.ml_sync_queue;
CREATE POLICY "Admins manage sync queue" ON public.ml_sync_queue
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );

DROP POLICY IF EXISTS "Vendors manage own sync queue" ON public.ml_sync_queue;
CREATE POLICY "Vendors manage own sync queue" ON public.ml_sync_queue
    FOR ALL USING (
        seller_id IN (
            SELECT seller_id FROM public.ml_seller_accounts
            WHERE vendor_id = auth.uid()
        )
    );

-- 12. Create Indexes for Performance optimization
CREATE INDEX IF NOT EXISTS idx_ml_raw_items_seller ON public.ml_raw_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_ml_raw_items_status ON public.ml_raw_items(status);
CREATE INDEX IF NOT EXISTS idx_ml_import_matches_raw ON public.ml_import_matches(raw_item_id);
CREATE INDEX IF NOT EXISTS idx_ml_catalog_links_prod ON public.ml_catalog_links(product_id);
CREATE INDEX IF NOT EXISTS idx_ml_catalog_links_var ON public.ml_catalog_links(variant_id);
CREATE INDEX IF NOT EXISTS idx_ml_sync_queue_status ON public.ml_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON public.products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ml_raw_items_title_trgm ON public.ml_raw_items USING gin (title gin_trgm_ops);

-- 13. Data Migration: Replicate existing tokens from ml_credentials to ml_seller_accounts
DO $$
DECLARE
    v_cred RECORD;
BEGIN
    -- Check if ml_credentials exists before executing migration
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ml_credentials') THEN
        FOR v_cred IN (SELECT * FROM public.ml_credentials)
        LOOP
            INSERT INTO public.ml_seller_accounts (
                vendor_id,
                seller_id,
                nickname,
                access_token,
                refresh_token,
                expires_at,
                created_at,
                updated_at
            ) VALUES (
                NULL, -- Platform-owned / Admin credentials
                'PLATFORM_MIGRATED_' || COALESCE(v_cred.id::text, gen_random_uuid()::text), -- Unique self-healing placeholder
                'Platform Store (Migrated)',
                v_cred.access_token,
                v_cred.refresh_token,
                v_cred.expires_at,
                COALESCE(v_cred.updated_at, NOW()),
                COALESCE(v_cred.updated_at, NOW())
            )
            ON CONFLICT (seller_id) DO NOTHING;
        END LOOP;
        
        -- Drop the deprecated ml_credentials table
        DROP TABLE public.ml_credentials;
    END IF;
END $$;

-- 14. Seed official categories (ensure they exist in catalog)
INSERT INTO public.categories (name, slug, is_active) VALUES
  ('Funko POP', 'funko-pop', true),
  ('Figuras de Acción', 'figuras-accion', true),
  ('Cromos / Figuritas', 'cromos-figuritas', true),
  ('Peluches', 'peluches', true),
  ('Vehículos a Escala', 'vehiculos-a-escala', true),
  ('Esculturas y Estatuas', 'esculturas-estatuas', true),
  ('Ropa & Accesorios', 'ropa-accesorios', true),
  ('TCG & Boardgames', 'tcg-boardgames', true),
  ('Llaveros', 'llaveros', true),
  ('Papelería', 'papeleria', true),
  ('Home & Decor', 'home-decor', true),
  ('Juegos y Juguetes', 'juegos-juguetes', true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true;

-- 15. Seed keyword matching rules (category_keyword_rules)
DO $$
DECLARE
  v_cat_id UUID;
  v_rules RECORD;
  v_kw TEXT;
BEGIN
  FOR v_rules IN (
    SELECT 'funko-pop' AS slug, ARRAY['funko', 'pop!'] AS kws, 100 AS priority
    UNION ALL
    SELECT 'figuras-accion' AS slug, ARRAY['neca', 'marvel legends', 'mcfarlane', 'bandai anime heroes', 'dragon stars'] AS kws, 90 AS priority
    UNION ALL
    SELECT 'cromos-figuritas' AS slug, ARRAY['panini', 'album', 'álbum', 'figuritas', 'sticker', 'cromos'] AS kws, 80 AS priority
    UNION ALL
    SELECT 'vehiculos-a-escala' AS slug, ARRAY['majorette', '1:64', 'die cast', 'autos de metal', 'escala'] AS kws, 70 AS priority
    UNION ALL
    SELECT 'esculturas-estatuas' AS slug, ARRAY['iron studios', 'minico', 'art scale', 'bds', 'estatua', 'escultura'] AS kws, 75 AS priority
    UNION ALL
    SELECT 'peluches' AS slug, ARRAY['plush', 'peluche'] AS kws, 60 AS priority
    UNION ALL
    SELECT 'tcg-boardgames' AS slug, ARRAY['heroclix', 'dice masters', 'card game', 'puzzle', 'tcg', 'yugioh', 'pokemon tcg'] AS kws, 85 AS priority
    UNION ALL
    SELECT 'ropa-accesorios' AS slug, ARRAY['body', 'camiseta', 'remera', 'gorro', 'guantes', 'medias', 'túnica'] AS kws, 50 AS priority
    UNION ALL
    SELECT 'papeleria' AS slug, ARRAY['cuaderno', 'set escolar', 'gomas'] AS kws, 40 AS priority
    UNION ALL
    SELECT 'llaveros' AS slug, ARRAY['llavero', 'keychain'] AS kws, 45 AS priority
    UNION ALL
    SELECT 'juegos-juguetes' AS slug, ARRAY['beyblade', 'estadio', 'lanzador', 'juguete', 'juego'] AS kws, 65 AS priority
  )
  LOOP
    SELECT id INTO v_cat_id FROM public.categories WHERE slug = v_rules.slug;
    IF v_cat_id IS NOT NULL THEN
      FOREACH v_kw IN ARRAY v_rules.kws
      LOOP
        INSERT INTO public.category_keyword_rules (category_id, keyword, priority)
        VALUES (v_cat_id, v_kw, v_rules.priority)
        ON CONFLICT (keyword) DO UPDATE SET category_id = EXCLUDED.category_id, priority = EXCLUDED.priority;
      END LOOP;
    END IF;
  END LOOP;
END $$;
