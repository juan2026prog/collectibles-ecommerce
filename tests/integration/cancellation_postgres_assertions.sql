-- Integration assertions against a temporary PostgreSQL instance.
DO $$
DECLARE
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_ord uuid := '22222222-2222-4222-8222-222222222222';
  v_sub_a uuid := '33333333-3333-4333-8333-333333333333';
  v_sub_b uuid := '44444444-4444-4444-8444-444444444444';
  v_shipment uuid := '55555555-5555-4555-8555-555555555555';
  v_refund uuid := '66666666-6666-4666-8666-666666666666';
  v_payment uuid := '77777777-7777-4777-8777-777777777777';
  v_req uuid := '88888888-8888-4888-8888-888888888888';
  v_hit boolean;
  v_result jsonb;
  v_proof text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, false);
  INSERT INTO public.profiles(id,is_admin) VALUES(v_admin,true);
  INSERT INTO public.orders(id,total_amount,payment_method,payment_status,status)
    VALUES(v_ord,100,'handy','approved','confirmed');
  INSERT INTO public.order_suborders(id,parent_order_id,status,shipping_status,product_subtotal)
    VALUES (v_sub_a,v_ord,'preparing','preparing',60),
           (v_sub_b,v_ord,'preparing','preparing',40);
  INSERT INTO public.payments(id,order_id,status) VALUES (v_payment,v_ord,'approved');
  INSERT INTO public.unified_order_requests(id,order_id,suborder_id,status,request_type)
    VALUES(v_req,v_ord,v_sub_a,'REQUESTED','cancel_vendor_policy');
  INSERT INTO public.shipments(id,order_id,suborder_id,shipping_status)
    VALUES (v_shipment,v_ord,v_sub_a,'preparing');

  v_hit:=false;
  BEGIN
    UPDATE public.shipments SET shipping_status='shipped' WHERE id=v_shipment;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: affected shipment should be blocked'; END IF;

  v_hit:=false;
  BEGIN
    UPDATE public.order_suborders SET status='shipped' WHERE id=v_sub_a;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: affected suborder should be blocked'; END IF;

  UPDATE public.order_suborders SET status='shipped' WHERE id=v_sub_b;
  IF (SELECT status FROM public.order_suborders WHERE id=v_sub_b)<>'shipped' THEN
    RAISE EXCEPTION 'FAILED: unaffected suborder should remain shippable'; END IF;

  v_hit:=false;
  BEGIN
    UPDATE public.orders SET status='cancelada' WHERE id=v_ord;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: paid order cancelled as unpaid'; END IF;

  INSERT INTO public.refunds(id,order_id,suborder_id,payment_id,provider,amount,status)
    VALUES(v_refund,v_ord,v_sub_a,v_payment,'handy',60,'manual_refund_required');
  INSERT INTO public.manual_refund_tasks(order_id,payment_provider,amount,status,refund_id)
    VALUES(v_ord,'handy',60,'pending',v_refund);

  INSERT INTO public.refunds(order_id,provider,amount,status)
    VALUES(v_ord,'handy',40,'processing');

  v_hit:=false;
  BEGIN
    INSERT INTO public.refunds(order_id,provider,amount,status)
      VALUES(v_ord,'handy',1,'processing');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: pending+completed over-refund must be blocked'; END IF;

  -- Unauthorized users cannot finalize a refund.
  PERFORM set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
  v_hit:=false;
  BEGIN
    PERFORM public.confirm_manual_refund_atomic(v_refund,'HANDY-REF-1234','storage://order-dispute-evidence/test.pdf');
  EXCEPTION WHEN insufficient_privilege THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: non-admin completed manual refund'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,false);
  v_proof := 'storage://order-dispute-evidence/'||v_admin::text||'/'||v_ord::text
           ||'/handy-refund-'||v_refund::text||'-123.pdf';
  INSERT INTO storage.objects(bucket_id,name) VALUES(
    'order-dispute-evidence',
    substr(v_proof,length('storage://order-dispute-evidence/')+1)
  );

  v_result:=public.confirm_manual_refund_atomic(v_refund,'HANDY-REF-1234',v_proof);
  IF v_result->>'success'<>'true' THEN RAISE EXCEPTION 'FAILED: manual refund not approved'; END IF;
  IF (SELECT status FROM public.refunds WHERE id=v_refund)<>'completed' THEN
    RAISE EXCEPTION 'FAILED: refund not completed'; END IF;
  IF (SELECT status FROM public.manual_refund_tasks WHERE refund_id=v_refund)<>'completed' THEN
    RAISE EXCEPTION 'FAILED: manual task not completed'; END IF;
  IF (SELECT payment_status FROM public.orders WHERE id=v_ord)<>'partially_refunded' THEN
    RAISE EXCEPTION 'FAILED: partial refund should not mark full order refunded'; END IF;

  -- A remaining suborder must still be able to ship after a partial Handy refund.
  INSERT INTO public.shipments(id,order_id,suborder_id,shipping_status)
    VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v_ord,v_sub_b,'shipped');
  v_hit:=false;
  BEGIN
    UPDATE public.shipments SET shipping_status='shipped' WHERE id=v_shipment;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN v_hit:=true; END;
  IF NOT v_hit THEN RAISE EXCEPTION 'FAILED: refunded suborder shipment must remain blocked'; END IF;

  v_result:=public.confirm_manual_refund_atomic(v_refund,'HANDY-REF-1234',v_proof);
  IF v_result->>'idempotent'<>'true' THEN
    RAISE EXCEPTION 'FAILED: replay must be idempotent'; END IF;

  RAISE NOTICE 'PASS: shipment holds, suborder scope, paid cancellation, cap, admin auth, proof, partial and idempotency';
END $$;
