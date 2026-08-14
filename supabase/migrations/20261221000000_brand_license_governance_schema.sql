-- Migration: 20261221000000_brand_license_governance_schema.sql
-- Description: Create Master Architecture for Brands (Manufacturers) and Licenses (Franchises), Requests, Aliases, and RLS.

-- 1. Create public.licenses Table
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create public.product_licenses Join Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.product_licenses (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, license_id)
);

CREATE INDEX IF NOT EXISTS idx_product_licenses_product_id ON public.product_licenses(product_id);
CREATE INDEX IF NOT EXISTS idx_product_licenses_license_id ON public.product_licenses(license_id);

-- 3. Enhance public.brands Table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS brand_type TEXT DEFAULT 'manufacturer' CHECK (brand_type IN ('manufacturer', 'generic', 'other')),
ADD COLUMN IF NOT EXISTS is_vendor_selectable BOOLEAN DEFAULT true;

-- Update existing generic brands
UPDATE public.brands 
SET brand_type = 'generic', is_vendor_selectable = false 
WHERE LOWER(TRIM(name)) IN ('genérica', 'generica', 'generic', 'sin marca', 'no brand', 'n/a', 'na', 'desconocido', 'ninguna', '—', '-');

-- 4. Create public.vendor_brand_requests Table
CREATE TABLE IF NOT EXISTS public.vendor_brand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  requested_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'vendor_form' CHECK (source IN ('vendor_form', 'csv_import', 'ml_import')),
  external_brand_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  admin_notes TEXT,
  resolved_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_brand_requests_vendor_id ON public.vendor_brand_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_brand_requests_status ON public.vendor_brand_requests(status);

-- 5. Create public.brand_aliases and public.license_aliases Tables
CREATE TABLE IF NOT EXISTS public.brand_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT UNIQUE NOT NULL,
  canonical_brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT UNIQUE NOT NULL,
  canonical_license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Seed Initial Canonical Licenses
INSERT INTO public.licenses (name, slug, description, is_active, sort_order)
VALUES 
  ('Marvel', 'marvel', 'Universo Marvel Comics y Marvel Studios', true, 1),
  ('Disney', 'disney', 'Clásicos y propiedades Disney', true, 2),
  ('Star Wars', 'star-wars', 'Universo Star Wars Lucasfilm', true, 3),
  ('DC', 'dc', 'Universo DC Comics y Warner Bros', true, 4),
  ('Pokémon', 'pokemon', 'Franquicia Pokémon Nintendo/Game Freak', true, 5),
  ('Sonic', 'sonic', 'Sonic the Hedgehog SEGA', true, 6),
  ('Minecraft', 'minecraft', 'Minecraft Mojang/Microsoft', true, 7),
  ('Roblox', 'roblox', 'Plataforma Roblox', true, 8),
  ('Harry Potter', 'harry-potter', 'Mundo Mágico de Harry Potter', true, 9),
  ('Dragon Ball', 'dragon-ball', 'Dragon Ball Akira Toriyama / Toei', true, 10),
  ('Naruto', 'naruto', 'Naruto Masashi Kishimoto / Pierrot', true, 11),
  ('One Piece', 'one-piece', 'One Piece Eiichiro Oda / Toei', true, 12),
  ('Zelda', 'zelda', 'The Legend of Zelda Nintendo', true, 13)
ON CONFLICT (name) DO NOTHING;

-- Seed License Aliases
INSERT INTO public.license_aliases (alias, canonical_license_id)
SELECT 'MARVEL ENTERTAINMENT', id FROM public.licenses WHERE name = 'Marvel'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.license_aliases (alias, canonical_license_id)
SELECT 'MARVEL STUDIOS', id FROM public.licenses WHERE name = 'Marvel'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.license_aliases (alias, canonical_license_id)
SELECT 'THE WALT DISNEY COMPANY', id FROM public.licenses WHERE name = 'Disney'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.license_aliases (alias, canonical_license_id)
SELECT 'DC COMICS', id FROM public.licenses WHERE name = 'DC'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.license_aliases (alias, canonical_license_id)
SELECT 'POKEMON', id FROM public.licenses WHERE name = 'Pokémon'
ON CONFLICT (alias) DO NOTHING;

-- Seed Brand Aliases
INSERT INTO public.brand_aliases (alias, canonical_brand_id)
SELECT 'HASBRO INC.', id FROM public.brands WHERE LOWER(name) = 'hasbro'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.brand_aliases (alias, canonical_brand_id)
SELECT 'HASBRO INC', id FROM public.brands WHERE LOWER(name) = 'hasbro'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO public.brand_aliases (alias, canonical_brand_id)
SELECT 'FUNKO LLC', id FROM public.brands WHERE LOWER(name) = 'funko'
ON CONFLICT (alias) DO NOTHING;

-- 7. Enable RLS & Configure Policies

-- Licenses
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Licenses viewable by everyone" ON public.licenses;
CREATE POLICY "Licenses viewable by everyone" ON public.licenses
  FOR SELECT USING (is_active = true OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)));

DROP POLICY IF EXISTS "Admins can manage licenses" ON public.licenses;
CREATE POLICY "Admins can manage licenses" ON public.licenses
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Product Licenses
ALTER TABLE public.product_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product licenses viewable by everyone" ON public.product_licenses;
CREATE POLICY "Product licenses viewable by everyone" ON public.product_licenses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product licenses" ON public.product_licenses;
CREATE POLICY "Admins can manage product licenses" ON public.product_licenses
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Vendors can manage product licenses for own products" ON public.product_licenses;
CREATE POLICY "Vendors can manage product licenses for own products" ON public.product_licenses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_licenses.product_id
      AND p.vendor_id = auth.uid()
    )
  );

-- Vendor Brand Requests
ALTER TABLE public.vendor_brand_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendors can view own brand requests" ON public.vendor_brand_requests;
CREATE POLICY "Vendors can view own brand requests" ON public.vendor_brand_requests
  FOR SELECT USING (vendor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Vendors can create brand requests" ON public.vendor_brand_requests;
CREATE POLICY "Vendors can create brand requests" ON public.vendor_brand_requests
  FOR INSERT WITH CHECK (vendor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can manage brand requests" ON public.vendor_brand_requests;
CREATE POLICY "Admins can manage brand requests" ON public.vendor_brand_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Brand & License Aliases
ALTER TABLE public.brand_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aliases viewable by authenticated users" ON public.brand_aliases;
CREATE POLICY "Aliases viewable by authenticated users" ON public.brand_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage brand aliases" ON public.brand_aliases;
CREATE POLICY "Admins manage brand aliases" ON public.brand_aliases FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "License aliases viewable by authenticated users" ON public.license_aliases;
CREATE POLICY "License aliases viewable by authenticated users" ON public.license_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage license aliases" ON public.license_aliases;
CREATE POLICY "Admins manage license aliases" ON public.license_aliases FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
