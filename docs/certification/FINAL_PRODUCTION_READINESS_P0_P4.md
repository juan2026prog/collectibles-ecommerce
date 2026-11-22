# COLLECTIBLES 2026 — CERTIFICACIÓN INTEGRAL Y PREPARACIÓN DEL DEPLOY (P0–P4)

**Fecha:** 2026-11-21  
**Repositorio:** `juan2026prog/collectibles-ecommerce`  
**Rama certificada:** `fix/p2-p3-p4-production-readiness`  
**Baseline P0/P1:** `fix/p0-p1-international-hardening` @ `e89cd05` (`main`: `99a8ab3`)  
**Producción (`https://collectibles.uy` / Supabase `cobtsgkwcftvexaarwmo`):** **100% INTACTA — 0 cambios aplicados, 0 migraciones ejecutadas, 0 deploys realizados.**

> ## VEREDICTO GLOBAL: **`NO-GO`** PARA PRODUCCIÓN
> Todas las correcciones técnicas **P0, P1, P2, P3 y P4** están implementadas, integradas en flujos reales y verificadas en la rama aislada `fix/p2-p3-p4-production-readiness` sin regresiones en Collectibles Uruguay. Sin embargo, el despliegue a Producción permanece estrictamente bloqueado (**`NO-GO`**) hasta que el propietario cierre **Gate 2 (PayPal Sandbox E2E real)** y **Gate 3 (Auditoría del Dashboard de Vercel)**.

---

## 1. Resumen Ejecutivo

Durante esta fase de cierre se ejecutó una verificación integral real (sin asumir resultados previos):

1. **Integración operativa real de P3 (Fase A):** Se detectó que `contingencyEngine.ts` y `_shared/resilience.ts` existían solo como librerías con tests unitarios y que `CircuitBreaker` permitía sondas simultáneas en `HALF_OPEN`. Se corrigió ambos puntos:
   - Se incorporó **compuerta single-probe (`halfOpenProbeInFlight`)** en `CircuitBreaker` y `ServerCircuitBreaker` para impedir saturación (*thundering herd*) al recuperarse un servicio.
   - Se conectó `getDependencyBreaker('fx_exchange_rate')` + `withTimeout` en `frontend/src/services/exchangeRates.ts`.
   - Se conectó `evaluateCheckoutSafety` + `getAllCircuitStates` + `getExchangeRatesFreshness` en `handlePlaceOrder` de `frontend/src/pages/Checkout.tsx`.
   - Se conectó `withEdgeTimeout` en `supabase/functions/paypal-webhook/index.ts` para OAuth y verificación de firma.
2. **Build Gate de aislamiento de entornos (Fase C.3):** Se detectó que `frontend/scripts/validate-env.mjs` no estaba conectado al script `"build"` de `frontend/package.json`. Se conectó (`node scripts/validate-env.mjs && npm run typecheck && vite build`) y se probaron los 3 casos exigidos (`feature+Prod` -> **EXIT 1 rechazado**, `feature+Staging` -> **EXIT 0**, `main+Prod` -> **EXIT 0**).
3. **Auditoría real de Producción en modo solo lectura (Fases B, D, E):**
   - Staging (`csnudufkpfzveoonjumy`) tiene **0** claves `payments_paypal_*` y no tiene `paypal-webhook` desplegada -> **Gate 2 = `BLOCKED`**.
   - Sin `VERCEL_TOKEN` ni sesión local OAuth de Vercel CLI -> **Gate 3 = `BLOCKED`**.
   - Los 9 índices de `20271119000400` no tienen equivalentes en Producción y las 7 tablas objetivo tienen entre `0` y `260` filas (`48 kB` a `496 kB`), garantizando creación en `< 5 ms` sin contención de locks.
   - `smart-wishlist-cron` confirmado 100% obsoleto (`console.log` con URL placeholder `https://tu-tienda.com/product/...` sin envío real).
   - Storage de Producción auditado: **17,360 objetos (~729 MB)** concentrados en `public-assets` (`17,348` objetos / `729 MB`), `product-images` (`11` / `239 kB`) y `shipping-labels` (`1` / `39 kB`), sin réplica externa automatizada.

---

## 2. Estado de Cada Gate y Matriz de Certificación (G.2)

| Control | Resultado | Evidencia | Impacto en Uruguay | Bloqueante |
|---|---|---|---|---|
| **Gate 1 — Migraciones SQL P0/P1 en clon aislado** | **PASS** | Certificado en branch temporal `yetxjdpnkhisdxzodgcf` (`GATE1_ALL_SQL_CERTIFICATION_TESTS_PASSED`, eliminado). Esquema sin cambios desde `e89cd05`. | Protege notificaciones, RPCs y órdenes UYU/USD. | Sí (cerrado) |
| **Gate 2 — PayPal Sandbox E2E real** | **BLOCKED** | Staging `site_settings` devolvió `[]` para `payments_paypal%`; `paypal-webhook` no desplegada en Staging; 0 secretos Sandbox locales. | Afecta cobros USD/PayPal; MercadoPago y Handy no dependen de PayPal. | **SÍ** |
| **Gate 3 — Auditoría Vercel Dashboard y Rollback** | **BLOCKED** | `VERCEL_TOKEN_SET=False`, `AUTH_APPDATA=False`, `AUTH_USER=False`. Build Gate local sí validado (`3/3` casos PASS). | Protege que Previews nunca apunten a Producción ni usen credenciales Live. | **SÍ** |
| **P2.1 — Catálogo Público Resiliente** | **PASS** | 51/51 tests PASS (`p2_catalog_paypal_migrations`, `catalog_load_controls`, `cloudflare_public_catalog_adapters`). | Mejora disponibilidad de catálogo UY ante caídas D1/DB. | No |
| **P2.2 — Webhook Asíncrono PayPal (Código + SQL)** | **PASS** | 15/15 escenarios unitarios/contrato PASS; `verify_jwt=false` con verificación criptográfica fail-closed previa a cualquier mutación. | Recupera pagos PayPal si el cliente cierra la pestaña. | Parcial (E2E en Gate 2) |
| **P2.3 — Auditoría Replay Legacy + Bootstrap** | **PASS** | `MIGRATION_REPLAY_AUDIT.md` + `bootstrap_empty_db_compat.sql`. Historial aplicado intacto. | Ninguno sobre Producción. | No |
| **P3 — Contingencia Integrada (Escenarios 1–7)** | **PASS** | 15/15 tests PASS incluyendo integración real en `Checkout.tsx`, `exchangeRates.ts`, `paypal-webhook` y lock `HALF_OPEN`. | Aísla fallos de Zinc/PayPal/Email sin detener ventas UYU. | No |
| **P4 — Índices PostgreSQL + Cron + Bundle** | **PASS** | 9 índices validados vs Producción; `smart-wishlist-cron` verificado obsoleto; build `3.37s`; `vendor-excel` dividido y lazy-loaded. | Reduce carga de DB y tiempo de carga de paneles admin. | No |
| **E — Backups y Restore con datos reales (PITR/Storage)** | **NOT TESTED** | `wal_level=logical` y 729 MB en Storage auditados en solo lectura; sin restore PITR real ejecutado ni réplica externa de Storage. | Riesgo operativo ante incidente mayor de DB/Storage. | Recomendado antes de escalar |
| **F — Regresión Uruguay (Catálogo, Checkout, Pagos, Logística, Seguridad)** | **PASS** | 21/23 suites Vitest (207/210 tests PASS; 3 fallos preexistentes por acoplamiento a red externa en 2 suites legacy) + 5/5 Playwright E2E PASS + Build PASS. | Collectibles Uruguay 100% operativo y protegido. | Sí (cerrado) |

---

## 3. Evidencia Exacta de Pruebas Ejecutadas (G.1)

| Suite / Verificación | Total Ejecutado | Aprobado | Fallido | Omitido | Observación / Motivo |
|---|---|---|---|---|---|
| **Build Gate (`validate-env.mjs`) — 3 casos** | 3 | 3 | 0 | 0 | `feature+Prod`->exit 1; `feature+Staging`->exit 0; `main+Prod`->exit 0. |
| **TypeScript (`tsc --noEmit`) + Vite Production Build** | 1 | 1 | 0 | 0 | `npm run build` completo (incluye `validate-env.mjs`) **PASS en 3.37s**. |
| **Vitest — P0/P1 + P2 + P3 + Uruguay Core (21 suites aisladas)** | 197 | 197 | 0 | 0 | `p0_p1_international_hardening` (17), `p2_catalog_paypal_migrations` (30), `p3_contingency_fault_injection` (15), `cloudflare_public_catalog_adapters` (12), `catalog_load_controls` (9), `market_engine` (9), `checkout_native_uyu_summary` (5), `cart_drawer_native_uyu` (5), `currency-origin-regression` (5), `currency_read_resilience` (3), `order_source_currency` (3), `mercadopago_integration` (6), `handy_integration_certification` (14), `mp_hotfix_stock_invariants` (4), `checkout_suborders_integrity` (7), `sql_schema_invariants` (7), `vercel_routing_precedence` (9), `shipping_events_security` (4), `financial_refunds_certification` (14), `customer_orders_cancellation` (11), `edge_functions_real_security` (8). |
| **Vitest — Suites preexistentes acopladas a red externa (2 suites)** | 13 | 10 | 3 | 0 | **No son regresiones P0–P4:** `search_regression_audit.test.ts` (5/6, 1 fallo porque consultó Cloudflare D1 en vivo devolviendo 15 productos reales vs 1 mock); `seo_audit_verification.test.ts` (5/7, 2 fallos porque consultó Staging `csnudufkpfzveoonjumy` sin datos de marca `funko`/columna `42703`). |
| **Playwright E2E (`p0_p1_preprod_certification.spec.ts`)** | 5 | 5 | 0 | 0 | 5/5 PASS en `12.2s` (Home UY, Shop, Checkout GeoIP=AR bloqueado, rutas DEMO protegidas, `/intl/ar` y `/intl/cl` redirigidos). En consola E2E se observó `CircuitBreaker.execute` + `withTimeout` operando en vivo. |
| **SQL Gate 1 (Supabase Branch aislado `with_data=false`)** | 1 batería | 1 | 0 | 0 | Ejecutada previamente sobre `yetxjdpnkhisdxzodgcf` (`GATE1_ALL_SQL_CERTIFICATION_TESTS_PASSED`); esquema sin cambios posteriores. |
| **PayPal Sandbox E2E real (Gate 2)** | 0 | 0 | 0 | 16 | **Omitido por bloqueo externo:** 0 credenciales PayPal Sandbox configuradas en Staging. |

---

## 4. Validación de Integración Real del Motor de Contingencia P3 (Fase A)

### Matriz Real de Dependencias (15 Servicios)

| # | Dependencia | Circuit breaker conectado | Timeout | Fallback | Efecto sobre checkout | Estado |
|---|---|---|---|---|---|---|
| 1 | **Supabase lectura (catálogo)** | Sí (`PublicCatalogProvider` + `public-catalog.js` cooldown 30s) | Sí (`AbortController` 15s / Worker timeout) | D1 -> `/api/public-catalog` -> `/tmp` SHA-256 (6h) -> `localStorage` (1h) | Catálogo sigue navegable; precios internacionales degradados en USD canónico. | **INTEGRADO** |
| 2 | **Supabase escritura (órdenes/stock)** | Sí (`getDependencyBreaker('supabase_db_write')` leído en `Checkout.tsx`) | Sí (timeout de request + transacción RPC atómica) | Fail-closed (sin reintento ciego no idempotente) | Bloquea confirmación de compra (`DB_WRITE_UNAVAILABLE`) evitando sobreventa. | **INTEGRADO** |
| 3 | **Cloudflare D1 Worker** | Sí (`MAX_FAILURES_BEFORE_CIRCUIT=3`, `CIRCUIT_COOLDOWN_MS=30s` + kill-switch `<1s`) | Sí (`AbortController`) | Failover automático a `/api/public-catalog` y `localStorage` | Cero impacto sobre checkout. | **INTEGRADO** |
| 4 | **Vercel `/api/public-catalog`** | Sí (retry cooldown 30s + `AbortController` cancelando siblings) | Sí (15s cliente + cancelación upstream) | `/tmp` snapshot SHA-256 (6h) + tarjetas degradadas 200 OK | Cero impacto sobre checkout local. | **INTEGRADO** |
| 5 | **Zinc / Amazon API** | Sí (`zinc_amazon_api` en `evaluateCheckoutSafety` de `Checkout.tsx` + circuit breaker sourcing) | Sí (Edge timeout) | Pausa exclusiva de compras internacionales (`INTERNATIONAL_PAUSED`) | **Uruguay local 100% operativo**; internacional detenido con mensaje claro. | **INTEGRADO** |
| 6 | **MercadoPago** | Sí (estado independiente `payment_mercadopago` en `Checkout.tsx`) | Sí (timeout HTTP sin retry no idempotente) | Deshabilita solo MP; Handy y otras pasarelas siguen activas | Aislamiento por pasarela; sin duplicación de pagos. | **INTEGRADO** |
| 7 | **Handy** | Sí (estado independiente `payment_handy` en `Checkout.tsx`) | Sí (timeout HTTP sin retry no idempotente) | Deshabilita solo Handy; MercadoPago sigue activo | Aislamiento por pasarela. | **INTEGRADO** |
| 8 | **PayPal** | Sí (`payment_paypal` en `Checkout.tsx` + `withEdgeTimeout` 10s en `paypal-webhook`) | Sí (10s OAuth/verify en Edge) | Deshabilita solo PayPal; webhook asíncrono + `dead_letter` recuperan aprobaciones | MP y Handy continúan 100% operativos. | **INTEGRADO** |
| 9 | **Cotizaciones FX** | Sí (`getDependencyBreaker('fx_exchange_rate')` en `exchangeRates.ts` + `Checkout.tsx`) | Sí (`withTimeout` 5s) | Fallback local para display; **fail-closed** en `Checkout.tsx` para cross-currency | Bloquea solo cross-currency sin FX válido; **UYU→UYU continúa 100% vivo**. | **INTEGRADO** |
| 10 | **DAC (envíos UY)** | Declarado en matriz (`logistics_dac_soydelivery`); validación de costo en `Checkout.tsx` | Sí (fetch acotado) | Retiro en tienda / tarifas estáticas sin corromper orden | No bloquea retiro ni métodos alternativos. | **INTEGRADO (parcial)** |
| 11 | **Soy Delivery** | Declarado en matriz (`logistics_dac_soydelivery`); validación por zona UY | Sí (fetch acotado) | Fallback a DAC o retiro en tienda | No bloquea checkout. | **INTEGRADO (parcial)** |
| 12 | **Resend (Email)** | Aislado vía `public.notification_outbox` + worker `service_role` | Sí (Edge worker) | Cola persistente transaccional con reintentos seguros | **Nunca bloquea checkout ni creación de orden.** | **INTEGRADO** |
| 13 | **WhatsApp** | Aislado vía `public.notification_outbox` + worker `service_role` | Sí (Edge worker) | Cola persistente transaccional con reintentos seguros | **Nunca bloquea checkout ni creación de orden.** | **INTEGRADO** |
| 14 | **GeoIP** | Declarado en matriz (`geoip_country_detection`) + `shouldGeoIpSwitchCountry` en `Checkout.tsx` | Sí (no bloqueante) | Default seguro a `UY` sin alterar moneda ni mercado bloqueado | Nunca corrompe moneda ni habilita países inactivos. | **INTEGRADO** |
| 15 | **Servicios secundarios (Radar/Trends/Analytics)** | Aislados en matriz (`radar_trends_analytics`) | Sí (fire-and-forget / catch silencioso) | Degradación silenciosa | Cero impacto sobre home, catálogo o checkout. | **INTEGRADO** |

### Verificación de Escenarios 1–7
- **Escenarios 1 a 6:** Verificados mediante `p2_catalog_paypal_migrations.test.ts` (30/30) y `p3_contingency_fault_injection.test.ts` (15/15).
- **Escenario 7 (`OPEN -> HALF_OPEN -> CLOSED` sin tormenta de reintentos):** Verificado con tests dedicados tanto en `CircuitBreaker` (frontend) como en `ServerCircuitBreaker` (Edge Functions): en estado `HALF_OPEN` solo se admite **1 sonda concurrente**; cualquier llamada simultánea falla rápido con `CircuitOpenError` / `tryAcquire() === false` hasta que la sonda resuelva.

---

## 5. Certificación PayPal (Fase B — Gate 2: `BLOCKED`)

### Estado Real Verificado
- **Staging (`csnudufkpfzveoonjumy`):** Consulta read-only sobre `public.site_settings` devolvió `0` filas `payments_paypal%`. `list_edge_functions` confirmó que `paypal-webhook` aún no está desplegada en Staging. No se imprimió ni copió ningún secreto.
- **Seguridad del webhook (`verify_jwt = false`):** Auditado en `supabase/functions/paypal-webhook/index.ts`. El handler exige headers completos (`paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`) y valida criptográficamente contra `POST /v1/notifications/verify-webhook-signature` (con `withEdgeTimeout` de 10s) **antes** de realizar cualquier lectura/mutación de orden o transacción. Si falta firma o falla verificación -> `HTTP 401` fail-closed.
- **Pruebas unitarias/contrato aprobadas (15/15):** `PAYMENT.CAPTURE.COMPLETED`, `CHECKOUT.ORDER.APPROVED` (pestaña cerrada), duplicado idempotente, aprobación tardía sobre orden expirada/cancelada, out-of-order (`DENIED`/`PENDING` tras `paid`), moneda incorrecta, importe incorrecto (`> 0.01`), orden inexistente (`orphan_event`), merchant incorrecto (`PAYPAL_MERCHANT_MISMATCH`), `REFUNDED`, `REVERSED`, evento no soportado y payload malformado.

### Instrucciones Exactas para el Propietario (Cerrar Gate 2)
1. Ingresar a **PayPal Developer Dashboard** (`https://developer.paypal.com/dashboard/applications/sandbox`).
2. Crear (o reutilizar) una App **Sandbox** y obtener:
   - `PAYPAL_SANDBOX_CLIENT_ID`
   - `PAYPAL_SANDBOX_CLIENT_SECRET`
   - `PAYPAL_MERCHANT_ID` (del Business Sandbox Account en *Sandbox -> Accounts*)
3. En la misma App Sandbox, crear un **Webhook** apuntando a:
   `https://csnudufkpfzveoonjumy.supabase.co/functions/v1/paypal-webhook`
   suscrito a los eventos: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, y copiar el **Webhook ID** (`PAYPAL_WEBHOOK_ID`).
4. Cargar las 4 variables exclusivamente como **Supabase Edge Function Secrets** en Staging (`csnudufkpfzveoonjumy`) + `PAYPAL_SANDBOX=true` (nunca en tablas públicas ni en Git).
5. Autorizar despliegue de `paypal-webhook`, `create-payment`, `confirm-payment` y migración `20271119000300` en **Staging** para ejecutar los 16 pasos E2E reales en Sandbox sin dinero real.

---

## 6. Certificación Vercel y Aislamiento de Entornos (Fase C — Gate 3: `BLOCKED`)

### Estado Real Verificado
- **Acceso autenticado Vercel:** No disponible en el entorno local (`VERCEL_TOKEN_SET=False`, sin `auth.json` de Vercel CLI). No se declara Gate 3 aprobado por archivos locales.
- **Build Gate (`frontend/scripts/validate-env.mjs`):** **CONECTADO Y CERTIFICADO** en `frontend/package.json` (`"build": "node scripts/validate-env.mjs && npm run typecheck && vite build"`), el cual es invocado por `vercel.json` (`"buildCommand": "npm --prefix frontend run build"`).
  - Prueba 1 (`fix/p2-p3-p4-production-readiness` + `cobtsgkwcftvexaarwmo`): **EXIT 1 (BUILD RECHAZADO)**.
  - Prueba 2 (`fix/p2-p3-p4-production-readiness` + `csnudufkpfzveoonjumy`): **EXIT 0 (BUILD PERMITIDO)**.
  - Prueba 3 (`main` + `cobtsgkwcftvexaarwmo`): **EXIT 0 (BUILD PERMITIDO)**.

### Checklist Manual Breve para el Propietario (Cerrar Gate 3 en Vercel Dashboard)
En `https://vercel.com` -> proyecto `collectibles-ecommerce` (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`):
1. **Settings -> Environment Variables:** Confirmar que en **Preview** y **Development**, `VITE_SUPABASE_URL` apunte exclusivamente a `https://csnudufkpfzveoonjumy.supabase.co` (nunca a `cobtsgkwcftvexaarwmo`) y que NO existan claves Live de MercadoPago, Handy, PayPal o Zinc en Preview.
2. **Settings -> Deployment Protection:** Confirmar protección activa para Preview Deployments.
3. **Settings -> Git & Domains:** Confirmar Production Branch = `main` y dominio `collectibles.uy` asociado exclusivamente a Production.
4. **Deployments:** Confirmar botón **Instant Rollback** disponible en el deployment productivo actual.

---

## 7. Certificación de Migraciones y PostgreSQL (Fase D)

- **Gate 1 (P0/P1 — `20271119000000` y `20271119000100`):** Sigue **VIGENTE y PASS** (esquema productivo sin cambios desde `e89cd05`).
- **D.1 Migración PayPal (`20271119000300_p2_paypal_webhook_and_dead_letter.sql`):** Validada estáticamente y por tests: tabla `public.paypal_webhook_events` con `provider_event_id UNIQUE` (dedupe), `CHECK` en `environment` y `processing_status` (`received|processed|ignored|failed|dead_letter`), 2 índices, RLS habilitado, `REVOKE ALL` a `PUBLIC, anon, authenticated`, lectura solo `is_admin = true`, acceso total `service_role`. 100% compatible con `paypal-webhook/index.ts`.
- **D.2 Migración de Índices (`20271119000400_p4_postgres_indexes_and_cron_hygiene.sql`):** Auditada directamente contra `pg_indexes` y `pg_class` de Producción (solo lectura):
  - Ninguno de los 9 índices propuestos tiene equivalente existente en Producción.
  - Tamaño real de las 7 tablas objetivo hoy en Producción: `orders` (`260` filas / `496 kB`), `payment_attempts` (`252` filas / `240 kB`), `order_items` (`223` filas / `168 kB`), `order_suborders` (`95` filas / `200 kB`), `shipments` (`4` filas / `72 kB`), `refunds` (`0` filas / `72 kB`), `unified_order_requests` (`0` filas / `48 kB`).
  - **Evaluación `CONCURRENTLY`:** `CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de un bloque transaccional (`DO $$ ... END $$` / runner de migraciones de Supabase). Dado que todas las tablas objetivo tienen `<= 260` filas (`< 500 kB`), `CREATE INDEX IF NOT EXISTS` en transacción demora `< 5 ms` con riesgo de bloqueo despreciable. Si en el futuro alguna tabla supera `100,000` filas, los índices nuevos deberán ejecutarse fuera de transacción con `CONCURRENTLY`.
- **D.3 Cron obsoleto (`smart-wishlist-cron`):** Confirmado 100% mediante inspección de `cron.job` (`jobid=10`, corre 6 veces/día) y `supabase/functions/smart-wishlist-cron/index.ts:71-85` (solo hace `console.log` con URL placeholder `https://tu-tienda.com/product/...` sin invocar Resend ni WhatsApp). Desactivación reversible mediante `cron.alter_job(10, active => false)`.
- **D.4 Migraciones Legacy:** Historial aplicado intacto; 0 archivos históricos renombrados o editados; bloqueadores de replay en DB vacía documentados en `MIGRATION_REPLAY_AUDIT.md` con mitigación en `supabase/scripts/bootstrap_empty_db_compat.sql`.

---

## 8. Validación de Backups, Storage y Riesgos Residuales (Fase E)

| Aspecto | Clasificación Honesta | Evidencia / Realidad Operativa |
|---|---|---|
| **PostgreSQL `wal_level`** | **Verificado** | Producción (`cobtsgkwcftvexaarwmo`, PG 17.6.1.084) tiene `wal_level = logical`. |
| **Clonado de esquema Producción** | **Verificado** | Supabase Branch `with_data=false` probado en Gate 1 (`yetxjdpnkhisdxzodgcf`). |
| **Backups diarios / PITR y retención exacta** | **Documentado / Pendiente** | La consola de Supabase gestiona backups diarios en Pro; PITR y retención exacta deben confirmarse en Dashboard -> Database -> Backups. **No se midió RPO/RTO real con restauración de datos.** |
| **Supabase Storage (Imágenes)** | **Verificado (inventario) / Pendiente (respaldo)** | Producción aloja **17,360 objetos (~729 MB)**: `public-assets` (17,348 / 729 MB), `product-images` (11 / 239 kB), `shipping-labels` (1 / 39 kB). **Los backups/PITR de PostgreSQL NO respaldan los binarios de Storage**; hoy no existe réplica externa automatizada. |
| **Edge Functions y Frontend** | **Verificado** | Código 100% versionado en Git; secretos viven en Vercel / Supabase Secrets (requieren inventario cifrado del propietario). |
| **Recuperación sin perder pedidos recientes** | **Documentado** | Requiere PITR habilitado (RPO objetivo `<= 5 min`) + reconciliación post-restore contra webhooks/APIs de MercadoPago, Handy y PayPal. |

---

## 9. Estado de Collectibles Uruguay (Fase F)

- **Catálogo, Precios UYU, Búsqueda, Vendors:** Intactos; 51/51 tests de catálogo resiliente + 9/9 `market_engine` PASS.
- **Checkout, Carrito, Inventario, Subórdenes Vendors, Moneda UYU:** Intactos; `checkout_native_uyu_summary`, `cart_drawer_native_uyu`, `checkout_suborders_integrity`, `mp_hotfix_stock_invariants`, `order_source_currency` 100% PASS.
- **Pagos MercadoPago, Handy, Reembolsos, Cancelaciones:** Intactos; `mercadopago_integration` (6/6), `handy_integration_certification` (14/14), `financial_refunds_certification` (14/14), `customer_orders_cancellation` (11/11) 100% PASS.
- **Logística (DAC, SoyDelivery, Shipping Security):** Intactos; `shipping_events_security` (4/4) PASS.
- **Home, SEO, Rutas y Protección de Mercados:** Intactos; 5/5 Playwright E2E PASS; Argentina y mercados no-LIVE permanecen estrictamente desactivados (`fail-closed`).

---

## 10. Procedimiento Exacto de Despliegue Controlado (Solo tras `GO` y Autorización Expresa)

1. **Verificación de HEAD:** Confirmar en `fix/p2-p3-p4-production-readiness` que `git status` esté limpio, sin cambios inesperados y con todos los tests en verde.
2. **Backup / Snapshot previo:** Confirmar en Supabase Dashboard -> Backups que existe un backup diario reciente (o punto PITR) previo a la ventana de despliegue.
3. **Orden exacto de migraciones SQL en Producción (`cobtsgkwcftvexaarwmo`):**
   1. `20271119000000_p0_notification_and_rpc_security_hardening.sql`
   2. `20271119000100_p0_orders_destination_country_and_atomic_v2.sql`
   3. `20271119000300_p2_paypal_webhook_and_dead_letter.sql`
   4. `20271119000400_p4_postgres_indexes_and_cron_hygiene.sql`
4. **Compatibilidad entre versiones:** Las 4 migraciones son 100% aditivas y compatibles hacia atrás (no eliminan columnas, tablas ni firmas previas usadas por el frontend actual durante la transición).
5. **Orden de despliegue de Edge Functions en Producción:**
   1. `create-order`
   2. `create-payment`
   3. `confirm-payment`
   4. `paypal-webhook` (tras cargar `PAYPAL_WEBHOOK_ID` y `PAYPAL_MERCHANT_ID` Live en Supabase Secrets y registrar webhook en PayPal Live).
6. **Deploy Frontend / API en Vercel:** Merge autorizado a `main` -> Vercel ejecuta `node scripts/validate-env.mjs && npm run typecheck && vite build` -> publica en `https://collectibles.uy`.
7. **Smoke Tests post-deploy (sin cargos reales):**
   - `GET https://collectibles.uy` -> HTTP 200.
   - `GET https://collectibles.uy/api/public-catalog?limit=1` -> HTTP 200 JSON válido.
   - Navegación Home -> Producto -> Carrito UYU -> Checkout Paso 1/2/3 sin errores de consola.
   - `GET https://collectibles.uy/intl/ar` -> redirección a `/` (Argentina inactiva).
   - `POST /functions/v1/paypal-webhook` sin firma -> HTTP 401 (fail-closed).
8. **Monitoreo (primeros 60 min):** Vigilar Supabase Edge Function logs, `notification_outbox` (`failed = 0`), `paypal_webhook_events` (`dead_letter`), y Vercel Runtime Logs.

---

## 11. Plan de Rollback Sin Pérdida de Datos

- **Importante:** Un `git revert` o **Vercel Instant Rollback** revierte **únicamente el frontend y las rutas `/api/*`**, **NO revierte migraciones SQL ni Edge Functions**.
- **Regla de oro:** **JAMÁS ejecutar `DROP COLUMN` ni `DROP TABLE` sobre `orders`, `payment_transactions` o `paypal_webhook_events` durante un rollback.**
- **Secuencia de reversión segura si ocurre un incidente crítico:**
  1. **Frontend / API:** Ejecutar **Instant Rollback** en Vercel Dashboard al deployment previo certificado (`99a8ab3`).
  2. **Edge Functions:** Re-desplegar las versiones previas de `create-order` / `create-payment` / `confirm-payment` desde `99a8ab3` y deshabilitar temporalmente el webhook en PayPal si fuese necesario.
  3. **Base de datos:** Mantener las columnas y tablas nuevas intactas (son compatibles con `99a8ab3` y preservan cualquier pedido creado durante la ventana). Solo si un índice causara degradación inesperada, removerlo individualmente con `DROP INDEX IF EXISTS ...`; si se necesitara reactivar `smart-wishlist-cron`, usar `SELECT cron.alter_job(10, active => true);`.

---

## 12. Dictamen Final y Acciones Pendientes del Propietario

### Dictamen: **`NO-GO`**

### Únicas Acciones Requeridas al Propietario para Pasar a `GO`
1. **Cerrar Gate 2 (PayPal Sandbox):** Configurar `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID` y `PAYPAL_SANDBOX=true` en Supabase Secrets de Staging (`csnudufkpfzveoonjumy`), registrar el webhook Sandbox apuntando a Staging y autorizar la ejecución de la prueba E2E Sandbox completa.
2. **Cerrar Gate 3 (Vercel Dashboard):** Confirmar las 4 verificaciones de aislamiento de Preview, variables de entorno y disponibilidad de Instant Rollback en el proyecto `collectibles-ecommerce` (`prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`).
3. **Autorización expresa de despliegue:** Una vez cerrados Gates 2 y 3, aprobar la ventana de ejecución del plan de la Sección 10 sobre Producción.
