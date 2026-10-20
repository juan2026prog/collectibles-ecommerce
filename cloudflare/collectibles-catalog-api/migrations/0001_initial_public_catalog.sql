-- ============================================================================
-- Migration: 0001_initial_public_catalog.sql
-- Target: Cloudflare D1 (SQLite) — Database: collectibles-catalog
-- Purpose: Proyección pública estructurada del catálogo de Collectibles.uy
-- Rules:
--   1. Productos locales/vendedores Uruguay se mantienen estrictamente en UYU.
--   2. Productos internacionales (Amazon, eBay, etc.) preservan USD + estimación UYU.
--   3. Stock es puramente informativo; Checkout siempre revalida contra Supabase.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Categorías públicas
CREATE TABLE IF NOT EXISTS public_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  description TEXT,
  image_url TEXT,
  icon_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  product_count_local INTEGER NOT NULL DEFAULT 0,
  product_count_intl INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_categories_slug ON public_categories(slug);
CREATE INDEX IF NOT EXISTS idx_public_categories_parent ON public_categories(parent_id, is_active, sort_order);

-- 2. Marcas públicas
CREATE TABLE IF NOT EXISTS public_brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  banner_url TEXT,
  description TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'approved',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_brands_slug ON public_brands(slug);
CREATE INDEX IF NOT EXISTS idx_public_brands_active ON public_brands(is_active, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_public_brands_name ON public_brands(name COLLATE NOCASE);

-- 3. Licencias públicas
CREATE TABLE IF NOT EXISTS public_licenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  banner_url TEXT,
  description TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_licenses_slug ON public_licenses(slug);
CREATE INDEX IF NOT EXISTS idx_public_licenses_active ON public_licenses(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_public_licenses_name ON public_licenses(name COLLATE NOCASE);

-- 4. Temas / Lneas públicas
CREATE TABLE IF NOT EXISTS public_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_themes_slug ON public_themes(slug);

-- 5. Relación Licencia <-> Tema
CREATE TABLE IF NOT EXISTS public_license_themes (
  license_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  PRIMARY KEY (license_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_public_license_themes_theme ON public_license_themes(theme_id);

-- 6. Tiendas de Vendedores públicas
CREATE TABLE IF NOT EXISTS public_vendor_stores (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  store_slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active INTEGER NOT NULL DEFAULT 1,
  ships_to_argentina INTEGER NOT NULL DEFAULT 0,
  promotions_opt_in INTEGER NOT NULL DEFAULT 0,
  badges_json TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_vendor_stores_slug ON public_vendor_stores(store_slug);
CREATE INDEX IF NOT EXISTS idx_public_vendor_stores_vendor ON public_vendor_stores(vendor_id);
CREATE INDEX IF NOT EXISTS idx_public_vendor_stores_active ON public_vendor_stores(is_active, status);

-- 7. Productos públicos (Proyección unificada Local UYU + Internacional USD)
CREATE TABLE IF NOT EXISTS public_products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  sku TEXT,
  ean TEXT,
  asin TEXT,
  external_product_id TEXT,
  -- Origen y separación monetaria estricta
  catalog_source TEXT NOT NULL DEFAULT 'local' CHECK (catalog_source IN ('local', 'international')),
  source_provider TEXT NOT NULL DEFAULT 'platform',
  source_market TEXT NOT NULL DEFAULT 'UY',
  is_international INTEGER NOT NULL DEFAULT 0,
  -- Regla comercial: UYU para local, USD para internacional
  currency TEXT NOT NULL DEFAULT 'UYU' CHECK (currency IN ('UYU', 'USD')),
  price_currency TEXT NOT NULL DEFAULT 'UYU' CHECK (price_currency IN ('UYU', 'USD')),
  base_price REAL NOT NULL DEFAULT 0,
  compare_at_price REAL,
  final_price_usd REAL,
  final_price_uyu REAL,
  urubox_estimated_cost_usd REAL,
  total_estimated_cost_usd REAL,
  amazon_current_price_usd REAL,
  amazon_list_price_usd REAL,
  amazon_discount_percent REAL,
  amazon_prime INTEGER NOT NULL DEFAULT 0,
  -- Disponibilidad informativa (Checkout valida stock real en Supabase)
  status TEXT NOT NULL DEFAULT 'published',
  is_active INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT NOT NULL DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'preorder', 'unavailable')),
  availability_type TEXT NOT NULL DEFAULT 'immediate',
  is_preorder INTEGER NOT NULL DEFAULT 0,
  preorder_eta TEXT,
  release_date TEXT,
  condition TEXT NOT NULL DEFAULT 'new',
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_new_arrival INTEGER NOT NULL DEFAULT 0,
  -- Relaciones taxonómicas y de vendedor
  category_id TEXT,
  category_slug TEXT,
  category_name TEXT,
  brand_id TEXT,
  brand_slug TEXT,
  brand_name TEXT,
  license_id TEXT,
  license_slug TEXT,
  license_name TEXT,
  theme_id TEXT,
  theme_slug TEXT,
  theme_name TEXT,
  vendor_id TEXT,
  vendor_store_id TEXT,
  vendor_name TEXT,
  vendor_slug TEXT,
  vendor_logo_url TEXT,
  vendor_status TEXT DEFAULT 'active',
  vendor_ships_to_argentina INTEGER NOT NULL DEFAULT 1,
  wave_name TEXT,
  weight_kg REAL,
  weight_grams INTEGER,
  -- Proyecciones JSON desnormalizadas para evitar joins N+1 en lecturas de tarjetas y fichas
  primary_image_url TEXT,
  images_json TEXT NOT NULL DEFAULT '[]',
  media_variants_json TEXT NOT NULL DEFAULT '{}',
  variants_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  category_ids_json TEXT NOT NULL DEFAULT '[]',
  group_ids_json TEXT NOT NULL DEFAULT '[]',
  buybox_json TEXT NOT NULL DEFAULT '[]',
  payment_restrictions_json TEXT NOT NULL DEFAULT '[]',
  -- Métricas y SEO
  average_rating REAL NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  reviews_preview_json TEXT NOT NULL DEFAULT '[]',
  seo_title TEXT,
  seo_description TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  -- Control temporal y expiración
  created_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ),
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ),
  synced_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ),
  expires_at TEXT
);

-- Índices compuestos para listados, filtros, ordenamientos y búsquedas sin table scans
CREATE INDEX IF NOT EXISTS idx_public_products_slug ON public_products(slug);
CREATE INDEX IF NOT EXISTS idx_public_products_active_source_created
  ON public_products(is_active, status, is_international, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_active_source_price
  ON public_products(is_active, status, is_international, base_price ASC);
CREATE INDEX IF NOT EXISTS idx_public_products_category
  ON public_products(is_active, status, is_international, category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_brand
  ON public_products(is_active, status, is_international, brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_license
  ON public_products(is_active, status, is_international, license_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_theme
  ON public_products(is_active, status, is_international, theme_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_vendor
  ON public_products(is_active, status, vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_vendor_store
  ON public_products(is_active, status, vendor_store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_featured
  ON public_products(is_active, status, is_international, is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_products_wave
  ON public_products(is_active, status, wave_name);
CREATE INDEX IF NOT EXISTS idx_public_products_asin
  ON public_products(asin) WHERE asin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_public_products_updated
  ON public_products(updated_at DESC);

-- 8. Relación Producto <-> Categoría (Soporta multi-categoría y mapeo Marca-Categoría)
CREATE TABLE IF NOT EXISTS public_product_categories (
  product_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  brand_id TEXT,
  is_international INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_public_prod_cat_category ON public_product_categories(category_id, is_international);
CREATE INDEX IF NOT EXISTS idx_public_prod_cat_brand ON public_product_categories(brand_id, category_id);

-- 9. Grupos de Productos / Colecciones Curadas
CREATE TABLE IF NOT EXISTS public_product_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  group_type TEXT,
  banner_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  product_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_product_groups_slug ON public_product_groups(slug);
CREATE INDEX IF NOT EXISTS idx_public_product_groups_active ON public_product_groups(is_active, sort_order);

-- 10. Promociones públicas activas
CREATE TABLE IF NOT EXISTS public_promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  min_purchase_amount REAL,
  max_discount_amount REAL,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 0,
  badge_text TEXT,
  applies_to_all INTEGER NOT NULL DEFAULT 0,
  targets_json TEXT NOT NULL DEFAULT '[]',
  exclusions_json TEXT NOT NULL DEFAULT '[]',
  tiers_json TEXT NOT NULL DEFAULT '[]',
  group_items_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_promotions_active ON public_promotions(is_active, priority DESC);

-- 11. Banners públicos de portada y secciones
CREATE TABLE IF NOT EXISTS public_banners (
  id TEXT PRIMARY KEY,
  title TEXT,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  mobile_image_url TEXT,
  link_url TEXT,
  cta_text TEXT,
  position TEXT NOT NULL DEFAULT 'home_hero',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_banners_active ON public_banners(is_active, position, sort_order);

-- 12. Badges públicos
CREATE TABLE IF NOT EXISTS public_badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  label TEXT,
  bg_color TEXT,
  text_color TEXT,
  icon TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

-- 13. Radar y Calendario de Lanzamientos públicos
CREATE TABLE IF NOT EXISTS public_radar_releases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  brand_id TEXT,
  brand_name TEXT,
  brand_slug TEXT,
  license_id TEXT,
  license_name TEXT,
  license_slug TEXT,
  category TEXT,
  release_date TEXT,
  estimated_quarter TEXT,
  status TEXT NOT NULL DEFAULT 'announced',
  msrp_usd REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  hero_image_url TEXT,
  gallery_json TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  editorial_summary TEXT,
  hype_score INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  milestones_json TEXT NOT NULL DEFAULT '[]',
  related_products_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ),
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_public_radar_slug ON public_radar_releases(slug);
CREATE INDEX IF NOT EXISTS idx_public_radar_date ON public_radar_releases(release_date ASC, hype_score DESC);
CREATE INDEX IF NOT EXISTS idx_public_radar_brand ON public_radar_releases(brand_id, release_date ASC);

-- 14. Redirecciones de Slugs de Productos
CREATE TABLE IF NOT EXISTS public_slug_redirects (
  old_slug TEXT PRIMARY KEY,
  new_slug TEXT NOT NULL,
  product_id TEXT,
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

-- 15. Configuración Pública del Sitio (Site Config, Feature Toggles, International Status & Markets)
CREATE TABLE IF NOT EXISTS public_site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

-- 16. Estado de Sincronización Incremental (Supabase -> D1)
CREATE TABLE IF NOT EXISTS sync_state (
  entity_type TEXT PRIMARY KEY,
  last_cursor_updated_at TEXT,
  last_cursor_id TEXT,
  last_sync_status TEXT NOT NULL DEFAULT 'idle',
  last_sync_at TEXT,
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

-- 17. Auditoría de Lotes de Sincronización
CREATE TABLE IF NOT EXISTS sync_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  records_affected INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);

CREATE INDEX IF NOT EXISTS idx_sync_audit_created ON sync_audit_log(created_at DESC);
