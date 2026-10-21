-- ==============================================================================
-- MIGRATION: Outbox Persistente, Reserva Atómica y Triggers Transaccionales D1
-- Created: 2026-10-20 (Timestamp: 20271021000000)
-- Description:
--   1. Tabla `public.d1_catalog_outbox` con bloqueo atómico (locked_at, locked_by).
--   2. Función RPC `public.claim_d1_outbox_batch()` con `FOR UPDATE SKIP LOCKED`
--      y recuperación automática de eventos atascados (timeout heartbeat).
--   3. Triggers transaccionales en `product_variants` y `products`:
--      - Actualizan `products.updated_at = now()` en cada mutación de inventario (monotonía).
--      - Encolan eventos atómicamente en la misma transacción comercial.
--   4. RLS y permisos restringidos a service_role.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.d1_catalog_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, 
  -- 'order_created', 'order_cancelled', 'order_refunded', 'stock_adjusted', 'product_published', 'product_unpublished', 'price_changed'
  entity_type TEXT NOT NULL DEFAULT 'product', -- 'product', 'taxonomy'
  entity_id TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  version_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'synced', 'failed', 'dead_letter'
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Índices parciales de bajo impacto
CREATE INDEX IF NOT EXISTS idx_d1_outbox_claim
ON public.d1_catalog_outbox (next_attempt_at)
WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_d1_outbox_processing
ON public.d1_catalog_outbox (locked_at)
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_d1_outbox_entity_ver
ON public.d1_catalog_outbox (entity_id, version_timestamp DESC);

-- RLS: Solo service_role
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

-- ------------------------------------------------------------------------------
-- FUNCIÓN: Reserva atómica de lotes con FOR UPDATE SKIP LOCKED y recuperación de atascados
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_d1_outbox_batch(
  p_batch_size INT DEFAULT 25,
  p_worker_id TEXT DEFAULT 'worker-1',
  p_stuck_interval_seconds INT DEFAULT 300
)
RETURNS SETOF public.d1_catalog_outbox
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Recuperar eventos atascados en 'processing' por caída de worker (timeout 5 min)
  UPDATE public.d1_catalog_outbox
  SET status = 'pending',
      locked_at = NULL,
      locked_by = NULL,
      last_error = 'Stuck in processing: heartbeat expired, auto-recovered'
  WHERE status = 'processing'
    AND locked_at < (now() - (p_stuck_interval_seconds || ' seconds')::interval);

  -- 2. Reserva atómica sin colisiones concurrentes mediante SKIP LOCKED
  RETURN QUERY
  WITH available AS (
    SELECT id
    FROM public.d1_catalog_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.d1_catalog_outbox o
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id
  FROM available
  WHERE o.id = available.id
  RETURNING o.*;
END;
$$;

-- ------------------------------------------------------------------------------
-- TRIGGER 1: Cambios de inventario en product_variants -> actualización monótona y outbox
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_product_variants_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.inventory_count IS DISTINCT FROM NEW.inventory_count) THEN
    -- 1. Garantizar versión monótona estricta en products.updated_at
    UPDATE public.products
    SET updated_at = now()
    WHERE id = NEW.product_id;

    -- 2. Insertar evento en outbox en la misma transacción comercial
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      'stock_adjusted',
      'product',
      NEW.product_id::text,
      jsonb_build_object(
        'variant_id', NEW.id,
        'old_inventory_count', OLD.inventory_count,
        'new_inventory_count', NEW.inventory_count
      ),
      now(),
      'pending',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variants_d1_outbox ON public.product_variants;
CREATE TRIGGER trg_product_variants_d1_outbox
  AFTER UPDATE OF inventory_count ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_product_variants_outbox_sync();

-- ------------------------------------------------------------------------------
-- TRIGGER 2: Cambios de precio o estado en products -> outbox
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_products_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (
    OLD.base_price IS DISTINCT FROM NEW.base_price OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.is_active IS DISTINCT FROM NEW.is_active
  )) THEN
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      CASE 
        WHEN NEW.status <> 'published' OR NEW.is_active = false THEN 'product_unpublished'
        WHEN OLD.base_price IS DISTINCT FROM NEW.base_price THEN 'price_changed'
        ELSE 'product_published'
      END,
      'product',
      NEW.id::text,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_price', OLD.base_price,
        'new_price', NEW.base_price
      ),
      COALESCE(NEW.updated_at, now()),
      'pending',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_d1_outbox ON public.products;
CREATE TRIGGER trg_products_d1_outbox
  AFTER UPDATE OF base_price, status, is_active ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_products_outbox_sync();
