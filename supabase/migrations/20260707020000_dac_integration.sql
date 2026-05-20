-- Migration: DAC Logistics Integration Schema
-- Creates: delivery_providers, dac_sessions, shipments

CREATE TABLE IF NOT EXISTS public.delivery_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'uat' CHECK (environment IN ('uat', 'production')),
  api_url text,
  username text,
  password_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dac_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  k_cliente text NOT NULL,
  k_usuario text NOT NULL,
  rut text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_key text REFERENCES public.delivery_providers(provider_key) ON UPDATE CASCADE,
  tracking_code text,
  external_guide text,
  destination_office text,
  shipping_status text,
  shipping_label_url text,
  shipping_label_base64 text,
  customer_name text,
  customer_phone text,
  customer_address text,
  customer_city text,
  customer_department text,
  package_weight numeric,
  package_quantity integer,
  webhook_payload jsonb DEFAULT '{}'::jsonb,
  provider_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS Enablement
ALTER TABLE public.delivery_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dac_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for delivery_providers
DROP POLICY IF EXISTS "Admins manage delivery providers" ON public.delivery_providers;
CREATE POLICY "Admins manage delivery providers" ON public.delivery_providers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for dac_sessions
DROP POLICY IF EXISTS "Admins manage dac_sessions" ON public.dac_sessions;
CREATE POLICY "Admins manage dac_sessions" ON public.dac_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for shipments
DROP POLICY IF EXISTS "Admins manage shipments" ON public.shipments;
CREATE POLICY "Admins manage shipments" ON public.shipments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users view own shipments" ON public.shipments;
CREATE POLICY "Users view own shipments" ON public.shipments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = shipments.order_id
      AND orders.customer_id = auth.uid()
    )
  );

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.delivery_providers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.delivery_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.shipments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the initial DAC provider
INSERT INTO public.delivery_providers (
  provider_key,
  provider_name,
  is_active,
  environment,
  api_url,
  username,
  password_encrypted
) VALUES (
  'dac',
  'DAC',
  false,
  'uat',
  'https://uat.sge.dac.com.uy:443/JAgencia/JAgencia.asmx',
  '',
  ''
) ON CONFLICT (provider_key) DO NOTHING;

-- Grant permissions for authenticated and anon users or RPCs
GRANT SELECT ON public.delivery_providers TO authenticated;
GRANT SELECT ON public.shipments TO authenticated;

-- Create shipping-labels bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('shipping-labels', 'shipping-labels', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for shipping-labels
DROP POLICY IF EXISTS "Shipping Labels are universally readable" ON storage.objects;
CREATE POLICY "Shipping Labels are universally readable" ON storage.objects FOR SELECT USING (bucket_id = 'shipping-labels');

DROP POLICY IF EXISTS "Admins can manage Shipping Labels" ON storage.objects;
CREATE POLICY "Admins can manage Shipping Labels" ON storage.objects FOR ALL USING (
  bucket_id = 'shipping-labels' AND 
  (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
);
