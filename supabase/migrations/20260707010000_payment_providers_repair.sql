CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  environment text DEFAULT 'testing',
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_providers
  ALTER COLUMN is_active SET DEFAULT false,
  ALTER COLUMN environment SET DEFAULT 'testing',
  ALTER COLUMN config SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.payment_providers
  ALTER COLUMN provider_key SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_providers_key
  ON public.payment_providers(provider_key);

DROP POLICY IF EXISTS "Admins manage payment providers" ON public.payment_providers;
CREATE POLICY "Admins manage payment providers" ON public.payment_providers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_providers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_providers (
  provider_key,
  name,
  is_active,
  environment,
  config
) VALUES (
  'handy',
  'Handy',
  false,
  'testing',
  '{}'::jsonb
)
ON CONFLICT (provider_key) DO UPDATE
SET
  name = EXCLUDED.name,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_public_payment_providers()
RETURNS TABLE (
  provider_key text,
  name text,
  is_active boolean,
  environment text,
  config jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    provider_key,
    name,
    is_active,
    environment,
    config
  FROM public.payment_providers
  WHERE is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_providers() TO anon, authenticated;

