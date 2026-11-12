export interface CancellationOrder {
  status?: string | null;
  payment_status?: string | null;
  reconciliation_status?: string | null;
  payments?: Array<{ status?: string | null }> | null;
}

/**
 * Client-side presentation only. Server remains authoritative for financial state.
 */
export function getCancellationEligibility(order: CancellationOrder) {
  const status = order.status || '';
  const approvedPayment = (order.payments || []).some(p => p.status === 'approved')
    || order.payment_status === 'approved';
  const isCancelled = ['cancelled', 'cancelada'].includes(status);
  const isManualRefundPending = status === 'refund_pending_manual'
    || (order.payments || []).some(p => p.status === 'manual_refund_required');
  const requiresReconciliation = order.reconciliation_status === 'pending_reconciliation'
    || order.payment_status === 'manual_refund_required';
  const isAlreadyRefunded = order.payment_status === 'refunded' ||
    ['refunded','partially_refunded'].includes(status);

  return {
    hasApprovedPayment: approvedPayment,
    isManualRefundPending,
    requiresReconciliation,
    canCancelUnpaid: !isCancelled && !isAlreadyRefunded && !isManualRefundPending
      && !requiresReconciliation && !approvedPayment
      && ['awaiting_payment', 'pending', 'expired'].includes(status),
    canRequestPaidResolution: !isCancelled && !isAlreadyRefunded && !isManualRefundPending
      && approvedPayment && !['shipped','delivered','entregado','despachado'].includes(status),
  };
}
