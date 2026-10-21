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

-- Permisos estrictos: solo service_role y postgres
REVOKE EXECUTE ON FUNCTION public.claim_d1_outbox_batch(integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_d1_outbox_batch(integer, text, integer) TO service_role, postgres;

-- ------------------------------------------------------------------------------
-- TRIGGER 1: Cambios de inventario en product_variants -> actualización monótona y outbox
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_product_variants_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prod_id UUID;
  v_old_cnt INT;
  v_new_cnt INT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_prod_id := OLD.product_id;
    v_old_cnt := OLD.inventory_count;
    v_new_cnt := 0;
  ELSE
    v_prod_id := NEW.product_id;
    v_old_cnt := CASE WHEN TG_OP = 'UPDATE' THEN OLD.inventory_count ELSE 0 END;
    v_new_cnt := NEW.inventory_count;
  END IF;

  IF (
    TG_OP = 'INSERT' OR
    TG_OP = 'DELETE' OR
    (TG_OP = 'UPDATE' AND (OLD.inventory_count IS DISTINCT FROM NEW.inventory_count OR OLD.is_active IS DISTINCT FROM NEW.is_active))
  ) THEN
    -- Actualizar versión monótona en products
    UPDATE public.products
    SET updated_at = now()
    WHERE id = v_prod_id;

    -- Encolar en outbox
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
      v_prod_id::text,
      jsonb_build_object(
        'variant_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        'old_inventory_count', v_old_cnt,
        'new_inventory_count', v_new_cnt,
        'operation', TG_OP
      ),
      now(),
      'pending',
      now()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variants_d1_outbox ON public.product_variants;
CREATE TRIGGER trg_product_variants_d1_outbox
  AFTER INSERT OR UPDATE OF inventory_count, is_active OR DELETE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_product_variants_outbox_sync();

-- ------------------------------------------------------------------------------
-- TRIGGER 2: Cambios de precio, estado o slug en products -> outbox
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_products_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'published' AND NEW.is_active = true) THEN
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      'product_published',
      'product',
      NEW.id::text,
      jsonb_build_object(
        'new_status', NEW.status,
        'new_price', NEW.base_price,
        'operation', 'INSERT'
      ),
      COALESCE(NEW.updated_at, now()),
      'pending',
      now()
    );
  ELSIF (TG_OP = 'UPDATE' AND (
    OLD.base_price IS DISTINCT FROM NEW.base_price OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.is_active IS DISTINCT FROM NEW.is_active OR
    OLD.slug IS DISTINCT FROM NEW.slug OR
    OLD.title IS DISTINCT FROM NEW.title
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
        'new_price', NEW.base_price,
        'old_slug', OLD.slug,
        'new_slug', NEW.slug
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
  AFTER INSERT OR UPDATE OF base_price, status, is_active, slug, title ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_products_outbox_sync();

-- Seguridad de privilegios mínimos para la RPC de reserva
REVOKE EXECUTE ON FUNCTION public.claim_d1_outbox_batch(INT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_d1_outbox_batch(INT, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_d1_outbox_batch(INT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_d1_outbox_batch(INT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_d1_outbox_batch(INT, TEXT, INT) TO postgres;
