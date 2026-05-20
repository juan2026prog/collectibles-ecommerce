-- Migration: Secure Delivery Providers and Shipping Rules

-- 1. Create a secure view for admins (excludes password_encrypted)
CREATE OR REPLACE VIEW public.delivery_providers_admin WITH (security_barrier) AS
SELECT id, provider_key, provider_name, is_active, environment, api_url, username, created_at, updated_at
FROM public.delivery_providers
WHERE EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
  AND profiles.is_admin = true
);

-- Grant select privilege on the view to authenticated users (who will be filtered by the WHERE clause)
GRANT SELECT ON public.delivery_providers_admin TO authenticated;

-- 2. Revoke direct select privileges on the base table to prevent credential scraping
REVOKE SELECT ON public.delivery_providers FROM public, anon, authenticated;

-- Ensure RLS is active
ALTER TABLE public.delivery_providers ENABLE ROW LEVEL SECURITY;

-- Drop old general policies
DROP POLICY IF EXISTS "Admins manage delivery providers" ON public.delivery_providers;

-- Allow admins to insert/update/delete on the base table
CREATE POLICY "Admins manage delivery_providers" ON public.delivery_providers
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

-- 3. Secure shipping_rules
ALTER TABLE public.shipping_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select shipping_rules" ON public.shipping_rules;
CREATE POLICY "Anyone can select shipping_rules" ON public.shipping_rules
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage shipping_rules" ON public.shipping_rules;
CREATE POLICY "Admins manage shipping_rules" ON public.shipping_rules
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
