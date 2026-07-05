-- Migration: Dynamic Shipping Providers & Real Tracking Fields
-- Date: 2026-06-29

-- 1. Create public.shipping_providers table
CREATE TABLE IF NOT EXISTS public.shipping_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'pending_integration', 'test_mode', 'deprecated')),
  is_active boolean NOT NULL DEFAULT false,
  supports_api boolean NOT NULL DEFAULT false,
  supports_labels boolean NOT NULL DEFAULT false,
  supports_tracking boolean NOT NULL DEFAULT false,
  supports_pickup boolean NOT NULL DEFAULT false,
  supports_manual boolean NOT NULL DEFAULT false,
  provider_type text NOT NULL DEFAULT 'courier' CHECK (provider_type IN ('courier', 'pickup', 'manual')),
  logo_url text,
  config_required boolean NOT NULL DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  username text,
  password_encrypted text,
  api_url text,
  environment text DEFAULT 'production' CHECK (environment IN ('uat', 'production')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shipping_providers ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Anyone can select active shipping providers" ON public.shipping_providers;
CREATE POLICY "Anyone can select active shipping providers" ON public.shipping_providers
  FOR SELECT
  USING (true);

-- Admin policies
DROP POLICY IF EXISTS "Admins manage shipping providers" ON public.shipping_providers;
CREATE POLICY "Admins manage shipping providers" ON public.shipping_providers
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

-- Create secure view shipping_providers_admin
CREATE OR REPLACE VIEW public.shipping_providers_admin WITH (security_barrier) AS
SELECT id, code, name, status, is_active, supports_api, supports_labels, supports_tracking, supports_pickup, supports_manual, provider_type, logo_url, config_required, settings, username, api_url, environment, created_at, updated_at
FROM public.shipping_providers
WHERE EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
  AND profiles.is_admin = true
);

GRANT SELECT ON public.shipping_providers_admin TO authenticated;

-- Seed default shipping providers
INSERT INTO public.shipping_providers (
  code, name, status, is_active, supports_api, supports_labels, supports_tracking, supports_pickup, supports_manual, provider_type, config_required
) VALUES
('dac', 'DAC', 'active', true, true, true, true, false, false, 'courier', true),
('soydelivery', 'SoyDelivery', 'active', true, true, false, true, false, false, 'courier', true),
('ues', 'UES', 'pending_integration', false, false, false, false, false, false, 'courier', true),
('correo_uruguayo', 'Correo Uruguayo', 'pending_integration', false, false, false, false, false, false, 'courier', true),
('pickup', 'Retiro en local', 'active', true, false, false, false, true, false, 'pickup', false),
('manual', 'Envío manual', 'active', true, false, false, false, false, true, 'manual', false)
ON CONFLICT (code) DO UPDATE
SET
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  supports_api = EXCLUDED.supports_api,
  supports_labels = EXCLUDED.supports_labels,
  supports_tracking = EXCLUDED.supports_tracking,
  supports_pickup = EXCLUDED.supports_pickup,
  supports_manual = EXCLUDED.supports_manual,
  provider_type = EXCLUDED.provider_type,
  config_required = EXCLUDED.config_required;

-- Migrate existing credentials from delivery_providers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'delivery_providers') THEN
    UPDATE public.shipping_providers sp
    SET
      username = dp.username,
      password_encrypted = dp.password_encrypted,
      api_url = dp.api_url,
      environment = dp.environment,
      settings = COALESCE(dp.settings, '{}'::jsonb)
    FROM public.delivery_providers dp
    WHERE sp.code = dp.provider_key;
  END IF;
END $$;

-- Drop old table and create updatable compatibility view
DROP TABLE IF EXISTS public.delivery_providers CASCADE;

CREATE OR REPLACE VIEW public.delivery_providers AS
SELECT 
  id,
  code AS provider_key,
  name AS provider_name,
  is_active,
  environment,
  api_url,
  username,
  password_encrypted,
  settings,
  created_at,
  updated_at
FROM public.shipping_providers;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_providers TO authenticated;
GRANT SELECT ON public.delivery_providers TO anon;

-- Re-create delivery_providers_admin view to point to shipping_providers_admin or shipping_providers
CREATE OR REPLACE VIEW public.delivery_providers_admin WITH (security_barrier) AS
SELECT id, code AS provider_key, name AS provider_name, is_active, environment, api_url, username, settings, created_at, updated_at
FROM public.shipping_providers
WHERE EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
  AND profiles.is_admin = true
);

GRANT SELECT ON public.delivery_providers_admin TO authenticated;

-- 2. Modify shipments table to support internal reference & link to shipping_providers
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS internal_reference TEXT;

-- Safely drop old foreign key pointing to delivery_providers if it exists
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'shipments' 
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%provider_key%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.shipments DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Add foreign key constraint to shipping_providers
ALTER TABLE public.shipments
  ADD CONSTRAINT fk_shipments_provider_key
  FOREIGN KEY (provider_key)
  REFERENCES public.shipping_providers(code)
  ON UPDATE CASCADE;

-- 3. Cleanup existing fake/mock tracking codes in shipments table
-- A. Move UES-xxxx, COL-xxxx, SHIP-xxxx, ORDER-xxxx, TRACK-xxxx, TEST, MOCK values to internal_reference
UPDATE public.shipments
SET
  internal_reference = tracking_code,
  tracking_code = NULL,
  shipping_status = 'pending_real_tracking'
WHERE
  tracking_code LIKE 'UES-%' OR
  tracking_code LIKE 'COL-%' OR
  tracking_code LIKE 'SHIP-%' OR
  tracking_code LIKE 'ORDER-%' OR
  tracking_code LIKE 'TRACK-%' OR
  LOWER(tracking_code) LIKE 'test%' OR
  LOWER(tracking_code) LIKE 'mock%';

-- B. Move UUIDs to internal_reference (UUID regex)
UPDATE public.shipments
SET
  internal_reference = tracking_code,
  tracking_code = NULL,
  shipping_status = 'pending_real_tracking'
WHERE
  tracking_code ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 4. Update order_suborders to support internal reference mapping and clear fake tracking
UPDATE public.order_suborders
SET
  tracking_number = NULL,
  shipping_status = 'pending_real_tracking'
WHERE
  tracking_number LIKE 'UES-%' OR
  tracking_number LIKE 'COL-%' OR
  tracking_number LIKE 'SHIP-%' OR
  tracking_number LIKE 'ORDER-%' OR
  tracking_number LIKE 'TRACK-%' OR
  LOWER(tracking_number) LIKE 'test%' OR
  LOWER(tracking_number) LIKE 'mock%';

-- 5. Revoke select privilege on shipping_providers from public and authenticated direct access to base table credentials
REVOKE SELECT ON public.shipping_providers FROM public, anon, authenticated;
GRANT SELECT ON public.shipping_providers_admin TO authenticated;

-- Allow edge functions (which use service_role) or authenticated admin to manage
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_providers TO authenticated;
