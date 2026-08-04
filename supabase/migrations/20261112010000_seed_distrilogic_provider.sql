-- Migration: Seed Distrilogic as Shipping Provider
-- Date: 2026-08-04

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
  config_required
) VALUES (
  'distrilogic',
  'Distrilogic',
  'active',
  true,
  true,
  true,
  true,
  false,
  false,
  'courier',
  true
)
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
