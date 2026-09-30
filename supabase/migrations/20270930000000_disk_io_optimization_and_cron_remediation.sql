-- ==============================================================================
-- MIGRATION: Disk I/O Optimization & Cron Remediation Suite
-- Applied: 2027-09-30
-- Description:
--   1. Ensures orders.updated_at exists and hardens release_expired_reservations()
--   2. Provides server-side aggregation RPCs for Admin Dashboard & Admin Reports
--   3. Enables pg_trgm and creates GIN Trigram indexes on product titles
--   4. Creates high-impact strategic B-Tree indexes (Radar, wave_name, slug redirects)
--   5. Creates safe maintenance cleanup function for operational caches
-- ==============================================================================

-- 1. Ensure orders.updated_at exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Ultra-Fast & Idempotent release_expired_reservations()
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS VOID AS $$
DECLARE
  v_expired_count INT;
BEGIN
  -- Quick check if there are any expired active reservations to avoid unnecessary table updates
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

-- 3. Server-side Aggregations RPC for Admin Dashboard
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_total_revenue NUMERIC(12,2) := 0;
  v_active_orders INT := 0;
  v_total_products INT := 0;
  v_total_customers INT := 0;
  v_low_stock_count INT := 0;
  v_pending_orders INT := 0;
  v_collectibles_pending INT := 0;
  v_mkt_pending_orders INT := 0;
  v_mkt_pending_vendors INT := 0;
BEGIN
  -- Verify admin authorization
  SELECT (is_admin = true OR role IN ('admin', 'super_admin', 'superadmin', 'god_admin')) INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar métricas.';
  END IF;

  -- 1. Total products count
  SELECT count(*) INTO v_total_products FROM public.products WHERE is_active = true;

  -- 2. Total customers count
  SELECT count(*) INTO v_total_customers FROM public.profiles WHERE COALESCE(is_admin, false) = false;

  -- 3. Orders stats (last 12 months for active revenue and pending)
  SELECT 
    COALESCE(SUM(CASE WHEN status IN ('paid', 'shipped', 'delivered') THEN total_amount ELSE 0 END), 0),
    COUNT(*),
    COUNT(CASE WHEN status = 'pending' THEN 1 END)
  INTO v_total_revenue, v_active_orders, v_pending_orders
  FROM public.orders
  WHERE created_at >= now() - interval '1 year';

  -- 4. Low stock count
  SELECT count(*) INTO v_low_stock_count
  FROM public.product_variants
  WHERE inventory_count < 5;

  -- 5. Suborders pending stats
  SELECT 
    COUNT(CASE WHEN (vendor_name IS NULL OR vendor_name ILIKE '%collectibles%') THEN 1 END),
    COUNT(CASE WHEN (vendor_name IS NOT NULL AND vendor_name NOT ILIKE '%collectibles%') THEN 1 END),
    COUNT(DISTINCT CASE WHEN (vendor_name IS NOT NULL AND vendor_name NOT ILIKE '%collectibles%') THEN vendor_name END)
  INTO v_collectibles_pending, v_mkt_pending_orders, v_mkt_pending_vendors
  FROM public.order_suborders os
  JOIN public.orders o ON os.parent_order_id = o.id
  WHERE (o.payment_status = 'approved' OR o.status = 'paid')
    AND (os.status IS NULL OR os.status IN ('pending', 'pendiente', 'preparando'))
    AND os.created_at >= now() - interval '6 months';

  RETURN jsonb_build_object(
    'totalRevenue', v_total_revenue,
    'activeOrders', v_active_orders,
    'totalProducts', v_total_products,
    'totalCustomers', v_total_customers,
    'lowStockCount', v_low_stock_count,
    'pendingOrders', v_pending_orders,
    'collectiblesPending', v_collectibles_pending,
    'mktPendingOrders', v_mkt_pending_orders,
    'mktPendingVendors', v_mkt_pending_vendors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;

-- 4. Server-side Aggregations RPC for Admin Reports
CREATE OR REPLACE FUNCTION public.get_admin_reports_metrics()
RETURNS JSONB AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_total_revenue NUMERIC(12,2) := 0;
  v_order_count INT := 0;
  v_paid_orders INT := 0;
  v_pending_orders INT := 0;
  v_cancelled_orders INT := 0;
  v_monthly_data JSONB := '[]'::jsonb;
BEGIN
  -- Verify admin authorization
  SELECT (is_admin = true OR role IN ('admin', 'super_admin', 'superadmin', 'god_admin')) INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar reportes.';
  END IF;

  -- 1. Aggregated totals across all orders
  SELECT 
    COALESCE(SUM(CASE WHEN status IN ('paid', 'shipped', 'delivered') THEN total_amount ELSE 0 END), 0),
    COUNT(*),
    COUNT(CASE WHEN status IN ('paid', 'shipped', 'delivered') THEN 1 END),
    COUNT(CASE WHEN status = 'pending' THEN 1 END),
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END)
  INTO v_total_revenue, v_order_count, v_paid_orders, v_pending_orders, v_cancelled_orders
  FROM public.orders;

  -- 2. Monthly revenue and orders for last 6 months
  SELECT jsonb_agg(
    jsonb_build_object(
      'month', m.month_label,
      'revenue', COALESCE(m.revenue, 0),
      'orders', COALESCE(m.orders, 0)
    )
  ) INTO v_monthly_data
  FROM (
    SELECT 
      to_char(date_trunc('month', created_at), 'Mon YYYY') as month_label,
      date_trunc('month', created_at) as m_date,
      SUM(CASE WHEN status IN ('paid', 'shipped', 'delivered') THEN total_amount ELSE 0 END) as revenue,
      COUNT(*) as orders
    FROM public.orders
    WHERE created_at >= now() - interval '6 months'
    GROUP BY date_trunc('month', created_at), to_char(date_trunc('month', created_at), 'Mon YYYY')
    ORDER BY m_date ASC
  ) m;

  RETURN jsonb_build_object(
    'totalRevenue', v_total_revenue,
    'orderCount', v_order_count,
    'paidOrders', v_paid_orders,
    'pendingOrders', v_pending_orders,
    'cancelledOrders', v_cancelled_orders,
    'avgTicket', CASE WHEN v_paid_orders > 0 THEN round(v_total_revenue / v_paid_orders) ELSE 0 END,
    'monthlyData', COALESCE(v_monthly_data, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_reports_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_reports_metrics() TO authenticated;

-- 5. Extension pg_trgm and GIN Trigram Indexes for Fast Product Searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_title_trgm 
ON public.products USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_intl_products_title_trgm 
ON public.international_products USING gin (title gin_trgm_ops);

-- 6. Missing High-Impact Strategic B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_release_events_created_at_desc 
ON public.release_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_events_brand_id 
ON public.release_events (brand_id) WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_release_events_license_id 
ON public.release_events (license_id) WHERE license_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_release_events_category_id 
ON public.release_events (category_id) WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_release_events_published_status 
ON public.release_events (is_published, status);

CREATE INDEX IF NOT EXISTS idx_products_wave_name 
ON public.products (wave_name) WHERE wave_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_slug_redirects_old_slug 
ON public.product_slug_redirects (old_slug);

-- 7. Operational Data Retention Function
CREATE OR REPLACE FUNCTION public.cleanup_expired_operational_data()
RETURNS VOID AS $$
BEGIN
  -- 1. Purge expired sourcing market cache older than 2 days
  DELETE FROM public.sourcing_market_cache 
  WHERE expires_at < now() - interval '2 days';

  -- 2. Purge international product sync logs older than 30 days
  DELETE FROM public.international_product_sync_logs 
  WHERE created_at < now() - interval '30 days';

  -- 3. Purge completed/archived ML sync queue older than 7 days
  DELETE FROM public.ml_sync_queue 
  WHERE status IN ('completed', 'synced') 
    AND created_at < now() - interval '7 days';

  -- 4. Purge released stock reservations older than 30 days
  DELETE FROM public.stock_reservations 
  WHERE status = 'released' 
    AND created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_operational_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_operational_data() TO service_role;
