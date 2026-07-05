-- Migration: Shipping V2.2 Production Readiness and Closure
-- Date: 2026-06-30

-- 1. Alter public.shipments table to add new label and cost columns
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS shipping_label_path text,
  ADD COLUMN IF NOT EXISTS shipping_quote_to_customer numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_provider_cost_estimated numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_provider_cost_real numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_invoice_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_margin_estimated numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_margin_real numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_invoice_status text DEFAULT 'pending' CHECK (shipping_invoice_status IN ('pending', 'paid', 'disputed', 'waived'));

-- 2. Alter public.order_suborders table to add new cost columns
ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS shipping_quote_to_customer numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_provider_cost_estimated numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_provider_cost_real numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_invoice_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_margin_estimated numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_margin_real numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_invoice_status text DEFAULT 'pending' CHECK (shipping_invoice_status IN ('pending', 'paid', 'disputed', 'waived'));

-- 3. Alter public.shipment_events table to add audit and tracking columns
ALTER TABLE public.shipment_events
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS suborder_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS provider_code text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

-- 4. Create trigger to automatically resolve and sync shipment_events fields
CREATE OR REPLACE FUNCTION public.resolve_shipment_event_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_shipment RECORD;
  v_suborder RECORD;
BEGIN
  -- Sync event_type / status
  IF NEW.status IS NULL AND NEW.event_type IS NOT NULL THEN
    NEW.status := NEW.event_type;
  ELSIF NEW.event_type IS NULL AND NEW.status IS NOT NULL THEN
    NEW.event_type := NEW.status;
  END IF;

  -- Sync description / message
  IF NEW.message IS NULL AND NEW.description IS NOT NULL THEN
    NEW.message := NEW.description;
  ELSIF NEW.description IS NULL AND NEW.message IS NOT NULL THEN
    NEW.description := NEW.message;
  END IF;

  -- Sync raw_response / raw_payload
  IF NEW.raw_payload IS NULL AND NEW.raw_response IS NOT NULL THEN
    NEW.raw_payload := NEW.raw_response;
  ELSIF NEW.raw_response IS NULL AND NEW.raw_payload IS NOT NULL THEN
    NEW.raw_response := NEW.raw_payload;
  END IF;

  -- Resolve parent fields from shipments
  IF NEW.shipment_id IS NOT NULL THEN
    SELECT order_id, suborder_id, provider_key, tracking_code 
    INTO v_shipment 
    FROM public.shipments 
    WHERE id = NEW.shipment_id;

    IF FOUND THEN
      IF NEW.order_id IS NULL THEN
        NEW.order_id := v_shipment.order_id;
      END IF;
      IF NEW.suborder_id IS NULL THEN
        NEW.suborder_id := v_shipment.suborder_id;
      END IF;
      IF NEW.provider_code IS NULL THEN
        NEW.provider_code := v_shipment.provider_key;
      END IF;
      IF NEW.tracking_code IS NULL THEN
        NEW.tracking_code := v_shipment.tracking_code;
      END IF;
    END IF;
  END IF;

  -- Resolve vendor_id from order_suborders
  IF NEW.suborder_id IS NOT NULL THEN
    SELECT vendor_id 
    INTO v_suborder 
    FROM public.order_suborders 
    WHERE id = NEW.suborder_id;

    IF FOUND AND NEW.vendor_id IS NULL THEN
      NEW.vendor_id := v_suborder.vendor_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists to avoid duplicates
DROP TRIGGER IF EXISTS trg_resolve_shipment_event_fields ON public.shipment_events;

CREATE TRIGGER trg_resolve_shipment_event_fields
BEFORE INSERT OR UPDATE ON public.shipment_events
FOR EACH ROW
EXECUTE FUNCTION public.resolve_shipment_event_fields();

-- 5. Recreate public.lock_shipping_queue_items to support 'retry_scheduled'
CREATE OR REPLACE FUNCTION public.lock_shipping_queue_items(limit_count integer)
 RETURNS SETOF shipping_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.shipping_queue
  SET status = 'processing', processed_at = now()
  WHERE id IN (
    SELECT id 
    FROM public.shipping_queue
    WHERE (status = 'queued' OR status = 'retry_scheduled' OR status = 'retrying') AND next_attempt_at <= now()
    ORDER BY priority DESC, created_at ASC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$function$;
