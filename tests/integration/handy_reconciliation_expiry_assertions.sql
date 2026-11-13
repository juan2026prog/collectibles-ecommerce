DO $test$
DECLARE
  held uuid:='11111111-1111-4111-8111-111111111111';
  held_attempt uuid:='22222222-2222-4222-8222-222222222222';
  unpaid uuid:='33333333-3333-4333-8333-333333333333';
  paid uuid:='44444444-4444-4444-8444-444444444444';
BEGIN
  INSERT INTO public.orders(id,status,payment_status,reconciliation_status) VALUES
    (held,'awaiting_payment','pending','pending_reconciliation'),
    (held_attempt,'awaiting_payment','pending',null),
    (unpaid,'awaiting_payment','pending',null),
    (paid,'confirmed','approved','reconciled');
  INSERT INTO public.stock_reservations(id,order_id,status,reserved_until) VALUES
    (gen_random_uuid(),held,'active',now()-interval '5 minutes'),
    (gen_random_uuid(),held_attempt,'active',now()-interval '5 minutes'),
    (gen_random_uuid(),unpaid,'active',now()-interval '5 minutes'),
    (gen_random_uuid(),paid,'active',now()-interval '5 minutes');
  INSERT INTO public.payment_attempts(id,order_id,normalized_status)
    VALUES(gen_random_uuid(),held_attempt,'manual_verification_required');
  INSERT INTO public.payments(id,order_id,status)
    VALUES(gen_random_uuid(),paid,'approved');
  PERFORM public.release_expired_reservations();
  IF (SELECT status FROM public.stock_reservations WHERE order_id=held)<>'active'
     OR (SELECT status FROM public.orders WHERE id=held)<>'awaiting_payment' THEN
    RAISE EXCEPTION 'FAILED: reconciliation pending order expired or stock released';
  END IF;
  IF (SELECT status FROM public.stock_reservations WHERE order_id=held_attempt)<>'active'
     OR (SELECT status FROM public.orders WHERE id=held_attempt)<>'awaiting_payment' THEN
    RAISE EXCEPTION 'FAILED: manual_verification_required attempt lost stock';
  END IF;
  IF (SELECT status FROM public.stock_reservations WHERE order_id=paid)<>'active'
     OR (SELECT status FROM public.orders WHERE id=paid)<>'confirmed' THEN
    RAISE EXCEPTION 'FAILED: approved order lost its stock';
  END IF;
  IF (SELECT status FROM public.stock_reservations WHERE order_id=unpaid)<>'released'
     OR (SELECT status FROM public.orders WHERE id=unpaid)<>'expired' THEN
    RAISE EXCEPTION 'FAILED: ordinary unpaid order failed to expire';
  END IF;
  RAISE NOTICE 'PASS: Handy reconciliation and approved payments are held, unpaid orders expire';
END
$test$;
