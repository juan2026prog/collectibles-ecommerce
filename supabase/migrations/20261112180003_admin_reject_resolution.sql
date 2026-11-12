-- A customer request may only be rejected BEFORE any financial refund was initiated.
-- No payment or inventory mutation is performed here.
CREATE OR REPLACE FUNCTION public.admin_reject_customer_request(
 p_request_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.unified_order_requests%ROWTYPE;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor AND is_admin IS TRUE
  ) THEN RAISE EXCEPTION 'FORBIDDEN: administrator required' USING ERRCODE = '42501'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 8 OR length(v_reason) > 1500 THEN
    RAISE EXCEPTION 'Reason required, between 8 and 1500 characters';
  END IF;

  SELECT * INTO v_req FROM public.unified_order_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status = 'REJECTED' THEN
    RETURN jsonb_build_object('success',true,'idempotent',true);
  END IF;
  IF v_req.status NOT IN ('REQUESTED','UNDER_REVIEW','WAITING_VENDOR') THEN
    RAISE EXCEPTION 'Cannot reject a request with refund or cancellation already in progress';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.refunds r
    WHERE r.order_id = v_req.order_id
      AND (v_req.suborder_id IS NULL OR r.suborder_id = v_req.suborder_id)
      AND r.status IN ('processing','completed','partial','manual_refund_required','reconciliation_required')
  ) THEN
    RAISE EXCEPTION 'A refund already exists for this request/order; reconcile before modifying it';
  END IF;
  UPDATE public.unified_order_requests
  SET status = 'REJECTED', admin_notes = v_reason,
      resolved_by = v_actor, resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;
  RETURN jsonb_build_object('success',true,'request_id',p_request_id,'status','REJECTED');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_customer_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_customer_request(uuid,text) TO authenticated;
