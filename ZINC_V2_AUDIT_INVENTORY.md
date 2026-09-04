# ZINC V2 TOTAL CODEBASE INVENTORY
**Date:** 2026-09-04  
**Project:** Collectibles 2026 (collectibles.uy)  
**Branch:** `zinc-v2-full-audit-20260904`  
**Authoritative Reference:** Live Zinc V2 Documentation & OpenAPI 3.1.0 `latest.json` (2026-08-21)

---

## 1. Inventory Summary Matrix

| Status | Count | Meaning |
| :--- | :---: | :--- |
| **PASS** | 5 | Fully compliant with official Zinc V2 specification |
| **LEGACY** | 7 | Utilizes deprecated Zinc V1 fields or endpoints |
| **WRONG** | 6 | Incorrect endpoint, schema mismatch, or parsing bug |
| **SECURITY** | 4 | Security risk (unauthenticated endpoint used for auth proof, permissive key validation, missing vault isolation) |
| **MISSING** | 6 | Required component or handler not yet implemented in repo |
| **REVIEW** | 3 | Functional logic requiring architectural verification |

---

## 2. Detailed Audit Inventory

| Area | File | Function | Current behavior | Zinc V2 expected | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Edge Functions** | `supabase/functions/zinc-config/index.ts` | `test_connection` (production) | Calls `GET /retailers` with Bearer token. `retailers` is public (`security: []`). | Must call authenticated, read-only endpoint requiring `zn_live_`: `GET /orders?limit=1`. | **SECURITY** |
| **Edge Functions** | `supabase/functions/zinc-config/index.ts` | `test_connection` (sandbox) | Assumes `GET /orders/test-products` returns raw JSON array: `Array.isArray(payload) ? payload.length : undefined`. | Returns `{ "products": [...] }`. Must parse `payload.products.length`. | **WRONG** |
| **Edge Functions** | `supabase/functions/zinc-config/index.ts` | `save_key` (validation) | Accepts any key starting with `zn_` not equal to `zn_test_`. | Production key must strictly start with `zn_live_`. | **WRONG** |
| **Edge Functions** | `supabase/functions/zinc-config/index.ts` | `save_webhook_secret` | Action not implemented in `zinc-config`. | Must support saving `zn_whsec_...` into Vault via `set_zinc_vault_secret`. | **MISSING** |
| **Edge Functions** | `supabase/functions/zinc-config/index.ts` | Local repo tracking | Function was deployed to Supabase cloud but missing from local git working tree. | Must be formally tracked and versioned in `supabase/functions/zinc-config/index.ts`. | **MISSING** |
| **Edge Functions** | `supabase/functions/zinc-webhook/index.ts` | Webhook Receiver | File does not exist in repo. | Must exist with `verify_jwt: false`, timing-safe HMAC-SHA256 verification, deduplication, durable event storage, and fast 2xx ACK. | **MISSING** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (payload) | Sends `retailer: 'amazon'` and `payment_method: { use_zinc_card: true }`. | In V2, `retailer` and `payment_method` are obsolete. Wallet is used by default. | **LEGACY** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (address) | Uses `zip_code` in `shipping_address`. | In V2, address requires `postal_code` and `address_line1`. | **LEGACY** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (idempotency) | Does not send `idempotency_key` (only sends `po_number`). | Must send unique string `idempotency_key` (UUID max 36 chars) per logical order. | **WRONG** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (auth) | Reads `Deno.env.get("ZINC_API_KEY")` directly. | Must resolve active key securely from Vault or centralized client. | **SECURITY** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (safety gate) | No server-side check preventing `POST /orders` with `zn_live_` if production is disabled. | Server-side hard gate: reject `POST /orders` if key is `zn_live_` and `zinc_production_enabled != true`. | **SECURITY** |
| **Edge Functions** | `supabase/functions/zinc-verify-after-payment/index.ts` | `create_zinc_order` (max_price) | Calculates `Math.round(maxAmazonPrice * 100)`. | Integer in cents is correct according to V2 spec (`max_price` in cents). | **PASS** |
| **Edge Functions** | `supabase/functions/zinc-sync-order-tracking/index.ts` | `parse_tracking_data` | Parses `package_tracking_associated_items` and `delivery_dates` (V1 legacy). | V2 uses `tracking_numbers: [{ carrier, tracking_number, url, delivered_at }]`. | **LEGACY** |
| **Edge Functions** | `supabase/functions/zinc-search-products/index.ts` | `search_products` | Uses `https://api.zinc.com/products/search` with `sort` query param. | Query params: `query`, `retailer`, `page`, `free_shipping`. | **LEGACY** |
| **Edge Functions** | `supabase/functions/zinc-search-products/index.ts` | `search_products` (auth) | Uses Bearer auth: `Authorization: Bearer ${ZINC_API_KEY}`. | Compliant with V2 Bearer auth specification. | **PASS** |
| **Edge Functions** | `supabase/functions/zinc-sync-published-products/index.ts` | `sync_product` | Calls `GET /products/{product_id}?retailer=amazon` without `max_age`. | Minimum `max_age` is 31s per 2026 changelog; endpoint compliant. | **PASS** |
| **Edge Functions** | `supabase/functions/zinc-sync-international-products/index.ts` | `sync_product` | Calls `GET /products/{product_id}?retailer=amazon` with Bearer auth. | Compliant with V2 product retrieval. | **PASS** |
| **Edge Functions** | `supabase/functions/zinc-live-check/index.ts` | `live_price_check` | Calls `GET /products/{product_id}?retailer=amazon`. | Compliant with V2 product retrieval. | **PASS** |
| **Edge Functions** | `supabase/functions/zinc-live-check-before-payment/index.ts` | `live_check_cart` | Verifies Amazon product price and prime status before payment. | Functional pricing check; preserves Pricing Engine & Profit Protection. | **REVIEW** |
| **Edge Functions** | `supabase/functions/zinc-enrich-candidate/index.ts` | `enrich_candidate` | Queries Amazon product details to enrich candidate categories. | Compliant with V2 product retrieval. | **REVIEW** |
| **Edge Functions** | `supabase/functions/zinc-create-category/index.ts` | `create_category` | Internal Supabase helper; creates category slugs for imported products. | Does not call Zinc directly; internal database logic. | **REVIEW** |
| **Shared Modules** | `supabase/functions/_shared/zinc/` | Centralized Zinc SDK | Directory does not exist. Redundant auth, base URL, and fetch logic across functions. | Centralize client, auth, types, orders adapter, webhooks, and error mapping in `_shared/zinc/`. | **MISSING** |
| **Database** | `public.zinc_integration_settings` | Schema & Constraints | Table exists in Supabase cloud with columns for sandbox and production, but missing from migrations. | Must be formally versioned in a migration file. | **MISSING** |
| **Database** | `public.zinc_webhook_events` | Deduplication constraint | Currently has `UNIQUE (payload_sha256)`. | Should be `UNIQUE (environment, payload_sha256)` to prevent cross-env collisions. | **WRONG** |
| **Database** | `public.get_zinc_vault_secret` | Permissions | Granted strictly to `service_role` and `postgres`. | Matches required security policy: strictly service_role/postgres only. | **PASS** |
| **Database** | `public.set_zinc_vault_secret` | Validation | Validates `p_secret LIKE 'zn_%'` for production. | Must strictly require `p_secret LIKE 'zn_live_%'` for production. | **SECURITY** |
| **Frontend** | `frontend/src/components/admin/AdminZincConfig.tsx` | Status Badge | Checks `data.status` (number 200) instead of `'pass'`, causing badge display bugs. | Map test result correctly: `status: data.ok ? 'pass' : 'fail'`. | **WRONG** |
| **Frontend** | `frontend/src/components/admin/AdminZincConfig.tsx` | Production Key Validation | Validates `keyVal.startsWith('zn_')`. | Must strictly require `keyVal.startsWith('zn_live_')`. | **WRONG** |
| **Frontend** | `frontend/src/components/admin/AdminZincConfig.tsx` | Webhook Secret Management | Only allows copying webhook URL; cannot enter or mask webhook signing secrets. | Provide UI to configure `zn_whsec_...` for Sandbox and Production into Vault. | **MISSING** |
| **Frontend** | `frontend/src/pages/admin/AdminSettings.tsx` | Zinc Panel Embedding | Embedded in `AdminSettings` under `tab=internacional` (subtab `zinc`). | Working and accessible for admin users. | **PASS** |
