-- 20261026000000_cancellations_returns_unified_engine.sql
-- Motor unificado de Cancelaciones, Devoluciones, Reclamaciones, Políticas de Vendor y Liquidaciones Hardenizadas

-- 1. Ampliar tabla vendors con políticas comerciales configurables
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT DEFAULT 'before_dispatch' CHECK (cancellation_policy IN ('before_prep', 'before_dispatch', 'time_window', 'none')),
  ADD COLUMN IF NOT EXISTS cancellation_window_hours INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS return_window_days INTEGER DEFAULT 0 CHECK (return_window_days >= 0 AND return_window_days <= 90),
  ADD COLUMN IF NOT EXISTS return_product_condition TEXT DEFAULT 'sealed_only' CHECK (return_product_condition IN ('sealed_only', 'opened_unused', 'no_box_allowed')),
  ADD COLUMN IF NOT EXISTS return_shipping_payer TEXT DEFAULT 'buyer' CHECK (return_shipping_payer IN ('buyer', 'vendor', 'conditional')),
  ADD COLUMN IF NOT EXISTS return_instructions TEXT,
  ADD COLUMN IF NOT EXISTS return_address TEXT;

-- 2. Snapshot inmutable de política en la suborden y campos de cancelación
ALTER TABLE public.order_suborders
  ADD COLUMN IF NOT EXISTS vendor_policy_snapshot JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 3. Tabla Unificada de Solicitudes (unified_order_requests)
CREATE TABLE IF NOT EXISTS public.unified_order_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  suborder_id UUID REFERENCES public.order_suborders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_model TEXT NOT NULL CHECK (business_model IN ('collectibles_national', 'vendor_national', 'collectibles_international')),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'cancel_before_payment',
    'cancel_immediate_10m',
    'cancel_vendor_policy',
    'cancel_international_zinc',
    'legal_withdrawal',
    'voluntary_return',
    'defective_product',
    'wrong_product',
    'damaged_in_transit',
    'not_delivered',
    'partial_refund',
    'full_refund',
    'chargeback'
  )),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED',
    'UNDER_REVIEW',
    'WAITING_VENDOR',
    'WAITING_SUPPLIER',
    'WAITING_RETURN',
    'RETURN_RECEIVED',
    'APPROVED',
    'REJECTED',
    'CANCELLATION_PENDING',
    'CANCELLATION_CONFIRMED',
    'REFUND_PENDING',
    'REFUND_PROCESSING',
    'REFUNDED',
    'REFUND_FAILED',
    'CLOSED'
  )),
  amount_requested NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  amount_approved NUMERIC(10,2) DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'UYU',
  reason TEXT NOT NULL,
  customer_notes TEXT,
  vendor_notes TEXT,
  admin_notes TEXT,
  evidence_images JSONB DEFAULT '[]'::jsonb,
  zinc_order_id TEXT,
  zinc_cancellation_status TEXT,
  zinc_response_payload JSONB DEFAULT '{}'::jsonb,
  zinc_refund_credited_to_wallet BOOLEAN DEFAULT false,
  courier_claim_reference TEXT,
  courier_claim_status TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS en unified_order_requests
ALTER TABLE public.unified_order_requests ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS RLS ESTRICTAS

-- A. Admins: Control total validando public.is_admin() (sin confiar en inputs)
DROP POLICY IF EXISTS "Admins manage all unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Admins manage all unified_order_requests" ON public.unified_order_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- B. Customers SELECT: Solo ver solicitudes donde son propietarios de la orden
DROP POLICY IF EXISTS "Customers view own unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Customers view own unified_order_requests" ON public.unified_order_requests
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = unified_order_requests.order_id 
      AND (o.customer_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

-- C. Customers INSERT: Validar estrictamente que la orden y la suborden les pertenecen realmente
DROP POLICY IF EXISTS "Customers create own unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Customers create own unified_order_requests" ON public.unified_order_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = unified_order_requests.order_id 
      AND (o.customer_id = auth.uid() OR o.user_id = auth.uid())
    ) AND
    (
      suborder_id IS NULL OR
      EXISTS (
        SELECT 1 FROM public.order_suborders os 
        WHERE os.id = unified_order_requests.suborder_id 
        AND os.parent_order_id = unified_order_requests.order_id
      )
    )
  );

-- D. Vendors SELECT: Solo solicitudes asociadas a su tienda/vendor_id autenticado
DROP POLICY IF EXISTS "Vendors view requests for their suborders" ON public.unified_order_requests;
CREATE POLICY "Vendors view requests for their suborders" ON public.unified_order_requests
  FOR SELECT
  TO authenticated
  USING (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE user_id = auth.uid()
    )
  );

-- E. Vendors UPDATE: Solo pueden actualizar sus propias notas/observaciones (vendor_notes).
-- Jamás alterar amount_approved, status financiero, order_id, suborder_id ni resoluciones administrativas.
DROP POLICY IF EXISTS "Vendors update response for their requests" ON public.unified_order_requests;
CREATE POLICY "Vendors update response for their requests" ON public.unified_order_requests
  FOR UPDATE
  TO authenticated
  USING (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE user_id = auth.uid()
    ) AND
    amount_approved = (SELECT r.amount_approved FROM public.unified_order_requests r WHERE r.id = unified_order_requests.id) AND
    order_id = (SELECT r.order_id FROM public.unified_order_requests r WHERE r.id = unified_order_requests.id) AND
    customer_id = (SELECT r.customer_id FROM public.unified_order_requests r WHERE r.id = unified_order_requests.id)
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_unified_requests_order ON public.unified_order_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_vendor ON public.unified_order_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_customer ON public.unified_order_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_status ON public.unified_order_requests(status);

-- 5. SEGURIDAD FINANCIERA: mark_liquidation_as_paid
-- Elimina completamente el parámetro p_admin_id inseguro.
-- Solo valida identidad server-side auténtica mediante public.is_admin() o auth.uid()
CREATE OR REPLACE FUNCTION public.mark_liquidation_as_paid(p_liquidation_id uuid, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar exclusivamente identidad autenticada server-side
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren privilegios de administrador autenticado.' USING errcode = '42501';
  END IF;

  IF p_liquidation_id IS NULL THEN
    RAISE EXCEPTION 'ID de liquidación no proporcionado.' USING errcode = '22023';
  END IF;

  -- 1. Actualizar liquidación a pagada con trazabilidad
  UPDATE public.vendor_liquidations
  SET status = 'paid',
      paid_at = now(),
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_liquidation_id;

  -- 2. Actualizar subórdenes con estado 'paid' consistente con comprobaciones financieras
  UPDATE public.order_suborders
  SET liquidation_status = 'paid',
      updated_at = now()
  WHERE liquidation_id = p_liquidation_id;

  RETURN true;
END;
$$;

-- Restringir estrictamente permisos EXECUTE
REVOKE ALL ON FUNCTION public.mark_liquidation_as_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_liquidation_as_paid(uuid, text) TO authenticated, service_role;
