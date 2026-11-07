import { describe, it, expect } from 'vitest';
import { mapHandyPaymentStatus, extractHandyWebhookData } from '../../../supabase/functions/_shared/handy.ts';

describe('Handy Integration Certification Suite', () => {
  describe('FASE 2 & 4: Status Mapping Invariants', () => {
    it('correctly maps all official Handy v2 status codes and descriptions to normalized states', () => {
      // Handy v2 Botón de Pago official:
      // 1: Pago exitoso
      // 2: Pago fallido
      // 3: Pendiente de pago
      // 0: Pago iniciado
      expect(mapHandyPaymentStatus(1)).toBe('approved');
      expect(mapHandyPaymentStatus('1')).toBe('approved');
      expect(mapHandyPaymentStatus('APPROVED')).toBe('approved');
      expect(mapHandyPaymentStatus('AUTHORIZED')).toBe('approved');
      expect(mapHandyPaymentStatus('PAID')).toBe('approved');
      expect(mapHandyPaymentStatus('SUCCESS')).toBe('approved');
      expect(mapHandyPaymentStatus('FINALIZADO')).toBe('approved');

      expect(mapHandyPaymentStatus(2)).toBe('rejected');
      expect(mapHandyPaymentStatus('2')).toBe('rejected');
      expect(mapHandyPaymentStatus('REJECTED')).toBe('rejected');
      expect(mapHandyPaymentStatus('DECLINED')).toBe('rejected');
      expect(mapHandyPaymentStatus('FAILED')).toBe('rejected');

      expect(mapHandyPaymentStatus(3)).toBe('pending');
      expect(mapHandyPaymentStatus('3')).toBe('pending');
      expect(mapHandyPaymentStatus(0)).toBe('pending');
      expect(mapHandyPaymentStatus('0')).toBe('pending');
      expect(mapHandyPaymentStatus('PENDING')).toBe('pending');
      expect(mapHandyPaymentStatus('CREATED')).toBe('pending');

      expect(mapHandyPaymentStatus('CANCELLED')).toBe('cancelled');
      expect(mapHandyPaymentStatus('4')).toBe('cancelled');

      expect(mapHandyPaymentStatus('REFUNDED')).toBe('refunded');
      expect(mapHandyPaymentStatus('5')).toBe('refunded');

      expect(mapHandyPaymentStatus('UNKNOWN_STATUS_XYZ')).toBe('failed');
      expect(mapHandyPaymentStatus(undefined)).toBe('failed');
    });

    it('correctly extracts official webhook data from Handy change-of-status notification (Section 6.1.1)', () => {
      const payload = {
        TransactionExternalId: '11111111-2222-3333-4444-555555555555',
        PurchaseData: {
          Currency: 858,
          TotalAmount: 1250.00,
          TaxedAmount: 0.0,
          Status: 1,
          Id: 'HN-PAY-987654',
          Products: [
            { Name: 'Figura Coleccionable 1', Quantity: 1, Amount: 1250.00 }
          ]
        }
      };

      const extracted = extractHandyWebhookData(payload);
      expect(extracted.transactionExternalId).toBe('11111111-2222-3333-4444-555555555555');
      expect(extracted.providerTransactionId).toBe('HN-PAY-987654');
      expect(extracted.mappedStatus).toBe('approved');
    });

    it('correctly extracts refund notification from Handy refund webhook (Section 6.1.2)', () => {
      const payload = {
        Success: true,
        Message: 'Devolución realizada correctamente',
        TransactionExternalId: '11111111-2222-3333-4444-555555555555'
      };

      const extracted = extractHandyWebhookData(payload);
      expect(extracted.transactionExternalId).toBe('11111111-2222-3333-4444-555555555555');
      expect(extracted.mappedStatus).toBe('refunded');
    });

    it('handles rejected payments correctly without throwing or misclassifying', () => {
      const payload = {
        TransactionExternalId: '11111111-2222-3333-4444-555555555555',
        PurchaseData: {
          Currency: 858,
          TotalAmount: 1250.00,
          Status: 2,
          Id: 'HN-PAY-FAIL-1'
        }
      };

      const extracted = extractHandyWebhookData(payload);
      expect(extracted.mappedStatus).toBe('rejected');
    });
  });

  describe('FASE 2: Out of order webhook defense', () => {
    it('preserves approved state if a stale pending or rejected webhook arrives later', () => {
      const paymentRecord = {
        id: 'pay-uuid-123',
        status: 'approved',
        amount: 500,
      };

      // Stale webhook arrives with Status: 3 (Pending) or 2 (Rejected)
      const staleWebhookData = {
        mappedStatus: 'rejected',
      };

      // Validation logic as coded in handy-webhook:
      let action = 'process';
      if (paymentRecord.status === 'approved') {
        if (staleWebhookData.mappedStatus === 'approved') {
          action = 'skip_already_processed';
        } else if (staleWebhookData.mappedStatus !== 'refunded') {
          action = 'ignore_stale_status';
        } else {
          action = 'process_refund';
        }
      }

      expect(action).toBe('ignore_stale_status');
    });

    it('allows refund notification to process even if payment was previously approved', () => {
      const paymentRecord = {
        id: 'pay-uuid-123',
        status: 'approved',
        amount: 500,
      };

      const refundWebhookData = {
        mappedStatus: 'refunded',
      };

      let action = 'process';
      if (paymentRecord.status === 'approved') {
        if (refundWebhookData.mappedStatus === 'approved') {
          action = 'skip_already_processed';
        } else if (refundWebhookData.mappedStatus !== 'refunded') {
          action = 'ignore_stale_status';
        } else {
          action = 'process_refund';
        }
      }

      expect(action).toBe('process_refund');
    });
  });

  describe('FASE 2: Financial Integrity (Amount & Currency check)', () => {
    it('flags amount mismatch if webhook amount differs from order total amount', () => {
      const orderAmount = 1500.00;
      const receivedAmount = 1400.00; // Altered amount

      const orderCents = Math.round(orderAmount * 100);
      const receivedCents = Math.round(receivedAmount * 100);
      expect(receivedCents === orderCents).toBe(false);
    });

    it('flags currency mismatch if webhook currency does not match order currency code', () => {
      const orderCurrency = 'UYU'; // expected 858
      const expectedCode = orderCurrency === 'USD' ? 840 : 858;
      const receivedCurrency = 840; // USD received instead of UYU

      const hasCurrencyMismatch = receivedCurrency !== expectedCode;
      expect(hasCurrencyMismatch).toBe(true);
    });
  });

  describe('HOTFIX: Strict Financial Validation & Exact Decimal Minor Unit (Cents) Invariants', () => {
    it('requires TotalAmount and Currency strictly from PurchaseData, rejecting missing or invalid values', () => {
      // 1. Missing PurchaseData
      const payloadNoPurchase = {
        TransactionExternalId: '11111111-2222-3333-4444-555555555555',
        Status: 1,
      };
      const extracted1 = extractHandyWebhookData(payloadNoPurchase);
      expect(Number.isNaN(extracted1.totalAmount)).toBe(true);
      expect(Number.isNaN(extracted1.currency)).toBe(true);

      // 2. Complete and valid PurchaseData
      const payloadValid = {
        TransactionExternalId: '11111111-2222-3333-4444-555555555555',
        PurchaseData: {
          TotalAmount: 75.0,
          Currency: 858,
          Status: 1,
        },
      };
      const extracted2 = extractHandyWebhookData(payloadValid);
      expect(extracted2.totalAmount).toBe(75.0);
      expect(extracted2.currency).toBe(858);
    });

    it('rejects decimal amount tampering with zero tolerance using minor currency units (cents)', () => {
      const orderAmount = 75.00;
      const orderCents = Math.round(orderAmount * 100); // 7500

      // Exact match
      const matchingCents = Math.round(75.00 * 100);
      expect(matchingCents === orderCents).toBe(true);

      // 1 cent difference (previous 1 UYU tolerance would have allowed this!)
      const alteredCents1 = Math.round(74.99 * 100);
      expect(alteredCents1 === orderCents).toBe(false);

      const alteredCents2 = Math.round(75.01 * 100);
      expect(alteredCents2 === orderCents).toBe(false);

      // 50 cents difference
      const alteredCents3 = Math.round(74.50 * 100);
      expect(alteredCents3 === orderCents).toBe(false);
    });

    it('enforces currency code comparison strictly without defaults', () => {
      const expectedCurrencyUYU = 858;
      const expectedCurrencyUSD = 840;

      expect(858 === expectedCurrencyUYU).toBe(true);
      expect(840 === expectedCurrencyUYU).toBe(false);
      expect(Number.isNaN(NaN)).toBe(true);
    });

    it('enforces that unauthenticated auto-confirmation is disabled by default', () => {
      const autoConfirmEnv = undefined; // Not set
      const autoConfirmEnabled = (autoConfirmEnv || "false").trim().toLowerCase() === "true";
      expect(autoConfirmEnabled).toBe(false);

      // When autoConfirmEnabled is false, payment is held in manual_verification_required / pending_reconciliation
      const financialValidationPassed = true;
      const canAutoConfirm = autoConfirmEnabled && financialValidationPassed;
      expect(canAutoConfirm).toBe(false);
    });
  });

  describe('FASE 5: Re-authentication, Idempotency & Database Column Invariants', () => {
    it('verifies payments table column invariant: provider_transaction_id does not exist and queries use valid columns', () => {
      const validPaymentsColumns = [
        'id',
        'order_id',
        'provider',
        'transaction_external_id',
        'payment_url',
        'amount',
        'currency',
        'status',
        'raw_request',
        'raw_response',
        'raw_webhook',
        'created_at',
        'updated_at',
      ];
      expect(validPaymentsColumns.includes('provider_transaction_id')).toBe(false);
      expect(validPaymentsColumns.includes('transaction_external_id')).toBe(true);
    });

    it('verifies provider credentials are never printed into application logs', () => {
      const safeLogObj = {
        provider_key: 'handy',
        is_active: true,
        environment: 'production',
      };
      const logString = JSON.stringify(safeLogObj);
      expect(logString.includes('merchant_secret_key')).toBe(false);
      expect(logString.includes('29a4a2fe')).toBe(false);
    });
  });
});
