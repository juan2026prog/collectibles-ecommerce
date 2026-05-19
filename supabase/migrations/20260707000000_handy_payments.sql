-- Handy payment provider, payment ledger, and payment status support

CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'testing' CHECK (environment IN ('testing', 'production')),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

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
  );

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  transaction_external_id text,
  payment_url text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UYU',
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'redirected', 'approved', 'rejected', 'cancelled', 'refunded', 'failed')
  ),
  raw_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_webhook jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text;

UPDATE public.orders
SET payment_status = CASE
  WHEN payment_processed_at IS NOT NULL OR status = 'paid' THEN 'approved'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'pending_payment'
END
WHERE payment_status IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN payment_status SET DEFAULT 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_payment_providers_key ON public.payment_providers(provider_key);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_status ON public.payments(provider, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_external_id
  ON public.payments(transaction_external_id)
  WHERE transaction_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_providers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.payments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_providers (
  provider_key,
  name,
  is_active,
  environment,
  status,
  config
) VALUES (
  'handy',
  'Handy Boton de Pago',
  false,
  'testing',
  'inactive',
  jsonb_build_object(
    'testing_base_url', 'https://api.payments.arriba.uy/api/v2',
    'production_base_url', 'https://api.payments.handy.uy/api/v2',
    'merchant_secret_key', '',
    'commerce_name', 'Collectibles',
    'site_url', '',
    'callback_url', '',
    'currency', 858,
    'response_type', 'Json',
    'default_image_url', '',
    'checkout_text', 'Pagar con Handy'
  )
) ON CONFLICT (provider_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_payment_providers()
RETURNS TABLE (
  provider_key text,
  name text,
  is_active boolean,
  status text,
  environment text,
  checkout_text text,
  default_image_url text,
  currency integer,
  response_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.provider_key,
    p.name,
    p.is_active,
    p.status,
    p.environment,
    COALESCE(p.config->>'checkout_text', p.name) AS checkout_text,
    COALESCE(p.config->>'default_image_url', '') AS default_image_url,
    COALESCE((p.config->>'currency')::integer, 858) AS currency,
    COALESCE(p.config->>'response_type', 'Json') AS response_type
  FROM public.payment_providers p;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_providers() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id uuid,
  p_total_amount numeric,
  p_currency text,
  p_payment_method text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_affiliate_id uuid,
  p_coupon_id uuid,
  p_items jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_variant_stock integer;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid
      FOR UPDATE;

      IF v_variant_stock IS NULL THEN
        RAISE EXCEPTION 'Variante % no encontrada', v_item->>'variant_id';
      END IF;

      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para variante %. Disponible: %, Solicitado: %',
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    customer_id,
    total_amount,
    currency,
    status,
    payment_status,
    payment_method,
    customer_email,
    customer_phone,
    shipping_address,
    affiliate_id,
    coupon_id
  ) VALUES (
    p_customer_id,
    p_total_amount,
    p_currency,
    'pending',
    'pending_payment',
    p_payment_method,
    p_customer_email,
    p_customer_phone,
    p_shipping_address,
    p_affiliate_id,
    p_coupon_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    (item->>'product_id')::uuid,
    NULLIF(item->>'variant_id', '')::uuid,
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', 'pending',
    'payment_status', 'pending_payment',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
