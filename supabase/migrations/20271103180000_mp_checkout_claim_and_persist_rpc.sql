-- Migration: 20271103180000_mp_checkout_claim_and_persist_rpc.sql
-- Implementa public.claim_mp_checkout y public.persist_mp_preference
-- Requeridas por startMercadoPagoPreference() en supabase/functions/_shared/mercadopago-recovery.ts
--
-- Invariantes:
-- 1. Control de concurrencia y bloqueo por orden (FOR UPDATE sobre orders).
-- 2. Distingue registros técnicos de creación de pedido (idempotency_key = 'create_order:...')
--    de verdaderos intentos de cobro de Mercado Pago.
-- 3. Modo 'existing': si ya existe external_preference_id activo y no vencido, lo devuelve para reconciliar.
-- 4. Modo 'create': si no hay preferencia, reserva y retorna attempt_id, attempt_number y expires_at.
-- 5. Modo 'hold': si la orden ya está pagada o hay un intento incierto/bloqueado, detiene la creación.
-- 6. persist_mp_preference persiste atómicamente external_preference_id, metadata con checkout_url,
--    provider_status = 'redirected' y actualiza last_payment_attempt_id en orders.
-- 7. SECURITY DEFINER con search_path 'public', 'pg_temp'.
--    REVOKE ALL de PUBLIC, anon, authenticated. GRANT EXECUTE a service_role y postgres.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_mp_checkout(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_reservation RECORD;
  v_existing_mp RECORD;
  v_create_order_attempt RECORD;
  v_new_attempt_id UUID;
  v_next_attempt_number INTEGER := 1;
  v_max_attempt_number INTEGER := 0;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Control de Acceso: service_role, postgres, supabase_admin o admin verificado
  v_caller_role := current_setting('role', true);
  IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Access denied: claim_mp_checkout requires service_role or admin.';
    END IF;
  END IF;

  -- 2. Bloquear la orden para serializar los checkout claims concurrentes
  SELECT id, status, payment_status, total_amount, currency, customer_id, user_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: La orden % no existe.', p_order_id;
  END IF;

  -- Si la orden ya está confirmada o pagada, modo 'hold' para bloquear nuevo cobro
  IF v_order.status IN ('confirmed', 'paid', 'completed') OR v_order.payment_status IN ('approved', 'paid', 'accredited') THEN
    RETURN jsonb_build_object(
      'success', true,
      'mode', 'hold',
      'reason', 'ORDER_ALREADY_PAID',
      'order_id', p_order_id
    );
  END IF;

  -- 3. Obtener la expiración de la reserva de stock activa
  SELECT reserved_until INTO v_expires_at
  FROM public.stock_reservations
  WHERE order_id = p_order_id AND status = 'active'
  ORDER BY reserved_until ASC
  LIMIT 1;

  -- Si no hay reserva de variantes, usar 30 minutos desde la creación
  IF v_expires_at IS NULL THEN
    v_expires_at := now() + interval '30 minutes';
  ELSIF v_expires_at <= now() THEN
    RETURN jsonb_build_object(
      'success', true,
      'mode', 'hold',
      'reason', 'RESERVATION_EXPIRED',
      'order_id', p_order_id
    );
  END IF;

  -- 4. Buscar si ya existe una preferencia de Mercado Pago generada previamente para esta orden
  SELECT id, attempt_number, external_preference_id, metadata, normalized_status, provider_status
  INTO v_existing_mp
  FROM public.payment_attempts
  WHERE order_id = p_order_id
    AND provider = 'mercadopago'
    AND external_preference_id IS NOT NULL
  ORDER BY attempt_number DESC
  LIMIT 1;

  IF v_existing_mp.id IS NOT NULL THEN
    -- Si ya existe una preferencia registrada, devolver modo 'existing' para que mercadopago-recovery la valide/reconcilie
    RETURN jsonb_build_object(
      'success', true,
      'mode', 'existing',
      'attempt_id', v_existing_mp.id,
      'preference_id', v_existing_mp.external_preference_id,
      'expires_at', to_char(v_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  END IF;

  -- 5. No hay preferencia creada aún. Resolver el attempt_id para la creación:
  -- Caso A: ¿Existe un registro técnico inicial (creado por create_order_atomic_v2) sin preferencia asignada?
  SELECT id, attempt_number, idempotency_key
  INTO v_create_order_attempt
  FROM public.payment_attempts
  WHERE order_id = p_order_id
    AND external_preference_id IS NULL
    AND (
      provider_status = 'order_created'
      OR (idempotency_key IS NOT NULL AND idempotency_key LIKE 'create_order:%')
    )
  ORDER BY attempt_number ASC
  LIMIT 1;

  IF v_create_order_attempt.id IS NOT NULL THEN
    -- Reutilizamos este attempt para asignarle la preferencia de Mercado Pago de forma limpia y única
    v_new_attempt_id := v_create_order_attempt.id;
    v_next_attempt_number := v_create_order_attempt.attempt_number;
  ELSE
    -- Caso B: Crear un nuevo attempt con el siguiente número disponible respetando el índice UNIQUE (order_id, attempt_number)
    SELECT COALESCE(MAX(attempt_number), 0) INTO v_max_attempt_number
    FROM public.payment_attempts
    WHERE order_id = p_order_id;

    v_next_attempt_number := v_max_attempt_number + 1;
    v_new_attempt_id := gen_random_uuid();

    INSERT INTO public.payment_attempts (
      id,
      order_id,
      user_id,
      provider,
      payment_method_type,
      attempt_number,
      amount,
      currency,
      normalized_status,
      provider_status,
      initiated_at,
      metadata
    ) VALUES (
      v_new_attempt_id,
      p_order_id,
      COALESCE(v_order.customer_id, v_order.user_id),
      'mercadopago',
      'mercadopago',
      v_next_attempt_number,
      v_order.total_amount,
      v_order.currency,
      'initiated',
      'checkout_claimed',
      now(),
      jsonb_build_object('checkout_claimed_at', now())
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'create',
    'attempt_id', v_new_attempt_id,
    'attempt_number', v_next_attempt_number,
    'expires_at', to_char(v_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_mp_checkout(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mp_checkout(UUID) TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.persist_mp_preference(
  p_order_id UUID,
  p_attempt_id UUID,
  p_preference_id TEXT,
  p_checkout_url TEXT,
  p_reconciled BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_existing_meta JSONB := '{}'::jsonb;
BEGIN
  -- 1. Control de Acceso
  v_caller_role := current_setting('role', true);
  IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      RAISE EXCEPTION 'Access denied: persist_mp_preference requires service_role or admin.';
    END IF;
  END IF;

  -- 2. Obtener metadata actual del attempt
  SELECT COALESCE(metadata, '{}'::jsonb) INTO v_existing_meta
  FROM public.payment_attempts
  WHERE id = p_attempt_id;

  -- 3. Actualizar payment_attempts con la preferencia generada
  UPDATE public.payment_attempts
  SET external_preference_id = p_preference_id,
      provider_status = 'redirected',
      normalized_status = 'initiated',
      metadata = v_existing_meta || jsonb_build_object(
        'preference_id', p_preference_id,
        'checkout_url', p_checkout_url,
        'reconciled', p_reconciled,
        'persisted_at', now()
      ),
      updated_at = now()
  WHERE id = p_attempt_id;

  -- 4. Actualizar la orden con la referencia externa y el último intento
  UPDATE public.orders
  SET payment_provider = 'mercadopago',
      payment_provider_reference = p_preference_id,
      last_payment_attempt_id = p_attempt_id,
      payment_status = 'pending',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'attempt_id', p_attempt_id,
    'preference_id', p_preference_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_mp_preference(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_mp_preference(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role, postgres;

COMMIT;
