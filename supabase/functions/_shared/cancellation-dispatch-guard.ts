/**
 * Preflight check BEFORE any external courier API call.
 * Database shipment/suborder triggers provide a second, transactional defense.
 * Only Collectibles payments via Handy/Mercado Pago are covered; Mercado Libre excluded.
 */
const ACTIVE_CANCEL_STATES = [
  'REQUESTED', 'UNDER_REVIEW', 'WAITING_VENDOR', 'APPROVED',
  'CANCELLATION_PENDING', 'CANCELLATION_CONFIRMED',
  'REFUND_PENDING', 'REFUND_PROCESSING',
];
const CANCEL_TYPES = [
  'cancel_immediate_10m', 'cancel_vendor_policy', 'legal_withdrawal',
  'full_refund', 'partial_refund',
];

export async function assertDispatchAllowed(
  supabaseAdmin: any,
  parentOrderId: string,
  suborderId: string | null = null,
): Promise<void> {
  if (!parentOrderId) throw new Error('DISPATCH_BLOCKED: missing order id');
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, payment_method, ml_order_id, order_source, status')
    .eq('id', parentOrderId)
    .single();
  if (orderError || !order) throw new Error('DISPATCH_BLOCKED: order lookup failed');

  // Never change the Mercado Libre workflow.
  if (order.ml_order_id || String(order.order_source || '').toLowerCase().includes('mercadolibre')) return;
  if (!['handy','mercadopago'].includes(String(order.payment_method || '').toLowerCase())) return;

  if (['refund_pending_manual','cancelada','cancelled','refunded'].includes(order.status)) {
    throw new Error('DISPATCH_BLOCKED: order is cancelled or awaiting a refund');
  }
  if (suborderId) {
    const { data: suborder, error: suborderError } = await supabaseAdmin
      .from('order_suborders')
      .select('status')
      .eq('id', suborderId)
      .eq('parent_order_id', parentOrderId)
      .single();
    if (suborderError || !suborder) throw new Error('DISPATCH_BLOCKED: suborder lookup failed');
    if (['refund_pending_manual','cancelled','refunded'].includes(suborder.status)) {
      throw new Error('DISPATCH_BLOCKED: suborder is cancelled or awaiting a refund');
    }
  }
  let query = supabaseAdmin.from('unified_order_requests')
    .select('id')
    .eq('order_id', parentOrderId)
    .in('request_type', CANCEL_TYPES)
    .in('status', ACTIVE_CANCEL_STATES)
    .limit(1);

  if (suborderId) {
    query = query.or(`suborder_id.is.null,suborder_id.eq.${suborderId}`);
  }
  const { data, error } = await query;
  if (error) throw new Error('DISPATCH_BLOCKED: cancellation preflight lookup failed');
  if (data && data.length > 0) {
    throw new Error('DISPATCH_BLOCKED_BY_CANCELLATION: unresolved cancellation request');
  }
}
