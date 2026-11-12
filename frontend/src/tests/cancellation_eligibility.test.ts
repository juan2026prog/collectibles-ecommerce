import { describe, expect, it } from 'vitest';
import { getCancellationEligibility } from '../lib/cancellationEligibility';

describe('Customer cancellation eligibility — Handy and Mercado Pago', () => {
  it('allows unpaid, not-yet-started orders to be cancelled', () => {
    expect(getCancellationEligibility({status:'awaiting_payment'}).canCancelUnpaid).toBe(true);
  });
  it('blocks unpaid cancellation during payment reconciliation', () => {
    const x=getCancellationEligibility({status:'awaiting_payment',reconciliation_status:'pending_reconciliation'});
    expect(x.canCancelUnpaid).toBe(false);
  });
  it('allows a paid order to request a resolution before shipping', () => {
    expect(getCancellationEligibility({status:'confirmed',payment_status:'approved'}).canRequestPaidResolution).toBe(true);
  });
  it('does not cancel an approved payment as unpaid', () => {
    expect(getCancellationEligibility({status:'pending',payments:[{status:'approved'}]}).canCancelUnpaid).toBe(false);
  });
  it('does not open a second cancellation for a pending Handy refund', () => {
    const x=getCancellationEligibility({status:'refund_pending_manual',payment_status:'approved'});
    expect(x.isManualRefundPending).toBe(true);
    expect(x.canCancelUnpaid).toBe(false);
    expect(x.canRequestPaidResolution).toBe(false);
  });
  it('detects a refund pending in the payment record', () => {
    expect(getCancellationEligibility({status:'confirmed',payments:[{status:'manual_refund_required'}]}).canRequestPaidResolution).toBe(false);
  });
  it('does not allow pre-dispatch cancellation after shipment', () => {
    for (const status of ['shipped','delivered','entregado','despachado']) {
      expect(getCancellationEligibility({status,payment_status:'approved'}).canRequestPaidResolution).toBe(false);
    }
  });
  it('does not allow duplicate cancellation of an already cancelled order', () => {
    const x=getCancellationEligibility({status:'cancelada'});
    expect(x.canCancelUnpaid).toBe(false);
    expect(x.canRequestPaidResolution).toBe(false);
  });
  it('does not allow cancelling a fully refunded order again', () => {
    expect(getCancellationEligibility({status:'refunded',payment_status:'refunded'}).canRequestPaidResolution).toBe(false);
  });
});
