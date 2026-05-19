-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT-03: Secure site_settings — Restrict secret keys to admin-only
-- Applied: 2026-05-14
-- 
-- PROBLEM: RLS policy "Anyone can read site settings" allows anonymous
-- users to read ALL keys including payment tokens, API secrets, etc.
--
-- SOLUTION: Replace the blanket SELECT policy with a conditional one:
-- - Public keys (appearance, store info, social, toggles) → readable by all
-- - Secret keys (payment tokens, API keys, credentials) → admin-only
-- ══════════════════════════════════════════════════════════════

-- Step 1: Drop the old permissive policy
DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;

-- Step 2: Create a new policy that filters based on key patterns
-- Public users can only read non-sensitive settings
CREATE POLICY "Public can read non-secret settings" ON public.site_settings
  FOR SELECT
  USING (
    -- Allow if the user is an admin (can read everything)
    (EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    ))
    OR
    -- Allow if the key is NOT a secret pattern
    (
      key NOT LIKE 'payments_%_access_token%'
      AND key NOT LIKE 'payments_%_secret%'
      AND key NOT LIKE 'payments_%_client_secret%'
      AND key NOT LIKE 'payments_mercadopago_access_token%'
      AND key NOT LIKE 'payments_paypal_secret_key%'
      AND key NOT LIKE 'payments_dlocal_go_secret_key%'
      AND key NOT LIKE 'payments_dlocal_go_x_login%'
      AND key NOT LIKE 'mercadolibre_access_token%'
      AND key NOT LIKE 'mercadolibre_refresh_token%'
      AND key NOT LIKE 'shipping_%_api_key%'
      AND key NOT LIKE 'shipping_%_clave%'
      AND key NOT LIKE 'resend_%_key%'
      AND key NOT LIKE 'meta_capi_%_token%'
      AND key NOT LIKE 'gemini_%_key%'
      AND key NOT LIKE 'whatsapp_%_token%'
    )
  );

-- Step 3: Ensure the admin full-access policy still exists
-- (It should already exist from the original migration, but ensure it)
DROP POLICY IF EXISTS "Admins manage site settings" ON public.site_settings;
CREATE POLICY "Admins manage site settings" ON public.site_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
