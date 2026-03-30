# Vendor Marketplace Architecture

## 1. Onboarding Flow
1. **Registration:** User creates an account and toggles intent to become a vendor. A `vendors` record is created with `status: pending`.
2. **Approval:** Admin reviews the store request in the Admin Panel and switches the status to `active`.
3. **Stripe Connect:** The vendor is prompted to complete Stripe Express onboarding to receive automatic payouts.
4. **Access:** The vendor gains access to the Storefront's `/vendor-dashboard` route (guarded by `is_vendor === true` and `status === 'active'`).

## 2. Product Management
Vendors can create their own `products`. 
- **Security:** RLS policies guarantee a vendor can only insert rows where `vendor_id === auth.uid()`.
- **Media:** Images for these products must be uploaded to the `product-images` storage bucket using the vendor's RLS permissions.

## 3. Financial Fulfillment (Multi-Vendor Carts)
When a Customer purchases a cart with products from multiple vendors:
1. The `checkout-handler` processes a single Stripe charge against the Customer.
2. The `orders` table tracks the global transaction.
3. The `order_items` table uniquely assigns the `vendor_id` to each individual line item.
4. The `calculate-commissions` Edge Function detects these `vendor_id`s, calculates the `vendor_payout` (Unit Price * Quantity * (1 - Platform Fee %)), and creates a pending balance in the `vendor_payouts` ledger.
5. A daily cron job (or instant webhook) processes `vendor_payouts` via Stripe Connect Transfers, settling the balance automatically.
