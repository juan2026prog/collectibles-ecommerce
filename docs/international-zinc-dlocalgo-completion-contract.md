# Collectibles — International Zinc/dLocal Go completion contract (staging only)

## Scope
dLocal Go is for international Zinc purchases only; local products and marketplace vendor orders keep their existing payment providers. Zinc is funded by Collectibles in advance; NEVER split the product price to Zinc. The buyer's payment reimburses Collectibles' working capital plus the configured Collectibles margin. No automatic top-up.

## Countries and settlement
UY: customer pays the Miami-to-Uruguay courier directly; checkout must not collect courier cost. AR: collect a verified shipping quote where supported and distribute shipping to the contracted logistics operator using dLocal Go Split Payments ONLY if merchant eligibility, country, API contract, collaborator onboarding, fee and refund behaviour are verified in sandbox. Do not emulate a split with an unrecorded transfer. Unsupported country/provider combination: block checkout with an actionable error, never silently fall back to UY or USD. Store gross amount, supplier cost, margin, shipping, payment fee, settlement amount and split allocation separately with currency and exchange-rate snapshot. Validate fixed amount vs percentage split before enabling.

## Payment / purchase invariants
1. Validate international-only basket and server-priced, unexpired Zinc quote, currency, margin, taxes, shipping quote, destination and buyer details. Never trust browser totals.
2. Create durable pending payment record before redirect. Confirm amount, currency, order ID, provider ID and provider status server-to-server. Process webhook events idempotently, with authenticated signature and replay protection. A return URL is not payment proof.
3. Atomic confirmation of payment and inventory reservation. No duplicate inventory decrements or Zinc purchases across retries or concurrent webhook and return verification.
4. Before ordering Zinc, recheck quote, profit protection, prepaid wallet balance, order payment state and cancellation hold. Use a durable unique idempotency key for supplier ordering. Persist Zinc request, response, provider order ID, financial consumption and supplier state. Never infer success from HTTP success alone.
5. If Zinc order fails, queue financial reconciliation and appropriate refund; never mark an order fulfilled. If wallet is insufficient, stop and alert operator; do not recharge wallet without authorization.

## Cancellation and refunds
UI: Mi cuenta > Mis pedidos > Detalle > Solicitar cancelación, with reason and confirmation. Guests require cryptographic order token. Customer request creates a HOLD immediately and shows pending review, not 'cancelled' or 'refunded'.
- Unpaid: cancel pending payment and order only after verifying provider state; race with late approval must be reconciled.
- Paid, not submitted to Zinc: lock purchase dispatch; request refund through verified dLocal Go refund API, then mark refunded only on verified provider completion.
- Submitted to Zinc, not shipped: request supplier cancellation and verify terminal cancellation before refund. Pending/unknown supplier status requires manual review; no optimistic refund.
- Shipped: cancellation request becomes return/claim workflow, subject to policy and consumer law; do not claim shipment was stopped.
- Delivered: return/claim workflow, not cancellation.
- Split shipping: check whether logistics service was incurred and whether collaborator allocation can be reversed. Reconcile product and shipping refund amounts independently; never refund more than captured minus previously completed refunds.
- Refund must be executed server-side, recorded with provider refund ID, amount, currency, idempotency key, actor, reason and provider response; pending status until confirmed. Handle partial/full refunds, webhook duplicates, chargebacks, rejected payments and late provider events.
- Restore inventory or capacity only once, and only where appropriate; do not restock virtual Zinc goods as physical local inventory.

## Required validation before production
Test UY and AR sandbox (if enabled): approved, declined, timeout, webhook replay, webhook-before-return, return-before-webhook, simultaneous confirmations, missing Zinc balance, Zinc price changed, supplier rejection, cancellation before supplier submission, cancellation during submission race, supplier cancellation approved/denied, shipped, delivered, partial/full refund, failed refund, repeated refund, split shipping payout and reversal, guest authorization, cross-account access, mixed local/international basket, currency mismatch, fee reconciliation, no negative margins. Verify logs, RLS, recovery queue and operator audit.
No production secrets or live purchases in tests. No production deploy or PR merge until evidence-backed sign-off.
