-- Migration: 20260815234500_argentina_mbe_rates_correction.sql
-- Description: Corrección de tarifas de envío a Argentina con MBE (PAK $59/$66, Caja $89) y desactivación de tarifas no confirmadas.

-- 1. Deactivate old unconfirmed weight tiers for Argentina
UPDATE public.international_shipping_weight_tiers
SET is_active = false
WHERE country_code = 'AR';

-- 2. Insert ONLY confirmed MBE shipping rates
INSERT INTO public.international_shipping_weight_tiers (country_code, service_type, min_weight_kg, max_weight_kg, rate_usd, is_active) VALUES
('AR', 'mbe_pak',  0.000, 0.500, 59.00, true),
('AR', 'mbe_pak',  0.501, 1.000, 66.00, true),
('AR', 'mbe_caja', 0.000, 1.000, 89.00, true);

-- 3. Ensure order snapshot columns for MBE metrics exist on public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS mbe_service_type TEXT,
    ADD COLUMN IF NOT EXISTS shipping_weight_real_kg NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS shipping_weight_volumetric_kg NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS shipping_weight_chargeable_kg NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS shipping_rule_applied TEXT,
    ADD COLUMN IF NOT EXISTS is_shipping_quote_required BOOLEAN DEFAULT false;

-- 4. Update create_order_atomic RPC to handle MBE snapshot columns
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_id UUID,
    p_total_amount NUMERIC(10,2),
    p_currency TEXT,
    p_payment_method TEXT,
    p_customer_email TEXT,
    p_customer_phone TEXT DEFAULT NULL,
    p_shipping_address JSONB DEFAULT '{}'::jsonb,
    p_affiliate_id UUID DEFAULT NULL,
    p_coupon_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_suborders JSONB DEFAULT '[]'::jsonb,
    p_terms_accepted BOOLEAN DEFAULT true,
    p_terms_accepted_at TIMESTAMPTZ DEFAULT now(),
    p_accepted_terms_version TEXT DEFAULT '2026-05-27',
    p_email_opt_in BOOLEAN DEFAULT false,
    p_whatsapp_opt_in BOOLEAN DEFAULT false,
    p_logistics_consent BOOLEAN DEFAULT false,
    p_display_currency TEXT DEFAULT 'UYU',
    p_display_subtotal NUMERIC(10,2) DEFAULT NULL,
    p_display_shipping NUMERIC(10,2) DEFAULT NULL,
    p_display_total NUMERIC(10,2) DEFAULT NULL,
    p_fx_rate NUMERIC(10,4) DEFAULT NULL,
    p_fx_rate_source TEXT DEFAULT NULL,
    p_shipping_weight_kg NUMERIC(8,3) DEFAULT NULL,
    p_shipping_cost_ars NUMERIC(10,2) DEFAULT NULL,
    p_shipping_cost_usd NUMERIC(10,2) DEFAULT NULL,
    p_mbe_service_type TEXT DEFAULT NULL,
    p_shipping_weight_real_kg NUMERIC(8,3) DEFAULT NULL,
    p_shipping_weight_volumetric_kg NUMERIC(8,3) DEFAULT NULL,
    p_shipping_weight_chargeable_kg NUMERIC(8,3) DEFAULT NULL,
    p_shipping_rule_applied TEXT DEFAULT NULL,
    p_is_shipping_quote_required BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_counter_val INTEGER;
    v_date_str TEXT;
    v_order_number TEXT;
    v_country TEXT;
    v_is_argentina BOOLEAN;
    v_handy_seq_val BIGINT := NULL;
    v_item RECORD;
    v_suborder RECORD;
    v_prod_title TEXT;
BEGIN
    -- Determine target country from shipping address
    v_country := LOWER(TRIM(COALESCE(p_shipping_address->>'country', 'Uruguay')));
    v_is_argentina := (v_country = 'argentina' OR v_country = 'ar');

    -- Generate atomic sequential Order Number based on country
    SELECT TO_CHAR(CURRENT_DATE, 'YYYYMMDD') INTO v_date_str;
    
    INSERT INTO public.daily_order_counters (day, counter)
    VALUES (CURRENT_DATE, 1)
    ON CONFLICT (day)
    DO UPDATE SET counter = public.daily_order_counters.counter + 1
    RETURNING counter INTO v_counter_val;

    IF v_is_argentina THEN
        v_order_number := 'AR-' || v_date_str || '-' || LPAD(v_counter_val::TEXT, 4, '0');
    ELSE
        v_order_number := 'COL-' || v_date_str || '-' || LPAD(v_counter_val::TEXT, 4, '0');
    END IF;

    -- Allocate 32-bit Handy Invoice Number sequence if payment method is handy
    IF LOWER(TRIM(p_payment_method)) = 'handy' THEN
        v_handy_seq_val := nextval('public.handy_invoice_seq');
    END IF;

    -- Insert Master Order
    INSERT INTO public.orders (
        customer_id,
        order_number,
        handy_invoice_number,
        total_amount,
        currency,
        status,
        payment_status,
        payment_method,
        customer_email,
        customer_phone,
        shipping_address,
        affiliate_id,
        coupon_id,
        terms_accepted,
        terms_accepted_at,
        accepted_terms_version,
        email_opt_in,
        whatsapp_opt_in,
        logistics_consent,
        display_currency,
        display_subtotal,
        display_shipping,
        display_total,
        payment_currency,
        payment_subtotal,
        payment_shipping,
        payment_total,
        fx_rate,
        fx_rate_source,
        fx_rate_timestamp,
        shipping_weight_kg,
        shipping_cost_ars,
        shipping_cost_usd,
        mbe_service_type,
        shipping_weight_real_kg,
        shipping_weight_volumetric_kg,
        shipping_weight_chargeable_kg,
        shipping_rule_applied,
        is_shipping_quote_required,
        created_at,
        updated_at
    ) VALUES (
        p_customer_id,
        v_order_number,
        v_handy_seq_val,
        p_total_amount,
        COALESCE(p_currency, 'UYU'),
        'pending',
        'pending',
        p_payment_method,
        p_customer_email,
        p_customer_phone,
        p_shipping_address,
        p_affiliate_id,
        p_coupon_id,
        p_terms_accepted,
        p_terms_accepted_at,
        p_accepted_terms_version,
        p_email_opt_in,
        p_whatsapp_opt_in,
        p_logistics_consent,
        COALESCE(p_display_currency, CASE WHEN v_is_argentina THEN 'ARS' ELSE 'UYU' END),
        p_display_subtotal,
        p_display_shipping,
        p_display_total,
        COALESCE(p_currency, CASE WHEN v_is_argentina THEN 'USD' ELSE 'UYU' END),
        p_total_amount - COALESCE(p_shipping_cost_usd, 0),
        COALESCE(p_shipping_cost_usd, 0),
        p_total_amount,
        p_fx_rate,
        COALESCE(p_fx_rate_source, 'open.er-api.com'),
        CASE WHEN p_fx_rate IS NOT NULL THEN now() ELSE NULL END,
        COALESCE(p_shipping_weight_chargeable_kg, p_shipping_weight_kg),
        p_shipping_cost_ars,
        p_shipping_cost_usd,
        p_mbe_service_type,
        p_shipping_weight_real_kg,
        p_shipping_weight_volumetric_kg,
        COALESCE(p_shipping_weight_chargeable_kg, p_shipping_weight_kg),
        p_shipping_rule_applied,
        p_is_shipping_quote_required,
        now(),
        now()
    ) RETURNING id INTO v_order_id;

    -- Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        variant_id UUID,
        vendor_id UUID,
        vendor_store_id UUID,
        quantity INTEGER,
        unit_price NUMERIC(10,2),
        product_name TEXT,
        sku TEXT,
        discount_total NUMERIC(10,2),
        final_total NUMERIC(10,2)
    )
    LOOP
        v_prod_title := v_item.product_name;
        IF v_prod_title IS NULL AND v_item.product_id IS NOT NULL THEN
            SELECT name INTO v_prod_title FROM public.products WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            variant_id,
            vendor_id,
            vendor_store_id,
            quantity,
            unit_price,
            product_name,
            sku,
            discount_total,
            final_total
        ) VALUES (
            v_order_id,
            v_item.product_id,
            v_item.variant_id,
            v_item.vendor_id,
            v_item.vendor_store_id,
            COALESCE(v_item.quantity, 1),
            COALESCE(v_item.unit_price, 0),
            COALESCE(v_prod_title, 'Producto'),
            v_item.sku,
            COALESCE(v_item.discount_total, 0),
            COALESCE(v_item.final_total, v_item.unit_price * COALESCE(v_item.quantity, 1))
        );
    END LOOP;

    -- Insert Suborders if multi-vendor
    IF jsonb_array_length(p_suborders) > 0 THEN
        FOR v_suborder IN SELECT * FROM jsonb_to_recordset(p_suborders) AS y(
            vendor_id UUID,
            vendor_store_id UUID,
            subtotal NUMERIC(10,2),
            shipping_cost NUMERIC(10,2),
            total_amount NUMERIC(10,2),
            shipping_method TEXT,
            items JSONB
        )
        LOOP
            INSERT INTO public.suborders (
                order_id,
                vendor_id,
                vendor_store_id,
                subtotal,
                shipping_cost,
                total_amount,
                shipping_method,
                status,
                created_at
            ) VALUES (
                v_order_id,
                v_suborder.vendor_id,
                v_suborder.vendor_store_id,
                v_suborder.subtotal,
                v_suborder.shipping_cost,
                v_suborder.total_amount,
                v_suborder.shipping_method,
                'pending',
                now()
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'handy_invoice_number', v_handy_seq_val,
        'is_argentina', v_is_argentina
    );
END;
$$;
