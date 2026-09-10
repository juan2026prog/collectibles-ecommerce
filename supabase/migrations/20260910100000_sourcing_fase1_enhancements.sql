-- ==============================================================================
-- MIGRATION: SOURCING INTELLIGENCE FASE 1 — ENHANCEMENTS
-- Extends existing sourcing tables WITHOUT breaking existing data.
-- Adds: normalized condition, seller reliability, freshness, delivery range,
--       offer history table, retailer capabilities table.
-- ==============================================================================

-- =============================================================
-- 1. Extend sourcing_normalized_products
-- =============================================================

ALTER TABLE public.sourcing_normalized_products
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS gtin text,
  ADD COLUMN IF NOT EXISTS best_buy_sku text,
  ADD COLUMN IF NOT EXISTS ebay_item_id text,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS match_confidence numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freshness_status text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS best_source text,
  ADD COLUMN IF NOT EXISTS best_source_reason text,
  ADD COLUMN IF NOT EXISTS data_status_amazon text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_status_ebay text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_status_bestbuy text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

COMMENT ON COLUMN public.sourcing_normalized_products.manufacturer IS 'Fabricante del producto (puede diferir de brand)';
COMMENT ON COLUMN public.sourcing_normalized_products.match_reason IS 'Razón de canonicalización: UPC_EXACT_MATCH, MPN_MATCH, BRAND_LINE_MATCH, TITLE_NORMALIZED, etc.';
COMMENT ON COLUMN public.sourcing_normalized_products.match_confidence IS 'Confianza del match canónico: 0.00 (ninguna) a 1.00 (certeza absoluta)';
COMMENT ON COLUMN public.sourcing_normalized_products.freshness_status IS 'LIVE | FRESH | STALE | UNKNOWN';
COMMENT ON COLUMN public.sourcing_normalized_products.best_source IS 'Fuente seleccionada actualmente: amazon | ebay | bestbuy';
COMMENT ON COLUMN public.sourcing_normalized_products.best_source_reason IS 'Razón textual de selección de mejor fuente';

-- Índices nuevos
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_gtin ON public.sourcing_normalized_products(gtin);
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_bbsku ON public.sourcing_normalized_products(best_buy_sku);
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_ebay_id ON public.sourcing_normalized_products(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_norm_freshness ON public.sourcing_normalized_products(freshness_status);

-- =============================================================
-- 2. Extend sourcing_source_offers
-- =============================================================

ALTER TABLE public.sourcing_source_offers
  ADD COLUMN IF NOT EXISTS condition_normalized text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS seller_rating numeric(5,2),
  ADD COLUMN IF NOT EXISTS seller_reviews int,
  ADD COLUMN IF NOT EXISTS seller_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfilled_by_retailer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sold_by_retailer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS freshness_status text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS availability_normalized text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS delivery_min date,
  ADD COLUMN IF NOT EXISTS delivery_max date,
  ADD COLUMN IF NOT EXISTS delivery_source text,
  ADD COLUMN IF NOT EXISTS estimated_weight_lbs numeric(8,3),
  ADD COLUMN IF NOT EXISTS weight_status text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS usa_shipping_usd numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authenticity_status text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'RESEARCH_DATA';

COMMENT ON COLUMN public.sourcing_source_offers.condition_normalized IS 'NEW | USED | OPEN_BOX | REFURBISHED | UNKNOWN';
COMMENT ON COLUMN public.sourcing_source_offers.availability_normalized IS 'IN_STOCK | LOW_STOCK | OUT_OF_STOCK | PREORDER | BACKORDER | UNKNOWN';
COMMENT ON COLUMN public.sourcing_source_offers.freshness_status IS 'LIVE | FRESH | STALE | UNKNOWN';
COMMENT ON COLUMN public.sourcing_source_offers.delivery_min IS 'Fecha mínima de entrega estimada a destino USA (Miami)';
COMMENT ON COLUMN public.sourcing_source_offers.delivery_max IS 'Fecha máxima de entrega estimada a destino USA (Miami)';
COMMENT ON COLUMN public.sourcing_source_offers.weight_status IS 'KNOWN | UNKNOWN — nunca inventar pesos';
COMMENT ON COLUMN public.sourcing_source_offers.data_source IS 'LIVE | CACHE | RESEARCH_DATA | NOT_CONFIGURED | ERROR';
COMMENT ON COLUMN public.sourcing_source_offers.authenticity_status IS 'VERIFIED | LIKELY_VERIFIED | REVIEW_REQUIRED | REJECTED | UNKNOWN';

-- Migrate existing condition values to normalized format
UPDATE public.sourcing_source_offers
SET condition_normalized = CASE
  WHEN condition = 'new' THEN 'NEW'
  WHEN condition = 'used' THEN 'USED'
  WHEN condition = 'refurbished' THEN 'REFURBISHED'
  ELSE 'UNKNOWN'
END
WHERE condition_normalized = 'UNKNOWN';

-- Migrate existing availability values
UPDATE public.sourcing_source_offers
SET availability_normalized = CASE
  WHEN availability = 'in_stock' THEN 'IN_STOCK'
  WHEN availability = 'out_of_stock' THEN 'OUT_OF_STOCK'
  WHEN availability = 'preorder' THEN 'PREORDER'
  WHEN availability = 'limited' THEN 'LOW_STOCK'
  ELSE 'UNKNOWN'
END
WHERE availability_normalized = 'UNKNOWN';

-- Copy domestic_shipping to usa_shipping_usd where not set
UPDATE public.sourcing_source_offers
SET usa_shipping_usd = domestic_shipping
WHERE usa_shipping_usd = 0 AND domestic_shipping > 0;

-- Índices nuevos
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_condition ON public.sourcing_source_offers(condition_normalized);
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_availability ON public.sourcing_source_offers(availability_normalized);
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_freshness ON public.sourcing_source_offers(freshness_status);
CREATE INDEX IF NOT EXISTS idx_sourcing_offers_datasource ON public.sourcing_source_offers(data_source);

-- =============================================================
-- 3. NEW TABLE: sourcing_offer_history
-- =============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_offer_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_product_id uuid REFERENCES public.sourcing_normalized_products(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_product_id text NOT NULL,
  change_type text NOT NULL, -- PRICE_CHANGE | STOCK_CHANGE | SELLER_CHANGE | CONDITION_CHANGE | AVAILABILITY_CHANGE | INITIAL
  previous_value jsonb DEFAULT '{}'::jsonb,
  new_value jsonb DEFAULT '{}'::jsonb,
  price_usd numeric(10,2),
  availability_normalized text,
  condition_normalized text,
  seller text,
  checked_at timestamptz DEFAULT now(),
  data_source text DEFAULT 'LIVE',
  notes text
);

COMMENT ON TABLE public.sourcing_offer_history IS 'Historial de cambios significativos en ofertas de fuentes externas. No duplica registros si no hay cambios.';
COMMENT ON COLUMN public.sourcing_offer_history.change_type IS 'PRICE_CHANGE | STOCK_CHANGE | SELLER_CHANGE | CONDITION_CHANGE | AVAILABILITY_CHANGE | INITIAL';
COMMENT ON COLUMN public.sourcing_offer_history.data_source IS 'LIVE | CACHE | RESEARCH_DATA';

CREATE INDEX IF NOT EXISTS idx_sourcing_offer_history_product ON public.sourcing_offer_history(normalized_product_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_offer_history_source ON public.sourcing_offer_history(source, source_product_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_offer_history_changes ON public.sourcing_offer_history(change_type, checked_at DESC);

ALTER TABLE public.sourcing_offer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sourcing_offer_history"
  ON public.sourcing_offer_history FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- =============================================================
-- 4. NEW TABLE: sourcing_retailer_capabilities
-- =============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_retailer_capabilities (
  retailer text PRIMARY KEY,
  -- Capability statuses: LIVE | ADAPTER_READY | NOT_CONFIGURED | ERROR
  search_status text DEFAULT 'NOT_CONFIGURED',
  product_status text DEFAULT 'NOT_CONFIGURED',
  price_status text DEFAULT 'NOT_CONFIGURED',
  stock_status text DEFAULT 'NOT_CONFIGURED',
  seller_status text DEFAULT 'NOT_CONFIGURED',
  delivery_status text DEFAULT 'NOT_CONFIGURED',
  live_check_available boolean DEFAULT false,
  live_check_endpoint text,
  -- Observability
  last_health_check_at timestamptz,
  last_error text,
  error_count_24h int DEFAULT 0,
  success_count_24h int DEFAULT 0,
  avg_response_ms int DEFAULT 0,
  notes text,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.sourcing_retailer_capabilities IS 'Declaración honesta de capacidades reales por retailer. Sin falsos verdes.';
COMMENT ON COLUMN public.sourcing_retailer_capabilities.search_status IS 'LIVE | ADAPTER_READY | NOT_CONFIGURED | ERROR';

ALTER TABLE public.sourcing_retailer_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sourcing_retailer_capabilities"
  ON public.sourcing_retailer_capabilities FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Seed initial capabilities (HONEST STATE — Amazon LIVE via Zinc, eBay/BestBuy ADAPTER_READY pending Zinc multi-retailer config)
INSERT INTO public.sourcing_retailer_capabilities
  (retailer, search_status, product_status, price_status, stock_status, seller_status, delivery_status, live_check_available, live_check_endpoint, notes)
VALUES
  (
    'amazon',
    'LIVE',      -- Zinc search active
    'LIVE',      -- Zinc product detail active
    'LIVE',      -- Zinc price active
    'LIVE',      -- Zinc stock active
    'LIVE',      -- Zinc seller info active
    'LIVE',      -- Zinc delivery info active
    true,
    'zinc-live-check',
    'Amazon via Zinc API (production key required). Full integration active.'
  ),
  (
    'ebay',
    'ADAPTER_READY',    -- Adapter code exists, endpoint structured
    'ADAPTER_READY',
    'NOT_CONFIGURED',   -- Zinc eBay retailer not confirmed active
    'NOT_CONFIGURED',
    'NOT_CONFIGURED',
    'NOT_CONFIGURED',
    false,
    'sourcing-retailer-live-check',
    'eBay adapter ready. Live check requires Zinc multi-retailer (retailer=ebay) to be enabled on account.'
  ),
  (
    'bestbuy',
    'ADAPTER_READY',    -- Adapter code exists
    'ADAPTER_READY',
    'NOT_CONFIGURED',
    'NOT_CONFIGURED',
    'NOT_CONFIGURED',
    'NOT_CONFIGURED',
    false,
    'sourcing-retailer-live-check',
    'Best Buy adapter ready. Live check requires Zinc multi-retailer (retailer=bestbuy) to be enabled on account.'
  )
ON CONFLICT (retailer) DO UPDATE SET
  notes = EXCLUDED.notes,
  updated_at = now();

-- =============================================================
-- 5. Observability: sourcing_sync_log
-- =============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  operation text NOT NULL, -- SEARCH | PRODUCT_LOOKUP | LIVE_CHECK | SYNC | HEALTH_CHECK
  success boolean NOT NULL,
  duration_ms int,
  offers_found int DEFAULT 0,
  offers_normalized int DEFAULT 0,
  offers_discarded int DEFAULT 0,
  duplicates_detected int DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_sync_log_source ON public.sourcing_sync_log(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_sync_log_success ON public.sourcing_sync_log(success, created_at DESC);

ALTER TABLE public.sourcing_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sourcing_sync_log"
  ON public.sourcing_sync_log FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- =============================================================
-- 6. Helper function: detect_sourcing_offer_changes
-- Returns TRUE if a significant change was detected vs previous record
-- =============================================================

CREATE OR REPLACE FUNCTION public.detect_sourcing_offer_change(
  p_product_id uuid,
  p_source text,
  p_source_product_id text,
  p_new_price numeric,
  p_new_availability text,
  p_new_condition text,
  p_new_seller text,
  p_threshold_percent numeric DEFAULT 0.5
)
RETURNS TABLE(has_change boolean, change_type text, previous_value jsonb, new_value jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last record;
  v_price_diff_pct numeric;
BEGIN
  SELECT price, availability_normalized, condition_normalized, seller, data_source
  INTO v_last
  FROM public.sourcing_offer_history
  WHERE normalized_product_id = p_product_id
    AND source = p_source
    AND source_product_id = p_source_product_id
  ORDER BY checked_at DESC
  LIMIT 1;

  -- No history exists: INITIAL record
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      true::boolean,
      'INITIAL'::text,
      '{}'::jsonb,
      jsonb_build_object(
        'price', p_new_price,
        'availability', p_new_availability,
        'condition', p_new_condition,
        'seller', p_new_seller
      );
    RETURN;
  END IF;

  -- Check price change beyond threshold
  IF v_last.price IS NOT NULL AND p_new_price IS NOT NULL AND v_last.price > 0 THEN
    v_price_diff_pct := ABS((p_new_price - v_last.price) / v_last.price) * 100;
    IF v_price_diff_pct >= p_threshold_percent THEN
      RETURN QUERY SELECT
        true::boolean,
        'PRICE_CHANGE'::text,
        jsonb_build_object('price', v_last.price)::jsonb,
        jsonb_build_object('price', p_new_price, 'diff_pct', ROUND(v_price_diff_pct, 2))::jsonb;
      RETURN;
    END IF;
  END IF;

  -- Check availability change
  IF v_last.availability_normalized IS DISTINCT FROM p_new_availability THEN
    RETURN QUERY SELECT
      true::boolean,
      'AVAILABILITY_CHANGE'::text,
      jsonb_build_object('availability', v_last.availability_normalized)::jsonb,
      jsonb_build_object('availability', p_new_availability)::jsonb;
    RETURN;
  END IF;

  -- Check condition change
  IF v_last.condition_normalized IS DISTINCT FROM p_new_condition THEN
    RETURN QUERY SELECT
      true::boolean,
      'CONDITION_CHANGE'::text,
      jsonb_build_object('condition', v_last.condition_normalized)::jsonb,
      jsonb_build_object('condition', p_new_condition)::jsonb;
    RETURN;
  END IF;

  -- No significant change detected
  RETURN QUERY SELECT false::boolean, 'NO_CHANGE'::text, '{}'::jsonb, '{}'::jsonb;
END;
$$;
