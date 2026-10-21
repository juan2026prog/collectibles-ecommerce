-- ==============================================================================
-- MIGRATION: Outbox Persistente y Cola de Sincronización Confiable D1
-- Created: 2026-10-20 (Timestamp: 20271021000000)
-- Description:
--   1. Crea la tabla `public.d1_catalog_outbox` para registrar eventos comerciales
--      (pedidos, cancelaciones, cambios de stock, precios, variantes, publicaciones)
--      sin bloquear transacciones principales.
--   2. Monotonic Versioning: registra `version_timestamp` para descartar eventos desfasados.
--   3. Dead Letter Queue: maneja `attempts`, `max_attempts` y `status = 'dead_letter'`.
--   4. Índices parciales de bajo impacto sin overhead en lecturas normales.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.d1_catalog_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, 
  -- 'order_created', 'order_cancelled', 'stock_adjusted', 'product_published', 'product_unpublished', 'price_changed'
  entity_type TEXT NOT NULL DEFAULT 'product', -- 'product', 'taxonomy'
  entity_id TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  version_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'synced', 'failed', 'dead_letter'
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Índice parcial ligero: solo indexa filas pendientes o fallidas para despacho eficiente
CREATE INDEX IF NOT EXISTS idx_d1_outbox_pending
ON public.d1_catalog_outbox (next_attempt_at)
WHERE status IN ('pending', 'failed');

-- Índice para deduplicación y resolución de versión más reciente por entidad
CREATE INDEX IF NOT EXISTS idx_d1_outbox_entity_ver
ON public.d1_catalog_outbox (entity_id, version_timestamp DESC);

-- RLS: Solo service_role y administradores pueden operar la cola outbox
ALTER TABLE public.d1_catalog_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'd1_catalog_outbox' AND policyname = 'service_role_all_d1_outbox'
  ) THEN
    CREATE POLICY service_role_all_d1_outbox ON public.d1_catalog_outbox
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
