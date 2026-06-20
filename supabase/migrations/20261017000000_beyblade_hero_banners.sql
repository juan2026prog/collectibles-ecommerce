-- Create schema beyblade if not exists
CREATE SCHEMA IF NOT EXISTS beyblade;

-- Create table for hero banners segmentated by country
CREATE TABLE IF NOT EXISTS beyblade.hero_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge TEXT,
  title_line1 TEXT,
  title_line2 TEXT,
  subtitle TEXT,
  cta_primary_text TEXT,
  cta_primary_url TEXT,
  cta_secondary_text TEXT,
  cta_secondary_url TEXT,
  image_right_url TEXT,
  country_code TEXT NOT NULL, -- 'UY', 'AR', 'LATAM', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE beyblade.hero_banners ENABLE ROW LEVEL SECURITY;

-- Allow public select for active banners
CREATE POLICY "Allow public select for active banners" 
ON beyblade.hero_banners 
FOR SELECT 
USING (is_active = true);

-- Allow all for admin users
CREATE POLICY "Allow all for admin users" 
ON beyblade.hero_banners 
FOR ALL 
TO authenticated 
USING (is_admin()) 
WITH CHECK (is_admin());

-- Grant access permissions for schemas and tables
GRANT USAGE ON SCHEMA beyblade TO anon, authenticated;
GRANT SELECT ON beyblade.hero_banners TO anon, authenticated;
GRANT ALL ON beyblade.hero_banners TO service_role;

-- Seed initial data for UY, AR and LATAM based on official Beyblade styles
INSERT INTO beyblade.hero_banners (
  badge, 
  title_line1, 
  title_line2, 
  subtitle, 
  cta_primary_text, 
  cta_primary_url, 
  cta_secondary_text, 
  cta_secondary_url, 
  image_right_url, 
  country_code, 
  is_active
) VALUES 
(
  'URUGUAY ECOSISTEMA CERTIFICADO', 
  'BEYBLADE X', 
  'URUGUAY', 
  'Prepárate para la aceleración Xtreme. Regístrate oficialmente como competidor, inscríbete en torneos nacionales y escala posiciones hacia la cima del ranking regional.', 
  'UNIRME A LA COMPETENCIA', 
  '/shop?category=beyblade-x', 
  'VER TORNEOS', 
  '/page/torneos', 
  'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/banners/1779596438930-beys.png', 
  'UY', 
  true
),
(
  'LATAM ECOSISTEMA CERTIFICADO', 
  'BEYBLADE X', 
  'LIGA LATAM', 
  'Prepárate para la aceleración Xtreme. Regístrate oficialmente como competidor, inscríbete en torneos nacionales y escala posiciones hacia la cima del ranking regional.', 
  'UNIRME A LA COMPETENCIA', 
  '/shop?category=beyblade-x', 
  'VER TORNEOS', 
  '/page/torneos', 
  'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/banners/1779596438930-beys.png', 
  'LATAM', 
  true
),
(
  'ARGENTINA ECOSISTEMA CERTIFICADO', 
  'BEYBLADE X', 
  'ARGENTINA', 
  'Prepárate para la aceleración Xtreme. Regístrate oficialmente como competidor, inscríbete en torneos nacionales y escala posiciones hacia la cima del ranking regional.', 
  'UNIRME A LA COMPETENCIA', 
  '/shop?category=beyblade-x', 
  'VER TORNEOS', 
  '/page/torneos', 
  'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/banners/1779596438930-beys.png', 
  'AR', 
  true
)
ON CONFLICT DO NOTHING;
