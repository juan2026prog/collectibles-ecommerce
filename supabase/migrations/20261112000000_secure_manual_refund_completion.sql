-- Complete a verified manual refund atomically. This RPC never initiates a gateway refund.
-- Requires an administrator to have independently verified the payment-provider reversal.
CREATE OR REPLACE FUNCTION public.confirm_manual_refund_atomic(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_proof_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_refund public.refunds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_refunded numeric;
  v_full boolean;
  v_reference text := nullif(btrim(p_provider_refund_id), '');
  v_order_id uuid;
  v_suborder_due numeric;
  v_proof text := nullif(btrim(p_proof_url), '');
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor AND is_admin IS TRUE
  ) THEN RAISE EXCEPTION 'FORBIDDEN: administrator required' USING ERRCODE = '42501'; END IF;

  IF v_reference IS NULL OR length(v_reference) < 4 OR length(v_reference) > 180 THEN
    RAISE EXCEPTION 'Provider refund reference required (4-180 characters)';
  END IF;
  IF v_proof IS NULL OR length(v_proof) > 2000 OR v_proof !~* '^https://' THEN
    RAISE EXCEPTION 'Verified HTTPS proof URL required';
  END IF;

  -- Lock order first, matching refund-order lock order to avoid deadlocks.
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = p_refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR v_refund.order_id <> v_order_id THEN
    RAISE EXCEPTION 'Refund changed during confirmation';
  END IF;
  IF v_refund.status = 'completed' THEN
    IF v_refund.provider_refund_id = v_reference THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true, 'refund_id', p_refund_id);
    END IF;
    RAISE EXCEPTION 'Refund already completed with another reference';
  END IF;
  IF v_refund.status <> 'manual_refund_required' OR v_refund.provider <> 'handy' THEN
    RAISE EXCEPTION 'Only pending Handy manual refunds may be completed here';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.refunds r
    WHERE r.provider = 'handy' AND r.provider_refund_id = v_reference AND r.id <> p_refund_id
  ) THEN RAISE EXCEPTION 'Provider reference already used'; END IF;

  UPDATE public.refunds SET status = 'completed', provider_refund_id = v_reference,
    processed_at = now(), updated_at = now(),
    api_response = coalesce(api_response, '{}'::jsonb) ||
      jsonb_build_object('manual_verified', true, 'proof_url', v_proof,
                         'verified_by', v_actor, 'verified_at', now())
  WHERE id = p_refund_id;

  UPDATE public.manual_refund_tasks
  SET status = 'completed', completed_at = now(), completed_by = v_actor,
      external_reference = v_reference, proof_url = v_proof
  WHERE order_id = v_refund.order_id
    AND payment_provider = 'handy'
    AND status = 'pending'
    AND amount = v_refund.amount;

  IF v_refund.suborder_id IS NOT NULL THEN
    -- A partial item refund must never mark the entire suborder as refunded.
    SELECT greatest(0, coalesce(product_subtotal,0)
           - coalesce(discount_total,0) + coalesce(shipping_charged_to_customer,0))
      INTO v_suborder_due FROM public.order_suborders
     WHERE id = v_refund.suborder_id AND parent_order_id = v_refund.order_id;
    IF v_suborder_due IS NULL THEN RAISE EXCEPTION 'Suborder not found'; END IF;
    IF (
      SELECT coalesce(sum(r.amount),0) FROM public.refunds r
      WHERE r.suborder_id = v_refund.suborder_id AND r.status = 'completed'
    ) >= v_suborder_due THEN
      UPDATE public.order_suborders SET status = 'refunded', updated_at = now()
       WHERE id = v_refund.suborder_id AND parent_order_id = v_refund.order_id;
    END IF;
  ELSE
    -- Whole-order refund: apply to every suborder only when the full order
    -- amount has been refunded (computed below).
    NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_refunded FROM public.refunds
  WHERE order_id = v_refund.order_id AND status = 'completed';
  v_full := v_refunded >= v_order.total_amount;

  IF v_full THEN
    UPDATE public.order_suborders SET status = 'refunded', updated_at = now()
     WHERE parent_order_id = v_refund.order_id
       AND status NOT IN ('refunded','cancelled');
  END IF;

  UPDATE public.orders SET
    payment_status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END,
    status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at = now()
  WHERE id = v_refund.order_id;

  UPDATE public.payments SET
    status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END,
    refund_amount = v_refunded, refund_date = now(),
    provider_refund_id = v_reference, updated_at = now()
  WHERE id = v_refund.payment_id;

  UPDATE public.unified_order_requests
  SET status = CASE WHEN v_full THEN 'REFUNDED' ELSE 'CANCELLATION_CONFIRMED' END,
      resolved_at = now(), resolved_by = v_actor,
      admin_notes = coalesce(admin_notes, '') || ' | Reembolso manual verificado: ' || v_reference
  WHERE order_id = v_refund.order_id
    AND status IN ('REFUND_PENDING', 'REFUND_PROCESSING', 'CANCELLATION_PENDING')
    AND (v_refund.suborder_id IS NULL OR suborder_id = v_refund.suborder_id);

  INSERT INTO public.payment_audit_logs
    (user_id, action, order_id, suborder_id, payment_id, refund_id, provider, amount, api_response)
  VALUES (v_actor, 'manual_refund_resolved', v_refund.order_id,
          v_refund.suborder_id, v_refund.payment_id, p_refund_id, 'handy',
          v_refund.amount, jsonb_build_object('provider_refund_id', v_reference, 'proof_url', v_proof));

  RETURN jsonb_build_object('success', true, 'refund_id', p_refund_id,
                            'amount', v_refund.amount, 'fully_refunded', v_full);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_manual_refund_atomic(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_manual_refund_atomic(uuid,text,text) TO authenticated;
