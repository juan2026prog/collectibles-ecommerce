import { describe, expect, it } from 'vitest';
import { extractHandyWebhookData, mapHandyPaymentStatus, parseHandyRefundResponse, isHandyCardPayment, isHandyFullReversal } from '../../../supabase/functions/_shared/handy';

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


describe('Handy Uruguay — single full-sale card refund v2', () => {
  const tx = '14ac888c-789d-43de-8ca4-8c57cf63b401';
  it('accepts only provider confirmation of request initiation for exact transaction', () => {
    expect(parseHandyRefundResponse({
      IsSuccess: true, StatusCode: 200, TransactionExternalId: tx,
    },tx).accepted).toBe(true);
    expect(parseHandyRefundResponse({
      IsSuccess: false, StatusCode: 200, TransactionExternalId: tx,
    },tx).accepted).toBe(false);
    expect(parseHandyRefundResponse({
      IsSuccess: true, StatusCode: 200, TransactionExternalId: 'other',
    },tx).accepted).toBe(false);
    expect(parseHandyRefundResponse({
      IsSuccess: true, StatusCode: 400, TransactionExternalId: tx,
    },tx).accepted).toBe(false);
  });

  it('permits only full original payment, without item/suborder scope', () => {
    expect(isHandyFullReversal(2,2,null,null)).toBe(true);
    expect(isHandyFullReversal(4,4,null,null)).toBe(true);
    expect(isHandyFullReversal(2,4,null,null)).toBe(false);
    expect(isHandyFullReversal(2,2,'vendor-suborder',null)).toBe(false);
    expect(isHandyFullReversal(2,2,null,'order-item')).toBe(false);
    expect(isHandyFullReversal(NaN,2,null,null)).toBe(false);
  });

  it('rejects bank transfers and Redpagos even if NotACard=false', () => {
    expect(isHandyCardPayment({
      InstrumentData:{NotACard:false,Name:'ITAÚ',IssuerName:'ITAÚ'},
    })).toBe(false);
    expect(isHandyCardPayment({
      InstrumentData:{NotACard:true,Name:'12345678',IssuerName:'Redpagos'},
    })).toBe(false);
    expect(isHandyCardPayment({})).toBe(false);
  });

  it('accepts approved Mastercard and Visa with explicit card evidence', () => {
    expect(isHandyCardPayment({
      InstrumentData:{NotACard:false,Name:'520394XXXXXX3450',IssuerName:'MasterCard'},
    })).toBe(true);
    expect(isHandyCardPayment({
      InstrumentData:{NotACard:false,Name:'411111XXXXXX1111',IssuerName:'Visa'},
    })).toBe(true);
  });
});
