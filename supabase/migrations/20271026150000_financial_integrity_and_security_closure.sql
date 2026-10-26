-- 20271026150000_financial_integrity_and_security_closure.sql
-- Cierre de defectos críticos: RLS, restricciones de idempotencia, máquina de estados y evidencias

-- 1. Ampliar refunds_status_check para admitir reconciliation_required
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (
  status IN (
    'pending',
    'processing',
    'completed',
    'partial',
    'failed',
    'rejected',
    'manual_refund_required',
    'reconciliation_required'
  )
);

-- 2. Restricción única de idempotencia en refunds (order_id, provider_refund_id) y columna idempotency_key
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_idempotency_key_idx ON public.refunds (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_order_provider_refund_idx ON public.refunds (order_id, provider_refund_id) WHERE provider_refund_id IS NOT NULL;

-- 3. Revocar privilegios peligrosos en unified_order_requests (TRUNCATE, DELETE, INSERT para anon)
REVOKE TRUNCATE, DELETE ON public.unified_order_requests FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON public.unified_order_requests FROM anon;

-- 4. Cerrar la brecha de INSERT directo de compradores en unified_order_requests
-- Forzar a que la creación de solicitudes de compradores pase exclusivamente por la Edge Function request-order-resolution (service_role)
DROP POLICY IF EXISTS "Buyers insert requests for own orders" ON public.unified_order_requests;

-- 5. Endurecer política de Vendors para que coincida exactamente con el esquema productivo
DROP POLICY IF EXISTS "Vendors select requests assigned to them" ON public.unified_order_requests;
CREATE POLICY "Vendors select requests assigned to them" ON public.unified_order_requests
FOR SELECT TO authenticated
USING (
  vendor_id IS NOT NULL AND 
  vendor_id IN (
    SELECT v.id FROM public.vendors v 
    JOIN public.vendor_stores vs ON vs.vendor_id = v.id 
    WHERE vs.vendor_id = auth.uid() OR v.id = auth.uid()
  )
);

-- 6. Endurecer RLS de almacenamiento de evidencias en order-dispute-evidence
DROP POLICY IF EXISTS "Authenticated users upload dispute evidence" ON storage.objects;
CREATE POLICY "Authenticated users upload dispute evidence" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (
  bucket_id = 'order-dispute-evidence' AND 
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text AND
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND (o.customer_id = auth.uid() OR o.user_id = auth.uid() OR public.is_admin())
  )
);

-- 7. Función RPC atómica para verificar o abortar compra Zinc antes del envío externo
CREATE OR REPLACE FUNCTION public.check_and_lock_zinc_purchase_item(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_cancelled_req RECORD;
BEGIN
  -- Bloquear la fila del item internacional
  SELECT * INTO v_item
  FROM public.international_order_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ITEM_NOT_FOUND');
  END IF;

  -- Si el item ya fue cancelado localmente
  IF v_item.purchase_status = 'cancelled' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'ALREADY_CANCELLED');
  END IF;

  -- Comprobar si existe una solicitud de cancelación confirmada o en revisión para esta orden
  SELECT id, status INTO v_cancelled_req
  FROM public.unified_order_requests
  WHERE order_id = v_item.order_id
    AND status IN ('CANCELLATION_CONFIRMED', 'CANCELLATION_PENDING', 'APPROVED')
    AND request_type IN ('cancel_immediate_10m', 'cancel_international_zinc', 'cancel_before_payment')
  LIMIT 1;

  IF FOUND THEN
    -- Abortar compra y marcar el item como cancelado
    UPDATE public.international_order_items
    SET purchase_status = 'cancelled',
        review_reason_code = 'CANCELLED_BEFORE_ZINC_SUBMISSION',
        updated_at = now()
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
      'allowed', false, 
      'reason', 'CANCELLATION_AUTHORIZED', 
      'request_id', v_cancelled_req.id,
      'request_status', v_cancelled_req.status
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'purchase_status', v_item.purchase_status);
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_lock_zinc_purchase_item(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_lock_zinc_purchase_item(UUID) TO service_role, postgres;
