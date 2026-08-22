-- Migration: 20261225000000_bulk_product_import_rpc.sql
-- Description: Performance indexes and helpers for Bulk Product Import and Export in Collectibles.uy

-- Index for fast SKU lookup during import matching
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_lower ON public.product_variants (LOWER(sku));

-- Index for fast product status & vendor filtering during export
CREATE INDEX IF NOT EXISTS idx_products_vendor_status ON public.products (vendor_id, status);

-- Index for brand and category lookup during metadata resolution
CREATE INDEX IF NOT EXISTS idx_brands_name_lower ON public.brands (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_categories_name_lower ON public.categories (LOWER(name));
