-- Preparación Multicanal
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_platform text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_vendor_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS external_variant_id text;

-- Trazabilidad y Logs
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_ml_sync_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_ml_stock_sync_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_ml_error text;
