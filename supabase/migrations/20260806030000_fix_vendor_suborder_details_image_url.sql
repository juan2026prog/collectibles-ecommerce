-- Migration: 20260806030000_fix_vendor_suborder_details_image_url.sql
-- Description: Fix get_vendor_suborder_details RPC to safely query product_images table instead of nonexistent pv.image_url column

CREATE OR REPLACE FUNCTION get_vendor_suborder_details(p_suborder_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suborder record;
  v_order record;
  v_items json;
  v_attempt record;
  v_events json;
  v_is_vendor boolean;
  v_is_admin boolean;
  v_is_approved boolean;
  v_sanitized_address json;
  v_result json;
BEGIN
  -- 1. Check authentication (allow postgres, service_role, or authenticated user)
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch suborder
  SELECT * INTO v_suborder FROM order_suborders WHERE id = p_suborder_id;
  IF v_suborder.id IS NULL THEN
    RAISE EXCEPTION 'Suborden no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Security check: User must be the vendor or an admin or postgres/service_role
  IF current_user NOT IN ('postgres', 'service_role') AND session_user <> 'postgres' THEN
    SELECT (v_suborder.vendor_id = auth.uid()) INTO v_is_vendor;
    SELECT COALESCE(is_admin, false) INTO v_is_admin FROM profiles WHERE id = auth.uid();

    IF NOT (v_is_vendor OR v_is_admin) THEN
      RAISE EXCEPTION 'Acceso denegado: No tenés permiso para ver esta suborden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Fetch parent order
  SELECT * INTO v_order FROM orders WHERE id = v_suborder.parent_order_id;

  -- 5. Fetch suborder items (using safe image fallback order: product_images primary -> product_images first -> null)
  SELECT json_agg(
    json_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name', COALESCE(oi.product_name, p.title, 'Producto'),
      'variant_id', oi.variant_id,
      'sku', COALESCE(oi.sku, pv.sku, 'N/A'),
      'variant_name', pv.name,
      'image_url', pi.url,
      'product_image_url', pi.url,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'final_total', oi.final_total,
      'is_preorder', COALESCE((p.badge ILIKE '%preorder%' OR p.badge ILIKE '%preventa%'), false)
    )
  ) INTO v_items
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN product_variants pv ON pv.id = oi.variant_id
  LEFT JOIN LATERAL (
    SELECT img.url 
    FROM product_images img 
    WHERE img.product_id = oi.product_id 
    ORDER BY img.is_primary DESC, img.sort_order ASC, img.created_at ASC 
    LIMIT 1
  ) pi ON true
  WHERE oi.suborder_id = v_suborder.id;

  -- 6. Fetch latest payment attempt
  SELECT * INTO v_attempt 
  FROM payment_attempts 
  WHERE order_id = v_suborder.parent_order_id 
  ORDER BY attempt_number DESC LIMIT 1;

  -- 7. Fetch audit events pertinent to order
  SELECT json_agg(
    json_build_object(
      'id', pe.id,
      'event_type', pe.event_type,
      'normalized_status', pe.normalized_status,
      'provider', pe.provider,
      'source', pe.source,
      'processing_result', pe.processing_result,
      'created_at', pe.created_at
    ) ORDER BY pe.created_at DESC
  ) INTO v_events
  FROM payment_events pe
  WHERE pe.order_id = v_suborder.parent_order_id;

  -- 8. Check if payment is approved
  v_is_approved := (COALESCE(v_order.payment_status, '') = 'approved' OR COALESCE(v_order.status, '') = 'paid');

  -- 9. Protect buyer delivery address if payment is not approved
  IF v_is_approved THEN
    v_sanitized_address := v_order.shipping_address;
  ELSE
    v_sanitized_address := json_build_object(
      'first_name', COALESCE(v_order.shipping_address->>'first_name', 'Cliente'),
      'last_name', COALESCE(v_order.shipping_address->>'last_name', ''),
      'city', COALESCE(v_order.shipping_address->>'city', ''),
      'department', COALESCE(v_order.shipping_address->>'department', ''),
      'country', COALESCE(v_order.shipping_address->>'country', 'Uruguay'),
      'address_protected', true,
      'protection_message', 'Los datos completos de entrega se habilitarán cuando el pago quede confirmado.'
    );
  END IF;

  -- 10. Construct final result JSON
  v_result := json_build_object(
    'suborder', json_build_object(
      'id', v_suborder.id,
      'suborder_number', v_suborder.suborder_number,
      'vendor_id', v_suborder.vendor_id,
      'vendor_name', v_suborder.vendor_name,
      'status', v_suborder.status,
      'preparation_status', CASE 
        WHEN NOT v_is_approved THEN 'blocked_by_payment'
        WHEN v_suborder.status = 'preparing' THEN 'preparing'
        WHEN v_suborder.status = 'ready_to_ship' THEN 'ready_to_ship'
        WHEN v_suborder.status = 'shipped' OR v_suborder.status = 'despachado' THEN 'dispatched'
        WHEN v_suborder.status = 'cancelled' OR v_suborder.status = 'cancelada' THEN 'cancelled'
        ELSE 'pending'
      END,
      'product_subtotal', v_suborder.product_subtotal,
      'shipping_cost', v_suborder.shipping_cost,
      'marketplace_fee', v_suborder.marketplace_fee,
      'payment_fee_share', v_suborder.payment_fee_share,
      'vendor_net_amount', v_suborder.vendor_net_amount,
      'shipping_method', v_suborder.shipping_method,
      'shipping_provider', v_suborder.shipping_provider,
      'shipping_mode', v_suborder.shipping_mode,
      'pickup_type', v_suborder.pickup_type,
      'tracking_number', v_suborder.tracking_number,
      'tracking_url', v_suborder.tracking_url,
      'liquidation_status', COALESCE(v_suborder.liquidation_status, 'pending'),
      'eligible_for_liquidation_at', v_suborder.eligible_for_liquidation_at,
      'created_at', v_suborder.created_at
    ),
    'order', json_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'created_at', v_order.created_at,
      'status', v_order.status,
      'payment_status', COALESCE(v_order.payment_status, 'pending'),
      'payment_provider', COALESCE(v_order.payment_provider, v_order.payment_method, 'handy'),
      'payment_method', v_order.payment_method,
      'customer_name', COALESCE(v_order.customer_name, (v_order.shipping_address->>'first_name') || ' ' || (v_order.shipping_address->>'last_name')),
      'customer_phone', CASE WHEN v_is_approved THEN COALESCE(v_order.customer_phone, v_order.shipping_address->>'phone') ELSE 'Protegido hasta confirmación de pago' END,
      'shipping_address', v_sanitized_address
    ),
    'items', COALESCE(v_items, '[]'::json),
    'latest_attempt', CASE WHEN v_attempt IS NOT NULL THEN row_to_json(v_attempt) ELSE NULL END,
    'events', COALESCE(v_events, '[]'::json)
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_vendor_suborder_details_by_number(p_suborder_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suborder_id uuid;
BEGIN
  SELECT id INTO v_suborder_id FROM order_suborders WHERE suborder_number = p_suborder_number;
  IF v_suborder_id IS NULL THEN
    RAISE EXCEPTION 'Suborden % no encontrada', p_suborder_number USING ERRCODE = 'P0002';
  END IF;

  RETURN get_vendor_suborder_details(v_suborder_id);
END;
$$;
