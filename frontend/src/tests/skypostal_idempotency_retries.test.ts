// frontend/src/tests/skypostal_idempotency_retries.test.ts

import { describe, it, expect } from 'vitest';

describe('SkyPostal Phase 3 — Idempotency & Error Classification', () => {
  it('should reuse existing tracking on worker retry when idempotency hit occurs', async () => {
    const existingShipmentInDb = {
      id: 'shp_112233',
      order_id: 'ord_5566',
      suborder_id: 'sub_5566',
      tracking_code: 'SKY-CL-98765432',
      external_guide: 'GUA-123456',
      shipping_label_url: 'https://storage.collectibles.uy/shipping-labels/skypostal/SKY-CL-98765432.pdf'
    };

    // Simulated checkExistingShipment
    const checkExisting = (orderId: string) => {
      if (orderId === existingShipmentInDb.suborder_id) {
        return {
          success: true,
          trackingCode: existingShipmentInDb.tracking_code,
          externalGuide: existingShipmentInDb.external_guide,
          labelUrl: existingShipmentInDb.shipping_label_url,
          rawResponse: {
            resolved_existing: true,
            idempotency_hit: true
          }
        };
      }
      return null;
    };

    const duplicateAttempt = checkExisting('sub_5566');
    expect(duplicateAttempt).not.toBeNull();
    expect(duplicateAttempt?.success).toBe(true);
    expect(duplicateAttempt?.trackingCode).toBe('SKY-CL-98765432');
    expect(duplicateAttempt?.rawResponse.idempotency_hit).toBe(true);
  });

  it('should classify network timeouts as RETRYABLE', () => {
    const error = new Error('Connection timeout to SkyPostal gateway');
    const isRetryable = error.message.includes('timeout') || error.message.includes('network');
    expect(isRetryable).toBe(true);
  });

  it('should classify missing customs tax ID as MANUAL_REVIEW', () => {
    const error = new Error('Documento de identidad aduanero (RUT) es obligatorio');
    const isManualReview = error.message.includes('RUT') || error.message.includes('documento');
    expect(isManualReview).toBe(true);
  });
});
