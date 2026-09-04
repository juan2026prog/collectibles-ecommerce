# ZINC V2 DOCUMENTATION GAPS & DISCREPANCIES REPORT
**Date:** 2026-09-04  
**Project:** Collectibles 2026 (collectibles.uy)  
**Authority Sources:**
- OpenAPI 3.1.0 `latest.json` (version `2026-08-21`)
- Zinc Changelog (through `2026-08-28`)
- Official V2 Documentation (`https://www.zinc.com/docs`, `llms.txt`, `migrating-from-v1.md`, `migration-reference.md`, `sandbox.md`, `webhooks.md`, `idempotency.md`, `error-handling.md`)

---

## 1. Executive Summary

This document records all verified discrepancies between the live Zinc V2 official documentation, OpenAPI specification (`latest.json`), and legacy implementation patterns discovered in the Collectibles 2026 codebase.

---

## 2. Identified Discrepancies & Resolutions

### Discrepancy 1: Production Connection Testing Endpoint
- **Legacy Behavior:** `zinc-config` tested the production API key by issuing `GET https://api.zinc.com/retailers`.
- **OpenAPI Specification (`2026-08-21`):** `spec.paths['/retailers'].get.security: []`. The `/retailers` endpoint is completely unauthenticated and public. An HTTP 200 response does **not** prove that the API key is valid or authenticated.
- **Official V2 Resolution:** Production connection testing must use an authenticated, read-only, non-destructive endpoint that requires `Bearer zn_live_...`. The authoritative endpoint is `GET https://api.zinc.com/orders?limit=1`.

### Discrepancy 2: Sandbox Test Products Endpoint Structure
- **Legacy Behavior:** The frontend and `zinc-config` parser expected `GET /orders/test-products` to return a JSON array at root (`Array.isArray(payload)`).
- **Official Documentation & OpenAPI:** `GET /orders/test-products` returns an object envelope:
  ```json
  {
    "products": [
      {
        "url": "https://zinc.com/shop/products/test-success",
        "scenario": "success",
        "name": "Success",
        "is_synchronous_error": false
      },
      ...
    ]
  }
  ```
- **Resolution:** Updated the parser to read `data.products` array and count elements correctly (`Array.isArray(data?.products) ? data.products.length : 0`).

### Discrepancy 3: Official Sandbox Scenarios vs Mock Scenarios
- **Legacy Code / Mock Comments:** Mentioned `test-cancelled` and `test-account-issue`.
- **Live Official Documentation (`sandbox.md`):** Only 8 official scenarios are provided by Zinc:
  1. `test-success` (Async lifecycle success)
  2. `test-invalid-address` (Synchronous error: `invalid_shipping_address`)
  3. `test-url-unreachable` (Synchronous error: `url_unreachable`)
  4. `test-insufficient-funds` (Synchronous error: `insufficient_funds`)
  5. `test-out-of-stock` (Asynchronous webhook error: `product_out_of_stock`)
  6. `test-price-exceeded` (Asynchronous webhook error: `max_price_exceeded`)
  7. `test-invalid-variant` (Asynchronous webhook error: `invalid_variant`)
  8. `test-shipping-unavailable` (Asynchronous webhook error: `shipping_unavailable`)
- **Resolution:** Eliminated `test-cancelled` and `test-account-issue` as official scenarios. The integration dynamically queries `GET /orders/test-products` as the source of truth.

### Discrepancy 4: Order Payload Schema Differences (V1 vs V2)
- **Legacy Code (`zinc-verify-after-payment`):**
  - Included `retailer: 'amazon'` (V1 top-level field).
  - Included `payment_method: { use_zinc_card: true }` (V1 field).
  - Included `shipping_address.zip_code` (V1 field).
  - Omitted `idempotency_key`.
- **OpenAPI 3.1.0 (`latest.json`):**
  - Top-level `retailer` is omitted; retailer is inferred from product URL.
  - `payment` block is omitted for default prepaid Zinc Wallet billing.
  - `shipping_address` requires `postal_code` (string), `address_line1` (string). `zip_code` and `address_line_1` are rejected.
  - `idempotency_key` is a top-level string (max 36 chars, recommended UUID).
  - `max_price` is an integer in cents (e.g. `$42.37` -> `4237`).
- **Resolution:** Replaced legacy fields with strict V2 `OrderCreate` schema.

### Discrepancy 5: Webhook Signature Verification Algorithm
- **Official Specification:**
  - Header: `X-Webhook-Signature` contains HMAC-SHA256 hex digest.
  - Header: `X-Webhook-Event` contains event name.
  - Payload signed: **Exact raw request body bytes** before any JSON parsing or normalization.
  - Comparison: Timing-safe comparison (`crypto.subtle.timingSafeEqual` in Deno / Node `crypto.timingSafeEqual`).
  - Secret format: `zn_whsec_...`
- **Resolution:** Implement strict raw-body reading (`await req.text()`) and timing-safe HMAC validation in `zinc-webhook`.

### Discrepancy 6: Product API Cache Constraints (`max_age`)
- **Changelog 2026-08-28:** Minimum `max_age` is now **31 seconds** for `/products/{product_id}` and `/products/search`. Lower values return HTTP 400.
- **Resolution:** All calls specifying `max_age` ensure `Math.max(31, max_age)`.

### Discrepancy 7: API Key Prefixes and Isolation
- **Documentation & Runbook:**
  - Sandbox: `zn_test_...`
  - Production: `zn_live_...`
  - Webhook Signing Secret: `zn_whsec_...`
- **Legacy Code:** Validated production key with generic `zn_` (excluding `zn_test_`), allowing non-conforming tokens.
- **Resolution:** Enforce `zn_live_` strictly across frontend, Edge Functions, SQL Vault RPCs, and tests.
