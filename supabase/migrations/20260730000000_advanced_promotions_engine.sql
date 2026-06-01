-- Migración para preparar el motor avanzado de promociones (Fase 1)

-- 1. Añadir columnas de metadatos y lógica a 'promotions' de manera segura
ALTER TABLE promotions 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS badge_text text,
ADD COLUMN IF NOT EXISTS badge_bg text,
ADD COLUMN IF NOT EXISTS badge_color text;

-- 2. Creación de tablas para reglas de inclusión/exclusión y tiers
CREATE TABLE IF NOT EXISTS promotion_targets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    promotion_id uuid REFERENCES promotions(id) ON DELETE CASCADE,
    target_type text NOT NULL, -- store, category, brand, collection, product, sku, vendor, tag
    target_id text NOT NULL,   -- UUID de producto/categoría o string genérico
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotion_exclusions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    promotion_id uuid REFERENCES promotions(id) ON DELETE CASCADE,
    target_type text NOT NULL, 
    target_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotion_tiers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    promotion_id uuid REFERENCES promotions(id) ON DELETE CASCADE,
    min_quantity integer NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE promotion_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_tiers ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acceso (Lectura pública, Escritura Admin)
CREATE POLICY "Public read promotion_targets" ON promotion_targets FOR SELECT USING (true);
CREATE POLICY "Public read promotion_exclusions" ON promotion_exclusions FOR SELECT USING (true);
CREATE POLICY "Public read promotion_tiers" ON promotion_tiers FOR SELECT USING (true);

CREATE POLICY "Admin write promotion_targets" ON promotion_targets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "Admin write promotion_exclusions" ON promotion_exclusions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "Admin write promotion_tiers" ON promotion_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
