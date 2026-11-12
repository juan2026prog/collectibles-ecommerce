-- Prevent total outstanding+completed refunds from exceeding the captured order amount.
-- Includes manual Handy refunds; these must reserve the amount until verified or rejected.
CREATE OR REPLACE FUNCTION public.enforce_web_refund_reservation_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reserved numeric;
BEGIN
  IF NEW.provider NOT IN ('handy','mercadopago')
     OR NEW.status NOT IN ('processing','completed','partial','manual_refund_required','reconciliation_required')
  THEN RETURN NEW; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund order missing'; END IF;
  IF v_order.ml_order_id IS NOT NULL OR lower(coalesce(v_order.order_source,'')) LIKE '%mercadolibre%'
  THEN RETURN NEW; END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
     RAISE EXCEPTION 'Refund amount must be positive';
  END IF;
  SELECT coalesce(sum(r.amount),0) INTO v_reserved
  FROM public.refunds r
  WHERE r.order_id = NEW.order_id
    AND r.id IS DISTINCT FROM NEW.id
    AND r.status IN ('processing','completed','partial','manual_refund_required','reconciliation_required');

  IF NEW.amount + v_reserved > v_order.total_amount + 0.000001 THEN
    RAISE EXCEPTION 'REFUND_AMOUNT_EXCEEDED: completed and pending refunds exceed order amount'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS web_refund_reservation_cap ON public.refunds;
CREATE TRIGGER web_refund_reservation_cap
BEFORE INSERT OR UPDATE OF status, amount ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.enforce_web_refund_reservation_cap();
