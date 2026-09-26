-- Migration: SkyPostal Phase 1 Foundation & International Markets
-- Purpose: Create international_markets table, register skypostal provider, harden shipment_events RLS, and secure sync cron.

-- 1. Create international_markets table
CREATE TABLE IF NOT EXISTS public.international_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  currency text NOT NULL,
  logistics_mode text NOT NULL CHECK (logistics_mode IN ('IMPORT_HUB', 'SKYPOSTAL')),
  market_status text NOT NULL DEFAULT 'DISABLED' CHECK (market_status IN ('DISABLED', 'PREVIEW', 'SANDBOX', 'LIVE')),
  public_enabled boolean NOT NULL DEFAULT false,
  checkout_enabled boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'skypostal',
  provider_environment text NOT NULL DEFAULT 'test' CHECK (provider_environment IN ('test', 'production')),
  preview_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on international_markets
ALTER TABLE public.international_markets ENABLE ROW LEVEL SECURITY;

-- Anyone can read markets to resolve destination rules
DROP POLICY IF EXISTS "Public can view international_markets" ON public.international_markets;
CREATE POLICY "Public can view international_markets" ON public.international_markets
  FOR SELECT
  USING (true);

-- Only Admins can modify international_markets
DROP POLICY IF EXISTS "Admins manage international_markets" ON public.international_markets;
CREATE POLICY "Admins manage international_markets" ON public.international_markets
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

-- Seed initial markets
INSERT INTO public.international_markets (
  country_code,
  country_name,
  currency,
  logistics_mode,
  market_status,
  public_enabled,
  checkout_enabled,
  provider,
  provider_environment,
  preview_enabled,
  sort_order,
  metadata
) VALUES
  ('UY', 'Uruguay', 'UYU', 'IMPORT_HUB', 'LIVE', true, true, 'import_hub', 'production', true, 1, '{"flag": "🇺🇾", "tax_regime": "franquicia_uruguay"}'::jsonb),
  ('AR', 'Argentina', 'ARS', 'IMPORT_HUB', 'LIVE', true, true, 'import_hub', 'production', true, 2, '{"flag": "🇦🇷", "tax_regime": "franquicia_argentina"}'::jsonb),
  ('CL', 'Chile', 'CLP', 'SKYPOSTAL', 'PREVIEW', false, false, 'skypostal', 'test', true, 3, '{"flag": "🇨🇱", "target_tier": "tier_1", "notes": "SkyPostal Phase 1 Lead Market"}'::jsonb),
  ('PE', 'Perú', 'PEN', 'SKYPOSTAL', 'PREVIEW', false, false, 'skypostal', 'test', true, 4, '{"flag": "🇵🇪", "target_tier": "tier_2"}'::jsonb),
  ('BR', 'Brasil', 'BRL', 'SKYPOSTAL', 'PREVIEW', false, false, 'skypostal', 'test', true, 5, '{"flag": "🇧🇷", "target_tier": "tier_2"}'::jsonb),
  ('CO', 'Colombia', 'COP', 'SKYPOSTAL', 'PREVIEW', false, false, 'skypostal', 'test', true, 6, '{"flag": "🇨🇴", "target_tier": "tier_2"}'::jsonb),
  ('EC', 'Ecuador', 'USD', 'SKYPOSTAL', 'PREVIEW', false, false, 'skypostal', 'test', true, 7, '{"flag": "🇪🇨", "target_tier": "tier_2"}'::jsonb),
  ('MX', 'México', 'MXN', 'SKYPOSTAL', 'DISABLED', false, false, 'skypostal', 'test', false, 8, '{"flag": "🇲🇽", "target_tier": "tier_3", "notes": "Disabled pending future certification"}'::jsonb)
ON CONFLICT (country_code) DO UPDATE SET
  country_name = EXCLUDED.country_name,
  currency = EXCLUDED.currency,
  logistics_mode = EXCLUDED.logistics_mode,
  provider = EXCLUDED.provider,
  updated_at = now();

-- 2. Register skypostal provider in shipping_providers
INSERT INTO public.shipping_providers (
  code,
  name,
  status,
  is_active,
  supports_api,
  supports_labels,
  supports_tracking,
  supports_pickup,
  supports_manual,
  provider_type,
  config_required,
  environment,
  supports_international,
  settings
) VALUES (
  'skypostal',
  'SkyPostal',
  'test_mode',
  false,
  true,
  true,
  true,
  false,
  false,
  'courier',
  true,
  'uat',
  true,
  '{"global_kill_switch": false, "default_environment": "test"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  supports_international = true,
  updated_at = now();

-- 3. Security Hardening on shipment_events
-- Drop open policy: "Anyone authenticated can view shipment_events"
DROP POLICY IF EXISTS "Anyone authenticated can view shipment_events" ON public.shipment_events;

-- Strict customer view policy: Customer can only view shipment_events of their own orders
DROP POLICY IF EXISTS "Customers view own shipment_events" ON public.shipment_events;
CREATE POLICY "Customers view own shipment_events" ON public.shipment_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.orders o ON o.id = s.order_id
      WHERE s.id = shipment_events.shipment_id
      AND o.customer_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.order_suborders so ON so.id = s.suborder_id
      JOIN public.orders o ON o.id = so.parent_order_id
      WHERE s.id = shipment_events.shipment_id
      AND o.customer_id = auth.uid()
    )
  );

-- Strict vendor view policy: Vendor can only view shipment_events of their own suborders
DROP POLICY IF EXISTS "Vendors view own suborder shipment_events" ON public.shipment_events;
CREATE POLICY "Vendors view own suborder shipment_events" ON public.shipment_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.order_suborders so ON so.id = s.suborder_id
      WHERE s.id = shipment_events.shipment_id
      AND so.vendor_id = auth.uid()
    )
  );

-- Strict admin view and manage policy
DROP POLICY IF EXISTS "Admins manage shipment_events" ON public.shipment_events;
CREATE POLICY "Admins manage shipment_events" ON public.shipment_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- 4. Restrict logistics_rules and shipping_monitor RLS from open authenticated
DROP POLICY IF EXISTS "Anyone can view rules" ON public.logistics_rules;
CREATE POLICY "Admins view logistics_rules" ON public.logistics_rules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Anyone can view monitor" ON public.shipping_monitor;
CREATE POLICY "Admins view shipping_monitor" ON public.shipping_monitor
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
