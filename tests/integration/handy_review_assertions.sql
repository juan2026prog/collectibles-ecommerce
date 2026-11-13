DO $test$
DECLARE
 buyer uuid := '11111111-1111-4111-8111-111111111111';
 admin_user uuid := '22222222-2222-4222-8222-222222222222';
 other_user uuid := '33333333-3333-4333-8333-333333333333';
 order_id uuid := '44444444-4444-4444-8444-444444444444';
 request_id uuid;
 result jsonb;
 blocked boolean;
BEGIN
 INSERT INTO public.profiles(id,is_admin,role) VALUES
 (buyer,false,'customer'),(admin_user,true,'super_admin'),(other_user,false,'customer');
 INSERT INTO public.orders(id,customer_id,user_id,payment_method,reconciliation_status,payment_status,total_amount,currency)
 VALUES (order_id,buyer,buyer,'handy','pending_reconciliation','pending',75,'UYU');
 INSERT INTO public.payment_attempts(order_id,normalized_status) VALUES (order_id,'manual_verification_required');
 PERFORM set_config('request.jwt.claim.sub',buyer::text,false);
 result := public.request_handy_payment_review(order_id,'request_cancellation','Comprobante Handy disponible');
 request_id := (result->>'request_id')::uuid;
 IF result->>'success' <> 'true' OR request_id IS NULL THEN
    RAISE EXCEPTION 'Buyer request failed';
 END IF;
 result := public.request_handy_payment_review(order_id,'request_cancellation','Reintento');
 IF (result->>'request_id')::uuid <> request_id
   OR (SELECT count(*) FROM public.unified_order_requests WHERE order_id=order_id) <> 1 THEN
   RAISE EXCEPTION 'Duplicate request not idempotent';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',other_user::text,false);
 blocked := false;
 BEGIN PERFORM public.request_handy_payment_review(order_id,'verify_payment',null);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Non-owner can request review'; END IF;
 blocked := false;
 BEGIN PERFORM public.admin_update_handy_payment_review(request_id,'in_review','Estoy revisando el ticket Handy');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Customer can update admin review'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_user::text,false);
 result:=public.admin_update_handy_payment_review(request_id,'in_review','Estamos verificando los movimientos de Handy');
 IF result->>'status'<>'UNDER_REVIEW' THEN RAISE EXCEPTION 'Admin did not update case'; END IF;
 blocked:=false;
 BEGIN PERFORM public.admin_update_handy_payment_review(request_id,'close_after_reconciliation','Verificado');
 EXCEPTION WHEN OTHERS THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Closed without payment reconciliation'; END IF;
 UPDATE public.orders SET reconciliation_status='reconciled',payment_status='approved' WHERE id=order_id;
 result:=public.admin_update_handy_payment_review(request_id,'close_after_reconciliation','La operación ya fue conciliada y registrada en el sistema');
 IF result->>'status'<>'CLOSED' THEN RAISE EXCEPTION 'Close after reconciliation failed'; END IF;
 RAISE NOTICE 'PASS: buyer owns, idempotency, admin-only, no premature close';
END $test$;
