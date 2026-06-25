-- Migration: Multi-Store Vendor / Tiendas Oficiales / Vendido Por
-- Date: 2026-06-25

BEGIN;

-- 1. CREATE vendor_stores TABLE
CREATE TABLE IF NOT EXISTS public.vendor_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL CONSTRAINT vendor_stores_store_name_key UNIQUE,
    slug TEXT NOT NULL CONSTRAINT vendor_stores_slug_key UNIQUE,
    logo_url TEXT,
    banner_url TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT check_store_status CHECK (status IN ('draft', 'pending_review', 'active', 'suspended', 'archived')),
    is_official BOOLEAN NOT NULL DEFAULT false,
    official_badge_text TEXT NOT NULL DEFAULT 'Oficial',
    contact_email TEXT,
    contact_phone TEXT,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    seo_title TEXT,
    seo_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rapid store lookups by slug and vendor
CREATE INDEX IF NOT EXISTS idx_vendor_stores_slug ON public.vendor_stores(slug);
CREATE INDEX IF NOT EXISTS idx_vendor_stores_vendor ON public.vendor_stores(vendor_id);

-- 2. CREATE vendor_store_brands TABLE (Official store association to brands)
CREATE TABLE IF NOT EXISTS public.vendor_store_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_store_id UUID NOT NULL REFERENCES public.vendor_stores(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending_review' CONSTRAINT check_store_brand_status CHECK (status IN ('pending_review', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_store_brand_unique UNIQUE (vendor_store_id, brand_id)
);

-- Index for rapid brand lookup per store
CREATE INDEX IF NOT EXISTS idx_vendor_store_brands_store ON public.vendor_store_brands(vendor_store_id);
CREATE INDEX IF NOT EXISTS idx_vendor_store_brands_brand ON public.vendor_store_brands(brand_id);

-- 3. ALTER EXISTING TABLES TO ADD vendor_store_id
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_store_id UUID REFERENCES public.vendor_stores(id) ON DELETE SET NULL;

ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS vendor_store_id UUID REFERENCES public.vendor_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_store_name TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS vendor_store_id UUID REFERENCES public.vendor_stores(id) ON DELETE SET NULL;

ALTER TABLE public.vendor_dispatch_addresses
  ADD COLUMN IF NOT EXISTS vendor_store_id UUID REFERENCES public.vendor_stores(id) ON DELETE SET NULL;

-- Define trigger functions early to bypass validation during migration inserts/updates
CREATE OR REPLACE FUNCTION public.check_vendor_store_insertion()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Bypass validation during system migrations
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins can only insert their own vendor_id
  IF NEW.vendor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Solo podés crear tiendas para tu propia cuenta.';
  END IF;

  -- Non-admins must insert with is_official = false
  IF NEW.is_official <> false THEN
    RAISE EXCEPTION 'Solo los administradores pueden crear tiendas oficiales.';
  END IF;

  -- Non-admins must insert with status = 'draft' or 'pending_review'
  IF NEW.status NOT IN ('draft', 'pending_review') THEN
    RAISE EXCEPTION 'El estado inicial de la tienda debe ser draft o pending_review.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_vendor_store_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Bypass validation during system migrations
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change vendor_id
  IF NEW.vendor_id <> OLD.vendor_id THEN
    RAISE EXCEPTION 'No podés cambiar el vendor_id de la tienda.';
  END IF;

  -- Non-admins cannot change is_official
  IF NEW.is_official <> OLD.is_official THEN
    RAISE EXCEPTION 'Solo los administradores pueden cambiar el estado oficial de la tienda.';
  END IF;

  -- Non-admins cannot set status to 'active' or 'suspended'
  IF NEW.status <> OLD.status AND NEW.status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Solo los administradores pueden activar o suspender tiendas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. MIGRATE DATA (CREATE DEFAULT STORE FOR EACH ACTIVE VENDOR)
-- Create stores for existing vendors
INSERT INTO public.vendor_stores (
    vendor_id,
    store_name,
    slug,
    logo_url,
    banner_url,
    description,
    status,
    is_official,
    official_badge_text,
    contact_email,
    contact_phone,
    social_links,
    seo_title,
    seo_description
)
SELECT
    id,
    store_name,
    slug,
    logo_url,
    banner_url,
    description,
    CASE 
      WHEN status = 'active' THEN 'active'::text 
      WHEN status = 'suspended' THEN 'suspended'::text 
      ELSE 'draft'::text 
    END,
    true, -- Preserve official status for existing main accounts
    'Oficial',
    contact_email,
    contact_phone,
    COALESCE(social_links, '{}'::jsonb),
    store_name || ' | Tienda Oficial',
    COALESCE(description, 'Tienda oficial de ' || store_name)
FROM public.vendors
ON CONFLICT (slug) DO NOTHING;

-- Map existing products to their new primary store
UPDATE public.products p
SET vendor_store_id = (
    SELECT id 
    FROM public.vendor_stores vs 
    WHERE vs.vendor_id = p.vendor_id 
    LIMIT 1
)
WHERE p.vendor_id IS NOT NULL AND p.vendor_store_id IS NULL;

-- Map existing dispatch addresses to their new primary store
UPDATE public.vendor_dispatch_addresses da
SET vendor_store_id = (
    SELECT id 
    FROM public.vendor_stores vs 
    WHERE vs.vendor_id = da.vendor_id 
    LIMIT 1
)
WHERE da.vendor_store_id IS NULL;

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.vendor_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_store_brands ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES FOR vendor_stores
DROP POLICY IF EXISTS "Public can view active stores" ON public.vendor_stores;
CREATE POLICY "Public can view active stores" 
  ON public.vendor_stores 
  FOR SELECT 
  USING (status = 'active');

DROP POLICY IF EXISTS "Vendors can view own stores" ON public.vendor_stores;
CREATE POLICY "Vendors can view own stores" 
  ON public.vendor_stores 
  FOR SELECT 
  USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Vendors can insert own stores" ON public.vendor_stores;
CREATE POLICY "Vendors can insert own stores" 
  ON public.vendor_stores 
  FOR INSERT 
  WITH CHECK (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Vendors can update own stores" ON public.vendor_stores;
CREATE POLICY "Vendors can update own stores" 
  ON public.vendor_stores 
  FOR UPDATE 
  USING (auth.uid() = vendor_id)
  WITH CHECK (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Admins manage all stores" ON public.vendor_stores;
CREATE POLICY "Admins manage all stores" 
  ON public.vendor_stores 
  FOR ALL 
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- 7. RLS POLICIES FOR vendor_store_brands
DROP POLICY IF EXISTS "Public can view approved store brands" ON public.vendor_store_brands;
CREATE POLICY "Public can view approved store brands" 
  ON public.vendor_store_brands 
  FOR SELECT 
  USING (status = 'approved');

DROP POLICY IF EXISTS "Vendors can view own store brands" ON public.vendor_store_brands;
CREATE POLICY "Vendors can view own store brands" 
  ON public.vendor_store_brands 
  FOR SELECT 
  USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Vendors can insert own store brand association" ON public.vendor_store_brands;
CREATE POLICY "Vendors can insert own store brand association" 
  ON public.vendor_store_brands 
  FOR INSERT 
  WITH CHECK (auth.uid() = vendor_id AND status = 'pending_review');

DROP POLICY IF EXISTS "Vendors can delete own store brand association" ON public.vendor_store_brands;
CREATE POLICY "Vendors can delete own store brand association" 
  ON public.vendor_store_brands 
  FOR DELETE 
  USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "Admins manage all store brands" ON public.vendor_store_brands;
CREATE POLICY "Admins manage all store brands" 
  ON public.vendor_store_brands 
  FOR ALL 
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- 8. TRIGGERS FOR DATA VALIDATION AND SECURITY
-- Enforce that a non-admin vendor cannot self-approve or make a store official on insert
CREATE OR REPLACE FUNCTION public.check_vendor_store_insertion()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Bypass validation during system migrations
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins can only insert their own vendor_id
  IF NEW.vendor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Solo podés crear tiendas para tu propia cuenta.';
  END IF;

  -- Non-admins must insert with is_official = false
  IF NEW.is_official <> false THEN
    RAISE EXCEPTION 'Solo los administradores pueden crear tiendas oficiales.';
  END IF;

  -- Non-admins must insert with status = 'draft' or 'pending_review'
  IF NEW.status NOT IN ('draft', 'pending_review') THEN
    RAISE EXCEPTION 'El estado inicial de la tienda debe ser draft o pending_review.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_vendor_store_insertion ON public.vendor_stores;
CREATE TRIGGER tr_check_vendor_store_insertion
  BEFORE INSERT ON public.vendor_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_store_insertion();

-- Enforce that a non-admin vendor cannot modify vendor_id, is_official, or set status to active/suspended on update
CREATE OR REPLACE FUNCTION public.check_vendor_store_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Bypass validation during system migrations
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change vendor_id
  IF NEW.vendor_id <> OLD.vendor_id THEN
    RAISE EXCEPTION 'No podés cambiar el vendor_id de la tienda.';
  END IF;

  -- Non-admins cannot change is_official
  IF NEW.is_official <> OLD.is_official THEN
    RAISE EXCEPTION 'Solo los administradores pueden cambiar el estado oficial de la tienda.';
  END IF;

  -- Non-admins cannot set status to 'active' or 'suspended'
  IF NEW.status <> OLD.status AND NEW.status IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Solo los administradores pueden activar o suspender tiendas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_vendor_store_modification ON public.vendor_stores;
CREATE TRIGGER tr_check_vendor_store_modification
  BEFORE UPDATE ON public.vendor_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_store_modification();

-- Enforce that a non-admin vendor cannot modify approved status of brand associations
CREATE OR REPLACE FUNCTION public.check_vendor_store_brand_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Bypass validation during system migrations
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  
  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot update brand status or approvals
  RAISE EXCEPTION 'Solo los administradores pueden aprobar o modificar asociaciones de marca existentes.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_check_vendor_store_brand_modification ON public.vendor_store_brands;
CREATE TRIGGER tr_check_vendor_store_brand_modification
  BEFORE UPDATE ON public.vendor_store_brands
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_store_brand_modification();

-- Enforce that vendor_store_id assigned to products belongs to the same vendor
CREATE OR REPLACE FUNCTION public.validate_product_store_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_store_vendor_id UUID;
BEGIN
  IF NEW.vendor_store_id IS NOT NULL THEN
    SELECT vendor_id INTO v_store_vendor_id
    FROM public.vendor_stores
    WHERE id = NEW.vendor_store_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La tienda seleccionada no existe.';
    END IF;

    IF v_store_vendor_id <> NEW.vendor_id THEN
      RAISE EXCEPTION 'La tienda seleccionada no pertenece a tu cuenta.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_validate_product_store_assignment ON public.products;
CREATE TRIGGER tr_validate_product_store_assignment
  BEFORE INSERT OR UPDATE OF vendor_store_id, vendor_id ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_store_assignment();

-- 9. UPDATE ADRESESS DEFAULT TRIGGER FOR SINGLE DEFAULT PER STORE AND VENDOR
CREATE OR REPLACE FUNCTION public.handle_vendor_default_dispatch_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    IF NEW.vendor_store_id IS NULL THEN
      UPDATE public.vendor_dispatch_addresses
      SET is_default = false
      WHERE vendor_id = NEW.vendor_id AND vendor_store_id IS NULL AND id <> NEW.id;
    ELSE
      UPDATE public.vendor_dispatch_addresses
      SET is_default = false
      WHERE vendor_id = NEW.vendor_id AND vendor_store_id = NEW.vendor_store_id AND id <> NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. UPDATE get_product_buybox RPC
CREATE OR REPLACE FUNCTION public.get_product_buybox(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_variant RECORD;
BEGIN
    FOR v_variant IN 
        SELECT id, inventory_count, price_adjustment 
        FROM public.product_variants 
        WHERE product_id = p_product_id AND is_active = true
    LOOP
        DECLARE
            v_collectibles_wins BOOLEAN := false;
            v_variant_result JSONB;
        BEGIN
            IF v_variant.inventory_count > 0 THEN
                v_collectibles_wins := true;
            END IF;

            IF v_collectibles_wins THEN
                SELECT jsonb_build_object(
                    'winner', jsonb_build_object(
                        'vendor_id', NULL,
                        'vendor_name', 'Collectibles',
                        'price_adjustment', v_variant.price_adjustment,
                        'stock', v_variant.inventory_count,
                        'is_collectibles', true,
                        'decision_reason', 'Collectibles es el vendedor oficial y tiene stock disponible.'
                    ),
                    'other_options', '[]'::jsonb
                ) INTO v_variant_result;
            ELSE
                WITH vendor_competitors AS (
                    SELECT 
                        vpv.id AS vpv_id,
                        v.id AS vendor_id,
                        COALESCE(
                            (SELECT store_name FROM public.vendor_stores vs WHERE vs.id = p.vendor_store_id),
                            v.store_name
                        ) AS vendor_name,
                        vp.price + vpv.price_adjustment AS total_price,
                        vpv.inventory_count AS stock,
                        (SELECT count(*) > 0 FROM public.vendor_shipping_connections vsc 
                         WHERE vsc.vendor_id = v.id AND vsc.connection_status = 'connected' AND vsc.provider IN ('dac', 'soydelivery', 'ues', 'mirtrans', 'pedidosya')
                        ) AS has_logistics
                    FROM public.vendor_product_variants vpv
                    JOIN public.product_variants pv ON pv.id = vpv.variant_id
                    JOIN public.products p ON p.id = pv.product_id
                    JOIN public.vendor_products vp ON vp.id = vpv.vendor_product_id
                    JOIN public.vendors v ON v.id = vp.vendor_id
                    WHERE vpv.variant_id = v_variant.id
                      AND vp.status = 'active'
                      AND v.status = 'active'
                      AND v.kyc_status = 'approved'
                      AND vpv.inventory_count > 0
                ),
                scored_competitors AS (
                    SELECT 
                        *,
                        MIN(total_price) OVER () AS min_price,
                        MAX(total_price) OVER () AS max_price,
                        MAX(stock) OVER () AS max_stock
                    FROM vendor_competitors
                ),
                final_scored AS (
                    SELECT 
                        *,
                        (CASE WHEN max_price = min_price THEN 60.0 
                         ELSE 60.0 * (1.0 - ((total_price - min_price) / (max_price - min_price))) END) AS price_score,
                        
                        (CASE WHEN max_stock = 0 THEN 0.0
                         ELSE 25.0 * (stock::numeric / max_stock::numeric) END) AS stock_score,
                         
                        (CASE WHEN has_logistics THEN 15.0 ELSE 0.0 END) AS logistics_score
                    FROM scored_competitors
                ),
                ranked AS (
                    SELECT 
                        *,
                        (price_score + stock_score + logistics_score) AS final_score
                    FROM final_scored
                    ORDER BY (price_score + stock_score + logistics_score) DESC, total_price ASC
                )
                SELECT jsonb_build_object(
                    'winner', (
                        SELECT jsonb_build_object(
                            'vpv_id', vpv_id,
                            'vendor_id', vendor_id,
                            'vendor_name', vendor_name,
                            'price', total_price,
                            'stock', stock,
                            'has_logistics', has_logistics,
                            'final_score', final_score,
                            'is_collectibles', false,
                            'decision_reason', 'Ganador por puntuación: Precio competitivo y stock disponible.'
                        )
                        FROM ranked LIMIT 1
                    ),
                    'other_options', (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'vpv_id', vpv_id,
                                'vendor_id', vendor_id,
                                'vendor_name', vendor_name,
                                'price', total_price,
                                'stock', stock,
                                'has_logistics', has_logistics,
                                'final_score', final_score
                            )
                        ), '[]'::jsonb)
                        FROM ranked OFFSET 1
                    )
                ) INTO v_variant_result;

                IF v_variant_result IS NULL OR v_variant_result->>'winner' IS NULL THEN
                    v_variant_result := jsonb_build_object(
                        'winner', NULL,
                        'other_options', '[]'::jsonb
                    );
                END IF;
            END IF;

            v_result := jsonb_set(v_result, ARRAY[v_variant.id::text], v_variant_result);
        END;
    END LOOP;

    RETURN v_result;
END;
$$;

-- 11. UPDATE create_order_atomic TO STORE vendor_store_id AND vendor_store_name
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid,numeric,text,text,text,text,jsonb,uuid,uuid,jsonb,jsonb,boolean,timestamp with time zone,text,boolean,boolean);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_shipping_address JSONB,
  p_affiliate_id UUID,
  p_coupon_id UUID,
  p_items JSONB,
  p_suborders JSONB,
  p_terms_accepted BOOLEAN DEFAULT false,
  p_terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_accepted_terms_version TEXT DEFAULT NULL,
  p_email_opt_in BOOLEAN DEFAULT false,
  p_whatsapp_opt_in BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_suborder JSONB;
  v_suborder_idx INTEGER := 0;
  v_suborder_id UUID;
  v_variant_stock INTEGER;
  v_shipping_provider TEXT := NULL;
  
  -- Financial consolidations
  v_subtotal_products NUMERIC := 0;
  v_total_shipping NUMERIC := 0;
  v_total_discounts NUMERIC := 0;
  
  v_cust_first_name TEXT;
  v_cust_last_name TEXT;
  v_customer_name TEXT;
BEGIN
  -- Verify stock for all items FIRST (within the transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid
      FOR UPDATE; -- Row-level lock to prevent race conditions

      IF v_variant_stock IS NULL THEN
        RAISE EXCEPTION 'Variante % no encontrada', v_item->>'variant_id';
      END IF;

      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para variante %. Disponible: %, Solicitado: %',
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- Consolidate financial details from suborders
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
    v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
    v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
  END LOOP;

  -- Customer name extraction
  v_cust_first_name := COALESCE(p_shipping_address->>'first_name', '');
  v_cust_last_name := COALESCE(p_shipping_address->>'last_name', '');
  v_customer_name := TRIM(v_cust_first_name || ' ' || v_cust_last_name);

  -- Determine logistics provider from shipping address details
  IF p_shipping_address->>'shipping_method' = 'delivery' OR 
     p_shipping_address->>'shipping_method' = 'dac' OR
     p_shipping_address->>'shipping_method' = 'dac_home' OR
     p_shipping_address->>'shipping_method' = 'dac_agency' THEN
    IF p_shipping_address->>'department' = 'Montevideo' THEN
      v_shipping_provider := 'SoyDelivery';
    ELSE
      v_shipping_provider := 'DAC';
    END IF;
  END IF;

  -- Create order number using sequence
  v_order_number := 'ORDER-' || nextval('public.order_number_seq');

  -- Create the main order record
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_data, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'pending', 'pending_payment',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts
  )
  RETURNING id INTO v_order_id;

  -- Create the suborders and linked items
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    DECLARE
      v_suborder_number TEXT;
      v_vendor_id UUID;
      v_vendor_store_id UUID;
      v_vendor_store_name TEXT;
      v_is_collectibles BOOLEAN;
      v_suborder_id UUID;
    BEGIN
      v_suborder_number := v_order_number || '-' || chr(65 + v_suborder_idx);
      v_suborder_idx := v_suborder_idx + 1;
      
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
      v_vendor_store_name := v_suborder->>'vendor_store_name';
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, vendor_store_id, vendor_store_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, payment_fee_share, vendor_gross_amount,
        vendor_net_amount, liquidation_status, status
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_vendor_store_id, v_vendor_store_name, v_is_collectibles,
        (v_suborder->>'product_subtotal')::numeric, v_suborder->>'shipping_method', 
        v_suborder->>'shipping_provider', (v_suborder->>'shipping_cost')::numeric, 'pending',
        (v_suborder->>'marketplace_commission_rate')::numeric, (v_suborder->>'marketplace_fee')::numeric,
        0.00,
        (v_suborder->>'vendor_gross_amount')::numeric, (v_suborder->>'vendor_net_amount')::numeric,
        'pending', 'pending'
      )
      RETURNING id INTO v_suborder_id;

      -- Insert items belonging to this suborder
      INSERT INTO public.order_items (
        order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
        quantity, unit_price, total_price, product_name, sku, discount_total, final_total
      )
      SELECT
        v_order_id,
        v_suborder_id,
        (item->>'product_id')::uuid,
        NULLIF(item->>'variant_id', '')::uuid,
        v_vendor_id,
        NULLIF(item->>'vendor_store_id', '')::uuid,
        (item->>'quantity')::integer,
        (item->>'unit_price')::numeric,
        (item->>'unit_price')::numeric * (item->>'quantity')::integer,
        item->>'product_name',
        item->>'sku',
        COALESCE((item->>'discount_total')::numeric, 0.00),
        COALESCE((item->>'final_total')::numeric, (item->>'unit_price')::numeric)
      FROM jsonb_array_elements(p_items) AS item
      WHERE 
        (v_vendor_store_id IS NOT NULL AND (item->>'vendor_store_id')::uuid = v_vendor_store_id) OR
        (v_vendor_store_id IS NULL AND 
          (v_vendor_id IS NOT NULL AND (item->>'vendor_id')::uuid = v_vendor_id AND (item->>'vendor_store_id' IS NULL OR item->>'vendor_store_id' = ''))
        ) OR
        (v_vendor_store_id IS NULL AND v_vendor_id IS NULL AND 
          (item->>'vendor_id' IS NULL OR item->>'vendor_id' = '') AND 
          (item->>'vendor_store_id' IS NULL OR item->>'vendor_store_id' = '')
        );
    END;
  END LOOP;

  -- Mark abandoned checkout as converted if exists
  UPDATE public.abandoned_checkouts
  SET status = 'converted', updated_at = now()
  WHERE email = p_customer_email AND status = 'abandoned';

  -- Upsert customer consents
  INSERT INTO public.customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in)
  ON CONFLICT (email) DO UPDATE SET
    phone = EXCLUDED.phone,
    email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
    whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
    updated_at = now();

  -- Return details
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items),
    'suborders_count', v_suborder_idx
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
