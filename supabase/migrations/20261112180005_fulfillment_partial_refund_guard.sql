-- Preserve legacy fulfillment checks for every other provider (including Mercado Libre).
-- Handy/MP may dispatch unaffected suborders after a verified partial refund,
-- while the cancellation guard continues to block affected suborders.
CREATE OR REPLACE FUNCTION public.check_fulfillment_allowed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_status text;
  v_method text;
  v_order_source text;
  v_ml_order_id text;
  v_parent_order_id uuid;
  v_partial_allowed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'order_suborders' THEN
    v_parent_order_id := NEW.parent_order_id;
    IF NEW.shipping_status IN ('preparing','ready_to_ship','dispatched','in_transit','delivered')
       OR NEW.status IN ('in_preparation','ready','shipped','delivered') THEN

      SELECT o.payment_status, o.payment_method, o.order_source, o.ml_order_id
        INTO v_payment_status, v_method, v_order_source, v_ml_order_id
        FROM public.orders o WHERE o.id = v_parent_order_id;

      v_partial_allowed := v_payment_status = 'partially_refunded'
        AND lower(coalesce(v_method,'')) IN ('handy','mercadopago')
        AND v_ml_order_id IS NULL
        AND lower(coalesce(v_order_source,'')) NOT LIKE '%mercadolibre%'
        AND lower(coalesce(NEW.status,'')) NOT IN ('refund_pending_manual','cancelled','refunded')
        AND lower(coalesce(NEW.shipping_status,'')) NOT IN ('cancelled','refunded');

      IF coalesce(v_payment_status,'') <> 'approved' AND NOT v_partial_allowed THEN
        RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: pago no aprobado para preparar suborden % (estado %)',
          NEW.suborder_number, coalesce(v_payment_status,'sin pago');
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'shipments' THEN
    v_parent_order_id := NEW.order_id;
    IF NEW.shipping_status IN ('cancelled','failed','voided') THEN
      RETURN NEW;
    END IF;

    SELECT o.payment_status, o.payment_method, o.order_source, o.ml_order_id
      INTO v_payment_status, v_method, v_order_source, v_ml_order_id
      FROM public.orders o WHERE o.id = v_parent_order_id;

    IF NEW.suborder_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.order_suborders so
         WHERE so.id = NEW.suborder_id AND so.parent_order_id = v_parent_order_id
           AND so.status NOT IN ('refund_pending_manual','cancelled','refunded')
      ) INTO v_partial_allowed;
    END IF;

    v_partial_allowed := v_partial_allowed
      AND v_payment_status = 'partially_refunded'
      AND lower(coalesce(v_method,'')) IN ('handy','mercadopago')
      AND v_ml_order_id IS NULL
      AND lower(coalesce(v_order_source,'')) NOT LIKE '%mercadolibre%';

    IF coalesce(v_payment_status,'') <> 'approved' AND NOT v_partial_allowed THEN
      RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: pago no aprobado para generar envío orden % (estado %)',
        NEW.order_id, coalesce(v_payment_status,'sin pago');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
