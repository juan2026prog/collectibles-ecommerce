-- 1. Extend abandoned_checkouts
ALTER TABLE abandoned_checkouts 
ADD COLUMN IF NOT EXISTS recovery_email_24h_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recovery_whatsapp_24h_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recovery_48h_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_contact_date timestamptz,
ADD COLUMN IF NOT EXISTS contact_channel text;

-- 2. Create customer_consents table
CREATE TABLE IF NOT EXISTS customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text,
  email_marketing_opt_in boolean DEFAULT false,
  whatsapp_opt_in boolean DEFAULT false,
  source text DEFAULT 'checkout',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access customer_consents" ON customer_consents FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
CREATE POLICY "Public insert customer_consents" ON customer_consents FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own consents" ON customer_consents FOR UPDATE USING (email IN (SELECT email FROM auth.users WHERE id = auth.uid()));

-- 3. Create wishlist_alerts table
CREATE TABLE IF NOT EXISTS wishlist_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid REFERENCES wishlists(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- 'restock', 'price_drop'
  status text DEFAULT 'pending', -- 'pending', 'sent'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wishlist_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access wishlist_alerts" ON wishlist_alerts FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
-- Internal triggers will bypass RLS.

-- 4. Triggers for Wishlist Inteligente
-- Detect Restock (inventory goes from 0 to >0)
CREATE OR REPLACE FUNCTION trigger_wishlist_restock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.inventory_count <= 0 AND NEW.inventory_count > 0 THEN
    -- Insert alert for all users who have this product in their wishlist
    INSERT INTO wishlist_alerts (wishlist_id, alert_type)
    SELECT id, 'restock'
    FROM wishlists
    WHERE product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_wishlist_restock_update ON product_variants;
CREATE TRIGGER trigger_wishlist_restock_update
AFTER UPDATE OF inventory_count ON product_variants
FOR EACH ROW
EXECUTE FUNCTION trigger_wishlist_restock();

-- Detect Price Drop on Base Product
CREATE OR REPLACE FUNCTION trigger_wishlist_price_drop()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.base_price > NEW.base_price THEN
    INSERT INTO wishlist_alerts (wishlist_id, alert_type)
    SELECT id, 'price_drop'
    FROM wishlists
    WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_wishlist_price_drop_update ON products;
CREATE TRIGGER trigger_wishlist_price_drop_update
AFTER UPDATE OF base_price ON products
FOR EACH ROW
EXECUTE FUNCTION trigger_wishlist_price_drop();


-- 5. Update create_order_atomic RPC
DROP FUNCTION IF EXISTS public.create_order_atomic(
  uuid, numeric, text, text, text, text, jsonb, uuid, uuid, jsonb, boolean, timestamp with time zone, text
);

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
  p_items jsonb,
  p_terms_accepted boolean DEFAULT false,
  p_terms_accepted_at timestamp with time zone DEFAULT NULL,
  p_accepted_terms_version text DEFAULT NULL,
  p_email_opt_in boolean DEFAULT false,
  p_whatsapp_opt_in boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_variant_stock integer;
  v_shipping_provider text := NULL;
BEGIN
  -- 1. Verify stock for all items FIRST (within the transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM product_variants
      WHERE id = (v_item->>'variant_id')::uuid
      FOR UPDATE; -- Row-level lock to prevent race conditions

      IF v_variant_stock IS NULL THEN
        RAISE EXCEPTION 'Variante % no encontrada', v_item->>'variant_id';
      END IF;

      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para variante %. Disponible: %, Solicitado: %',
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- Determine logistics provider from shipping address details
  IF p_shipping_address->>'shipping_method' = 'delivery' OR 
     p_shipping_address->>'shipping_method' = 'dac' OR
     p_shipping_address->>'shipping_method' = 'dac_home' OR
     p_shipping_address->>'shipping_method' = 'dac_agency' THEN
    IF p_shipping_address->>'department' = 'Montevideo' THEN
      v_shipping_provider := 'SoyDelivery';
    ELSE
      v_shipping_provider := 'DAC';
    END IF;
  END IF;

  -- 2. Create the order
  INSERT INTO orders (
    customer_id, total_amount, currency, status,
    payment_method, customer_email, customer_phone,
    shipping_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version
  ) VALUES (
    p_customer_id, p_total_amount, p_currency, 'pending',
    p_payment_method, p_customer_email, p_customer_phone,
    p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version
  )
  RETURNING id INTO v_order_id;

  -- 3. Insert all order items (same transaction)
  INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total_price)
  SELECT
    v_order_id,
    (item->>'product_id')::uuid,
    NULLIF(item->>'variant_id', '')::uuid,
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer
  FROM jsonb_array_elements(p_items) AS item;

  -- 4. Mark abandoned checkout as converted if exists
  UPDATE abandoned_checkouts
  SET status = 'converted', updated_at = now()
  WHERE email = p_customer_email AND status = 'abandoned';

  -- 5. Upsert customer consents
  INSERT INTO customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in)
  ON CONFLICT (email) DO UPDATE SET
    phone = EXCLUDED.phone,
    email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
    whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
    updated_at = now();

  -- 6. Return the created order details
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', 'pending',
    'total_amount', p_total_amount,
    'items_count', jsonb_array_length(p_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enable pg_cron and schedule jobs (URL requires manual setup)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- This is a placeholder snippet. Supabase Scheduled Functions or pg_cron should be used.
-- SELECT cron.schedule('invoke-abandoned-carts', '*/15 * * * *', $$
--     SELECT net.http_post(
--         url:='https://<PROJECT_REF>.supabase.co/functions/v1/abandoned-carts-cron',
--         headers:='{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
--     );
-- $$);
