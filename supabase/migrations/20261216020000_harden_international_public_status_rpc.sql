-- Migration: harden_international_public_status_rpc
-- Timestamp: 20261216020000

-- 1. Ensure fully qualified table access, search_path isolation, and minimal return object
CREATE OR REPLACE FUNCTION public.get_international_public_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'international_public_enabled', COALESCE((SELECT s.international_public_enabled FROM public.international_sync_settings s WHERE s.id = 1), false),
    'international_purchases_enabled', COALESCE((SELECT s.international_purchases_enabled FROM public.international_sync_settings s WHERE s.id = 1), true)
  );
$$;

-- 2. Revoke execute from PUBLIC and grant strictly to required roles (anon, authenticated)
REVOKE ALL ON FUNCTION public.get_international_public_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_international_public_status() TO anon, authenticated;

-- 3. Confirm RLS on international_sync_settings prevents any direct anon reads
ALTER TABLE public.international_sync_settings ENABLE ROW LEVEL SECURITY;
