-- ============================================================================
-- SOURCING INTELLIGENCE — FASE 7 — ECOSISTEMA, ORQUESTACIÓN Y APRENDIZAJE
-- Collectibles 2026
-- ============================================================================

-- 1. TABLA: RADAR SIGNAL PRODUCTS (Relación Radar -> Productos Master & Catálogo)
CREATE TABLE IF NOT EXISTS public.radar_signal_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radar_event_id UUID REFERENCES public.release_events(id) ON DELETE CASCADE,
  radar_signal_id TEXT,
  canonical_sku TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  international_product_id UUID REFERENCES public.international_products(id) ON DELETE SET NULL,
  relationship_type TEXT NOT NULL DEFAULT 'EXACT_MATCH' CHECK (relationship_type IN ('EXACT_MATCH', 'RELATED_CHARACTER', 'SERIES_MATCH', 'FRANCHISE_MATCH', 'RECOMMENDED')),
  confidence NUMERIC NOT NULL DEFAULT 90.0,
  source TEXT NOT NULL DEFAULT 'SOURCING_INTELLIGENCE',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radar_signal_products_event ON public.radar_signal_products(radar_event_id);
CREATE INDEX IF NOT EXISTS idx_radar_signal_products_sku ON public.radar_signal_products(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_radar_signal_products_product ON public.radar_signal_products(product_id);

-- 2. TABLA: SOURCING LEARNING SIGNALS (Circuito Cerrado de Aprendizaje)
CREATE TABLE IF NOT EXISTS public.sourcing_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_sku TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  score_version TEXT NOT NULL DEFAULT '7.0',
  weights_version TEXT NOT NULL DEFAULT '7.0',
  views_count INT NOT NULL DEFAULT 0,
  wishlist_count INT NOT NULL DEFAULT 0,
  cart_adds_count INT NOT NULL DEFAULT 0,
  orders_count INT NOT NULL DEFAULT 0,
  revenue_usd NUMERIC NOT NULL DEFAULT 0.0,
  margin_achieved_usd NUMERIC NOT NULL DEFAULT 0.0,
  conversion_rate NUMERIC NOT NULL DEFAULT 0.0,
  learning_weight_delta NUMERIC NOT NULL DEFAULT 0.0,
  performance_verdict TEXT NOT NULL DEFAULT 'NEUTRAL' CHECK (performance_verdict IN ('HIGH_PERFORMER', 'GOOD', 'NEUTRAL', 'UNDERPERFORMER', 'PAUSE_RECOMMENDED')),
  metadata JSONB DEFAULT '{}'::jsonb,
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_learning_sku ON public.sourcing_learning_signals(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_sourcing_learning_verdict ON public.sourcing_learning_signals(performance_verdict);

-- 3. TABLA: SOURCING ECOSYSTEM SYSTEM LOGS (Observabilidad y Timeline Central)
CREATE TABLE IF NOT EXISTS public.sourcing_system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'PRODUCT',
  entity_id TEXT NOT NULL,
  canonical_sku TEXT,
  actor TEXT NOT NULL DEFAULT 'SYSTEM',
  details JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'WARNING', 'ERROR', 'SKIPPED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_system_logs_sku ON public.sourcing_system_logs(canonical_sku);
CREATE INDEX IF NOT EXISTS idx_sourcing_system_logs_event ON public.sourcing_system_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_sourcing_system_logs_created ON public.sourcing_system_logs(created_at DESC);

-- RLS Security Policies
ALTER TABLE public.radar_signal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_learning_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_system_logs ENABLE ROW LEVEL SECURITY;

-- Public read for radar signal products
CREATE POLICY "Public can view radar signal products"
  ON public.radar_signal_products FOR SELECT
  USING (true);

-- Admin & System full access
CREATE POLICY "Admins full access to radar_signal_products"
  ON public.radar_signal_products FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin') OR
    auth.role() = 'service_role'
  );

CREATE POLICY "Admins full access to sourcing_learning_signals"
  ON public.sourcing_learning_signals FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin') OR
    auth.role() = 'service_role'
  );

CREATE POLICY "Admins full access to sourcing_system_logs"
  ON public.sourcing_system_logs FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'superadmin') OR
    auth.role() = 'service_role'
  );
