-- Guard against directly treating paid / manually refunded / unreconciled web
-- checkout orders as 'unpaid cancelled', including calls bypassing the frontend.
-- Mercado Libre is explicitly out of scope.
CREATE OR REPLACE FUNCTION public.prevent_paid_order_unpaid_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status NOT IN ('cancelada','cancelled')
     OR OLD.status IN ('cancelada','cancelled')
     OR lower(coalesce(OLD.payment_method,'')) NOT IN ('handy','mercadopago')
     OR OLD.ml_order_id IS NOT NULL
     OR lower(coalesce(OLD.order_source,'')) LIKE '%mercadolibre%'
  THEN RETURN NEW; END IF;

  IF coalesce(OLD.payment_status,'') IN
        ('approved','paid','manual_refund_required','partially_refunded','refunded')
     OR OLD.reconciliation_status = 'pending_reconciliation'
     OR OLD.status = 'refund_pending_manual'
     OR EXISTS (
       SELECT 1 FROM public.payments p WHERE p.order_id = OLD.id
         AND p.status IN ('approved','manual_refund_required','partially_refunded','refunded')
     )
     OR EXISTS (
       SELECT 1 FROM public.payment_attempts a WHERE a.order_id = OLD.id
         AND (a.normalized_status IN
              ('approved','manual_verification_required','processing','pending_capture')
          OR (a.checkout_session_id IS NOT NULL
               AND a.normalized_status IN ('pending','initiated')
               AND a.cancelled_at IS NULL))
     )
  THEN
    RAISE EXCEPTION 'PAYMENT_REQUIRES_RECONCILIATION: cannot cancel as unpaid'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_prevent_paid_unpaid_cancellation ON public.orders;
CREATE TRIGGER orders_prevent_paid_unpaid_cancellation
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_paid_order_unpaid_cancellation();
