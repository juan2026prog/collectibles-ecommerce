-- Migration: Payments Cancellations and Disputes Notifications
-- Date: 2026-06-27

-- 1. Dispute Notification Function & Trigger
CREATE OR REPLACE FUNCTION public.fn_trigger_dispute_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_payload jsonb;
    v_order_number text;
    v_customer_email text;
    v_customer_phone text;
    v_customer_name text;
    v_vendor_email text;
    v_vendor_phone text;
    v_vendor_name text;
    v_payment_id text;
BEGIN
    -- Get order details
    SELECT order_number, customer_name, customer_email, customer_phone
    INTO v_order_number, v_customer_name, v_customer_email, v_customer_phone
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Get vendor details
    SELECT contact_email, store_name
    INTO v_vendor_email, v_vendor_name
    FROM public.vendors
    WHERE id = NEW.vendor_id;

    -- Get payment details
    SELECT payment_id
    INTO v_payment_id
    FROM public.payments
    WHERE id = NEW.payment_id;

    -- Send Admin Notification
    v_payload := jsonb_build_object(
        'type', 'admin_chargeback_received',
        'dispute', jsonb_build_object(
            'id', NEW.id,
            'provider', NEW.provider,
            'amount', NEW.amount,
            'dispute_reason', NEW.dispute_reason,
            'status', NEW.status
        ),
        'order', jsonb_build_object(
            'order_number', v_order_number,
            'customer_name', v_customer_name,
            'customer_email', v_customer_email
        ),
        'vendor', jsonb_build_object(
            'store_name', v_vendor_name
        )
    );

    PERFORM net.http_post(
        url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/transactional-emails',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := v_payload
    );

    -- Send Client Notification
    IF v_customer_email IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'type', 'client_chargeback',
            'email', v_customer_email,
            'phone', v_customer_phone,
            'order_number', v_order_number,
            'amount', NEW.amount
        );
        PERFORM net.http_post(
            url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/transactional-emails',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := v_payload
        );
    END IF;

    -- Send Vendor Notification
    IF v_vendor_email IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'type', 'vendor_chargeback',
            'email', v_vendor_email,
            'store_name', v_vendor_name,
            'order_number', v_order_number,
            'amount', NEW.amount,
            'reason', NEW.dispute_reason
        );
        PERFORM net.http_post(
            url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/transactional-emails',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := v_payload
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger dispute notifications: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_dispute_notifications ON public.payment_disputes;
CREATE TRIGGER trg_dispute_notifications
    AFTER INSERT OR UPDATE ON public.payment_disputes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_dispute_notification();


-- 2. Vendor Financial Adjustment Notification Function & Trigger
CREATE OR REPLACE FUNCTION public.fn_trigger_adjustment_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_payload jsonb;
    v_vendor_email text;
    v_vendor_name text;
    v_order_number text;
BEGIN
    -- Get vendor details
    SELECT contact_email, store_name
    INTO v_vendor_email, v_vendor_name
    FROM public.vendors
    WHERE id = NEW.vendor_id;

    -- Get order details
    SELECT order_number
    INTO v_order_number
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Send Vendor Notification
    IF v_vendor_email IS NOT NULL THEN
        v_payload := jsonb_build_object(
            'type', 'vendor_adjustment_created',
            'email', v_vendor_email,
            'store_name', v_vendor_name,
            'order_number', v_order_number,
            'amount', NEW.amount,
            'type_adj', NEW.type,
            'reason', NEW.reason
        );
        
        PERFORM net.http_post(
            url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/transactional-emails',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := v_payload
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger adjustment notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_adjustment_notifications ON public.vendor_financial_adjustments;
CREATE TRIGGER trg_adjustment_notifications
    AFTER INSERT ON public.vendor_financial_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_adjustment_notification();
