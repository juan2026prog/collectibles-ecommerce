-- Agregando soporte para metadatos (características) en productos
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Aseguramos que el slug sea opcional
ALTER TABLE products ALTER COLUMN slug DROP NOT NULL;
