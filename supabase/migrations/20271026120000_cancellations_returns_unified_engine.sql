-- 20261026000000_cancellations_returns_unified_engine.sql
-- Motor unificado de Cancelaciones, Devoluciones, Reclamaciones, Bucket Privado de Evidencias y Liquidaciones Seguras

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
  ADD COLUMN IF NOT EXISTS is_international BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_policy_snapshot JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Asegurar paid_at en orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_international BOOLEAN NOT NULL DEFAULT false;

-- 3. Storage Bucket Privado para Evidencias Fotográficas de Reclamaciones
INSERT INTO storage.buckets (id, name, public) 
VALUES ('order-dispute-evidence', 'order-dispute-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Políticas de RLS en storage.objects para order-dispute-evidence
DROP POLICY IF EXISTS "Authenticated users upload dispute evidence" ON storage.objects;
CREATE POLICY "Authenticated users upload dispute evidence" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (
  bucket_id = 'order-dispute-evidence' AND 
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Users and Admins view own dispute evidence" ON storage.objects;
CREATE POLICY "Users and Admins view own dispute evidence" ON storage.objects 
FOR SELECT TO authenticated 
USING (
  bucket_id = 'order-dispute-evidence' AND 
  (
    public.is_admin() OR 
    (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- 4. Tabla Unificada de Solicitudes (unified_order_requests)
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

-- 5. POLÍTICAS RLS ESTRICTAS

-- A. Admins: Control total validando public.is_admin()
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

-- C. Customers INSERT: Bloqueado directamente desde la tabla para impedir inyección de montos/estados.
-- Las solicitudes deben canalizarse mediante la Edge Function autorizada request-order-resolution o RPC protegida.
DROP POLICY IF EXISTS "Customers create own unified_order_requests" ON public.unified_order_requests;

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

-- E. Vendors UPDATE: Bloqueado directamente vía RLS.
-- La actualización de vendor_notes se gestiona mediante la RPC segura update_vendor_request_notes.
DROP POLICY IF EXISTS "Vendors update response for their requests" ON public.unified_order_requests;

-- RPC Segura para que Vendors actualicen notas sin tocar montos ni estados
CREATE OR REPLACE FUNCTION public.update_vendor_request_notes(
  p_request_id UUID,
  p_vendor_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  SELECT id INTO v_vendor_id FROM public.vendors WHERE user_id = auth.uid();
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Usuario no registrado como vendor.' USING errcode = '42501';
  END IF;

  UPDATE public.unified_order_requests
  SET vendor_notes = p_vendor_notes,
      updated_at = now()
  WHERE id = p_request_id AND vendor_id = v_vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada o no pertenece a tu comercio.' USING errcode = 'P0002';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_vendor_request_notes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_vendor_request_notes(UUID, TEXT) TO authenticated, service_role;

-- Indices
CREATE INDEX IF NOT EXISTS idx_unified_requests_order ON public.unified_order_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_vendor ON public.unified_order_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_customer ON public.unified_order_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_unified_requests_status ON public.unified_order_requests(status);
CREATE INDEX IF NOT EXISTS idx_unified_requests_idempotency ON public.unified_order_requests(idempotency_key);

-- 6. LIQUIDACIONES: ELIMINAR SOBRECARGA ANTIGUA Y PROTEGER FIRMA ÚNICA
-- Eliminar cualquier firma anterior de mark_liquidation_as_paid que acepte p_admin_id
DROP FUNCTION IF EXISTS public.mark_liquidation_as_paid(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mark_liquidation_as_paid(uuid, text);

-- Crear firma única e inmutable
CREATE OR REPLACE FUNCTION public.mark_liquidation_as_paid(p_liquidation_id uuid, p_reference text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar exclusivamente privilegios de administrador autenticado server-side
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


-- 7. ACTUALIZACIÓN TRANSACCIONAL DE create_order_atomic PARA PERSISTIR vendor_policy_snapshot
-- Reemplaza la inserción de order_suborders asegurando que el snapshot inmutable quede guardado
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_payment_method TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_shipping_address JSONB,
  p_affiliate_id UUID,
  p_coupon_id UUID,
  p_items JSONB,
  p_suborders JSONB,
  p_terms_accepted BOOLEAN DEFAULT true,
  p_terms_accepted_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  p_terms_version TEXT DEFAULT '2026-v1.0',
  p_identity_confirmed BOOLEAN DEFAULT false,
  p_customs_compliance_acknowledged BOOLEAN DEFAULT false,
  p_logistics_consent BOOLEAN DEFAULT false,
  p_display_currency TEXT DEFAULT 'UYU',
  p_display_subtotal NUMERIC DEFAULT NULL,
  p_display_shipping NUMERIC DEFAULT NULL,
  p_display_discounts NUMERIC DEFAULT NULL,
  p_display_total NUMERIC DEFAULT NULL,
  p_display_total_currency TEXT DEFAULT NULL,
  p_cart_subtotal_usd NUMERIC DEFAULT NULL,
  p_shipping_cost_usd NUMERIC DEFAULT NULL,
  p_courier_domestic_cost_usd NUMERIC DEFAULT NULL,
  p_applied_promotion_id TEXT DEFAULT NULL,
  p_promotion_discount_total NUMERIC DEFAULT 0,
  p_exchange_rate_value NUMERIC DEFAULT NULL,
  p_exchange_rate_effective_at NUMERIC DEFAULT NULL,
  p_exchange_rate_source TEXT DEFAULT NULL,
  p_is_exchange_rate_frozen BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_suborder JSONB;
  v_suborder_id UUID;
  v_suborder_number TEXT;
  v_item JSONB;
  v_order_item_id UUID;
  v_is_collectibles BOOLEAN;
  v_seller_type TEXT;
  v_shipping_mode TEXT;
  v_pickup_type TEXT;
  v_agency_id UUID;
  v_agency_name TEXT;
  v_dispatch_address_id UUID;
  v_internal_reference TEXT;
  v_vendor_id UUID;
  v_vendor_store_id UUID;
BEGIN
  IF p_total_amount < 0 THEN
    RAISE EXCEPTION 'Total amount no puede ser negativo.' USING errcode = '22003';
  END IF;

  -- 1. Insertar orden principal
  INSERT INTO public.orders (
    customer_id, user_id, total_amount, currency, payment_method,
    customer_email, customer_phone, shipping_address, affiliate_id, coupon_id,
    terms_accepted, terms_accepted_at, terms_version, status, payment_status,
    display_currency, display_subtotal, display_shipping, display_discounts,
    display_total, display_total_currency, exchange_rate_value, exchange_rate_source
  ) VALUES (
    p_customer_id, p_customer_id, p_total_amount, p_currency, p_payment_method,
    p_customer_email, p_customer_phone, p_shipping_address, p_affiliate_id, p_coupon_id,
    p_terms_accepted, p_terms_accepted_at, p_terms_version, 'pending', 'pending',
    p_display_currency, p_display_subtotal, p_display_shipping, p_display_discounts,
    p_display_total, p_display_total_currency, p_exchange_rate_value, p_exchange_rate_source
  ) RETURNING id INTO v_order_id;

  -- 2. Insertar subórdenes con persistencia de vendor_policy_snapshot
  IF p_suborders IS NOT NULL AND jsonb_array_length(p_suborders) > 0 THEN
    FOR v_suborder IN SELECT * FROM jsonb_array_elements(p_suborders)
    LOOP
      v_suborder_number := COALESCE(v_suborder->>'suborder_number', 'SUB-' || nextval('public.suborder_number_seq'));
      v_vendor_id := NULLIF(v_suborder->>'vendor_id', '')::uuid;
      v_vendor_store_id := NULLIF(v_suborder->>'vendor_store_id', '')::uuid;
      v_is_collectibles := COALESCE((v_suborder->>'is_collectibles_order')::boolean, false);
      v_seller_type := COALESCE(v_suborder->>'seller_type', CASE WHEN v_is_collectibles THEN 'platform' ELSE 'vendor' END);
      v_shipping_mode := v_suborder->>'shipping_mode';
      v_pickup_type := v_suborder->>'pickup_type';
      v_agency_id := NULLIF(v_suborder->>'agency_id', '')::uuid;
      v_agency_name := v_suborder->>'agency_name';
      v_dispatch_address_id := NULLIF(v_suborder->>'dispatch_address_id', '')::uuid;
      v_internal_reference := COALESCE(v_suborder->>'internal_reference', v_suborder_number);

      INSERT INTO public.order_suborders (
        parent_order_id, suborder_number, vendor_id, vendor_name, vendor_store_id, vendor_store_name, is_collectibles_order,
        product_subtotal, shipping_method, shipping_provider, shipping_cost, shipping_status,
        marketplace_commission_rate, marketplace_fee, vendor_gross_amount, vendor_net_amount,
        liquidation_status, status, discount_total, seller_type, shipping_mode, pickup_type,
        agency_id, agency_name, dispatch_address_id, internal_reference, vendor_policy_snapshot
      ) VALUES (
        v_order_id, v_suborder_number, v_vendor_id, v_suborder->>'vendor_name', v_vendor_store_id, v_suborder->>'vendor_store_name', v_is_collectibles,
        COALESCE((v_suborder->>'product_subtotal')::numeric, 0.00), v_suborder->>'shipping_method',
        v_suborder->>'shipping_provider', COALESCE((v_suborder->>'shipping_cost')::numeric, 0.00), 'pending',
        COALESCE((v_suborder->>'marketplace_commission_rate')::numeric, 0.00), COALESCE((v_suborder->>'marketplace_fee')::numeric, 0.00),
        COALESCE((v_suborder->>'vendor_gross_amount')::numeric, 0.00), COALESCE((v_suborder->>'vendor_net_amount')::numeric, 0.00),
        'pending', 'pending', COALESCE((v_suborder->>'discount_total')::numeric, 0.00),
        v_seller_type, v_shipping_mode, v_pickup_type, v_agency_id, v_agency_name, v_dispatch_address_id, v_internal_reference,
        COALESCE(v_suborder->'vendor_policy_snapshot', '{}'::jsonb)
      ) RETURNING id INTO v_suborder_id;

      -- 3. Insertar items correspondientes
      FOR v_item IN 
        SELECT * FROM jsonb_array_elements(p_items) AS item
        WHERE (item->>'vendor_id' = v_vendor_id::text) 
           OR (v_vendor_id IS NULL AND (item->>'vendor_id' IS NULL OR item->>'vendor_id' = ''))
      LOOP
        INSERT INTO public.order_items (
          order_id, suborder_id, product_id, variant_id, vendor_id, vendor_store_id,
          quantity, unit_price, total_price, product_name, sku, discount_total, final_total
        ) VALUES (
          v_order_id, v_suborder_id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id', '')::uuid,
          v_vendor_id, NULLIF(v_item->>'vendor_store_id', '')::uuid, (v_item->>'quantity')::integer,
          (v_item->>'unit_price')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer,
          COALESCE(v_item->>'product_name', v_item->>'title', 'Producto'), v_item->>'sku',
          COALESCE((v_item->>'discount_total')::numeric, 0.00),
          COALESCE((v_item->>'final_total')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer)
        );
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('order_id', v_order_id, 'success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN) TO service_role, postgres;
