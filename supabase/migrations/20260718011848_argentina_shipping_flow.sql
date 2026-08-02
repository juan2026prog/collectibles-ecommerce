-- Migration: Argentina Shipping Flow Setup
-- Date: 2026-07-18

-- 1. Extend public.orders and public.customer_consents with logistics consent
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS logistics_consent boolean DEFAULT false;
ALTER TABLE public.customer_consents ADD COLUMN IF NOT EXISTS logistics_consent_opt_in boolean DEFAULT false;

-- 2. Insert site setting for USD international pricing mode
INSERT INTO public.site_settings (key, value) 
VALUES ('international_usd_mode', 'true') 
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Create public.mbe_shipping_logs table
CREATE TABLE IF NOT EXISTS public.mbe_shipping_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number text NOT NULL,
    sent_at timestamptz DEFAULT now(),
    recipient text NOT NULL,
    subject text NOT NULL,
    file_name text NOT NULL,
    status text NOT NULL CHECK (status IN ('Pendiente de enviar a logística', 'Enviado a MBE', 'Error al enviar a MBE', 'Reenviado a MBE')),
    attempts integer DEFAULT 1,
    error_message text,
    email_provider_id text,
    file_size integer,
    file_checksum text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.mbe_shipping_logs ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE public.mbe_shipping_logs ADD COLUMN IF NOT EXISTS file_checksum text;

-- Enable RLS on mbe_shipping_logs
ALTER TABLE public.mbe_shipping_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins manage mbe_shipping_logs" ON public.mbe_shipping_logs;
CREATE POLICY "Admins manage mbe_shipping_logs" ON public.mbe_shipping_logs
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 4. Create public.international_shipment_tracking table
CREATE TABLE IF NOT EXISTS public.international_shipment_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    tracking_number text NOT NULL,
    tracking_url text,
    courier_company text NOT NULL,
    picked_up_at timestamptz,
    estimated_delivery date,
    contact_phone text,
    contact_email text,
    observations text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS on international_shipment_tracking
ALTER TABLE public.international_shipment_tracking ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins manage international_shipment_tracking" ON public.international_shipment_tracking;
CREATE POLICY "Admins manage international_shipment_tracking" ON public.international_shipment_tracking
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

DROP POLICY IF EXISTS "Customers view own international_shipment_tracking" ON public.international_shipment_tracking;
CREATE POLICY "Customers view own international_shipment_tracking" ON public.international_shipment_tracking
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND customer_id = auth.uid())
    );

-- 5. Create daily_order_counters table
CREATE TABLE IF NOT EXISTS public.daily_order_counters (
    day date PRIMARY KEY,
    counter integer NOT NULL DEFAULT 0
);

-- Enable RLS on daily_order_counters
ALTER TABLE public.daily_order_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage daily_order_counters" ON public.daily_order_counters;
CREATE POLICY "Admins manage daily_order_counters" ON public.daily_order_counters
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 6. Create logistics_outbox table
CREATE TABLE IF NOT EXISTS public.logistics_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'retry_scheduled')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    next_attempt_at timestamptz DEFAULT now() NOT NULL,
    file_size integer,
    file_checksum text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS on logistics_outbox
ALTER TABLE public.logistics_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage logistics_outbox" ON public.logistics_outbox;
CREATE POLICY "Admins manage logistics_outbox" ON public.logistics_outbox
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 7. Recreate public.create_order_atomic to support Argentina order number formats and consent column
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_shipping_address JSONB,
  p_affiliate_id UUID,
  p_coupon_id UUID,
  p_items JSONB,
  p_suborders JSONB,
  p_terms_accepted BOOLEAN DEFAULT false,
  p_terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_accepted_terms_version TEXT DEFAULT NULL,
  p_email_opt_in BOOLEAN DEFAULT false,
  p_whatsapp_opt_in BOOLEAN DEFAULT false,
  p_logistics_consent BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_suborder JSONB;
  v_suborder_idx INTEGER := 0;
  v_suborder_id UUID;
  v_variant_stock INTEGER;
  v_shipping_provider TEXT := NULL;
  
  -- Financial consolidations
  v_subtotal_products NUMERIC := 0;
  v_total_shipping NUMERIC := 0;
  v_total_discounts NUMERIC := 0;
  
  v_cust_first_name TEXT;
  v_cust_last_name TEXT;
  v_customer_name TEXT;
  
  -- Reservation fields
  v_reservation_minutes INTEGER;
  v_reserved_until TIMESTAMPTZ;
  v_is_preorder BOOLEAN := false;
  v_has_any_preorder BOOLEAN := false;
  v_order_item_id UUID;
  
  -- Concurrent counter
  v_counter_val INTEGER;
BEGIN
  -- Verify stock for all items FIRST (within the transaction, counting active reservations)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      -- Lock the variant row to prevent concurrent modifications
      PERFORM 1 FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;

      -- Calculate available stock = physical stock - active reservations
      SELECT (
        inventory_count - COALESCE(
          (SELECT SUM(quantity) FROM public.stock_reservations WHERE variant_id = (v_item->>'variant_id')::uuid AND status = 'active' AND reserved_until > now()), 
          0
        )
      ) INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid;
      
      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para la variante %: disponible %, solicitado %', 
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- Get reservation minutes from site_settings or use defaults
  SELECT (CASE WHEN value ~ '^[0-9]+$' THEN value::integer ELSE NULL END) INTO v_reservation_minutes
  FROM public.site_settings
  WHERE key = 'payment_reservation_minutes_' || p_payment_method;
  
  IF v_reservation_minutes IS NULL THEN
    IF p_payment_method = 'manual' THEN
      v_reservation_minutes := 1440; -- 24 hours
    ELSE
      v_reservation_minutes := 30; -- 30 minutes
    END IF;
  END IF;
  
  v_reserved_until := now() + (v_reservation_minutes || ' minutes')::interval;

  -- 1. Generate unique, concurrent-safe order number using daily_order_counters (COL-YYYYMMDD-XXXX or AR-YYYYMMDD-XXXX)
  INSERT INTO public.daily_order_counters (day, counter)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day)
  DO UPDATE SET counter = daily_order_counters.counter + 1
  RETURNING counter INTO v_counter_val;

  IF LOWER(p_shipping_address->>'country') = 'argentina' OR LOWER(p_shipping_address->>'country') = 'ar' THEN
    v_order_number := 'AR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  ELSE
    v_order_number := 'COL-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_counter_val::text, 4, '0');
  END IF;

  -- 2. Consolidate financial totals from suborders
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    v_subtotal_products := v_subtotal_products + COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00);
    v_total_shipping := v_total_shipping + COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00);
    v_total_discounts := v_total_discounts + COALESCE((v_suborder->>'discount_total')::numeric, 0.00);
    
    IF v_shipping_provider IS NULL AND v_suborder->>'shipping_provider' IS NOT NULL THEN
      v_shipping_provider := v_suborder->>'shipping_provider';
    END IF;
  END LOOP;

  -- 3. Resolve customer name
  v_cust_first_name := p_shipping_address->>'first_name';
  v_cust_last_name := p_shipping_address->>'last_name';
  v_customer_name := TRIM(COALESCE(v_cust_first_name, '') || ' ' || COALESCE(v_cust_last_name, ''));
  IF v_customer_name = '' THEN
    v_customer_name := 'Cliente';
  END IF;

  -- 4. Create master order (initial status: awaiting_payment, payment_status: not_started)
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts,
    preorder_status, logistics_consent
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'awaiting_payment', 'not_started',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts,
    'not_applicable', p_logistics_consent
  )
  RETURNING id INTO v_order_id;

  -- 5. Create suborders and linked items
  FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
  LOOP
    DECLARE
      v_suborder_number TEXT;
      v_vendor_id UUID;
      v_vendor_store_id UUID;
      v_vendor_store_name TEXT;
      v_is_collectibles BOOLEAN;
      v_suborder_id UUID;
      
      -- New logistical fields
      v_seller_type TEXT;
      v_shipping_mode TEXT;
      v_pickup_type TEXT;
      v_agency_id UUID;
      v_agency_name TEXT;
      v_dispatch_address_id UUID;
      v_internal_reference TEXT;
    BEGIN
      v_suborder_number := v_order_number || '-' || chr(65 + v_suborder_idx);
      v_suborder_idx := v_suborder_idx + 1;
      
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
      v_vendor_store_name := v_suborder->>'vendor_store_name';
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);
      
      -- Resolve new logistical fields from JSON
      v_seller_type := COALESCE(v_suborder->>'seller_type', CASE WHEN v_is_collectibles THEN 'platform' ELSE 'vendor' END);
      v_shipping_mode := v_suborder->>'shipping_mode';
      v_pickup_type := v_suborder->>'pickup_type';
      v_agency_id := NULLIF(v_suborder->>'agency_id', '')::uuid;
      v_agency_name := v_suborder->>'agency_name';
      v_dispatch_address_id := NULLIF(v_suborder->>'dispatch_address_id', '')::uuid;
      v_internal_reference := COALESCE(v_suborder->>'internal_reference', v_suborder_number);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, vendor_store_id, vendor_store_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, payment_fee_share, vendor_gross_amount,
        vendor_net_amount, liquidation_status, status, discount_total,
        shipping_charged_to_customer, shipping_provider_cost, shipping_paid_by, shipping_billing_mode,
        shipping_margin, shipping_provider_invoice_status,
        seller_type, shipping_mode, pickup_type, agency_id, agency_name, dispatch_address_id, internal_reference
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_vendor_store_id, v_suborder->>'vendor_store_name', v_is_collectibles,
        (v_suborder->>'product_subtotal')::numeric, v_suborder->>'shipping_method', 
        v_suborder->>'shipping_provider', (v_suborder->>'shipping_cost')::numeric, 'pending',
        (v_suborder->>'marketplace_commission_rate')::numeric, (v_suborder->>'marketplace_fee')::numeric,
        0.00,
        (v_suborder->>'vendor_gross_amount')::numeric, (v_suborder->>'vendor_net_amount')::numeric,
        'pending', 'pending', COALESCE((v_suborder->>'discount_total')::numeric, 0.00),
        COALESCE((v_suborder->>'shipping_charged_to_customer')::numeric, 0.00),
        COALESCE((v_suborder->>'shipping_provider_cost')::numeric, 0.00),
        COALESCE(v_suborder->>'shipping_paid_by', 'collectibles'),
        COALESCE(v_suborder->>'shipping_billing_mode', 'collectibles_envios'),
        COALESCE((v_suborder->>'shipping_margin')::numeric, 0.00),
        COALESCE(v_suborder->>'shipping_provider_invoice_status', 'pending'),
        v_seller_type, v_shipping_mode, v_pickup_type, v_agency_id, v_agency_name, v_dispatch_address_id, v_internal_reference
      )
      RETURNING id INTO v_suborder_id;

      -- Insert items belonging to this suborder
      FOR v_item IN 
        SELECT * FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'vendor_id' = v_vendor_id::text) 
           OR (v_vendor_id IS NULL AND item->>'vendor_id' IS NULL)
      LOOP
        INSERT INTO public.order_items (
          order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
          quantity, unit_price, total_price, product_name, sku, discount_total, final_total
        ) VALUES (
          v_order_id,
          v_suborder_id,
          (v_item->>'product_id')::uuid,
          NULLIF(v_item->>'variant_id', '')::uuid,
          v_vendor_id,
          NULLIF(v_item->>'vendor_store_id', '')::uuid,
          (v_item->>'quantity')::integer,
          (v_item->>'unit_price')::numeric,
          (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer,
          v_item->>'product_name',
          v_item->>'sku',
          COALESCE((v_item->>'discount_total')::numeric, 0.00),
          COALESCE((v_item->>'final_total')::numeric, 0.00)
        ) RETURNING id INTO v_order_item_id;

        -- Check if it is a preorder item
        SELECT EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = (v_item->>'product_id')::uuid
            AND (
              p.badge ILIKE '%preorder%' 
              OR p.badge ILIKE '%preventa%'
              OR EXISTS (
                SELECT 1 FROM public.badges b 
                WHERE (b.id::text = p.badge OR b.slug = p.badge)
                  AND (b.slug ILIKE '%preorder%' OR b.label ILIKE '%preorder%' OR b.label ILIKE '%preventa%')
              )
            )
        ) INTO v_is_preorder;

        IF v_is_preorder THEN
          v_has_any_preorder := true;
          
          INSERT INTO public.preorder_items (
            order_item_id,
            product_id,
            customer_id,
            status,
            estimated_arrival
          ) VALUES (
            v_order_item_id,
            (v_item->>'product_id')::uuid,
            p_customer_id,
            'awaiting_payment',
            now() + interval '30 days'
          );
        END IF;

        -- Create temporary stock reservation instead of physical decrement
        IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
          INSERT INTO public.stock_reservations (
            order_id,
            variant_id,
            quantity,
            reserved_until
          ) VALUES (
            v_order_id,
            (v_item->>'variant_id')::uuid,
            (v_item->>'quantity')::integer,
            v_reserved_until
          );
        END IF;
      END LOOP;

    END;
  END LOOP;

  -- If any preorder is present, update order preorder_status to awaiting_payment
  IF v_has_any_preorder THEN
    UPDATE public.orders
    SET preorder_status = 'awaiting_payment'
    WHERE id = v_order_id;
  END IF;

  -- Insert/update customer marketing and logistics consents
  INSERT INTO public.customer_consents (email, phone, email_marketing_opt_in, whatsapp_opt_in, logistics_consent_opt_in)
  VALUES (p_customer_email, p_customer_phone, p_email_opt_in, p_whatsapp_opt_in, p_logistics_consent)
  ON CONFLICT (email) DO UPDATE
  SET phone = EXCLUDED.phone,
      email_marketing_opt_in = EXCLUDED.email_marketing_opt_in,
      whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
      logistics_consent_opt_in = EXCLUDED.logistics_consent_opt_in,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Add outbox triggers and hooks

-- Trigger Function: Create Outbox Entry
CREATE OR REPLACE FUNCTION public.trg_fn_create_logistics_outbox_entry()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'paid' OR NEW.payment_status = 'approved') 
     AND (OLD.status IS DISTINCT FROM 'paid' AND OLD.payment_status IS DISTINCT FROM 'approved') -- transition to paid
     AND (LOWER(NEW.shipping_address->>'country') = 'argentina' OR LOWER(NEW.shipping_address->>'country') = 'ar') THEN
     
     INSERT INTO public.logistics_outbox (order_id, status)
     VALUES (NEW.id, 'pending')
     ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create Outbox Entry
DROP TRIGGER IF EXISTS trg_create_logistics_outbox_entry ON public.orders;
CREATE TRIGGER trg_create_logistics_outbox_entry
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_create_logistics_outbox_entry();

-- Trigger Function: Process Outbox Entry (via pg_net async call to edge function)
CREATE OR REPLACE FUNCTION public.trg_fn_process_logistics_outbox()
RETURNS TRIGGER AS $$
DECLARE
  v_payload jsonb;
  v_headers jsonb;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status IN ('pending', 'retry_scheduled')) OR
     (TG_OP = 'UPDATE' AND NEW.status IN ('pending', 'retry_scheduled') AND OLD.status IS DISTINCT FROM NEW.status) THEN
     
     v_payload := jsonb_build_object(
       'action', 'process_outbox',
       'order_id', NEW.order_id
     );
     
     v_headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'x-mbe-logistics-bypass', 'collectibles-mbe-logistics-secret'
     );
     
     PERFORM net.http_post(
       url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/mbe-logistics',
       headers := v_headers,
       body := v_payload
     );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Process Outbox Entry
DROP TRIGGER IF EXISTS trg_process_logistics_outbox ON public.logistics_outbox;
CREATE TRIGGER trg_process_logistics_outbox
  AFTER INSERT OR UPDATE OF status ON public.logistics_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_process_logistics_outbox();
