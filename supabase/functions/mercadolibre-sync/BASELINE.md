# MercadoLibre sync: compatibility with deployed version 113

This entrypoint was reconciled against the source actually deployed in Supabase
as `mercadolibre-sync` version 113, rather than publishing unrelated repository
changes to product classification, SKU/GTIN handling, brands or conditions.

`auth-v113.ts` is the exact deployed authentication helper, with normalized line
endings. The entrypoint imports its existing `verifyAuth` from this dedicated
copy. This preserves this function's current authentication behavior and does
not modify the shared helper, permissions or authorization of other functions.
The other deployed dependencies, `_shared/cors.ts` and `_shared/alerts.ts`, were
verified identical to their repository versions.

`baseline-v113-bounded.patch` records the only behavior changes to the deployed
entrypoint: bounded reads, no write retries, a 45-second processing budget,
conditional queue claims and release of work deferred before an external write.
Stock, price calculations, product settings, orders and other actions retain
their deployed behavior. An uncertain external write remains a charged failed
attempt, rather than being retried immediately or treated as never attempted.

The integrity test reverses the allowed patch and authentication import move in
memory, then verifies SHA-256 against the captured deployed source:

- Entrypoint v113: `6fd6dc579f4feb6bb5c660a909420b372326339a6c0ccb11db223dc2055a15d4`
- Auth helper v113: `32d232de65dd7369a2e57cba8cfb23211903138cd6c45cdc6b4e3cfb50027e68`

Hashes use UTF-8, LF line endings and omit trailing whitespace. This is a source
compatibility record, not evidence that the function caused the database outage
or that a timeout proves an external write was not accepted.
