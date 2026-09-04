// frontend/src/tests/zinc_v2_contract.test.ts
// OpenAPI Contract Test verifying Collectibles 2026 schema alignment against live Zinc OpenAPI 3.1.0

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zinc API V2 - OpenAPI Contract Conformance', () => {
  // Locate downloaded latest.json OpenAPI specification
  const possiblePaths = [
    path.resolve('C:/Users/juanm/.gemini/antigravity/brain/1ead32c2-553c-4022-9709-4adb22201a9e/scratch/latest.json'),
    path.resolve('C:/Users/juanm/.gemini/antigravity/brain/1ead32c2-553c-4022-9709-4adb22201a9e/.system_generated/steps/1199/content.md')
  ];
  
  let spec: any = null;

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          spec = JSON.parse(raw.slice(jsonStart));
          break;
        }
      } catch {
        // continue
      }
    }
  }

  it('verifies OpenAPI spec is version 3.1.0 and recent 2026 release', () => {
    expect(spec).toBeDefined();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toContain('2026');
  });

  it('verifies OrderCreate schema requirements and optional fields in OpenAPI spec', () => {
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

    // Optional fields supported by OpenAPI
    expect(orderCreate.properties.retailer_credentials_id).toBeDefined();
    expect(orderCreate.properties.metadata).toBeDefined();
    expect(orderCreate.properties.po_number).toBeDefined();
    expect(orderCreate.properties.handling_days_max).toBeDefined();
    expect(orderCreate.properties.is_gift).toBeDefined();
    expect(orderCreate.properties.gift_message).toBeDefined();
    expect(orderCreate.properties.customer_notifications).toBeDefined();

    // Wallet payment model: payment block is optional and omitted for prepaid-wallet billing
    expect(orderCreate.properties.payment).toBeDefined();
    expect(orderCreate.properties.payment.description).toContain('Omit for prepaid-wallet billing (default)');

    // Obsolete V1 fields must NOT exist at top-level
    expect(orderCreate.properties.retailer).toBeUndefined();
    expect(orderCreate.properties.payment_method).toBeUndefined();
    expect(orderCreate.properties.webhooks).toBeUndefined();
  });

  it('verifies Address schema requirements and address_line2 support in OpenAPI spec', () => {
    const address = spec.components?.schemas?.Address;
    expect(address).toBeDefined();

    // Required address fields
    expect(address.required).toContain('first_name');
    expect(address.required).toContain('last_name');
    expect(address.required).toContain('address_line1');
    expect(address.required).toContain('postal_code');
    expect(address.required).toContain('phone_number');

    // address_line2 is an optional string/null field in OpenAPI V2
    expect(address.properties.address_line2).toBeDefined();
    expect(address.required).not.toContain('address_line2');

    // Legacy V1 fields must NOT exist
    expect(address.properties.zip_code).toBeUndefined();
    expect(address.properties.address_line_1).toBeUndefined();
    expect(address.properties.phone).toBeUndefined();
  });

  it('verifies GET /products/search endpoint contract and parameters in OpenAPI spec', () => {
    const searchOp = spec.paths?.['/products/search']?.get;
    expect(searchOp).toBeDefined();

    const paramNames = searchOp.parameters.map((p: any) => p.name);
    expect(paramNames).toContain('query');
    expect(paramNames).toContain('retailer');
    expect(paramNames).toContain('page');
    expect(paramNames).toContain('free_shipping');

    const queryParam = searchOp.parameters.find((p: any) => p.name === 'query');
    expect(queryParam.required).toBe(true);

    const retailerParam = searchOp.parameters.find((p: any) => p.name === 'retailer');
    expect(retailerParam.required).toBe(true);
  });

  it('verifies GET /products/{product_id} and GET /products/{product_id}/offers exist in OpenAPI spec', () => {
    const getProduct = spec.paths?.['/products/{product_id}']?.get;
    expect(getProduct).toBeDefined();
    const productParams = getProduct.parameters.map((p: any) => p.name);
    expect(productParams).toContain('product_id');
    expect(productParams).toContain('retailer');

    const getOffers = spec.paths?.['/products/{product_id}/offers']?.get;
    expect(getOffers).toBeDefined();
    const offerParams = getOffers.parameters.map((p: any) => p.name);
    expect(offerParams).toContain('product_id');
    expect(offerParams).toContain('retailer');
  });

  it('verifies securitySchemes require BearerAuth', () => {
    const bearer = spec.components?.securitySchemes?.BearerAuth;
    expect(bearer).toBeDefined();
    expect(bearer.name).toBe('Authorization');
  });

  it('confirms /retailers endpoint has empty security (unauthenticated)', () => {
    const retailers = spec.paths?.['/retailers']?.get;
    expect(retailers).toBeDefined();
    expect(retailers.security).toEqual([]);
  });

  it('confirms /orders endpoint requires global BearerAuth', () => {
    const ordersPost = spec.paths?.['/orders']?.post;
    expect(ordersPost).toBeDefined();
    expect(ordersPost.security).toBeUndefined();
  });
});
