-- Collectibles: customer-to-Super-Admin Handy review cases.
-- No payment, inventory, shipping or refund is modified by these procedures.
-- Mercado Libre and Mercado Pago are unaffected.
ALTER TABLE public.unified_order_requests
DROP CONSTRAINT IF EXISTS unified_order_requests_request_type_check;
ALTER TABLE public.unified_order_requests
ADD CONSTRAINT unified_order_requests_request_type_check
CHECK (request_type IN (
 'cancel_before_payment','cancel_immediate_10m','cancel_vendor_policy',
 'cancel_international_zinc','legal_withdrawal','voluntary_return',
 'defective_product','wrong_product','damaged_in_transit','not_delivered',
 'partial_refund','full_refund','chargeback','handy_payment_review'
));

CREATE OR REPLACE FUNCTION public.request_handy_payment_review(
  p_order_id uuid, p_intent text, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_req public.unified_order_requests%ROWTYPE;
  v_key text := 'handy-review-' || p_order_id::text;
  v_reason text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_intent NOT IN ('verify_payment','request_cancellation') THEN
    RAISE EXCEPTION 'Invalid review intent';
  END IF;
  IF length(coalesce(p_notes,'')) > 1500 THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;
  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id FOR SHARE;
  IF NOT FOUND
     OR (v_order.customer_id IS DISTINCT FROM v_actor AND v_order.user_id IS DISTINCT FROM v_actor)
     OR lower(coalesce(v_order.payment_method,'')) <> 'handy'
     OR v_order.ml_order_id IS NOT NULL
     OR lower(coalesce(v_order.order_source,'')) LIKE '%mercadolibre%'
  THEN RAISE EXCEPTION 'Order not eligible or not owned by user' USING ERRCODE = '42501';
  END IF;
  IF v_order.reconciliation_status <> 'pending_reconciliation'
     AND NOT EXISTS (
       SELECT 1 FROM public.payment_attempts a
       WHERE a.order_id = p_order_id AND a.normalized_status='manual_verification_required'
     )
  THEN RAISE EXCEPTION 'Handy payment is not pending verification';
  END IF;
  v_reason := CASE p_intent
    WHEN 'request_cancellation' THEN 'Solicito cancelación y devolución luego de verificar pago Handy'
    ELSE 'Solicito verificación de pago Handy'
  END;
  INSERT INTO public.unified_order_requests(
     order_id,customer_id,business_model,request_type,status,
     amount_requested,currency,reason,customer_notes,idempotency_key
  ) VALUES (
     v_order.id,v_actor,'collectibles_national','handy_payment_review','REQUESTED',
     v_order.total_amount,coalesce(v_order.currency,'UYU'),v_reason,
     nullif(btrim(coalesce(p_notes,'')),''),v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_req;
  IF v_req.id IS NULL THEN
    SELECT * INTO v_req FROM public.unified_order_requests
      WHERE idempotency_key=v_key AND customer_id=v_actor;
  END IF;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Review request could not be retrieved'; END IF;
  -- A buyer can escalate an existing payment-verification request into a
  -- cancellation request without creating a duplicate or erasing admin notes.
  IF p_intent='request_cancellation'
    AND v_req.status IN ('REQUESTED','UNDER_REVIEW')
    AND v_req.reason NOT LIKE 'Solicito cancelación%' THEN
    UPDATE public.unified_order_requests
    SET reason=v_reason,
        customer_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''), customer_notes),
        updated_at=now()
    WHERE id=v_req.id;
  END IF;
  RETURN jsonb_build_object('success',true,'request_id',v_req.id,
                            'status',v_req.status,'message',
                            'Solicitud recibida. No efectúes otro pago mientras verificamos Handy.');
END;
$$;
REVOKE ALL ON FUNCTION public.request_handy_payment_review(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_handy_payment_review(uuid,text,text) TO authenticated;

-- The buyer can attach a proof after Super Admin asks for it.
-- File upload itself is protected by existing Storage RLS.
CREATE OR REPLACE FUNCTION public.add_handy_payment_review_evidence(
 p_request_id uuid, p_storage_path text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $proof$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.unified_order_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_req FROM public.unified_order_requests
   WHERE id=p_request_id AND request_type='handy_payment_review'
     AND customer_id=v_actor FOR UPDATE;
  IF NOT FOUND OR v_req.status NOT IN ('REQUESTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Review unavailable for evidence submission' USING ERRCODE='42501';
  END IF;
  IF length(p_storage_path)>750
    OR p_storage_path NOT LIKE (v_actor::text||'/'||v_req.order_id::text||'/%')
    OR NOT EXISTS (SELECT 1 FROM storage.objects obj
                   WHERE obj.bucket_id='order-dispute-evidence' AND obj.name=p_storage_path)
  THEN RAISE EXCEPTION 'Private evidence file not found or not owned by buyer'; END IF;
  IF NOT coalesce(v_req.evidence_images,'[]'::jsonb) @> jsonb_build_array(p_storage_path) THEN
    UPDATE public.unified_order_requests
    SET evidence_images=coalesce(evidence_images,'[]'::jsonb)||jsonb_build_array(p_storage_path),
        updated_at=now()
    WHERE id=p_request_id;
  END IF;
  RETURN jsonb_build_object('success',true,'request_id',p_request_id);
END;
$proof$;
REVOKE ALL ON FUNCTION public.add_handy_payment_review_evidence(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_handy_payment_review_evidence(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_handy_payment_review(
 p_request_id uuid, p_action text, p_public_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req public.unified_order_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_status text;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id=v_actor AND (is_admin IS TRUE OR role='super_admin')
  ) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('in_review','request_evidence','close_after_reconciliation')
    OR length(btrim(coalesce(p_public_note,''))) < 8
    OR length(p_public_note) > 1200
  THEN RAISE EXCEPTION 'Invalid action or public note'; END IF;
  SELECT * INTO v_req FROM public.unified_order_requests
  WHERE id=p_request_id AND request_type='handy_payment_review'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF v_req.status IN ('CLOSED','REJECTED') THEN
    RAISE EXCEPTION 'Review already closed';
  END IF;
  IF p_action='close_after_reconciliation' THEN
    SELECT * INTO v_order FROM public.orders WHERE id=v_req.order_id;
    IF v_req.reason LIKE 'Solicito cancelación%' THEN
      IF coalesce(v_order.payment_status,'') <> 'refunded' THEN
        RAISE EXCEPTION 'Cancellation request cannot close before the customer refund is confirmed';
      END IF;
    ELSIF v_order.reconciliation_status IS DISTINCT FROM 'reconciled'
       AND coalesce(v_order.payment_status,'') NOT IN ('refunded','partially_refunded') THEN
      RAISE EXCEPTION 'Financial reconciliation must be completed first';
    END IF;
    v_status := 'CLOSED';
  ELSE
    v_status := 'UNDER_REVIEW';
  END IF;
  UPDATE public.unified_order_requests
  SET status=v_status,admin_notes=btrim(p_public_note),updated_at=now(),
      resolved_by=CASE WHEN v_status='CLOSED' THEN v_actor ELSE NULL END,
      resolved_at=CASE WHEN v_status='CLOSED' THEN now() ELSE NULL END
  WHERE id=p_request_id;
  RETURN jsonb_build_object('success',true,'status',v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_handy_payment_review(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_handy_payment_review(uuid,text,text) TO authenticated;
