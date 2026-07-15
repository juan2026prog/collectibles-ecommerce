-- Migration: Checkout Package Shipping V2 columns and updated create_order_atomic RPC
-- Path: supabase/migrations/20261210000000_checkout_package_shipping_v2.sql

-- 1. Add new logistical columns to order_suborders if they do not exist
ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS seller_type TEXT CHECK (seller_type IN ('platform', 'vendor')),
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT CHECK (shipping_mode IN ('home', 'agency', 'pickup')),
  ADD COLUMN IF NOT EXISTS pickup_type TEXT,
  ADD COLUMN IF NOT EXISTS agency_id UUID,
  ADD COLUMN IF NOT EXISTS agency_name TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_address_id UUID,
  ADD COLUMN IF NOT EXISTS internal_reference TEXT;

-- 2. Re-create create_order_atomic function with suborder JSON parsing for the new fields
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
  p_whatsapp_opt_in BOOLEAN DEFAULT false
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
BEGIN
  -- Verify stock for all items FIRST (within the transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
      SELECT inventory_count INTO v_variant_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid
      FOR UPDATE;
      
      IF v_variant_stock < (v_item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Stock insuficiente para la variante %: disponible %, solicitado %', 
          v_item->>'variant_id', v_variant_stock, v_item->>'quantity';
      END IF;
    END IF;
  END LOOP;

  -- 1. Generate unique order number (COL-YYYYMMDD-XXXX)
  SELECT 'COL-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(coalesce(count(*)+1, 1)::text, 4, '0')
  INTO v_order_number
  FROM public.orders
  WHERE created_at::date = now()::date;

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

  -- 4. Create master order
  INSERT INTO public.orders (
    customer_id, order_number, total_amount, currency, status, payment_status,
    payment_method, payment_provider, customer_email, customer_phone, customer_name,
    shipping_address, billing_address, affiliate_id, coupon_id,
    shipping_provider, terms_accepted, terms_accepted_at,
    accepted_terms_version, subtotal_products, total_shipping, total_discounts
  ) VALUES (
    p_customer_id, v_order_number, p_total_amount, p_currency, 'pending', 'pending_payment',
    p_payment_method, p_payment_method, p_customer_email, p_customer_phone, v_customer_name,
    p_shipping_address, p_shipping_address, p_affiliate_id, p_coupon_id,
    v_shipping_provider, p_terms_accepted, p_terms_accepted_at,
    p_accepted_terms_version, v_subtotal_products, v_total_shipping, v_total_discounts
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
      INSERT INTO public.order_items (
        order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
        quantity, unit_price, total_price, product_name, sku, discount_total, final_total
      )
      SELECT
        v_order_id,
        v_suborder_id,
        (item->>'product_id')::uuid,
        NULLIF(item->>'variant_id', '')::uuid,
        v_vendor_id,
        NULLIF(item->>'vendor_store_id', '')::uuid,
        (item->>'quantity')::integer,
        (item->>'unit_price')::numeric,
        (item->>'unit_price')::numeric * (item->>'quantity')::integer,
        item->>'product_name',
        item->>'sku',
        COALESCE((item->>'discount_total')::numeric, 0.00),
        COALESCE((item->>'final_total')::numeric, 0.00)
      FROM jsonb_array_elements(p_items) AS item
      WHERE (item->>'vendor_id' = v_vendor_id::text) 
         OR (v_vendor_id IS NULL AND item->>'vendor_id' IS NULL);

      -- Deduct inventory stock for variant items
      FOR v_item IN 
        SELECT * FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'vendor_id' = v_vendor_id::text) 
           OR (v_vendor_id IS NULL AND item->>'vendor_id' IS NULL)
      LOOP
        IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != '' THEN
          UPDATE public.product_variants
          SET inventory_count = inventory_count - (v_item->>'quantity')::integer
          WHERE id = (v_item->>'variant_id')::uuid;
        END IF;
      END LOOP;

    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
