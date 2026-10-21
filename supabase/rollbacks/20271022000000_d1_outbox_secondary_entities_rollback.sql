-- ==============================================================================
-- ROLLBACK SCRIPT: MIGRACIÓN SECUNDARIA DE TRIGGERS D1 OUTBOX
-- ==============================================================================
-- Archivo: 20271022000000_d1_outbox_secondary_entities_rollback.sql
-- Ubicación: supabase/rollbacks/ (Aislado de migraciones automáticas)
-- Propósito: Deshacer de forma segura, atómica e inmediata la instalación de
--            los triggers de sincronización secundaria (promotions, release_events,
--            site_settings, feature_toggles, banners, badges) y el notificador
--            hacia d1_catalog_outbox.
-- ==============================================================================

-- 1. Eliminar trigger y función de Notificación Asíncrona (pg_net)
DROP TRIGGER IF EXISTS trg_d1_outbox_notify_consumer ON public.d1_catalog_outbox;
DROP FUNCTION IF EXISTS public.trg_fn_d1_outbox_notify_consumer();

-- 2. Eliminar trigger y función de Promociones
DROP TRIGGER IF EXISTS trg_promotions_d1_outbox ON public.promotions;
DROP FUNCTION IF EXISTS public.trg_fn_promotions_outbox_sync();

-- 3. Eliminar trigger y función de Radar (Lanzamientos)
DROP TRIGGER IF EXISTS trg_release_events_d1_outbox ON public.release_events;
DROP FUNCTION IF EXISTS public.trg_fn_release_events_outbox_sync();

-- 4. Eliminar trigger y función de Configuración del Sitio (site_settings)
DROP TRIGGER IF EXISTS trg_site_settings_d1_outbox ON public.site_settings;
DROP FUNCTION IF EXISTS public.trg_fn_site_settings_outbox_sync();

-- 5. Eliminar triggers y función de Toggles, Banners y Badges
DROP TRIGGER IF EXISTS trg_feature_toggles_d1_outbox ON public.feature_toggles;
DROP TRIGGER IF EXISTS trg_banners_d1_outbox ON public.banners;
DROP TRIGGER IF EXISTS trg_vendor_store_badges_d1_outbox ON public.vendor_store_badges;
DROP FUNCTION IF EXISTS public.trg_fn_settings_entity_outbox_sync();
