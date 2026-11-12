-- Database-side safety net: never progress a Collectibles web order toward dispatch
-- while a cancellation/refund request is unresolved. Does NOT touch Mercado Libre orders.
-- External carrier label creation must additionally check before issuing a request.
CREATE OR REPLACE FUNCTION public.prevent_dispatch_during_cancellation()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_is_progression boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only Handy and Mercado Pago payments on Collectibles (never Mercado Libre).
  IF coalesce(v_order.payment_method, '') NOT IN ('handy','mercadopago')
     OR v_order.ml_order_id IS NOT NULL
     OR lower(coalesce(v_order.order_source,'')) LIKE '%mercadolibre%'
  THEN RETURN NEW; END IF;

  v_is_progression := (
     (TG_OP = 'INSERT' OR coalesce(OLD.shipping_status,'') IS DISTINCT FROM coalesce(NEW.shipping_status,''))
     AND lower(coalesce(NEW.shipping_status,'')) IN
       ('ready_for_dispatch','ready_to_ship','label_created','dispatched',
        'shipped','in_transit','out_for_delivery','delivered','picked_up')
  );

  IF NOT v_is_progression AND TG_OP = 'UPDATE' THEN
    v_is_progression :=
      (OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL)
      OR (OLD.shipping_label_url IS NULL AND NEW.shipping_label_url IS NOT NULL)
      OR (OLD.external_guide IS NULL AND NEW.external_guide IS NOT NULL);
  END IF;

  IF v_is_progression AND EXISTS (
    SELECT 1 FROM public.unified_order_requests r
    WHERE r.order_id = NEW.order_id
      AND (r.suborder_id IS NULL OR NEW.suborder_id IS NULL OR r.suborder_id = NEW.suborder_id)
      AND r.request_type IN
         ('cancel_immediate_10m','cancel_vendor_policy','legal_withdrawal',
          'full_refund','partial_refund')
      AND r.status IN
         ('REQUESTED','UNDER_REVIEW','WAITING_VENDOR','APPROVED',
          'CANCELLATION_PENDING','CANCELLATION_CONFIRMED',
          'REFUND_PENDING','REFUND_PROCESSING')
  ) THEN
    RAISE EXCEPTION 'DISPATCH_BLOCKED_BY_CANCELLATION: resolve cancellation before progressing shipment'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS shipments_prevent_dispatch_during_cancellation ON public.shipments;
CREATE TRIGGER shipments_prevent_dispatch_during_cancellation
BEFORE INSERT OR UPDATE ON public.shipments
FOR EACH ROW EXECUTE FUNCTION public.prevent_dispatch_during_cancellation();
