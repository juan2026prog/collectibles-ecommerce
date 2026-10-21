-- ==============================================================================
-- MIGRACIÓN PREPARADA (AISLADA / NO APLICADA EN PRODUCCIÓN SIN AUTORIZACIÓN)
-- ==============================================================================
-- Archivo: 20271022000000_d1_outbox_secondary_entities.sql
-- Propósito: Extender el mecanismo transaccional de outbox Nivel 1 existente
--            (public.d1_catalog_outbox) para soportar las entidades públicas:
--            1. Promociones (public.promotions)
--            2. Lanzamientos Radar públicos (public.release_events)
--            3. Configuración y Toggles (public.site_settings, public.feature_toggles)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGER: public.promotions -> d1_catalog_outbox
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
        'type', NEW.type,
        'value', NEW.value,
        'is_active', NEW.is_active,
        'starts_at', NEW.starts_at,
        'ends_at', NEW.ends_at,
        'operation', TG_OP
      ),
      COALESCE(NEW.updated_at, now()),
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
-- 3. TRIGGER: public.site_settings & public.feature_toggles -> d1_catalog_outbox
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_settings_outbox_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    COALESCE(NEW.id::text, TG_TABLE_NAME),
    jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP),
    now(),
    'pending',
    now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_settings_d1_outbox ON public.site_settings;
CREATE TRIGGER trg_site_settings_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_settings_outbox_sync();

DROP TRIGGER IF EXISTS trg_feature_toggles_d1_outbox ON public.feature_toggles;
CREATE TRIGGER trg_feature_toggles_d1_outbox
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_toggles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_settings_outbox_sync();
