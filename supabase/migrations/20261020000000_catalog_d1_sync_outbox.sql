-- ============================================================================
-- Migration (PREPARADA LOCALMENTE - NO APLICAR A PRODUCCIÓN SIN APROBACIÓN)
-- File: supabase/migrations/20261020000000_catalog_d1_sync_outbox.sql
-- Purpose:
--   1. Índices livianos por (updated_at, id) para lectura incremental por cursor
--      sin table scans sobre Supabase Nano (500 MB RAM).
--   2. Tabla de cola de eventos (catalog_d1_sync_outbox) para capturar bajas,
--      despublicaciones y cambios puntuales de stock/precio sin barrer toda la base.
-- ============================================================================

-- 1. Índices de cursor incremental liviano
CREATE INDEX IF NOT EXISTS idx_products_d1_sync_cursor
  ON public.products (updated_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_intl_products_d1_sync_cursor
  ON public.international_products (updated_at ASC, id ASC);

-- 2. Tabla Outbox de cambios incrementales hacia Cloudflare D1
CREATE TABLE IF NOT EXISTS public.catalog_d1_sync_outbox (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'international_product', 'category', 'brand', 'promotion', 'radar', 'settings')),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'unpublish', 'delete')),
  payload JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_d1_outbox_pending
  ON public.catalog_d1_sync_outbox (created_at ASC)
  WHERE processed_at IS NULL;

-- 3. Trigger liviano en products para encolar despublicaciones o cambios de precio/stock
CREATE OR REPLACE FUNCTION public.fn_enqueue_product_d1_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.catalog_d1_sync_outbox (entity_type, entity_id, operation)
    VALUES ('product', OLD.id::text, 'unpublish');
    RETURN OLD;
  END IF;

  IF (NEW.status IS DISTINCT FROM 'published' OR NEW.is_active IS DISTINCT FROM true) THEN
    INSERT INTO public.catalog_d1_sync_outbox (entity_type, entity_id, operation)
    VALUES ('product', NEW.id::text, 'unpublish');
  ELSE
    INSERT INTO public.catalog_d1_sync_outbox (entity_type, entity_id, operation)
    VALUES ('product', NEW.id::text, 'upsert');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_d1_sync_outbox ON public.products;
CREATE TRIGGER trg_products_d1_sync_outbox
AFTER INSERT OR UPDATE OF title, slug, base_price, compare_at_price, currency, stock, status, is_active, is_featured, category_id, brand_id, vendor_id
OR DELETE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_product_d1_sync();

-- ============================================================================
-- ROLLBACK (Reversible):
-- DROP TRIGGER IF EXISTS trg_products_d1_sync_outbox ON public.products;
-- DROP FUNCTION IF EXISTS public.fn_enqueue_product_d1_sync();
-- DROP TABLE IF EXISTS public.catalog_d1_sync_outbox;
-- DROP INDEX IF EXISTS idx_intl_products_d1_sync_cursor;
-- DROP INDEX IF EXISTS idx_products_d1_sync_cursor;
-- ============================================================================
