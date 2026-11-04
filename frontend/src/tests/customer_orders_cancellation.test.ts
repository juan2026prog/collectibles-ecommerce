import { describe, it, expect } from 'vitest';

describe('Customer Orders Classification & Filtering Helper Logic', () => {
  function formatCurrencyPrice(amount: number) {
    return `$ ${amount.toFixed(2)}`;
  }

  // Classification helper mirroring CustomerPortal.tsx logic
  function classifyOrder(order: any) {
    const isOrderCancelled = ['cancelled', 'cancelada'].includes(order.status);
    const isOrderExpired = order.status === 'expired';

    // Manejo robusto de reembolsos: verificar estado completado/aprobado e importe reembolsado
    const completedRefunds = (order.refunds || []).filter((r: any) => 
      ['approved', 'completed', 'succeeded'].includes((r.status || '').toLowerCase())
    );
    const totalRefundedAmount = completedRefunds.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    const isFullRefund = totalRefundedAmount >= Number(order.total_amount || 0) && totalRefundedAmount > 0;
    const isPartialRefund = totalRefundedAmount > 0 && !isFullRefund;

    const isPaymentRefunded = order.payment_status === 'refunded' || isFullRefund;
    const isPaymentPartiallyRefunded = order.payment_status === 'partially_refunded' || isPartialRefund;
    const hasApprovedPayment = (order.payments || []).some((p: any) => p.status === 'approved') || order.payment_status === 'approved';

    let orderBadge = { label: 'Esperando Pago', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
    if (isOrderCancelled) {
      orderBadge = { label: 'Cancelado', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
    } else if (isOrderExpired) {
      orderBadge = { label: 'Expirado', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
    } else if (['paid', 'confirmed'].includes(order.status)) {
      orderBadge = { label: 'Confirmado', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    } else if (order.status === 'processing') {
      orderBadge = { label: 'En Preparación', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
    } else if (order.status === 'shipped') {
      orderBadge = { label: 'En Tránsito', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    } else if (order.status === 'delivered') {
      orderBadge = { label: 'Entregado', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    }

    let paymentBadge = { label: 'Sin Iniciar', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
    if (isPaymentRefunded) {
      paymentBadge = { label: 'Reembolsado', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
    } else if (isPaymentPartiallyRefunded) {
      paymentBadge = { label: 'Reembolso Parcial', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
    } else if (hasApprovedPayment) {
      paymentBadge = { label: 'Aprobado', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    } else if (order.payment_status === 'rejected') {
      paymentBadge = { label: 'Rechazado', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
    } else if (order.payment_status === 'pending' || order.status === 'awaiting_payment') {
      paymentBadge = { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    }

    // Cancellation / refund state distinction
    let cancellationNotice: { type: 'refunded' | 'partial_refund' | 'pending_refund' | 'unpaid_cancelled' | null; label: string } = {
      type: null,
      label: ''
    };

    if (isPaymentRefunded) {
      cancellationNotice = {
        type: 'refunded',
        label: `Reembolsado (${formatCurrencyPrice(totalRefundedAmount || order.total_amount)})`
      };
    } else if (isPaymentPartiallyRefunded) {
      cancellationNotice = {
        type: 'partial_refund',
        label: `Reembolso Parcial (${formatCurrencyPrice(totalRefundedAmount)})`
      };
    } else if (isOrderCancelled && hasApprovedPayment) {
      cancellationNotice = {
        type: 'pending_refund',
        label: 'Cancelación solicitada — Devolución pendiente'
      };
    } else if (isOrderCancelled && !hasApprovedPayment) {
      cancellationNotice = {
        type: 'unpaid_cancelled',
        label: 'Cancelado (Sin cargo realizado)'
      };
    }

    return { orderBadge, paymentBadge, cancellationNotice, hasApprovedPayment };
  }

  function matchesFilter(order: any, filter: string): boolean {
    const isCancelled = ['cancelled', 'cancelada'].includes(order.status);
    const completedRefunds = (order.refunds || []).filter((r: any) => 
      ['approved', 'completed', 'succeeded'].includes((r.status || '').toLowerCase())
    );
    const totalRefunded = completedRefunds.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    const isRefunded = order.payment_status === 'refunded' || order.payment_status === 'partially_refunded' || totalRefunded > 0;
    const isPaid = (order.payments || []).some((p: any) => p.status === 'approved') || ['paid', 'confirmed'].includes(order.status);

    switch (filter) {
      case 'pending':
        return ['pending', 'awaiting_payment'].includes(order.status) && !isCancelled;
      case 'paid':
        return isPaid && !isCancelled && !isRefunded;
      case 'processing':
        return order.status === 'processing';
      case 'shipped':
        return order.status === 'shipped';
      case 'cancelled':
        return isCancelled;
      case 'refunded':
        return isRefunded;
      case 'all':
      default:
        return true;
    }
  }

  it('correctly classifies COL-20261103-0020 as Refunded with confirmed refund record', () => {
    const col0020 = {
      id: '27874812-e8be-4536-860a-8f5e6d68ab37',
      order_number: 'COL-20261103-0020',
      total_amount: 2,
      status: 'cancelada',
      payment_status: 'refunded',
      payments: [{ id: 'p1', status: 'approved' }],
      refunds: [{ id: 'r1', amount: 2, status: 'approved' }]
    };

    const classified = classifyOrder(col0020);
    expect(classified.cancellationNotice.type).toBe('refunded');
    expect(classified.cancellationNotice.label).toContain('Reembolsado');
    expect(classified.paymentBadge.label).toBe('Reembolsado');
    expect(matchesFilter(col0020, 'refunded')).toBe(true);
    expect(matchesFilter(col0020, 'cancelled')).toBe(true);
  });

  it('does NOT classify as refunded if a refund attempt is rejected or pending', () => {
    const orderWithFailedRefund = {
      id: 'ord-failed-refund',
      order_number: 'COL-TEST-FAIL-REF',
      total_amount: 50,
      status: 'cancelada',
      payment_status: 'approved',
      payments: [{ id: 'p1', status: 'approved' }],
      refunds: [{ id: 'r1', amount: 50, status: 'rejected' }]
    };

    const classified = classifyOrder(orderWithFailedRefund);
    expect(classified.cancellationNotice.type).toBe('pending_refund');
    expect(classified.paymentBadge.label).toBe('Aprobado');
    expect(matchesFilter(orderWithFailedRefund, 'refunded')).toBe(false);
  });

  it('correctly handles partial refund amounts and badges', () => {
    const orderPartial = {
      id: 'ord-partial-refund',
      order_number: 'COL-TEST-PARTIAL',
      total_amount: 100,
      status: 'paid',
      payment_status: 'partially_refunded',
      payments: [{ id: 'p1', status: 'approved' }],
      refunds: [{ id: 'r1', amount: 30, status: 'completed' }]
    };

    const classified = classifyOrder(orderPartial);
    expect(classified.cancellationNotice.type).toBe('partial_refund');
    expect(classified.paymentBadge.label).toBe('Reembolso Parcial');
    expect(matchesFilter(orderPartial, 'refunded')).toBe(true);
  });

  it('correctly classifies COL-20261031-0002 as Cancellation Requested with Pending Refund', () => {
    const col0002 = {
      id: '95c110c1-942c-48ef-9f9a-5e4eec6c1f00',
      order_number: 'COL-20261031-0002',
      total_amount: 2,
      status: 'cancelada',
      payment_status: 'approved',
      payments: [{ id: 'p2', status: 'approved' }],
      refunds: []
    };

    const classified = classifyOrder(col0002);
    expect(classified.cancellationNotice.type).toBe('pending_refund');
    expect(classified.cancellationNotice.label).toBe('Cancelación solicitada — Devolución pendiente');
    expect(classified.paymentBadge.label).toBe('Aprobado');
    expect(matchesFilter(col0002, 'cancelled')).toBe(true);
    expect(matchesFilter(col0002, 'refunded')).toBe(false);
  });

  it('correctly classifies COL-20261103-0014 as Expired / Unpaid', () => {
    const col0014 = {
      id: '55e1f242-1375-4d0f-a209-d009ecf0b8fa',
      order_number: 'COL-20261103-0014',
      total_amount: 2,
      status: 'expired',
      payment_status: 'expired',
      payments: [],
      refunds: []
    };

    const classified = classifyOrder(col0014);
    expect(classified.orderBadge.label).toBe('Expirado');
    expect(classified.hasApprovedPayment).toBe(false);
    expect(classified.cancellationNotice.type).toBe(null);
  });

  it('handles unpaid order cancellation distinction', () => {
    const unpaidCancelledOrder = {
      id: 'order-unpaid-uuid',
      total_amount: 15,
      status: 'cancelada',
      payment_status: 'cancelled',
      payments: [],
      refunds: []
    };

    const classified = classifyOrder(unpaidCancelledOrder);
    expect(classified.cancellationNotice.type).toBe('unpaid_cancelled');
    expect(classified.cancellationNotice.label).toBe('Cancelado (Sin cargo realizado)');
  });
});
