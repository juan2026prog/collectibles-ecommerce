import { describe, expect, it } from 'vitest';
import { extractHandyWebhookData, mapHandyPaymentStatus } from '../../../supabase/functions/_shared/handy';

// Official Handy Boton de Pago v2 (2025) status codes: 0 initiated,
// 1 approved, 2 failed, 3 pending. Never approve a failed transaction.
describe('Handy Uruguay — webhook status safety', () => {
  it.each([
    ['0', 'pending'],
    ['1', 'approved'],
    ['2', 'failed'],
    ['3', 'pending'],
    ['PAID', 'approved'],
    ['FAILED', 'failed'],
    ['UNRECOGNIZED', 'unknown'],
  ])('maps %s to %s', (raw, expected) => {
    expect(mapHandyPaymentStatus(raw)).toBe(expected);
  });

  it('reads Handy v2 PurchaseData.Status and TransactionExternalId', () => {
    const payload = {
      TransactionExternalId: '14ac888c-789d-43de-8ca4-8c57cf63b401',
      PurchaseData: { Status: 1, TotalAmount: 1090, Currency: 858 },
    };
    const actual = extractHandyWebhookData(payload);
    expect(actual.transactionExternalId).toBe(payload.TransactionExternalId);
    expect(actual.mappedStatus).toBe('approved');
  });

  it('does not interpret Handy failed status 2 as an approved payment', () => {
    const payload = {
      TransactionExternalId: '14ac888c-789d-43de-8ca4-8c57cf63b401',
      PurchaseData: { Status: 2, TotalAmount: 1090, Currency: 858 },
    };
    expect(extractHandyWebhookData(payload).mappedStatus).toBe('failed');
  });
});
