-- ============================================================================
-- Reversible Rollback Migration: 0001_initial_public_catalog.down.sql
-- Target: Cloudflare D1 (SQLite) — Database: collectibles-catalog
-- ============================================================================

DROP TABLE IF EXISTS sync_audit_log;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS public_site_settings;
DROP TABLE IF EXISTS public_slug_redirects;
DROP TABLE IF EXISTS public_radar_releases;
DROP TABLE IF EXISTS public_badges;
DROP TABLE IF EXISTS public_banners;
DROP TABLE IF EXISTS public_promotions;
DROP TABLE IF EXISTS public_product_groups;
DROP TABLE IF EXISTS public_product_categories;
DROP TABLE IF EXISTS public_products;
DROP TABLE IF EXISTS public_vendor_stores;
DROP TABLE IF EXISTS public_license_themes;
DROP TABLE IF EXISTS public_themes;
DROP TABLE IF EXISTS public_licenses;
DROP TABLE IF EXISTS public_brands;
DROP TABLE IF EXISTS public_categories;
