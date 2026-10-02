-- ==============================================================================
-- MIGRATION: Comprehensive Disk I/O, Audit Log Delta & Performance Suite
-- Applied: 2026-10-02 (Timestamp: 20271002000000)
-- Description:
--   1. Ensures orders.updated_at exists and hardens release_expired_reservations()
--   2. Suppresses redundant row updates on products and product_variants (returns NULL)
--   3. Hardens log_audit_trigger() to record ONLY changed field deltas (eliminates full-row TOAST bloat)
--   4. Optimizes get_product_buybox() by selecting specific columns and hoisting store resolution
--   5. Cleans duplicate indexes and adds strategic B-Tree and GIN Trigram indexes
--   6. Provides safe batch retention functions for operational tables
-- ==============================================================================

-- 1. Ensure orders.updated_at exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Clean Duplicate Indexes Safely
DROP INDEX IF EXISTS public.idx_images_product;
DROP INDEX IF EXISTS public.idx_variants_product;
DROP INDEX IF EXISTS public.idx_products_brand;
DROP INDEX IF EXISTS public.idx_products_category;
DROP INDEX IF EXISTS public.idx_products_vendor;

-- 3. Create Missing High-Traffic Strategic Indexes
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status_reserved 
ON public.stock_reservations (status, reserved_until);

CREATE INDEX IF NOT EXISTS idx_vpv_variant_id 
ON public.vendor_product_variants (variant_id);

CREATE INDEX IF NOT EXISTS idx_vendor_products_vendor_status 
ON public.vendor_products (vendor_id, status);

CREATE INDEX IF NOT EXISTS idx_vendor_stores_vendor_status 
ON public.vendor_stores (vendor_id, status);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_intl_products_title_trgm 
ON public.international_products USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_active_published 
ON public.products (status, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_slug_redirects_old_slug 
ON public.product_slug_redirects (old_slug);

-- 4. Redundant Row Update Suppression Function and Triggers
CREATE OR REPLACE FUNCTION public.suppress_redundant_row_update()
RETURNS TRIGGER AS $$
DECLARE
  v_old_clean JSONB;
  v_new_clean JSONB;
BEGIN
  -- Strip updated_at and search_vector
  v_old_clean := to_jsonb(OLD) - 'updated_at' - 'search_vector';
  v_new_clean := to_jsonb(NEW) - 'updated_at' - 'search_vector';

  -- If identical, returning NULL completely cancels heap write, index update, WAL & downstream triggers
  IF v_old_clean = v_new_clean THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_suppress_redundant_product_updates ON public.products;
CREATE TRIGGER trg_suppress_redundant_product_updates
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.suppress_redundant_row_update();

DROP TRIGGER IF EXISTS trg_suppress_redundant_variant_updates ON public.product_variants;
CREATE TRIGGER trg_suppress_redundant_variant_updates
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.suppress_redundant_row_update();

-- 5. Hardened, Low-Overhead log_audit_trigger()
CREATE OR REPLACE FUNCTION public.log_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  rec_id TEXT;
  v_old_json JSONB;
  v_new_json JSONB;
  v_diff_old JSONB := '{}'::jsonb;
  v_diff_new JSONB := '{}'::jsonb;
  k TEXT;
  v_old_val JSONB;
  v_new_val JSONB;
BEGIN
  -- Determine record identifier safely
  BEGIN
    IF TG_OP = 'DELETE' THEN 
      rec_id := OLD.id::text; 
    ELSE 
      rec_id := NEW.id::text; 
    END IF;
  EXCEPTION WHEN undefined_column THEN
    IF TG_TABLE_NAME = 'site_settings' THEN 
      IF TG_OP = 'DELETE' THEN rec_id := OLD.key; ELSE rec_id := NEW.key; END IF; 
    ELSE 
      rec_id := 'unknown'; 
    END IF;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(OLD) - 'search_vector';
    INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, v_old_json);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    v_new_json := to_jsonb(NEW) - 'search_vector';
    INSERT INTO public.audit_logs(user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, v_new_json);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD) - 'search_vector' - 'updated_at';
    v_new_json := to_jsonb(NEW) - 'search_vector' - 'updated_at';

    -- If no difference in business columns, do not log anything
    IF v_old_json = v_new_json THEN
      RETURN NEW;
    END IF;

    -- Compute field-level delta
    FOR k IN SELECT jsonb_object_keys(v_new_json)
    LOOP
      v_old_val := v_old_json -> k;
      v_new_val := v_new_json -> k;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_diff_old := v_diff_old || jsonb_build_object(k, v_old_val);
        v_diff_new := v_diff_new || jsonb_build_object(k, v_new_val);
      END IF;
    END LOOP;

    -- Include keys dropped if any
    FOR k IN SELECT jsonb_object_keys(v_old_json)
    LOOP
      IF NOT (v_new_json ? k) THEN
        v_diff_old := v_diff_old || jsonb_build_object(k, v_old_json -> k);
        v_diff_new := v_diff_new || jsonb_build_object(k, null);
      END IF;
    END LOOP;

    IF v_diff_old <> '{}'::jsonb OR v_diff_new <> '{}'::jsonb THEN
      INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_data, new_data)
      VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, rec_id, v_diff_old, v_diff_new);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Ultra-Fast & Idempotent release_expired_reservations()
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS VOID AS $$
DECLARE
  v_expired_count INT;
BEGIN
  -- Quick check if there are any expired active reservations to avoid unnecessary table locks
  SELECT count(*) INTO v_expired_count
  FROM public.stock_reservations
  WHERE status = 'active' AND reserved_until < now();

  IF v_expired_count = 0 THEN
    RETURN;
  END IF;

  -- 1. Release active expired stock reservations
  WITH expired_reservations AS (
    SELECT DISTINCT order_id
    FROM public.stock_reservations
    WHERE status = 'active' AND reserved_until < now()
  ),
  updated_res AS (
    UPDATE public.stock_reservations
    SET status = 'released',
        updated_at = now()
    WHERE status = 'active' AND reserved_until < now()
    RETURNING order_id
  )
  -- 2. Expire orders awaiting payment that have expired reservations
  UPDATE public.orders o
  SET status = 'expired',
      payment_status = 'expired',
      updated_at = now()
  FROM expired_reservations er
  WHERE o.id = er.order_id 
    AND o.status = 'awaiting_payment'
    AND COALESCE(o.payment_status, '') <> 'approved';

  -- 3. Expire corresponding preorder items
  UPDATE public.preorder_items pi
  SET status = 'expired',
      updated_at = now()
  FROM public.order_items oi,
       public.stock_reservations sr
  WHERE pi.order_item_id = oi.id
    AND oi.order_id = sr.order_id
    AND sr.status = 'released'
    AND sr.updated_at >= now() - interval '2 minutes'
    AND pi.status IN ('awaiting_payment', 'pending');

  -- 4. Expire corresponding pending suborders
  UPDATE public.order_suborders os
  SET status = 'expired',
      updated_at = now()
  FROM public.stock_reservations sr
  WHERE os.parent_order_id = sr.order_id
    AND sr.status = 'released'
    AND sr.updated_at >= now() - interval '2 minutes'
    AND os.status = 'pending';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- 7. Optimized get_product_buybox()
CREATE OR REPLACE FUNCTION public.get_product_buybox(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_variant RECORD;
    v_product RECORD;
    v_base_store RECORD;
    v_has_base_store BOOLEAN := false;
    v_first_variant_id TEXT := NULL;
    v_first_winner JSONB := NULL;
    v_first_other_options JSONB := '[]'::jsonb;
    v_has_variants BOOLEAN := false;
BEGIN
    -- Fetch ONLY needed product columns
    SELECT id, vendor_id, vendor_store_id, base_price, metadata 
    INTO v_product 
    FROM public.products 
    WHERE id = p_product_id;

    IF NOT FOUND THEN
        RETURN '{}'::jsonb;
    END IF;

    -- If product belongs to a vendor, resolve vendor store info ONCE outside variant loop
    IF v_product.vendor_id IS NOT NULL THEN
        SELECT 
            vs.id, 
            COALESCE(vs.store_name, v.company_name, v.store_name, 'Vendedor') AS store_name,
            vs.slug, 
            vs.logo_url,
            v.status AS vendor_status,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'badge_key', b.badge_key, 'label', b.label, 'color_class', b.color_class, 'description', b.description))
               FROM public.vendor_store_badge_assignments ba
               JOIN public.vendor_store_badges b ON b.id = ba.badge_id
               WHERE ba.vendor_store_id = vs.id AND ba.status = 'active' AND ba.approved_by IS NOT NULL),
              '[]'::jsonb
            ) AS vendor_store_badges
        INTO v_base_store
        FROM public.vendors v
        LEFT JOIN public.vendor_stores vs ON (vs.id = v_product.vendor_store_id OR (v_product.vendor_store_id IS NULL AND vs.vendor_id = v.id))
        WHERE v.id = v_product.vendor_id
        ORDER BY vs.created_at ASC
        LIMIT 1;

        v_has_base_store := (v_base_store.vendor_status = 'active');
    END IF;

    FOR v_variant IN 
        SELECT id, inventory_count, price_adjustment 
        FROM public.product_variants 
        WHERE product_id = p_product_id AND is_active = true
        ORDER BY created_at ASC
    LOOP
        v_has_variants := true;
        DECLARE
            v_variant_result JSONB := NULL;
        BEGIN
            -- CASE 1: Primary inventory has stock
            IF COALESCE(v_variant.inventory_count, 0) > 0 THEN
                IF v_product.vendor_id IS NULL THEN
                    -- Collectibles is official owner and has stock
                    SELECT jsonb_build_object(
                        'winner', jsonb_build_object(
                            'vendor_id', NULL,
                            'vendor_name', 'Collectibles',
                            'vendor_store_id', NULL,
                            'vendor_store_slug', NULL,
                            'vendor_store_logo', NULL,
                            'vendor_store_badges', '[]'::jsonb,
                            'price', (COALESCE(v_product.base_price, 0) + COALESCE(v_variant.price_adjustment, 0)),
                            'price_adjustment', v_variant.price_adjustment,
                            'stock', v_variant.inventory_count,
                            'is_collectibles', true,
                            'decision_reason', 'Collectibles es el vendedor oficial y tiene stock disponible.'
                        ),
                        'other_options', '[]'::jsonb
                    ) INTO v_variant_result;
                ELSIF v_has_base_store THEN
                    -- Owning vendor is active and wins
                    SELECT jsonb_build_object(
                        'winner', jsonb_build_object(
                            'vendor_id', v_product.vendor_id,
                            'vendor_name', COALESCE(v_base_store.store_name, 'Vendedor'),
                            'vendor_store_id', v_base_store.id,
                            'vendor_store_slug', v_base_store.slug,
                            'vendor_store_logo', v_base_store.logo_url,
                            'vendor_store_badges', COALESCE(v_base_store.vendor_store_badges, '[]'::jsonb),
                            'price', (COALESCE(v_product.base_price, 0) + COALESCE(v_variant.price_adjustment, 0)),
                            'price_adjustment', v_variant.price_adjustment,
                            'stock', v_variant.inventory_count,
                            'is_collectibles', false,
                            'decision_reason', 'Vendedor propietario del producto con stock disponible.'
                        ),
                        'other_options', '[]'::jsonb
                    ) INTO v_variant_result;
                ELSE
                    v_variant_result := NULL;
                END IF;
            END IF;

            -- CASE 2: No winner yet -> Evaluate competing vendor listings
            IF v_variant_result IS NULL OR v_variant_result->>'winner' IS NULL THEN
                WITH vendor_competitors AS (
                    SELECT 
                        vpv.id AS vpv_id,
                        v.id AS vendor_id,
                        vs.id AS vendor_store_id,
                        COALESCE(vs.store_name, v.company_name, v.store_name, 'Vendedor') AS vendor_name,
                        vs.slug AS vendor_store_slug,
                        vs.logo_url AS vendor_store_logo,
                        COALESCE(
                          (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'badge_key', b.badge_key, 'label', b.label, 'color_class', b.color_class, 'description', b.description))
                           FROM public.vendor_store_badge_assignments ba
                           JOIN public.vendor_store_badges b ON b.id = ba.badge_id
                           WHERE ba.vendor_store_id = vs.id AND ba.status = 'active' AND ba.approved_by IS NOT NULL),
                          '[]'::jsonb
                        ) AS vendor_store_badges,
                        (vp.price + COALESCE(vpv.price_adjustment, 0)) AS total_price,
                        vpv.inventory_count AS stock
                    FROM public.vendor_product_variants vpv
                    JOIN public.vendor_products vp ON vp.id = vpv.vendor_product_id
                    JOIN public.vendors v ON v.id = vp.vendor_id
                    LEFT JOIN public.vendor_stores vs ON vs.vendor_id = v.id AND vs.status = 'active'
                    WHERE vpv.variant_id = v_variant.id 
                      AND vp.status = 'active'
                      AND v.status = 'active'
                      AND COALESCE(vpv.inventory_count, 0) > 0
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
                        (CASE WHEN max_price = min_price THEN 70.0 
                         ELSE 70.0 * (1.0 - ((total_price - min_price) / NULLIF(max_price - min_price, 0))) END) AS price_score,
                        
                        (CASE WHEN max_stock = 0 THEN 0.0
                         ELSE 30.0 * (stock::numeric / NULLIF(max_stock::numeric, 0)) END) AS stock_score
                    FROM scored_competitors
                ),
                ranked AS (
                    SELECT 
                        *,
                        (COALESCE(price_score, 0) + COALESCE(stock_score, 0)) AS final_score
                    FROM final_scored
                    ORDER BY (COALESCE(price_score, 0) + COALESCE(stock_score, 0)) DESC, total_price ASC, stock DESC
                )
                SELECT jsonb_build_object(
                    'winner', (
                        SELECT jsonb_build_object(
                            'vpv_id', vpv_id,
                            'vendor_id', vendor_id,
                            'vendor_name', vendor_name,
                            'vendor_store_id', vendor_store_id,
                            'vendor_store_slug', vendor_store_slug,
                            'vendor_store_logo', vendor_store_logo,
                            'vendor_store_badges', vendor_store_badges,
                            'price', total_price,
                            'stock', stock,
                            'has_logistics', false,
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
                                'vendor_store_id', vendor_store_id,
                                'vendor_store_slug', vendor_store_slug,
                                'vendor_store_logo', vendor_store_logo,
                                'vendor_store_badges', vendor_store_badges,
                                'price', total_price,
                                'stock', stock,
                                'has_logistics', false,
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

            IF v_first_variant_id IS NULL THEN
                v_first_variant_id := v_variant.id::text;
                v_first_winner := v_variant_result->'winner';
                v_first_other_options := v_variant_result->'other_options';
            END IF;

            v_result := jsonb_set(v_result, ARRAY[v_variant.id::text], v_variant_result);
        END;
    END LOOP;

    -- Handle products without active variants (fallback to metadata stock if available)
    IF NOT v_has_variants THEN
        DECLARE
            v_meta_initial NUMERIC := NULLIF(v_product.metadata->>'initial_quantity', '')::numeric;
            v_meta_sold NUMERIC := COALESCE(NULLIF(v_product.metadata->>'sold_quantity', '')::numeric, 0);
            v_meta_stock NUMERIC := CASE WHEN v_meta_initial IS NOT NULL THEN GREATEST(0, v_meta_initial - v_meta_sold) ELSE NULL END;
        BEGIN
            IF v_meta_stock IS NOT NULL AND v_meta_stock > 0 THEN
                v_result := jsonb_build_object(
                    'winner', jsonb_build_object(
                        'vendor_id', NULL,
                        'vendor_name', 'Collectibles',
                        'vendor_store_id', NULL,
                        'vendor_store_slug', NULL,
                        'vendor_store_logo', NULL,
                        'vendor_store_badges', '[]'::jsonb,
                        'price', COALESCE(v_product.base_price, 0),
                        'price_adjustment', 0,
                        'stock', v_meta_stock,
                        'is_collectibles', true,
                        'decision_reason', 'Collectibles es el vendedor oficial y tiene stock en metadata disponible.'
                    ),
                    'other_options', '[]'::jsonb
                );
            ELSE
                v_result := jsonb_build_object(
                    'winner', NULL,
                    'other_options', '[]'::jsonb
                );
            END IF;
            RETURN v_result;
        END;
    END IF;

    IF v_first_variant_id IS NOT NULL THEN
        v_result := jsonb_set(v_result, ARRAY['winner'], COALESCE(v_first_winner, 'null'::jsonb));
        v_result := jsonb_set(v_result, ARRAY['other_options'], COALESCE(v_first_other_options, '[]'::jsonb));
    END IF;

    RETURN v_result;
END;
$function$;

-- 8. Safe Batch Retention Functions
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_days integer DEFAULT 90, p_batch_size integer DEFAULT 500)
RETURNS integer AS $$
DECLARE
  v_deleted integer := 0;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - (p_days || ' days')::interval;

  WITH to_delete AS (
    SELECT id
    FROM public.audit_logs
    WHERE created_at < v_cutoff
    LIMIT p_batch_size
  )
  DELETE FROM public.audit_logs
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer, integer) TO service_role;
