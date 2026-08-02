-- Migration to update WhatsApp trigger function and confirm_payment_atomic to support order status 'confirmed' and status 'pending'

-- 1. Update confirm_payment_atomic to handle both 'awaiting_payment' and 'pending' statuses
CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(p_order_id UUID, p_payment_provider TEXT, p_payment_ref TEXT)
RETURNS VOID AS $$
DECLARE
  v_res RECORD;
  v_has_preorder BOOLEAN := false;
BEGIN
  -- 1. Lock the order and update status (matching awaiting_payment, pending, or initiated)
  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'approved',
      payment_provider = p_payment_provider,
      payment_provider_reference = p_payment_ref,
      payment_id = p_payment_ref,
      payment_processed_at = COALESCE(payment_processed_at, now())
  WHERE id = p_order_id AND status IN ('awaiting_payment', 'pending', 'initiated', 'redirected');

  -- 2. Complete reservations and decrement stock physically
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status = 'active'
  LOOP
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    UPDATE public.product_variants
    SET inventory_count = inventory_count - v_res.quantity
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 3. Update preorder items status to confirmed
  UPDATE public.preorder_items
  SET status = 'confirmed', updated_at = now()
  WHERE order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id = p_order_id
  ) AND status IN ('awaiting_payment', 'pending');

  -- 4. Check if order has any preorder items and update order preorder_status
  SELECT EXISTS (
    SELECT 1 FROM public.preorder_items pi
    JOIN public.order_items oi ON pi.order_item_id = oi.id
    WHERE oi.order_id = p_order_id
  ) INTO v_has_preorder;

  IF v_has_preorder THEN
    UPDATE public.orders
    SET preorder_status = 'confirmed'
    WHERE id = p_order_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update WhatsApp Notification Trigger Function to support 'confirmed' status and 'approved' payment_status
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
            -- Trigger if order moves to 'paid' or 'confirmed' or payment_status moves to 'approved'
            IF (NEW.status IN ('paid', 'confirmed') OR NEW.payment_status = 'approved') 
               AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
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
