-- Handy manual-refund creation must not span independent PostgREST writes.
-- Callable ONLY by a trusted Edge Function using the service_role JWT.
CREATE OR REPLACE FUNCTION public.register_handy_manual_refund_pending_atomic(
  p_refund_id uuid,
  p_order_id uuid,
  p_suborder_id uuid,
  p_order_item_id uuid,
  p_payment_id uuid,
  p_vendor_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor uuid,
  p_ip text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_task_id uuid;
  v_scope uuid := p_suborder_id;
  v_reason text := coalesce(nullif(btrim(p_reason),''),'Devolución manual Handy pendiente');
  v_payment_method text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: trusted payment backend only' USING ERRCODE = '42501';
  END IF;

  -- Always lock the order first, consistent with refund reservation and completion.
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR lower(coalesce(v_order.payment_method,'')) <> 'handy'
     OR v_order.ml_order_id IS NOT NULL
     OR lower(coalesce(v_order.order_source,'')) LIKE '%mercadolibre%' THEN
    RAISE EXCEPTION 'Invalid Collectibles Handy order';
  END IF;

  SELECT * INTO v_refund FROM public.refunds
    WHERE id=p_refund_id AND order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund reservation missing'; END IF;
  IF v_refund.status='manual_refund_required' THEN
    SELECT id INTO v_task_id FROM public.manual_refund_tasks
      WHERE refund_id=p_refund_id AND status='pending';
    IF v_task_id IS NULL THEN
      RAISE EXCEPTION 'Pending refund without administrative task; requires reconciliation';
    END IF;
    RETURN jsonb_build_object('success',true,'idempotent',true,'refund_id',p_refund_id,'task_id',v_task_id);
  END IF;
  IF v_refund.status<>'processing' OR v_refund.amount<>p_amount OR p_amount<=0 THEN
    RAISE EXCEPTION 'Refund reservation state or amount mismatch';
  END IF;

  IF p_payment_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.payments WHERE id=p_payment_id AND order_id=p_order_id
      AND status IN ('approved','partially_refunded','manual_refund_required')
  ) THEN
    RAISE EXCEPTION 'Approved Handy payment reference required';
  END IF;

  IF v_scope IS NULL AND p_order_item_id IS NOT NULL THEN
    SELECT oi.suborder_id INTO v_scope FROM public.order_items oi
    WHERE oi.id=p_order_item_id AND oi.order_id=p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  END IF;

  IF v_scope IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_suborders so
    WHERE so.id=v_scope AND so.parent_order_id=p_order_id
      AND so.status NOT IN ('cancelled','refunded')
  ) THEN RAISE EXCEPTION 'Suborder not eligible for manual refund'; END IF;

  UPDATE public.refunds SET
    suborder_id=v_scope,
    order_item_id=p_order_item_id,
    vendor_id=p_vendor_id,
    payment_id=p_payment_id,
    provider='handy',
    reason=v_reason,
    status='manual_refund_required',
    api_response=coalesce(api_response,'{}'::jsonb) ||
        jsonb_build_object('manual_required',true,'recorded_at',now()),
    updated_at=now()
  WHERE id=p_refund_id AND status='processing';

  INSERT INTO public.manual_refund_tasks
    (refund_id,order_id,payment_provider,payment_id,amount,currency,reason,status,note)
  VALUES
    (p_refund_id,p_order_id,'handy',
     coalesce(nullif(v_order.payment_id,''),p_payment_id::text),
     p_amount,coalesce(nullif(v_order.currency,''),'UYU'),v_reason,'pending',v_reason)
  RETURNING id INTO v_task_id;

  UPDATE public.payments SET status='manual_refund_required',updated_at=now()
  WHERE id=p_payment_id AND order_id=p_order_id;

  UPDATE public.order_suborders SET status='refund_pending_manual',updated_at=now()
  WHERE parent_order_id=p_order_id AND (v_scope IS NULL OR id=v_scope);

  IF v_scope IS NULL THEN
    UPDATE public.orders SET status='refund_pending_manual', updated_at=now()
     WHERE id=p_order_id;
  END IF;

  INSERT INTO public.payment_audit_logs
    (user_id,action,order_id,suborder_id,payment_id,refund_id,provider,amount,api_response,ip_address)
  VALUES(p_actor,CASE WHEN v_scope IS NULL THEN 'full_refund_pending_manual'
                    ELSE 'partial_refund_pending_manual' END,
         p_order_id,v_scope,p_payment_id,p_refund_id,'handy',p_amount,
         jsonb_build_object('task_id',v_task_id),p_ip);

  RETURN jsonb_build_object('success',true,'idempotent',false,
                            'refund_id',p_refund_id,'task_id',v_task_id);
END;
$$;
REVOKE ALL ON FUNCTION public.register_handy_manual_refund_pending_atomic(
 uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_handy_manual_refund_pending_atomic(
 uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,text) TO service_role;
