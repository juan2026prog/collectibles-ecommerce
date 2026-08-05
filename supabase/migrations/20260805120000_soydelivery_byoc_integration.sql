-- Migration: Enforce BYOC Model for SoyDelivery / Flex integration
-- Path: supabase/migrations/20260805120000_soydelivery_byoc_integration.sql

-- 1. Ensure SoyDelivery in shipping_providers is configured as BYOC vendor integration
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
  'soydelivery',
  'SoyDelivery / Flex',
  'active',
  true,
  true,
  false,
  true,
  false,
  false,
  'courier',
  true
)
ON CONFLICT (code) DO UPDATE
SET
  name = 'SoyDelivery / Flex',
  status = 'active',
  is_active = true,
  supports_api = true,
  supports_tracking = true,
  config_required = true;

-- 2. Add comment documenting SoyDelivery BYOC rules
COMMENT ON TABLE public.shipping_providers IS 'Shipping providers registry. SoyDelivery and Distrilogic require vendor BYOC credentials in vendor_shipping_connections.';
