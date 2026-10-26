-- 20271026000000_cancellations_returns_unified_engine.sql
-- Motor unificado de Cancelaciones, Devoluciones, Reclamaciones, Políticas de Vendor y Normalización de Liquidaciones

-- 1. Ampliar tabla vendors con políticas comerciales configurables
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT DEFAULT 'before_dispatch' CHECK (cancellation_policy IN ('before_prep', 'before_dispatch', 'time_window', 'none')),
  ADD COLUMN IF NOT EXISTS cancellation_window_hours INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS return_window_days INTEGER DEFAULT 0 CHECK (return_window_days >= 0 AND return_window_days <= 90),
  ADD COLUMN IF NOT EXISTS return_product_condition TEXT DEFAULT 'sealed_only' CHECK (return_product_condition IN ('sealed_only', 'opened_unused', 'no_box_allowed')),
  ADD COLUMN IF NOT EXISTS return_shipping_payer TEXT DEFAULT 'buyer' CHECK (return_shipping_payer IN ('buyer', 'vendor', 'conditional')),
  ADD COLUMN IF NOT EXISTS return_instructions TEXT,
  ADD COLUMN IF NOT EXISTS return_address TEXT;

-- 2. Asegurar snapshot inmutable de política en la suborden
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

-- Políticas de RLS
DROP POLICY IF EXISTS "Admins manage all unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Admins manage all unified_order_requests" ON public.unified_order_requests
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Customers view own unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Customers view own unified_order_requests" ON public.unified_order_requests
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers create own unified_order_requests" ON public.unified_order_requests;
CREATE POLICY "Customers create own unified_order_requests" ON public.unified_order_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Vendors view requests for their suborders" ON public.unified_order_requests;
CREATE POLICY "Vendors view requests for their suborders" ON public.unified_order_requests
  FOR SELECT
  TO authenticated
  USING (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE user_id = auth.uid()
    )
  );

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
    )
  );

-- Indices para rendimiento óptimo
CREATE INDEX IF NOT EXISTS idx_unified_requests_order ON public.unified_order_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_vendor ON public.unified_order_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_customer ON public.unified_order_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_status ON public.unified_order_requests(status);

-- 4. Normalizar RPC mark_liquidation_as_paid para consistencia con liquidation_status = 'paid'
CREATE OR REPLACE FUNCTION public.mark_liquidation_as_paid(p_admin_id uuid, p_liquidation_id uuid, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) 
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.' USING errcode = '42501';
  END IF;

  UPDATE public.vendor_liquidations
  SET status = 'paid',
      paid_at = now(),
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_liquidation_id;

  -- Actualizar subórdenes con estado 'paid' consistente con el check de refund-order
  UPDATE public.order_suborders
  SET liquidation_status = 'paid',
      updated_at = now()
  WHERE liquidation_id = p_liquidation_id;

  RETURN true;
END;
$$;

-- Permisos RPC
REVOKE EXECUTE ON FUNCTION public.mark_liquidation_as_paid(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_liquidation_as_paid(uuid, uuid, text) TO authenticated, service_role;
