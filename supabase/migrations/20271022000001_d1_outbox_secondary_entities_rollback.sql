-- ==============================================================================
-- ROLLBACK SCRIPT: MIGRACIÓN SECUNDARIA DE TRIGGERS D1 OUTBOX
-- ==============================================================================
-- Archivo: 20271022000001_d1_outbox_secondary_entities_rollback.sql
-- Propósito: Deshacer de forma segura, atómica e inmediata la instalación de
--            los triggers de sincronización secundaria (promotions, release_events,
--            site_settings, feature_toggles, banners, badges) hacia d1_catalog_outbox.
-- ==============================================================================

-- 1. Eliminar trigger y función de Promociones
DROP TRIGGER IF EXISTS trg_promotions_d1_outbox ON public.promotions;
DROP FUNCTION IF EXISTS public.trg_fn_promotions_outbox_sync();

-- 2. Eliminar trigger y función de Radar (Lanzamientos)
DROP TRIGGER IF EXISTS trg_release_events_d1_outbox ON public.release_events;
DROP FUNCTION IF EXISTS public.trg_fn_release_events_outbox_sync();

-- 3. Eliminar triggers y función de Configuración, Toggles, Banners y Badges
DROP TRIGGER IF EXISTS trg_site_settings_d1_outbox ON public.site_settings;
DROP TRIGGER IF EXISTS trg_feature_toggles_d1_outbox ON public.feature_toggles;
DROP TRIGGER IF EXISTS trg_banners_d1_outbox ON public.banners;
DROP TRIGGER IF EXISTS trg_vendor_store_badges_d1_outbox ON public.vendor_store_badges;
DROP FUNCTION IF EXISTS public.trg_fn_settings_outbox_sync();
