// frontend/src/tests/skypostal_foundation.test.ts

import { describe, it, expect } from 'vitest';
import { sanitizeProviderPayload, maskTaxIdentifier } from '../../../supabase/functions/_shared/skypostal/skypostal-sanitizer';
import { mapCollectiblesAddressToSkyPostal, buildSkyPostalShipmentRequest } from '../../../supabase/functions/_shared/skypostal/skypostal-mappers';
import { SkyPostalClient } from '../../../supabase/functions/_shared/skypostal/skypostal-client';
import { SkyPostalAdapter } from '../../../supabase/functions/_shared/adapters/skypostal-adapter';

describe('SkyPostal Foundation & Sanitizer', () => {
  it('masks authorization headers, API keys, tokens and passwords in raw payloads', () => {
    const sensitivePayload = {
      orderId: 'ORD-12345',
      carrier: 'SkyPostal',
      auth: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123',
      apiKey: 'sk_live_very_secret_key_123456789',
      password: 'super_secret_carrier_password',
      headers: {
        Authorization: 'Bearer secret_skypostal_token_abc'
      },
      customer: {
        name: 'Juan Perez',
        email: 'juan@test.com'
      }
    };

    const sanitized = sanitizeProviderPayload(sensitivePayload);

    expect(sanitized.orderId).toBe('ORD-12345');
    expect(sanitized.auth).toBe('[REDACTED_SECRET]');
    expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
    expect(sanitized.password).toBe('[REDACTED_SECRET]');
    expect(sanitized.headers.Authorization).toBe('[REDACTED_SECRET]');
    expect(sanitized.customer.name).toBe('Juan Perez');
  });

  it('masks national tax identification numbers safely', () => {
    expect(maskTaxIdentifier('12345678-9')).toBe('12***-9');
    expect(maskTaxIdentifier('123')).toBe('***');
    expect(maskTaxIdentifier('')).toBe('');
  });

  it('maps shipping addresses correctly to SkyPostal address structure', () => {
    const address = {
      first_name: 'Carlos',
      last_name: 'Valenzuela',
      street: 'Av. Providencia 1234',
      city: 'Santiago',
      department: 'Región Metropolitana',
      postal_code: '7500000',
      country_code: 'CL',
      phone: '+56912345678',
      rut: '12345678-9'
    };

    const mapped = mapCollectiblesAddressToSkyPostal(address);

    expect(mapped.firstName).toBe('Carlos');
    expect(mapped.lastName).toBe('Valenzuela');
    expect(mapped.street).toBe('Av. Providencia 1234');
    expect(mapped.city).toBe('Santiago');
    expect(mapped.countryCode).toBe('CL');
    expect(mapped.taxIdOrNationalId).toBe('12345678-9');
  });

  it('builds a standardized shipment request with idempotency key', () => {
    const req = buildSkyPostalShipmentRequest(
      'ORD-999',
      'SUB-999',
      { street: 'Calle 100 #15-20', city: 'Bogotá', country_code: 'CO', phone: '+573001234567' },
      2.5,
      2,
      75.0,
      'Fragile items'
    );

    expect(req.orderId).toBe('ORD-999');
    expect(req.suborderId).toBe('SUB-999');
    expect(req.idempotencyKey).toBe('skypostal_SUB-999');
    expect(req.package.weightKg).toBe(2.5);
    expect(req.package.declaredValueUsd).toBe(75.0);
    expect(req.package.items?.[0].quantity).toBe(2);
  });

  it('SkyPostalClient blocks real shipment creation in PREVIEW mode', async () => {
    const client = new SkyPostalClient({
      credentials: {},
      environment: 'test',
      isDryRun: true
    });

    const req = buildSkyPostalShipmentRequest(
      'ORD-PREVIEW-1',
      'SUB-PREVIEW-1',
      { street: 'Las Condes 100', city: 'Santiago', country_code: 'CL', phone: '+5699999999' },
      1.0,
      1
    );

    // Calling createShipment with isMarketPreview = true MUST throw SkyPostalPreviewBlockedError
    await expect(client.createShipment(req, true)).rejects.toThrow(
      /el mercado CL se encuentra en modo PREVIEW/
    );
  });

  it('SkyPostalAdapter implements ShippingAdapter interface correctly', () => {
    const adapter = new SkyPostalAdapter();
    expect(typeof adapter.validateConfig).toBe('function');
    expect(typeof adapter.createShipment).toBe('function');
    expect(typeof adapter.checkExistingShipment).toBe('function');

    expect(adapter.validateConfig({ environment: 'test' })).toBe(true);
    expect(adapter.validateConfig(null)).toBe(false);
  });
});
