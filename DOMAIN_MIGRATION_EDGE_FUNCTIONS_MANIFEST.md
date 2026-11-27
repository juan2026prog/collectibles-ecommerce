# COLLECTIBLES 2026 — MANIFIESTO Y RECONCILIACIÓN DE SUPABASE EDGE FUNCTIONS

## 1. Resumen Ejecutivo de Reconciliación

| Métrica | Cantidad | Detalle |
|---|---|---|
| Directorios locales en `supabase/functions/` (sin `_shared`) | **81** | Rama `fix/domain-migration-com-uy` |
| Funciones activas en Producción (`cobtsgkwcftvexaarwmo`) | **72** | Inspeccionado vía MCP `list_edge_functions` (solo lectura) |
| Funciones verificadas en vivo en Staging (`csnudufkpfzveoonjumy`) | **12** | Redesplegadas y certificadas con HTTP `OPTIONS`/`POST`/`GET` en Fase 2 |
| Discrepancias de `verify_jwt` entre `supabase/config.toml` y Producción | **0** | Corregidas las 13 discrepancias detectadas en Fase 1 |
| Funciones en Producción que **DEBEN** redesplegarse en el Release | **69** | Porque modifican código propio o empaquetan `_shared/cors.ts` / `_shared/email-guard.ts` / `_shared/notificationTemplates.ts` |
| Funciones solo en repositorio local (NO desplegadas en Producción) | **10** | `create-test-user`, `dac-sync-offices`, `migrate`, `reconcile-payment`, `shipping-webhooks`, `sourcing-bestbuy-search`, `sourcing-market-intelligence`, `sourcing-openai-research`, `sourcing-retailer-health`, `sourcing-retailer-live-check` — **NO desplegar en este release** para respetar mínimo privilegio y no activar módulos deshabilitados |
| Funciones solo en Producción (ausentes en repositorio local) | **1** | `ai-search` (v13, `verify_jwt=true`) — **CONSERVAR intacta en Producción**; no eliminar |
| Funciones residuales solo en Staging (`csnudufkpfzveoonjumy`) | **4** | `deblex-manage-users`, `deblex-remove-user`, `request-international-cancellation`, `international-cancellation-reconcile` — provenientes de ramas no fusionadas; **NO desplegar en Producción** |

> [!IMPORTANT]
> **Por qué deben redesplegarse las 69 funciones activas en Producción que importan `_shared/`:**
> Supabase Edge Runtime empaqueta estáticamente (`.ezbr`) los archivos de `supabase/functions/_shared/` dentro de cada función en el momento de ejecutar `supabase functions deploy`. Actualizar `_shared/cors.ts` o `_shared/email-guard.ts` en Git **no surte efecto en Producción** hasta que cada función consumidora sea redesplegada.

---

## 2. Matriz Completa de Edge Functions (86 entradas reconciliadas)

| Función (`slug`) | En Repo (`fix/domain-migration-com-uy`) | En Producción (`cobtsgkwcftvexaarwmo`) | Estado en Staging (`csnudufkpfzveoonjumy`) | `verify_jwt` (`config.toml`) | `verify_jwt` (Prod actual) | Acción de Release en Producción |
|---|---|---|---|---|---|---|
| `abandoned-carts-cron` | Sí | Sí (v15) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `admin-daily-summary-cron` | Sí | Sí (v10) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `ai-catalog-generator` | Sí | Sí (v25) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `ai-search` | No | Sí (v10) | NOT_DEPLOYED | `N/A` | `false` | PRESERVE_OR_AUDIT (`ai-search` activa en Prod sin carpeta en rama) |
| `ai-seo-optimizer` | Sí | Sí (v24) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `block-user` | Sí | Sí (v22) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `calculate-commissions` | Sí | Sí (v28) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `campaign-runner` | Sí | Sí (v18) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `checkout-handler` | Sí | Sí (v29) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `confirm-payment` | Sí | Sí (v33) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `create-handy-payment` | Sí | Sí (v40) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `create-order` | Sí | Sí (v60) | VERIFIED_STAGING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `create-payment` | Sí | Sí (v51) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `create-test-user` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `create-user` | Sí | Sí (v21) | ACTIVE_PREEXISTING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `dac-create-shipment` | Sí | Sí (v32) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-get-cost` | Sí | Sí (v26) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-get-label` | Sí | Sí (v25) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-login` | Sí | Sí (v23) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-refresh-session` | Sí | Sí (v22) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-sync-offices` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `dac-track-shipment` | Sí | Sí (v22) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dac-webhook` | Sí | Sí (v21) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `deblex-manage-users` | No | No | ACTIVE_PREEXISTING | `N/A` | `N/A` | STAGING_ONLY_ARTIFACT (Rama externa/histórica en Staging — ignorar en Prod) |
| `deblex-remove-user` | No | No | ACTIVE_PREEXISTING | `N/A` | `N/A` | STAGING_ONLY_ARTIFACT (Rama externa/histórica en Staging — ignorar en Prod) |
| `delete-user` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `distrilogic-cancel-shipment` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-create-shipment` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-get-label` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-get-tracking` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-quote` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-sync-services` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `distrilogic-webhook` | Sí | Sí (v12) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `dlocalgo-checkout` | Sí | Sí (v24) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `dlocalgo-webhook` | Sí | Sí (v26) | VERIFIED_STAGING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `generate-content` | Sí | Sí (v24) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `get-order-status` | Sí | Sí (v2) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `handy-test-connection` | Sí | Sí (v20) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `handy-webhook` | Sí | Sí (v27) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `international-cancellation-reconcile` | No | No | ACTIVE_PREEXISTING | `N/A` | `N/A` | STAGING_ONLY_ARTIFACT (Rama externa/histórica en Staging — ignorar en Prod) |
| `mbe-logistics` | Sí | Sí (v15) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `media-proxy` | Sí | Sí (v13) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `mercadolibre-auth` | Sí | Sí (v29) | VERIFIED_STAGING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `mercadolibre-sync` | Sí | Sí (v124) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `mercadolibre-webhook` | Sí | Sí (v34) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `mercadopago-checkout` | Sí | Sí (v30) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `mercadopago-webhook` | Sí | Sí (v42) | NOT_DEPLOYED | `false` | `false` | NO_CHANGE_NEEDED (Sin dependencia de dominio/CORS modificado) |
| `meta-capi` | Sí | Sí (v30) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `migrate` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `ml-import-worker` | Sí | Sí (v20) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `notification-dispatcher` | Sí | Sí (v21) | VERIFIED_STAGING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `order-execution-worker` | Sí | Sí (v6) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `process-catalog-outbox` | Sí | Sí (v18) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `reconcile-payment` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `refund-order` | Sí | Sí (v47) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `request-international-cancellation` | No | No | ACTIVE_PREEXISTING | `N/A` | `N/A` | STAGING_ONLY_ARTIFACT (Rama externa/histórica en Staging — ignorar en Prod) |
| `request-order-resolution` | Sí | Sí (v14) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `seed-paypal` | Sí | Sí (v23) | NOT_DEPLOYED | `true` | `true` | NO_CHANGE_NEEDED (Sin dependencia de dominio/CORS modificado) |
| `send-whatsapp-notification` | Sí | Sí (v20) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `shipping-webhooks` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `shipping-worker` | Sí | Sí (v13) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `sitemap` | Sí | Sí (v22) | VERIFIED_STAGING | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `smart-wishlist-cron` | Sí | Sí (v15) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `sourcing-bestbuy-search` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `sourcing-market-intelligence` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `sourcing-openai-research` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `sourcing-retailer-health` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `sourcing-retailer-live-check` | Sí | No | NOT_DEPLOYED | `true` | `N/A` | DO_NOT_DEPLOY (Función en repo pero inactiva/no desplegada en Prod) |
| `soydelivery-sync` | Sí | Sí (v27) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `transactional-emails` | Sí | Sí (v30) | VERIFIED_STAGING | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `ues-create-shipment` | Sí | Sí (v15) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `vendor-shipping-save-connection` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `vendor-shipping-test-connection` | Sí | Sí (v13) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-config` | Sí | Sí (v10) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Código + _shared actualizados) |
| `zinc-create-category` | Sí | Sí (v12) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-create-return` | Sí | Sí (v9) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-enrich-candidate` | Sí | Sí (v14) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-import-candidates` | Sí | Sí (v15) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-live-check` | Sí | Sí (v14) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-live-check-before-payment` | Sí | Sí (v18) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-search-products` | Sí | Sí (v24) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-sync-international-products` | Sí | Sí (v15) | NOT_DEPLOYED | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-sync-order-tracking` | Sí | Sí (v10) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-sync-published-products` | Sí | Sí (v17) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-verify-after-payment` | Sí | Sí (v18) | ACTIVE_PREEXISTING | `true` | `true` | REDEPLOY_REQUIRED (Empaqueta _shared/cors.ts o _shared actualizado) |
| `zinc-webhook` | Sí | Sí (v12) | NOT_DEPLOYED | `false` | `false` | REDEPLOY_REQUIRED (Código + _shared actualizados) |

---

## 3. Comando Exacto de Despliegue a Producción (SOLO TRAS APROBACIÓN DEL PROPIETARIO)

Gracias a que `supabase/config.toml` ahora tiene **0 discrepancias de `verify_jwt`** respecto a Producción (`cobtsgkwcftvexaarwmo`), el despliegue autorizado se ejecuta en lotes controlados exclusivamente para las **69 funciones activas en Producción** (sin tocar `ai-search` ni subir las 10 funciones inactivas):

```powershell
# Lote 1 — Contención Crítica: CORS, Emails, Notificaciones, Proxy de Medios y Meta CAPI
npx supabase functions deploy meta-capi media-proxy transactional-emails notification-dispatcher abandoned-carts-cron admin-daily-summary-cron send-whatsapp-notification campaign-runner smart-wishlist-cron --remote=cobtsgkwcftvexaarwmo --use-api

# Lote 2 — Checkout, Órdenes, Pasarelas de Pago, Reembolsos y Resoluciones
npx supabase functions deploy create-order checkout-handler create-payment confirm-payment create-handy-payment handy-test-connection mercadopago-checkout dlocalgo-checkout dlocalgo-webhook refund-order get-order-status request-order-resolution order-execution-worker calculate-commissions --remote=cobtsgkwcftvexaarwmo --use-api

# Lote 3 — Auth Admin, Mercado Libre, Sitemap, IA y Catálogo D1 Outbox
npx supabase functions deploy create-user block-user delete-user mercadolibre-auth mercadolibre-sync mercadolibre-webhook ml-import-worker sitemap ai-catalog-generator ai-seo-optimizer generate-content process-catalog-outbox --remote=cobtsgkwcftvexaarwmo --use-api

# Lote 4 — Logística Nacional e Internacional (DAC, Distrilogic, SoyDelivery, UES, MBE, Zinc)
npx supabase functions deploy mbe-logistics soydelivery-sync ues-create-shipment shipping-worker vendor-shipping-save-connection vendor-shipping-test-connection dac-create-shipment dac-get-cost dac-get-label dac-login dac-refresh-session dac-track-shipment dac-webhook distrilogic-cancel-shipment distrilogic-create-shipment distrilogic-get-label distrilogic-get-tracking distrilogic-quote distrilogic-sync-services distrilogic-webhook zinc-config zinc-create-category zinc-create-return zinc-enrich-candidate zinc-import-candidates zinc-live-check zinc-live-check-before-payment zinc-search-products zinc-sync-international-products zinc-sync-order-tracking zinc-sync-published-products zinc-verify-after-payment zinc-webhook --remote=cobtsgkwcftvexaarwmo --use-api
```
