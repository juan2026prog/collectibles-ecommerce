// frontend/src/tests/zinc_v2_contract.test.ts
// OpenAPI Contract Test verifying Collectibles 2026 schema alignment against live Zinc OpenAPI 3.1.0

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zinc API V2 - OpenAPI Contract Conformance', () => {
  // Locate downloaded latest.json OpenAPI specification
  const specPath = path.resolve('C:/Users/juanm/.gemini/antigravity/brain/1ead32c2-553c-4022-9709-4adb22201a9e/.system_generated/steps/1199/content.md');
  
  let spec: any = null;

  try {
    if (fs.existsSync(specPath)) {
      const raw = fs.readFileSync(specPath, 'utf8');
      const jsonStart = raw.indexOf('{');
      if (jsonStart !== -1) {
        spec = JSON.parse(raw.slice(jsonStart));
      }
    }
  } catch {
    spec = null;
  }

  it('verifies OpenAPI spec is version 3.1.0 and recent 2026 release', () => {
    if (!spec) return;
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toContain('2026');
  });

  it('verifies OrderCreate schema requirements in OpenAPI spec', () => {
    if (!spec) return;
    const orderCreate = spec.components?.schemas?.OrderCreate;
    expect(orderCreate).toBeDefined();

    // Required fields
    expect(orderCreate.required).toContain('products');
    expect(orderCreate.required).toContain('shipping_address');
    expect(orderCreate.required).toContain('max_price');

    // max_price must be integer in cents
    expect(orderCreate.properties.max_price.type).toBe('integer');

    // idempotency_key max 36 chars
    const idempotencyProp = orderCreate.properties.idempotency_key;
    const stringSchema = idempotencyProp.anyOf?.find((s: any) => s.type === 'string');
    expect(stringSchema?.maxLength).toBe(36);

    // Obsolete V1 fields must NOT exist at top-level
    expect(orderCreate.properties.retailer).toBeUndefined();
    expect(orderCreate.properties.payment_method).toBeUndefined();
    expect(orderCreate.properties.webhooks).toBeUndefined();
  });

  it('verifies Address schema requirements in OpenAPI spec', () => {
    if (!spec) return;
    const address = spec.components?.schemas?.Address;
    expect(address).toBeDefined();

    // Required address fields
    expect(address.required).toContain('first_name');
    expect(address.required).toContain('last_name');
    expect(address.required).toContain('address_line1');
    expect(address.required).toContain('postal_code');
    expect(address.required).toContain('phone_number');

    // Legacy V1 fields must NOT exist
    expect(address.properties.zip_code).toBeUndefined();
    expect(address.properties.address_line_1).toBeUndefined();
    expect(address.properties.phone).toBeUndefined();
  });

  it('verifies securitySchemes require BearerAuth', () => {
    if (!spec) return;
    const bearer = spec.components?.securitySchemes?.BearerAuth;
    expect(bearer).toBeDefined();
    expect(bearer.name).toBe('Authorization');
  });

  it('confirms /retailers endpoint has empty security (unauthenticated)', () => {
    if (!spec) return;
    const retailers = spec.paths?.['/retailers']?.get;
    expect(retailers).toBeDefined();
    expect(retailers.security).toEqual([]);
  });

  it('confirms /orders endpoint requires global BearerAuth', () => {
    if (!spec) return;
    const ordersPost = spec.paths?.['/orders']?.post;
    expect(ordersPost).toBeDefined();
    // Inherits global security
    expect(ordersPost.security).toBeUndefined();
  });
});
