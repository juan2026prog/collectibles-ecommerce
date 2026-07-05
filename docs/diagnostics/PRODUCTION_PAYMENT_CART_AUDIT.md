# Production Payment & Cart Audit Report

This report documents the chronological audit of the Handy payment integration issues and the invalid price cart rejections on Collectibles.uy.

## 1. Handy InvoiceNumber Bug: Historical vs. Current

There was an apparent contradiction regarding whether the Handy `InvoiceNumber` type bug was active or historical. We conducted a forensic audit of database records, git history, and deployed production Edge Functions to resolve this:

### Failures Timeline & Commit Analysis
1. **First Failure (UUID Casing):**
   - **Timestamp:** `2026-05-19 03:54:36 UTC` (Payment ID: `cddbe983-a856-4902-a946-46b9a51ed568`)
   - **Error:** `errors: {"Cart.InvoiceNumber": ["Could not convert string to integer: 43E43992."]}`
   - **Reason:** The checkout was sending the Hexadecimal UUID string (`43e43992-6dba...`) as the invoice number.
2. **Second Failure:**
   - **Timestamp:** `2026-05-19 03:54:54 UTC` (Payment ID: `6a8f45bb-8318-41a1-b0af-3c38fe0739c8`)
   - **Error:** `errors: {"Cart.InvoiceNumber": ["Could not convert string to integer: 9762D834."]}`
3. **Commit written:**
   - **Timestamp:** `2026-05-19 04:15:59 UTC` (Commit: `12feb2a3d3` by `juan2026prog`)
   - **Action:** Switched `InvoiceNumber` calculation to use the stable numeric timestamp: `Math.floor(orderTime / 1000)`.
4. **Edge Function Deploy:**
   - **Timestamp:** `2026-05-19 04:26:18 UTC` (Updated timestamp on Edge Function `create-handy-payment` metadata: `1779164778626`).
5. **Post-Deploy Successes:**
   - **Timestamp:** `2026-05-19 04:30:05 UTC` (Payment ID: `bccb98ba-519b-4487-b2c9-ba3938c8f282`)
   - **Result:** **Success (HTTP 200 / Redirect URL generated)**. No type error.
   - **Timestamp:** `2026-06-27 04:10:40 UTC` (Payment ID: `8884b0e4-120c-4b6b-82f1-10f15d0e1965`)
   - **Result:** **Success (HTTP 200 / Redirect URL generated)**. No type error.

### Code Comparison (Local vs. Production)
We downloaded and compared the source of the `create-handy-payment` function currently deployed in production (version 22) against the local repository code:
- **Local code:** `const invoiceNumber = Math.floor(orderTime / 1000);`
- **Production code:** `const invoiceNumber = Math.floor(orderTime / 1000);`
- **Comparison Result:** Identical. Production has had the fix active since May 19, 2026 at 04:26:18 UTC.

### Audit Conclusion: BUG HISTÓRICO RESUELTO
The type mismatch bug is **historical**. The errors in the logs correspond to attempts made prior to the deployment of the fix on May 19, 2026. The integration is generating valid redirects.

---

## 2. Handy HTTP 500 Errors Analysis

Between the first type errors and the final deployment on May 19, 2026, 5 consecutive payment attempts failed with HTTP 500 errors from Handy:
- `2026-05-19 03:57:14 UTC` (Payment: `215b6ff0-c093`)
- `2026-05-19 03:58:07 UTC` (Payment: `1e0677ef-d996`)
- `2026-05-19 04:07:15 UTC` (Payment: `08886cd5-64bc`)
- `2026-05-19 04:11:53 UTC` (Payment: `a26189af-0ee9`)
- `2026-05-19 04:20:51 UTC` (Payment: `c7b7c8d2-0b4f`)

### Causa Raíz
These HTTP 500 errors were caused by **API validation rules on Handy's side** rejecting formatting discrepancies:
- `UriFormatException` triggered when fields like `LinkImageUrl` or `SiteUrl` were sent as empty strings instead of valid URLs or omitted entirely.
- Wrong casing on `CallbackURL` payload property.
These were corrected in commits [d31197b](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L189) and [58147ee](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L215) which cleaned URL fields, mapped UYU/USD correctly, and corrected the Callback parameter. Once deployed, Handy stopped returning 500 errors.

---

## 3. Invalid Cart Price Rejection Cause (`[Cart] Rejected item with invalid price`)

### Causa Raíz 1: Event Object Leakage
In `ProductDetail.tsx`, the `addToCart` handler signature is `addToCart(selectedOption?: any)`. Since it was bound directly in the buttons as `onClick={addToCart}`, the browser's `MouseEvent` was passed as `selectedOption`.
Because `selectedOption` was truthy (as the event object), `selectedOption || selectedVariant` evaluated to the `MouseEvent`. This resulted in:
- Bypassing the actual selected variant.
- Variant price adjustments and direct prices being ignored (falling back to 0).
- Forcing quantity to `1` (since `selectedOption ? 1 : quantity` evaluated to `1`).
- Loss of custom seller branding details (vendor properties).

### Causa Raíz 2: Numeric Column Serialization
The PostgreSQL driver serializes `numeric` columns (e.g. `base_price` and `price_adjustment`) as strings in JavaScript to preserve decimal precision.
When the frontend calculated prices using `product.base_price + selectedVariant.price_adjustment` without casting, it performed string concatenation (e.g. `"270.00" + "0.00" = "270.000.00"`). This string evaluated to `NaN` when math operations or subtotal calculations were performed, rendering as `$ NaN` and causing the cart to reject items as having a non-numeric price (`<= 0` or `NaN`).

---

## 4. Meta Pixel `Incorrect eventID type` Warning

- **Causa Raíz:** The call to `trackAddToCart` in [ProductDetail.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx#L342) had its parameters swapped: `trackAddToCart(payload, eventId)` instead of `trackAddToCart(eventId, payload)`. This caused the event ID to receive the payload object, triggering the type warning in Facebook Pixel console.

---

## 5. Security Advisory: Supabase RLS

During database schema inspection, we noted:
> [!CAUTION]
> **Row Level Security (RLS) is disabled for `public.backup_funko_dc_cleanup`.**
> Anyone with the anonymous API key can read or modify every row in this table.
>
> **Remediation SQL:**
> ```sql
> ALTER TABLE public.backup_funko_dc_cleanup ENABLE ROW LEVEL SECURITY;
> ```
