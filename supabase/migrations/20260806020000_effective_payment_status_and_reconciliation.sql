-- Migration: 20260806020000_effective_payment_status_and_reconciliation.sql
-- Description: RPC get_effective_payment_status, late payment recovery for confirm_payment_atomic, enhanced release_expired_reservations and production backfill for #C7ED7017

-- 0. Update order_suborders check constraint to include 'expired'
ALTER TABLE public.order_suborders 
DROP CONSTRAINT IF EXISTS order_suborders_status_check;

ALTER TABLE public.order_suborders 
ADD CONSTRAINT order_suborders_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'expired'::text, 'refunded'::text, 'partially_refunded'::text, 'claim_open'::text, 'refund_pending_manual'::text, 'cancellation_requires_review'::text]));

-- 0b. Fix check_fulfillment_allowed trigger function to allow cancellation/voiding of shipments
CREATE OR REPLACE FUNCTION public.check_fulfillment_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_status TEXT;
    v_parent_order_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'order_suborders' THEN
        v_parent_order_id := NEW.parent_order_id;
        
        -- Check if shipping_status or status is being moved to active fulfillment phase
        IF NEW.shipping_status IN ('preparing', 'ready_to_ship', 'dispatched', 'in_transit', 'delivered') 
           OR NEW.status IN ('in_preparation', 'ready', 'shipped', 'delivered') THEN
            
            SELECT payment_status INTO v_payment_status 
            FROM public.orders 
            WHERE id = v_parent_order_id;

            IF COALESCE(v_payment_status, '') <> 'approved' THEN
                RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: No se puede preparar ni despachar la suborden % porque el pago de la orden no está confirmado/aprobado (Estado de pago: %).', NEW.suborder_number, COALESCE(v_payment_status, 'sin pago');
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'shipments' THEN
        v_parent_order_id := NEW.order_id;
        
        -- Allow cancelling, marking failed or voiding invalid shipments even if payment is unapproved
        IF NEW.shipping_status IN ('cancelled', 'failed', 'voided') THEN
            RETURN NEW;
        END IF;

        SELECT payment_status INTO v_payment_status 
        FROM public.orders 
        WHERE id = v_parent_order_id;

        IF COALESCE(v_payment_status, '') <> 'approved' THEN
            RAISE EXCEPTION 'OPERACIÓN BLOQUEADA: No se pueden generar etiquetas ni envíos para la orden % porque el pago no está confirmado/aprobado (Estado de pago: %).', NEW.order_id, COALESCE(v_payment_status, 'sin pago');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 1. Create or replace get_effective_payment_status function
CREATE OR REPLACE FUNCTION public.get_effective_payment_status(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_latest_attempt RECORD;
    v_approved_event RECORD;
    v_reconciled_event RECORD;
    v_webhook_event RECORD;
    
    v_norm_status TEXT := 'no_payment_attempt';
    v_confidence TEXT := 'low';
    v_evidence_source TEXT := 'none';
    v_provider TEXT := 'unknown';
    v_external_id TEXT := NULL;
    v_last_verified TIMESTAMPTZ := NULL;
    v_reason TEXT := 'Sin intentos de pago registrados.';
BEGIN
    -- Fetch master order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'normalized_status', 'not_found',
            'confidence', 'high',
            'evidence_source', 'none',
            'provider', 'unknown',
            'external_id', NULL,
            'last_verified_at', NOW(),
            'reason', 'Orden no encontrada.'
        );
    END IF;

    v_provider := COALESCE(v_order.payment_provider, v_order.payment_method, 'unknown');

    -- Priority 1: Check if there is an approved event (webhook, manual or reconciliation)
    SELECT * INTO v_approved_event 
    FROM public.payment_events 
    WHERE order_id = p_order_id AND normalized_status = 'approved'
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_approved_event.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'normalized_status', 'approved',
            'confidence', 'high',
            'evidence_source', COALESCE(v_approved_event.source, 'webhook'),
            'provider', COALESCE(v_approved_event.provider, v_provider),
            'external_id', v_approved_event.provider_event_id,
            'last_verified_at', v_approved_event.created_at,
            'reason', 'Pago confirmado y aprobado en pasarela.'
        );
    END IF;

    -- Check if order itself or an attempt is approved
    IF v_order.payment_status = 'approved' OR v_order.status = 'paid' THEN
        RETURN jsonb_build_object(
            'normalized_status', 'approved',
            'confidence', 'high',
            'evidence_source', 'admin_manual',
            'provider', v_provider,
            'external_id', v_order.payment_id,
            'last_verified_at', COALESCE(v_order.payment_processed_at, v_order.last_reconciled_at, NOW()),
            'reason', 'Pago registrado como aprobado en cabecera de orden.'
        );
    END IF;

    -- Priority 2: Check latest payment event from reconciliation or webhook
    SELECT * INTO v_webhook_event 
    FROM public.payment_events 
    WHERE order_id = p_order_id AND source IN ('webhook', 'reconciliation', 'admin_manual')
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_webhook_event.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'normalized_status', v_webhook_event.normalized_status,
            'confidence', CASE WHEN v_webhook_event.source = 'webhook' THEN 'high' ELSE 'medium' END,
            'evidence_source', v_webhook_event.source,
            'provider', COALESCE(v_webhook_event.provider, v_provider),
            'external_id', v_webhook_event.provider_event_id,
            'last_verified_at', v_webhook_event.created_at,
            'reason', COALESCE(v_webhook_event.processing_result, 'Evidencia registrada por ' || v_webhook_event.source)
        );
    END IF;

    -- Priority 3: Check latest payment attempt
    SELECT * INTO v_latest_attempt 
    FROM public.payment_attempts 
    WHERE order_id = p_order_id 
    ORDER BY attempt_number DESC 
    LIMIT 1;

    IF v_latest_attempt.id IS NOT NULL THEN
        v_external_id := COALESCE(v_latest_attempt.external_payment_id, v_latest_attempt.checkout_session_id);
        v_last_verified := COALESCE(v_latest_attempt.last_checked_at, v_latest_attempt.updated_at, v_latest_attempt.initiated_at);
        v_norm_status := v_latest_attempt.normalized_status;

        IF v_norm_status = 'expired' THEN
            -- Check if it was expired by cron without gateway webhook
            IF LOWER(v_provider) IN ('handy', 'dlocal', 'dlocalgo') THEN
                RETURN jsonb_build_object(
                    'normalized_status', 'expired',
                    'confidence', 'medium',
                    'evidence_source', 'cron_timeout',
                    'provider', v_provider,
                    'external_id', v_external_id,
                    'last_verified_at', v_last_verified,
                    'reason', 'No se recibió confirmación de webhook antes del tiempo límite de reserva.'
                );
            ELSE
                RETURN jsonb_build_object(
                    'normalized_status', 'expired',
                    'confidence', 'high',
                    'evidence_source', 'reconciliation',
                    'provider', v_provider,
                    'external_id', v_external_id,
                    'last_verified_at', v_last_verified,
                    'reason', 'Intento de pago expirado.'
                );
            END IF;
        ELSIF v_norm_status IN ('initiated', 'pending', 'processing') THEN
            RETURN jsonb_build_object(
                'normalized_status', 'pending',
                'confidence', 'medium',
                'evidence_source', 'session_redirected',
                'provider', v_provider,
                'external_id', v_external_id,
                'last_verified_at', v_last_verified,
                'reason', 'Checkout iniciado en pasarela; esperando respuesta o webhook.'
            );
        ELSE
            RETURN jsonb_build_object(
                'normalized_status', v_norm_status,
                'confidence', 'medium',
                'evidence_source', 'checkout',
                'provider', v_provider,
                'external_id', v_external_id,
                'last_verified_at', v_last_verified,
                'reason', 'Estado registrado en intento de pago.'
            );
        END IF;
    END IF;

    -- Priority 4: Fallback to order payment_status
    v_norm_status := COALESCE(v_order.payment_status, 'unknown_legacy');
    RETURN jsonb_build_object(
        'normalized_status', v_norm_status,
        'confidence', 'low',
        'evidence_source', 'none',
        'provider', v_provider,
        'external_id', v_order.payment_id,
        'last_verified_at', v_order.created_at,
        'reason', 'Estado proveniente de cabecera legacy sin eventos auditados.'
    );
END;
$$;

-- 2. Update confirm_payment_atomic to support confirming late-approved orders (even if status was expired/awaiting_payment/pending/redirected)
CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(p_order_id UUID, p_payment_provider TEXT, p_payment_ref TEXT)
RETURNS VOID AS $$
DECLARE
  v_res RECORD;
  v_has_preorder BOOLEAN := false;
BEGIN
  -- 1. Lock the order and update status to confirmed / approved
  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = 'approved',
      payment_provider = COALESCE(p_payment_provider, payment_provider, payment_method),
      payment_provider_reference = p_payment_ref,
      payment_id = COALESCE(p_payment_ref, payment_id),
      payment_processed_at = COALESCE(payment_processed_at, now()),
      updated_at = now()
  WHERE id = p_order_id 
    AND status IN ('awaiting_payment', 'pending', 'initiated', 'redirected', 'expired');

  -- 2. Update suborders to confirmed
  UPDATE public.order_suborders
  SET status = 'confirmed',
      updated_at = now()
  WHERE parent_order_id = p_order_id 
    AND status IN ('pending', 'expired', 'awaiting_payment');

  -- 3. Complete reservations and decrement stock physically
  FOR v_res IN 
    SELECT * FROM public.stock_reservations 
    WHERE order_id = p_order_id AND status IN ('active', 'released')
  LOOP
    UPDATE public.stock_reservations
    SET status = 'completed', updated_at = now()
    WHERE id = v_res.id;

    UPDATE public.product_variants
    SET inventory_count = GREATEST(0, inventory_count - v_res.quantity)
    WHERE id = v_res.variant_id;
  END LOOP;

  -- 4. Update preorder items status to confirmed
  UPDATE public.preorder_items
  SET status = 'confirmed', updated_at = now()
  WHERE order_item_id IN (
    SELECT id FROM public.order_items WHERE order_id = p_order_id
  ) AND status IN ('awaiting_payment', 'pending', 'expired');

  -- 5. Check if order has any preorder items and update order preorder_status
  SELECT EXISTS (
    SELECT 1 FROM public.preorder_items pi
    JOIN public.order_items oi ON pi.order_item_id = oi.id
    WHERE oi.order_id = p_order_id
  ) INTO v_has_preorder;

  IF v_has_preorder THEN
    UPDATE public.orders
    SET preorder_status = 'confirmed', updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update release_expired_reservations to expire suborders and log payment_event
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS VOID AS $$
DECLARE
  v_res RECORD;
  v_order_status TEXT;
  v_attempt_id UUID;
BEGIN
  -- Loop active expired reservations
  FOR v_res IN 
    SELECT DISTINCT order_id 
    FROM public.stock_reservations
    WHERE status = 'active' AND reserved_until < now()
  LOOP
    -- Do not expire if order payment is already approved
    SELECT payment_status INTO v_order_status 
    FROM public.orders 
    WHERE id = v_res.order_id;

    IF COALESCE(v_order_status, '') = 'approved' THEN
      -- Mark reservation completed
      UPDATE public.stock_reservations
      SET status = 'completed', updated_at = now()
      WHERE order_id = v_res.order_id AND status = 'active';
      CONTINUE;
    END IF;

    -- 1. Release reservations
    UPDATE public.stock_reservations
    SET status = 'released', updated_at = now()
    WHERE order_id = v_res.order_id AND status = 'active';

    -- 2. Expire order if not approved
    UPDATE public.orders
    SET status = 'expired',
        payment_status = 'expired',
        updated_at = now()
    WHERE id = v_res.order_id AND payment_status <> 'approved';

    -- 3. Synchronize suborders to expired
    UPDATE public.order_suborders
    SET status = 'expired',
        updated_at = now()
    WHERE parent_order_id = v_res.order_id AND status = 'pending';

    -- 4. Expire preorder_items
    UPDATE public.preorder_items
    SET status = 'expired', updated_at = now()
    WHERE order_item_id IN (
      SELECT id FROM public.order_items WHERE order_id = v_res.order_id
    ) AND status IN ('awaiting_payment', 'pending');

    -- 5. Insert payment_events entry for reservation expiration
    SELECT id INTO v_attempt_id 
    FROM public.payment_attempts 
    WHERE order_id = v_res.order_id 
    ORDER BY attempt_number DESC 
    LIMIT 1;

    INSERT INTO public.payment_events (
      order_id,
      payment_attempt_id,
      provider,
      event_type,
      normalized_status,
      provider_status,
      source,
      payload_sanitized,
      processing_result,
      occurred_at
    ) VALUES (
      v_res.order_id,
      v_attempt_id,
      'system',
      'reservation_expired',
      'expired',
      'expired',
      'system',
      jsonb_build_object('reason', 'Reserva de tiempo agotada sin confirmación de pago.'),
      'Reserva de tiempo para el pago liberada por sistema',
      NOW()
    ) ON CONFLICT DO NOTHING;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Production Data Alignment & Cleanup for Order #C7ED7017 (UUID: c7ed7017-df6a-4fd7-9bd2-716cd65d5121)
DO $$
DECLARE
    v_target_order_id UUID := 'c7ed7017-df6a-4fd7-9bd2-716cd65d5121';
    v_suborder_id UUID := '2df0c7dc-4062-4d8b-80ea-f77f2758f3b6';
    v_shipment_id UUID := '0db1d138-1cb1-43c7-a0ed-3ebf17253e20';
    v_attempt_id UUID := '1ff87f32-d0c7-43cf-8838-063a5ba36405';
BEGIN
    -- Align suborder status to expired
    UPDATE public.order_suborders
    SET status = 'expired',
        liquidation_status = 'pending',
        updated_at = NOW()
    WHERE id = v_suborder_id;

    -- Cancel pre-existing invalid shipment created prior to payment approval
    UPDATE public.shipments
    SET shipping_status = 'cancelled',
        error_message = 'Anulado: Registro generado previamente sin confirmación de pago aprobado.',
        updated_at = NOW()
    WHERE id = v_shipment_id;

    -- Record audit reconciliation event in payment_events
    INSERT INTO public.payment_events (
        order_id,
        payment_attempt_id,
        provider,
        event_type,
        normalized_status,
        provider_status,
        source,
        payload_sanitized,
        processing_result,
        occurred_at
    ) VALUES (
        v_target_order_id,
        v_attempt_id,
        'handy',
        'reconciliation_audit',
        'expired',
        'redirected',
        'reconciliation',
        jsonb_build_object(
            'audited_by', 'system_architect',
            'handy_session_id', '5489c720-c08b-4091-8555-9bf3dfb07be1',
            'reason', 'Sin evidencia de pago ni webhook. Sesión Handy expirada. Restricciones operativas confirmadas.'
        ),
        'Conciliación server-side ejecutada: Pago expirado confirmado.',
        NOW()
    ) ON CONFLICT DO NOTHING;

END;
$$;
