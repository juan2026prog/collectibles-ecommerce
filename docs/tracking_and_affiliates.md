# Tracking & Affiliate Architecture

## 1. Deterministic Attribution Flow
To prevent fraud and guarantee precise affiliate commission payouts, attribution follows a rigid lifecycle:

1. **Click Capture:** The frontend intercepts URLs containing `?ref=CODE` or `?affiliate=CODE`.
2. **Persistence:** The `affiliate_id` is immediately stored securely in a local storage cookie or contextual state (lasting up to 30 days).
3. **Checkout Validation:** At checkout, the cart explicitly sends this `affiliate_id` to the `checkout-handler` Edge Function alongside any directly entered coupon codes.
4. **Resolution Rule:** If a user clicks Affiliate A's link but types in Affiliate B's explicit discount code, **the discount code wins** and attribution is granted to Affiliate B.
5. **Database Freeze:** The `affiliate_id` and `coupon_id` are saved irrevocably into the `orders` table. The `calculate-commissions` Edge Function generates the ledger payouts from there.

## 2. Meta Event Deduplication Matrix
To ensure ROAS is correctly measured without artificially inflating conversion numbers, we employ a hybrid Client/Server tracking model.

- **Client Side (Meta Pixel):** Fires on `PageView`, `AddToCart`, `Purchase` via React.
- **Server Side (Conversion API):** The `meta-capi` Edge Function fires purely on definitive, un-fakeable backend events (e.g. `Purchase` when Stripe succeeds).

**Deduplication Key:** 
Every tracking event on the frontend generates a unique `eventId` (e.g., `uuid()`). 
When a purchase happens:
1. Pixel sends: `<Purchase, event_id: 123>`
2. React passes `123` to the backend.
3. Edge Function sends CAPI: `<Purchase, event_id: 123>`
4. Meta's servers receive both and correctly deduplicate them, retaining the one with the highest quality data payload.
