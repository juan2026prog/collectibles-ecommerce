-- Agregando campos extendidos de Mercado Libre para sincronización avanzada
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS ml_status text,
  ADD COLUMN IF NOT EXISTS listing_type_id text,
  ADD COLUMN IF NOT EXISTS ml_permalink text;

-- Aseguramos que el slug sea opcional o tenga un default si no viene
ALTER TABLE products ALTER COLUMN slug DROP NOT NULL;
