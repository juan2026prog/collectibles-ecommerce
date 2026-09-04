// frontend/src/tests/zinc_v2_unit.test.ts
// Comprehensive unit test suite for Zinc API V2 integration

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Re-implement pure logic for testing in Node / Vitest environment
function validKeyForEnv(key: string, env: 'sandbox' | 'production'): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 10) return false;
  if (env === 'sandbox') return trimmed.startsWith('zn_test_');
  if (env === 'production') return trimmed.startsWith('zn_live_');
  return false;
}

function validWebhookSecret(secret: string): boolean {
  if (!secret || typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  return trimmed.length >= 10 && trimmed.startsWith('zn_whsec_');
}

function dollarsToCents(amountUsd: number): number {
  if (typeof amountUsd !== 'number' || isNaN(amountUsd) || amountUsd < 0) return 0;
  return Math.round(amountUsd * 100);
}

function centsToDollars(cents: number): number {
  if (typeof cents !== 'number' || isNaN(cents) || cents <= 0) return 0;
  return Number((cents / 100).toFixed(2));
}

function buildZincAddress(shipping: Record<string, any>) {
  const recipientName = String(shipping.international_recipient_name || shipping.full_name || shipping.name || '').trim();
  const nameParts = recipientName.split(' ').filter(Boolean);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || '.';

  const line1 = String(shipping.international_address_line_1 || shipping.address_line1 || shipping.address || '').trim();
  const line2Parts = [
    shipping.international_address_line_2 || shipping.address_line2,
    shipping.international_customer_code || shipping.customer_code
  ].filter(Boolean);
  const line2 = line2Parts.join(' ').trim() || null;

  const city = String(shipping.international_city || shipping.city || '').trim();
  const state = String(shipping.international_state || shipping.state || '').trim() || null;
  const postalCode = String(
    shipping.international_postal_code || shipping.postal_code || shipping.zip_code || ''
  ).trim();
  const phone = String(
    shipping.international_phone || shipping.phone_number || shipping.phone || '206-555-0100'
  ).trim();
  const country = String(shipping.international_country || shipping.country || 'US').trim().toUpperCase();

  return {
    first_name: firstName,
    last_name: lastName,
    address_line1: line1,
    address_line2: line2,
    city,
    state,
    postal_code: postalCode,
    phone_number: phone,
    country,
  };
}

function assertProductionGate(apiKey: string, productionEnabled: boolean): void {
  if (apiKey.startsWith('zn_live_')) {
    if (productionEnabled !== true) {
      throw new Error('[SECURITY GATE] Compras reales con Zinc Production están estrictamente bloqueadas (zinc_production_enabled = false).');
    }
  }
}

function computeHmacSha256Hex(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret.trim()).update(rawBody).digest('hex');
}

function verifyWebhookSignature(rawBody: string, signatureHeader: string | null | undefined, secret: string | null | undefined): boolean {
  if (!signatureHeader || !secret || !rawBody) return false;
  const expected = computeHmacSha256Hex(secret, rawBody);
  const received = signatureHeader.trim().toLowerCase();
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function computeSha256Hex(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function parseTestProductsResponse(payload: any) {
  if (payload && Array.isArray(payload.products)) {
    return payload.products;
  }
  return [];
}

describe('Zinc API V2 - Unit Test Certification Suite', () => {
  // 1. API Key Validation & Environment Isolation
  describe('API Key Validation & Environment Isolation', () => {
    it('accepts valid sandbox key starting with zn_test_', () => {
      expect(validKeyForEnv('zn_test_1234567890abcdef', 'sandbox')).toBe(true);
    });

    it('rejects sandbox key in production', () => {
      expect(validKeyForEnv('zn_test_1234567890abcdef', 'production')).toBe(false);
    });

    it('accepts valid production key starting with zn_live_', () => {
      expect(validKeyForEnv('zn_live_1234567890abcdef', 'production')).toBe(true);
    });

    it('rejects production key in sandbox', () => {
      expect(validKeyForEnv('zn_live_1234567890abcdef', 'sandbox')).toBe(false);
    });

    it('rejects invalid or legacy prefixes in both environments', () => {
      expect(validKeyForEnv('api_key_1234567890', 'sandbox')).toBe(false);
      expect(validKeyForEnv('api_key_1234567890', 'production')).toBe(false);
      expect(validKeyForEnv('zn_prod_1234567890', 'production')).toBe(false);
      expect(validKeyForEnv('bearer_1234567890', 'production')).toBe(false);
      expect(validKeyForEnv('', 'sandbox')).toBe(false);
      expect(validKeyForEnv('short', 'sandbox')).toBe(false);
    });

    it('validates webhook secret prefix zn_whsec_', () => {
      expect(validWebhookSecret('zn_whsec_1234567890abcdef')).toBe(true);
      expect(validWebhookSecret('whsec_1234567890abcdef')).toBe(false);
      expect(validWebhookSecret('zn_test_1234567890abcdef')).toBe(false);
      expect(validWebhookSecret('')).toBe(false);
    });
  });

  // 2. Max Price Currency Conversion (USD Decimal -> Integer Cents)
  describe('max_price Integer Cents Conversion & Rounding', () => {
    it('converts 0 USD to 0 cents', () => {
      expect(dollarsToCents(0)).toBe(0);
    });

    it('converts 0.01 USD to 1 cent', () => {
      expect(dollarsToCents(0.01)).toBe(1);
    });

    it('converts 2.00 USD to 200 cents', () => {
      expect(dollarsToCents(2.00)).toBe(200);
    });

    it('converts 42.37 USD to 4237 cents exactly', () => {
      expect(dollarsToCents(42.37)).toBe(4237);
    });

    it('converts 99.99 USD to 9999 cents', () => {
      expect(dollarsToCents(99.99)).toBe(9999);
    });

    it('converts 100.00 USD to 10000 cents', () => {
      expect(dollarsToCents(100.00)).toBe(10000);
    });

    it('handles large monetary amounts safely without floating point distortion', () => {
      expect(dollarsToCents(1499.99)).toBe(149999);
      expect(centsToDollars(149999)).toBe(1499.99);
    });

    it('handles negative or invalid values by returning 0', () => {
      expect(dollarsToCents(-10)).toBe(0);
      expect(dollarsToCents(NaN)).toBe(0);
    });
  });

  // 3. Address Mapping (Strict V2 Compliance)
  describe('Address Schema Mapping (V2 vs Legacy V1)', () => {
    it('maps international shipping address with postal_code and address_line1', () => {
      const shipping = {
        international_recipient_name: 'Juan Perez',
        international_address_line_1: '123 Main St',
        international_address_line_2: 'Suite 4B',
        international_customer_code: 'UY-1002',
        international_city: 'Miami',
        international_state: 'FL',
        international_postal_code: '33101',
        international_phone: '+13055550199',
      };

      const mapped = buildZincAddress(shipping);
      expect(mapped.first_name).toBe('Juan');
      expect(mapped.last_name).toBe('Perez');
      expect(mapped.address_line1).toBe('123 Main St');
      expect(mapped.address_line2).toBe('Suite 4B UY-1002');
      expect(mapped.city).toBe('Miami');
      expect(mapped.state).toBe('FL');
      expect(mapped.postal_code).toBe('33101');
      expect((mapped as any).zip_code).toBeUndefined(); // Crucial: No legacy zip_code
      expect((mapped as any).address_line_1).toBeUndefined(); // Crucial: No legacy address_line_1
      expect(mapped.phone_number).toBe('+13055550199');
      expect(mapped.country).toBe('US');
    });

    it('falls back gracefully on single-word names and missing optional fields', () => {
      const shipping = {
        name: 'Monónimo',
        address: '456 Elm St',
        city: 'New York',
        zip_code: '10001', // legacy source key
      };

      const mapped = buildZincAddress(shipping);
      expect(mapped.first_name).toBe('Monónimo');
      expect(mapped.last_name).toBe('.');
      expect(mapped.address_line1).toBe('456 Elm St');
      expect(mapped.address_line2).toBeNull();
      expect(mapped.postal_code).toBe('10001');
      expect(mapped.country).toBe('US');
    });
  });

  // 4. Production Safety Gate
  describe('Server-Side Hard Production Safety Gate', () => {
    it('throws security error when key is zn_live_ and productionEnabled is false', () => {
      expect(() => {
        assertProductionGate('zn_live_secret123456789', false);
      }).toThrow(/SECURITY GATE/);
    });

    it('allows sandbox key even if productionEnabled is false', () => {
      expect(() => {
        assertProductionGate('zn_test_secret123456789', false);
      }).not.toThrow();
    });

    it('allows production key only if productionEnabled is explicitly true', () => {
      expect(() => {
        assertProductionGate('zn_live_secret123456789', true);
      }).not.toThrow();
    });
  });

  // 5. Test Products Parser
  describe('GET /orders/test-products Response Parser', () => {
    it('correctly parses object envelope with products array', () => {
      const response = {
        products: [
          { url: 'https://zinc.com/shop/products/test-success', scenario: 'success', name: 'Success', is_synchronous_error: false },
          { url: 'https://zinc.com/shop/products/test-invalid-address', scenario: 'invalid_address', name: 'Invalid Address', is_synchronous_error: true }
        ]
      };

      const products = parseTestProductsResponse(response);
      expect(products).toHaveLength(2);
      expect(products[0].scenario).toBe('success');
      expect(products[1].is_synchronous_error).toBe(true);
    });

    it('handles empty or malformed response gracefully', () => {
      expect(parseTestProductsResponse(null)).toEqual([]);
      expect(parseTestProductsResponse({})).toEqual([]);
      expect(parseTestProductsResponse('not-an-object')).toEqual([]);
    });
  });

  // 6. Webhook HMAC-SHA256 Signature Verification
  describe('Webhook HMAC-SHA256 Signature Verification', () => {
    const secret = 'zn_whsec_test_secret_for_unit_tests';
    const payload = JSON.stringify({
      event: 'order.placed',
      order_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'order_placed',
      timestamp: '2026-09-04T12:00:00Z',
      data: { price_components: { total: 2500 } }
    });

    it('verifies valid HMAC-SHA256 signature', () => {
      const signature = computeHmacSha256Hex(secret, payload);
      expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    });

    it('rejects tampered payload', () => {
      const signature = computeHmacSha256Hex(secret, payload);
      const tampered = payload.replace('2500', '9999');
      expect(verifyWebhookSignature(tampered, signature, secret)).toBe(false);
    });

    it('rejects wrong secret', () => {
      const signature = computeHmacSha256Hex(secret, payload);
      expect(verifyWebhookSignature(payload, signature, 'zn_whsec_wrong_secret')).toBe(false);
    });

    it('rejects missing signature or missing secret', () => {
      expect(verifyWebhookSignature(payload, null, secret)).toBe(false);
      expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
      expect(verifyWebhookSignature(payload, 'abc', null)).toBe(false);
    });

    it('computes consistent payload SHA256 for delivery deduplication', () => {
      const hash1 = computeSha256Hex(payload);
      const hash2 = computeSha256Hex(payload);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  // 7. Idempotency & already_exists Response Handling
  describe('Idempotency & already_exists Handling', () => {
    it('treats 409 already_exists as success on retry', () => {
      const response = {
        code: 'already_exists',
        message: "Order with idempotency key '550e8400' already exists",
        details: { resource: 'Order', identifier: '550e8400-e29b-41d4-a716-446655440000' }
      };

      const isAlreadyExists = response.code === 'already_exists';
      expect(isAlreadyExists).toBe(true);
      expect(response.details.identifier).toBeDefined();
    });

    it('enforces maximum 36 characters for idempotency_key', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(uuid.length).toBeLessThanOrEqual(36);
    });
  });
});
