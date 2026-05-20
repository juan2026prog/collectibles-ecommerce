-- Migration: DAC Get Cost Integration Schema
-- Creates: dac_offices table, adds settings column to delivery_providers

-- 1. Add settings column to delivery_providers if not exists
ALTER TABLE public.delivery_providers ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- 2. Update secure view delivery_providers_admin to include settings
CREATE OR REPLACE VIEW public.delivery_providers_admin WITH (security_barrier) AS
SELECT id, provider_key, provider_name, is_active, environment, api_url, username, settings, created_at, updated_at
FROM public.delivery_providers
WHERE EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
  AND profiles.is_admin = true
);

-- 3. Create dac_offices table
CREATE TABLE IF NOT EXISTS public.dac_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  k_oficina integer NOT NULL UNIQUE,
  office_name text NOT NULL,
  department text NOT NULL,
  city text NOT NULL,
  locality text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for dac_offices
ALTER TABLE public.dac_offices ENABLE ROW LEVEL SECURITY;

-- Admins manage dac_offices
DROP POLICY IF EXISTS "Admins manage dac_offices" ON public.dac_offices;
CREATE POLICY "Admins manage dac_offices" ON public.dac_offices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Authenticated and anon users can select dac_offices
DROP POLICY IF EXISTS "Anyone can view active dac_offices" ON public.dac_offices;
CREATE POLICY "Anyone can view active dac_offices" ON public.dac_offices
  FOR SELECT
  USING (is_active = true);

-- 4. Seed the initial default Montevideo office (601)
INSERT INTO public.dac_offices (
  k_oficina,
  office_name,
  department,
  city,
  locality,
  is_active
) VALUES (
  601,
  'DAC Montevideo Centro',
  'Montevideo',
  'Montevideo',
  'Centro',
  true
) ON CONFLICT (k_oficina) DO NOTHING;

-- Grant permissions for dac_offices
GRANT SELECT ON public.dac_offices TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.dac_offices TO authenticated;
