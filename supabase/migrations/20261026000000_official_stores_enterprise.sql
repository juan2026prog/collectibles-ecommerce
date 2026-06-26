-- Migration: Evolución de Tiendas Oficiales (Seller Stores Enterprise)
-- Date: 2026-06-25

BEGIN;

-- 1. ALTER vendor_stores TABLE to add reputation metrics and extra details
ALTER TABLE public.vendor_stores
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS reviews_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS response_rate NUMERIC(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS cancelled_orders INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_shipments INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_orders INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_products INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS years_in_platform INTEGER NOT NULL DEFAULT 1;

-- 2. ALTER vendor_store_brands TABLE to add exclusivity attributes
ALTER TABLE public.vendor_store_brands
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brand_page_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3. CREATE vendor_store_followers TABLE
CREATE TABLE IF NOT EXISTS public.vendor_store_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_store_id UUID NOT NULL REFERENCES public.vendor_stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_store_follower_unique UNIQUE (vendor_store_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_store_followers_store ON public.vendor_store_followers(vendor_store_id);
CREATE INDEX IF NOT EXISTS idx_vendor_store_followers_customer ON public.vendor_store_followers(customer_id);

-- 4. CREATE vendor_store_badges TABLE
CREATE TABLE IF NOT EXISTS public.vendor_store_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_key TEXT NOT NULL CONSTRAINT vendor_store_badges_key_key UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    color_class TEXT NOT NULL DEFAULT 'bg-primary-500 text-white',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CREATE vendor_store_badge_assignments TABLE
CREATE TABLE IF NOT EXISTS public.vendor_store_badge_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_store_id UUID NOT NULL REFERENCES public.vendor_stores(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES public.vendor_store_badges(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_store_badge_unique UNIQUE (vendor_store_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_badge_assignments_store ON public.vendor_store_badge_assignments(vendor_store_id);

-- 6. CREATE vendor_store_collections TABLE
CREATE TABLE IF NOT EXISTS public.vendor_store_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_store_id UUID NOT NULL REFERENCES public.vendor_stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    banner_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_store_collection_slug_unique UNIQUE (vendor_store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_store_collections_store ON public.vendor_store_collections(vendor_store_id);

-- 7. CREATE vendor_store_collection_products TABLE
CREATE TABLE IF NOT EXISTS public.vendor_store_collection_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES public.vendor_store_collections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    CONSTRAINT vendor_store_collection_product_unique UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_collection ON public.vendor_store_collection_products(collection_id);

-- 8. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.vendor_store_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_store_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_store_badge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_store_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_store_collection_products ENABLE ROW LEVEL SECURITY;

-- 9. RLS POLICIES

-- vendor_store_followers
DROP POLICY IF EXISTS "Public read followers" ON public.vendor_store_followers;
CREATE POLICY "Public read followers" ON public.vendor_store_followers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own follows" ON public.vendor_store_followers;
CREATE POLICY "Users insert own follows" ON public.vendor_store_followers
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Users delete own follows" ON public.vendor_store_followers;
CREATE POLICY "Users delete own follows" ON public.vendor_store_followers
  FOR DELETE USING (auth.uid() = customer_id);

-- vendor_store_badges
DROP POLICY IF EXISTS "Public read badges" ON public.vendor_store_badges;
CREATE POLICY "Public read badges" ON public.vendor_store_badges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage badges" ON public.vendor_store_badges;
CREATE POLICY "Admins manage badges" ON public.vendor_store_badges
  FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- vendor_store_badge_assignments
DROP POLICY IF EXISTS "Public read badge assignments" ON public.vendor_store_badge_assignments;
CREATE POLICY "Public read badge assignments" ON public.vendor_store_badge_assignments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage badge assignments" ON public.vendor_store_badge_assignments;
CREATE POLICY "Admins manage badge assignments" ON public.vendor_store_badge_assignments
  FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- vendor_store_collections
DROP POLICY IF EXISTS "Public read active collections" ON public.vendor_store_collections;
CREATE POLICY "Public read active collections" ON public.vendor_store_collections
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Vendors manage own collections" ON public.vendor_store_collections;
CREATE POLICY "Vendors manage own collections" ON public.vendor_store_collections
  FOR ALL USING (
    auth.uid() IN (SELECT vendor_id FROM public.vendor_stores WHERE id = vendor_store_id)
  );

-- vendor_store_collection_products
DROP POLICY IF EXISTS "Public read collection products" ON public.vendor_store_collection_products;
CREATE POLICY "Public read collection products" ON public.vendor_store_collection_products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Vendors manage own collection products" ON public.vendor_store_collection_products;
CREATE POLICY "Vendors manage own collection products" ON public.vendor_store_collection_products
  FOR ALL USING (
    auth.uid() IN (
      SELECT vs.vendor_id 
      FROM public.vendor_store_collections vsc
      JOIN public.vendor_stores vs ON vs.id = vsc.vendor_store_id
      WHERE vsc.id = collection_id
    )
  );

-- 10. REPUTATION AUTOMATIC TRIGGERS

-- A. FOLLOWERS COUNT UPDATER
CREATE OR REPLACE FUNCTION public.handle_vendor_store_follower_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.vendor_stores
    SET followers_count = followers_count + 1
    WHERE id = NEW.vendor_store_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.vendor_stores
    SET followers_count = GREATEST(0, followers_count - 1)
    WHERE id = OLD.vendor_store_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_vendor_store_follower_counter
  AFTER INSERT OR DELETE ON public.vendor_store_followers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_vendor_store_follower_change();

-- B. CREATED PRODUCTS COUNTER
CREATE OR REPLACE FUNCTION public.handle_product_store_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert
  IF TG_OP = 'INSERT' THEN
    IF NEW.vendor_store_id IS NOT NULL THEN
      UPDATE public.vendor_stores
      SET created_products = created_products + 1
      WHERE id = NEW.vendor_store_id;
    END IF;
    RETURN NEW;
  -- Delete
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vendor_store_id IS NOT NULL THEN
      UPDATE public.vendor_stores
      SET created_products = GREATEST(0, created_products - 1)
      WHERE id = OLD.vendor_store_id;
    END IF;
    RETURN OLD;
  -- Update
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.vendor_store_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(NEW.vendor_store_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      IF OLD.vendor_store_id IS NOT NULL THEN
        UPDATE public.vendor_stores
        SET created_products = GREATEST(0, created_products - 1)
        WHERE id = OLD.vendor_store_id;
      END IF;
      IF NEW.vendor_store_id IS NOT NULL THEN
        UPDATE public.vendor_stores
        SET created_products = created_products + 1
        WHERE id = NEW.vendor_store_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_products_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_product_store_change();

-- C. RATINGS AND REVIEWS COUNTER
CREATE OR REPLACE FUNCTION public.handle_review_change_recalculate_reputation()
RETURNS TRIGGER AS $$
DECLARE
  v_prod_id UUID;
  v_store_id UUID;
  v_avg NUMERIC(3,2);
  v_count INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prod_id := OLD.product_id;
  ELSE
    v_prod_id := NEW.product_id;
  END IF;

  -- Find store ID
  SELECT vendor_store_id INTO v_store_id
  FROM public.products
  WHERE id = v_prod_id;

  IF v_store_id IS NOT NULL THEN
    -- Recalculate
    SELECT COALESCE(AVG(r.rating), 0.00), COUNT(r.id) INTO v_avg, v_count
    FROM public.reviews r
    JOIN public.products p ON p.id = r.product_id
    WHERE p.vendor_store_id = v_store_id;

    UPDATE public.vendor_stores
    SET rating = v_avg,
        reviews_count = v_count
    WHERE id = v_store_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_reviews_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_review_change_recalculate_reputation();

-- D. SUBORDERS SALES & STATUS COUNTER
CREATE OR REPLACE FUNCTION public.handle_suborder_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_store_id IS NOT NULL AND OLD.status <> NEW.status THEN
    -- Sales and completed count
    IF NEW.status = 'completed' THEN
      UPDATE public.vendor_stores
      SET sales_count = sales_count + 1,
          completed_orders = completed_orders + 1
      WHERE id = NEW.vendor_store_id;
    ELSIF NEW.status = 'cancelled' THEN
      UPDATE public.vendor_stores
      SET cancelled_orders = cancelled_orders + 1
      WHERE id = NEW.vendor_store_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_suborders_counter
  AFTER UPDATE OF status ON public.order_suborders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_suborder_status_change();

-- E. LATE SHIPMENTS COUNTER
CREATE OR REPLACE FUNCTION public.handle_shipment_late_tracking()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id UUID;
BEGIN
  IF NEW.shipping_status = 'late' AND OLD.shipping_status <> 'late' AND NEW.suborder_id IS NOT NULL THEN
    SELECT vendor_store_id INTO v_store_id
    FROM public.order_suborders
    WHERE id = NEW.suborder_id;

    IF v_store_id IS NOT NULL THEN
      UPDATE public.vendor_stores
      SET late_shipments = late_shipments + 1
      WHERE id = v_store_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_shipments_late_counter
  AFTER UPDATE OF shipping_status ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_shipment_late_tracking();

-- 11. SEED DEFAULT BADGES
INSERT INTO public.vendor_store_badges (badge_key, label, description, color_class) VALUES
  ('official_store', '✔ Tienda Oficial', 'Establecimiento minorista oficial de la marca', 'bg-red-500 text-white border-red-400'),
  ('official_distributor', '✔ Distribuidor Oficial', 'Distribuidor autorizado oficial del fabricante', 'bg-blue-600 text-white border-blue-500'),
  ('exclusive_distributor', '✔ Distribuidor Exclusivo', 'Único importador exclusivo de la marca en Uruguay', 'bg-purple-600 text-white border-purple-500'),
  ('gold_seller', '✔ Gold Seller', 'Vendedor de alto rendimiento y excelente reputación', 'bg-amber-500 text-slate-900 border-amber-400 font-bold'),
  ('platinum_seller', '✔ Platinum Seller', 'Vendedor premium con los estándares logísticos más altos', 'bg-slate-300 text-slate-900 border-slate-200 font-extrabold'),
  ('top_rated', '⭐ Top Rated', 'Tienda con calificación promedio superior a 4.8 estrellas', 'bg-emerald-500 text-white border-emerald-400')
ON CONFLICT (badge_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  color_class = EXCLUDED.color_class;

-- 12. RUN INITIAL SYNC/MIGRATION OF EXISTING VALUES
-- Seed initial product count for all active stores
UPDATE public.vendor_stores vs
SET created_products = (
  SELECT COUNT(p.id)
  FROM public.products p
  WHERE p.vendor_store_id = vs.id AND p.status = 'published' AND p.is_active = true
);

-- Seed initial reviews count and rating
UPDATE public.vendor_stores vs
SET rating = COALESCE((
      SELECT AVG(r.rating)
      FROM public.reviews r
      JOIN public.products p ON p.id = r.product_id
      WHERE p.vendor_store_id = vs.id
    ), 0.00),
    reviews_count = COALESCE((
      SELECT COUNT(r.id)
      FROM public.reviews r
      JOIN public.products p ON p.id = r.product_id
      WHERE p.vendor_store_id = vs.id
    ), 0);

-- Assign default 'official_store' badge to existing stores marked as official
INSERT INTO public.vendor_store_badge_assignments (vendor_store_id, badge_id)
SELECT id, (SELECT id FROM public.vendor_store_badges WHERE badge_key = 'official_store' LIMIT 1)
FROM public.vendor_stores
WHERE is_official = true
ON CONFLICT (vendor_store_id, badge_id) DO NOTHING;

COMMIT;
