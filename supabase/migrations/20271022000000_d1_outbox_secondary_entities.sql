-- ==============================================================================
-- MIGRACIÓN PREPARADA (AISLADA / NO APLICADA EN PRODUCCIÓN SIN AUTORIZACIÓN)
-- ==============================================================================
-- Archivo: 20271022000000_d1_outbox_secondary_entities.sql
-- Propósito: Extender el mecanismo transaccional de outbox Nivel 1 existente
--            (public.d1_catalog_outbox) para soportar las entidades públicas:
--            1. Promociones (public.promotions)
--            2. Lanzamientos Radar públicos (public.release_events)
--            3. Configuración del Sitio (public.site_settings)
--            4. Feature Toggles (public.feature_toggles)
--            5. Banners (public.banners)
--            6. Badges (public.vendor_store_badges)
--            7. Trigger asíncrono pg_net que despierta automáticamente a process-catalog-outbox
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGER: public.promotions -> d1_catalog_outbox
-- Nota de esquema: PK es id (uuid), campos de descuento son discount_type y discount_value.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_promotions_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      CASE WHEN NEW.is_active = true THEN 'promotion_active' ELSE 'promotion_inactive' END,
      'promotion',
      NEW.id::text,
      jsonb_build_object(
        'name', NEW.name,
        'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value,
        'is_active', NEW.is_active,
        'starts_at', NEW.starts_at,
        'ends_at', NEW.ends_at,
        'operation', TG_OP
      ),
      COALESCE(NEW.created_at, now()),
      'pending',
      now()
    );
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      'promotion_deleted',
      'promotion',
      OLD.id::text,
      jsonb_build_object('operation', 'DELETE'),
      now(),
      'pending',
      now()
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_promotions_d1_outbox ON public.promotions;
CREATE TRIGGER trg_promotions_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_promotions_outbox_sync();

-- ------------------------------------------------------------------------------
-- 2. TRIGGER: public.release_events (Radar) -> d1_catalog_outbox
-- Regla de Oro: Solo publicar eventos con is_published = true AND approval_status = 'PUBLISHED'.
-- Jamás propagar borradores, contenido privado o notas internas de auditoría.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_release_events_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_public BOOLEAN;
  v_was_public BOOLEAN;
BEGIN
  v_is_public := (TG_OP <> 'DELETE') AND (NEW.is_published = true) AND (NEW.approval_status = 'PUBLISHED');
  v_was_public := (TG_OP <> 'INSERT') AND (OLD.is_published = true) AND (OLD.approval_status = 'PUBLISHED');

  IF (v_is_public) THEN
    -- Alta o actualización de lanzamiento publicado
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      'radar_published',
      'radar',
      NEW.id::text,
      jsonb_build_object(
        'title', NEW.title,
        'slug', NEW.slug,
        'status', NEW.status,
        'is_featured', NEW.is_featured,
        'operation', TG_OP
      ),
      COALESCE(NEW.updated_at, now()),
      'pending',
      now()
    );
  ELSIF (v_was_public AND NOT v_is_public) THEN
    -- Despublicación o eliminación de un evento previamente público
    INSERT INTO public.d1_catalog_outbox (
      event_type,
      entity_type,
      entity_id,
      payload,
      version_timestamp,
      status,
      next_attempt_at
    ) VALUES (
      'radar_unpublished',
      'radar',
      OLD.id::text,
      jsonb_build_object('operation', TG_OP, 'reason', 'unpublished_or_deleted'),
      now(),
      'pending',
      now()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_release_events_d1_outbox ON public.release_events;
CREATE TRIGGER trg_release_events_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.release_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_release_events_outbox_sync();

-- ------------------------------------------------------------------------------
-- 3. TRIGGER: public.site_settings -> d1_catalog_outbox
-- Nota de esquema: PK es key (text), no tiene id.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_site_settings_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_key := OLD.key;
  ELSE
    v_key := NEW.key;
  END IF;

  INSERT INTO public.d1_catalog_outbox (
    event_type,
    entity_type,
    entity_id,
    payload,
    version_timestamp,
    status,
    next_attempt_at
  ) VALUES (
    'settings_updated',
    'settings',
    v_key,
    jsonb_build_object('table', 'site_settings', 'key', v_key, 'operation', TG_OP),
    now(),
    'pending',
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_site_settings_d1_outbox ON public.site_settings;
CREATE TRIGGER trg_site_settings_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_site_settings_outbox_sync();

-- ------------------------------------------------------------------------------
-- 4. TRIGGER: public.feature_toggles, public.banners & public.vendor_store_badges -> d1_catalog_outbox
-- Nota de esquema: PK es id (text o uuid).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_settings_entity_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_entity_id := OLD.id::text;
  ELSE
    v_entity_id := NEW.id::text;
  END IF;

  INSERT INTO public.d1_catalog_outbox (
    event_type,
    entity_type,
    entity_id,
    payload,
    version_timestamp,
    status,
    next_attempt_at
  ) VALUES (
    'settings_updated',
    'settings',
    v_entity_id,
    jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP),
    now(),
    'pending',
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_toggles_d1_outbox ON public.feature_toggles;
CREATE TRIGGER trg_feature_toggles_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_toggles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_settings_entity_outbox_sync();

DROP TRIGGER IF EXISTS trg_banners_d1_outbox ON public.banners;
CREATE TRIGGER trg_banners_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.banners
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_settings_entity_outbox_sync();

DROP TRIGGER IF EXISTS trg_vendor_store_badges_d1_outbox ON public.vendor_store_badges;
CREATE TRIGGER trg_vendor_store_badges_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.vendor_store_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_settings_entity_outbox_sync();

-- ------------------------------------------------------------------------------
-- 5. TRIGGER ASÍNCRONO PG_NET: public.d1_catalog_outbox -> process-catalog-outbox
-- Despierta automáticamente al consumidor Edge Function sin bloquear la transacción
-- ni requerir cron jobs ni intervención manual. Se ejecuta FOR EACH STATEMENT.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_d1_outbox_notify_consumer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret 
  FROM vault.decrypted_secrets 
  WHERE name = 'catalog_sync_secret';

  IF v_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/process-catalog-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := '{"source": "statement_trigger", "batch_size": 25}'::jsonb,
      timeout_milliseconds := 15000
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_d1_outbox_notify_consumer ON public.d1_catalog_outbox;
CREATE TRIGGER trg_d1_outbox_notify_consumer
  AFTER INSERT ON public.d1_catalog_outbox
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_fn_d1_outbox_notify_consumer();
