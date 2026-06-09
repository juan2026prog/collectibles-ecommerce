-- ══════════════════════════════════════════════════════════════
-- SEC-CRIT: WhatsApp Operational Notifications Schema & Triggers
-- Applied: 2026-09-02
-- ══════════════════════════════════════════════════════════════

-- 1. Create vendor_notification_settings table
CREATE TABLE IF NOT EXISTS public.vendor_notification_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid UNIQUE NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    whatsapp_numbers jsonb DEFAULT '[]'::jsonb,
    notify_new_sale boolean DEFAULT false,
    notify_payment_received boolean DEFAULT false,
    notify_order_shipped boolean DEFAULT false,
    notify_low_stock boolean DEFAULT false,
    notify_payout_paid boolean DEFAULT false,
    is_active boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Create admin_notification_settings table
CREATE TABLE IF NOT EXISTS public.admin_notification_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    is_singleton boolean DEFAULT true UNIQUE CHECK (is_singleton),
    whatsapp_numbers jsonb DEFAULT '[]'::jsonb,
    notify_own_sales boolean DEFAULT false,
    notify_vendor_sales boolean DEFAULT false,
    notify_payment_received boolean DEFAULT false,
    notify_low_stock boolean DEFAULT false,
    notify_shipping_events boolean DEFAULT false,
    notify_payout_pending boolean DEFAULT false,
    is_active boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Insert default admin singleton row
INSERT INTO public.admin_notification_settings (is_singleton, whatsapp_numbers, notify_own_sales, notify_vendor_sales, notify_payment_received, notify_low_stock, notify_shipping_events, notify_payout_pending, is_active)
VALUES (true, '[]'::jsonb, false, false, false, false, false, false, false)
ON CONFLICT (is_singleton) DO NOTHING;

-- 3. Create notification_logs table
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL CHECK (scope IN ('vendor', 'admin')),
    vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    recipient_number_masked text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    error_message text,
    created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE public.vendor_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- vendor_notification_settings policies:
DROP POLICY IF EXISTS "Vendors can view their own settings" ON public.vendor_notification_settings;
CREATE POLICY "Vendors can view their own settings" ON public.vendor_notification_settings
    FOR SELECT USING (auth.uid() = vendor_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Vendors can manage their own settings" ON public.vendor_notification_settings;
CREATE POLICY "Vendors can manage their own settings" ON public.vendor_notification_settings
    FOR ALL USING (auth.uid() = vendor_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- admin_notification_settings policies:
DROP POLICY IF EXISTS "Admins can manage admin settings" ON public.admin_notification_settings;
CREATE POLICY "Admins can manage admin settings" ON public.admin_notification_settings
    FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- notification_logs policies:
DROP POLICY IF EXISTS "Admins can view all notification logs" ON public.notification_logs;
CREATE POLICY "Admins can view all notification logs" ON public.notification_logs
    FOR SELECT USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Vendors can view their own notification logs" ON public.notification_logs;
CREATE POLICY "Vendors can view their own notification logs" ON public.notification_logs
    FOR SELECT USING (auth.uid() = vendor_id);

DROP POLICY IF EXISTS "System can insert notification logs" ON public.notification_logs;
CREATE POLICY "System can insert notification logs" ON public.notification_logs
    FOR INSERT WITH CHECK (true);

-- 6. Webhook secret setup in site_settings
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('whatsapp_webhook_secret', gen_random_uuid()::text, now())
ON CONFLICT (key) DO NOTHING;

-- 7. Trigger Function to invoke Edge Function send-whatsapp-notification
CREATE OR REPLACE FUNCTION public.fn_trigger_whatsapp_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_secret text;
    v_payload jsonb;
    v_vendor_id uuid;
BEGIN
    -- Wrap in exception to prevent blocking the main database transaction under any error
    BEGIN
        -- Get the webhook secret
        SELECT value INTO v_secret FROM public.site_settings WHERE key = 'whatsapp_webhook_secret';
        IF v_secret IS NULL THEN
            v_secret := 'default-secret-key';
        END IF;

        IF TG_TABLE_NAME = 'orders' THEN
            -- Only trigger if order moves to 'paid'
            IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
                v_payload := jsonb_build_object(
                    'event_type', 'order_paid',
                    'order_id', NEW.id,
                    'webhook_secret', v_secret
                );
            ELSE
                RETURN NEW;
            END IF;

        ELSIF TG_TABLE_NAME = 'vendor_payouts' THEN
            -- Only trigger if payout moves to 'paid'
            IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
                v_payload := jsonb_build_object(
                    'event_type', 'payout_paid',
                    'payout_id', NEW.id,
                    'vendor_id', NEW.vendor_id,
                    'webhook_secret', v_secret
                );
            ELSE
                RETURN NEW;
            END IF;

        ELSIF TG_TABLE_NAME = 'product_variants' THEN
            -- Only trigger if stock falls <= 2 and it was previously higher (or new variant starting <= 2)
            IF NEW.inventory_count <= 2 AND (OLD.inventory_count IS NULL OR OLD.inventory_count > 2) AND NEW.is_active = true THEN
                -- Find vendor_id of the product
                SELECT vendor_id INTO v_vendor_id FROM public.products WHERE id = NEW.product_id;
                
                v_payload := jsonb_build_object(
                    'event_type', 'low_stock',
                    'variant_id', NEW.id,
                    'product_id', NEW.product_id,
                    'vendor_id', v_vendor_id,
                    'webhook_secret', v_secret
                );
            ELSE
                RETURN NEW;
            END IF;

        ELSIF TG_TABLE_NAME = 'shipments' THEN
            IF TG_OP = 'INSERT' THEN
                -- Shipment created
                -- Find vendor_id of the order if possible
                SELECT vendor_id INTO v_vendor_id FROM public.products p
                JOIN public.order_items oi ON oi.product_id = p.id
                WHERE oi.order_id = NEW.order_id
                LIMIT 1;

                v_payload := jsonb_build_object(
                    'event_type', 'shipment_created',
                    'shipment_id', NEW.id,
                    'order_id', NEW.order_id,
                    'vendor_id', v_vendor_id,
                    'webhook_secret', v_secret
                );
            ELSIF TG_OP = 'UPDATE' THEN
                -- Shipment delivered
                IF NEW.shipping_status IN ('delivered', 'entregado') AND (OLD.shipping_status IS DISTINCT FROM NEW.shipping_status) THEN
                    SELECT vendor_id INTO v_vendor_id FROM public.products p
                    JOIN public.order_items oi ON oi.product_id = p.id
                    WHERE oi.order_id = NEW.order_id
                    LIMIT 1;

                    v_payload := jsonb_build_object(
                        'event_type', 'shipment_delivered',
                        'shipment_id', NEW.id,
                        'order_id', NEW.order_id,
                        'vendor_id', v_vendor_id,
                        'webhook_secret', v_secret
                    );
                ELSE
                    RETURN NEW;
                END IF;
            END IF;
        END IF;

        -- Perform Deno Edge Function trigger call
        IF v_payload IS NOT NULL THEN
            PERFORM net.http_post(
                url := 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/send-whatsapp-notification',
                headers := '{"Content-Type": "application/json"}'::jsonb,
                body := v_payload
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to queue whatsapp notification: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- 8. Create Triggers

-- Orders Table Trigger
DROP TRIGGER IF EXISTS trg_whatsapp_order_paid ON public.orders;
CREATE TRIGGER trg_whatsapp_order_paid
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_whatsapp_notification();

-- Payouts Table Trigger
DROP TRIGGER IF EXISTS trg_whatsapp_payout_paid ON public.vendor_payouts;
CREATE TRIGGER trg_whatsapp_payout_paid
    AFTER UPDATE ON public.vendor_payouts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_whatsapp_notification();

-- Product Variants Table Trigger (for Low Stock)
DROP TRIGGER IF EXISTS trg_whatsapp_low_stock ON public.product_variants;
CREATE TRIGGER trg_whatsapp_low_stock
    AFTER UPDATE OR INSERT ON public.product_variants
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_whatsapp_notification();

-- Shipments Table Trigger
DROP TRIGGER IF EXISTS trg_whatsapp_shipment_events ON public.shipments;
CREATE TRIGGER trg_whatsapp_shipment_events
    AFTER INSERT OR UPDATE ON public.shipments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_whatsapp_notification();
