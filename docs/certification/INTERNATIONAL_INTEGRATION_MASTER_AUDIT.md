# COLLECTIBLES 2026 — AUDITORÍA MAESTRA E INTEGRACIÓN DE COLLECTIBLES INTERNACIONAL

**Fecha:** 2026-11-22  
**Repositorio:** `juan2026prog/collectibles-ecommerce`  
**Modo de ejecución:** Auditoría integral, verificación automatizada en entorno seguro y preservación estricta de ramas y Producción (`0` cambios en `main`, `0` cambios en Supabase Producción `cobtsgkwcftvexaarwmo`, `0` deploys productivos, `0` ramas nuevas creadas).

---

## A. Rama de Trabajo Confirmada y Topología Real de Ramas

Tras auditar todas las ramas locales y remotas (fechas, commits, `ahead/behind` respecto a `main` @ `99a8ab3` y diferencias de archivos), se comprobó que **ninguna rama individual contiene simultáneamente todo Collectibles Internacional**: el trabajo se encuentra dividido en **dos ramas complementarias reales**:

| Rama | HEAD | Fecha | vs `main` (`99a8ab3`) | Contenido Real Verificado |
|---|---|---|---|---|
| **`fix/p2-p3-p4-production-readiness`** *(activa)* | `c3c2f34` | 2026-11-22 | **0 detrás / 8 adelante** | **Base más actualizada.** Contiene los 121 commits recientes de `main` (**SkyPostal Fases 1–4**, Market Engine, Catálogo Global, Uruguay local + Uruguay Miami `international_courier_direct`, Cloudflare D1) **+ todo el hardening P0–P4** (210/210 Vitest, 5/5 Playwright). **No contiene Deblex.** |
| **`feat/argentina-deblex-block2`** | `b4363e1` | 2026-10-22 | **121 detrás / 16 adelante** | Contiene **toda la implementación de Argentina Deblex** (`38` archivos, `+9,392` líneas: `ArgentinaCheckoutFlow.tsx`, `DeblexPortal.tsx`, `pricingEngine.ts`, `deblex-manage-users`, `11` migraciones SQL Deblex, `25` tests). **No contiene** SkyPostal Fases 1–4, Cloudflare D1 ni P0–P4. |
| `feat/multicountry-block1-reconciliation` | `40ed656` | 2026-10-15 | 121 detrás / 0 adelante | Ya absorbida íntegramente en `main`. |
| `fix/pause-international-storefront-20261030` | — | — | **No existe** | No existe en local ni en `origin`. |
| `main` | `99a8ab3` | 2026-11-18 | 0 / 0 | Rama productiva actual (`https://collectibles.uy`). |

### Decisión de Continuidad (Regla 1 del Prompt Maestro)
- **No se creó ninguna rama nueva** y **no se ejecutaron merges automáticos, rebases ni cherry-picks masivos**, preservando íntegramente el historial de todas las ramas.
- **Ambigüedad arquitectónica documentada:** `feat/argentina-deblex-block2` tiene el desarrollo exclusivo de Argentina/Deblex (`16` commits), mientras `fix/p2-p3-p4-production-readiness` tiene la continuidad más completa del resto de la plataforma (SkyPostal + Catálogo Global + Uruguay + P0–P4).
- **Ruta segura recomendada (requiere autorización del propietario):**
  1. Cerrar Gate 2 (PayPal Sandbox) y Gate 3 (Vercel) y promover `fix/p2-p3-p4-production-readiness` -> `main`.
  2. Integrar controladamente los `16` commits de `feat/argentina-deblex-block2` sobre esa base actualizada, resolviendo únicamente los **7 archivos con solapamiento** (`frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/layouts/StorefrontLayout.tsx`, `frontend/src/pages/CustomerPortal.tsx`, `frontend/src/pages/Login.tsx`, `supabase/config.toml`) y verificando compatibilidad de las 11 migraciones Deblex con el endurecimiento RLS de Staging (`20271119000200`).

---

## B. Inventario de Módulos Existentes

### B.1 Catálogo Internacional Global & Sourcing
- `public.international_products` (tabla maestra única compartida; sin duplicación por país ni filtros arbitrarios por marca).
- `public.international_sync_settings` (Producción verificada: `international_public_enabled = false`, `international_purchases_enabled = false`, `auto_purchase_enabled = false`, `block_payment_on_price_change = true`, `never_sell_at_loss = true`).
- `frontend/src/pages/international/InternationalMarketTemplate.tsx`, `frontend/src/pages/InternationalStorefront.tsx`.
- `api/_lib/public-catalog.js`, `api/_lib/public-catalog-handler.js`, `frontend/src/lib/providers/PublicCatalogProvider.ts`.
- Edge Functions Zinc/Sourcing: `zinc-search-products`, `zinc-enrich-candidate`, `zinc-import-candidates`, `zinc-live-check`, `zinc-live-check-before-payment`, `zinc-sync-international-products`, `zinc-sync-published-products`, `zinc-verify-after-payment`, `zinc-sync-order-tracking`, `zinc-webhook`, `zinc-config`, `zinc-create-return`.

### B.2 Uruguay (2 Circuitos Logísticos Existentes)
- **Circuito 1 — Stock físico local (Collectibles Oficial + Vendors):**
  - `frontend/src/pages/Checkout.tsx`, `frontend/src/utils/uruguayLocations.ts`.
  - Proveedores activos en Producción (`shipping_providers`): `dac` (API activa), `soydelivery` (API activa), `distrilogic` (API activa), `pickup` (activo), `manual` (activo); `ues` y `correo_uruguayo` en `pending_integration`.
  - Edge Functions: `dac-create-shipment`, `dac-track-shipment`, `dac-webhook`, `distrilogic-create-shipment`, `distrilogic-cancel-shipment`, `distrilogic-webhook`, `ues-create-shipment`, `vendor-shipping-save-connection`, `vendor-shipping-test-connection`.
- **Circuito 2 — Internacional a courier en Miami elegido por el cliente:**
  - `frontend/src/pages/Checkout.tsx`: método `international_courier_direct` (**«Entrega en tu courier de Miami»**, líneas 598, 626–627, 1026, 1055, 1178, 1188, 1486, 2204), tabla `international_couriers`, dirección Miami + suite/casillero + ZIP US.
  - **Carritos mixtos (`Checkout.tsx:2250`):** El checkout muestra separación visual pero **bloquea intencionalmente la compra simultánea en una sola orden** (`Los productos locales e internacionales deben comprarse por separado.`) como defensa financiera P0/P1 contra mezcla `UYU`/`USD`, cobros duplicados y corrupción de inventario.

### B.3 Argentina — Deblex (en `feat/argentina-deblex-block2` @ `b4363e1` + tablas activas en Staging)
- Frontend: `frontend/src/components/argentina/ArgentinaCheckoutFlow.tsx` (537 líneas), `DeblexPortal.tsx` (1,735 líneas), `DeblexAuth.tsx`, `DeblexUserManagement.tsx`, `MyPackagesTab.tsx`, `MyShipmentsTab.tsx`, `frontend/src/pages/ArgentinaCheckoutPage.tsx`, `DeblexEntryPage.tsx`, `AdminArgentinaLogistics.tsx`, `ArgentinaFinancialDashboard.tsx`.
- Librerías: `frontend/src/lib/argentina/pricingEngine.ts`, `suiteConfig.ts`, `taxIdValidator.ts`, `excelExporter.ts`, `zincFulfillmentAdapter.ts`, `types.ts`.
- Backend / SQL: `supabase/functions/deblex-manage-users/index.ts` (desplegada en Staging), `11` migraciones SQL (`20261015070000` a `20261015200000`), `frontend/src/tests/argentina_deblex_block2.test.ts` (25 tests).
- **Tablas verificadas en Staging (`csnudufkpfzveoonjumy`):** `deblex_portal_users`, `deblex_pre_alerts`, `deblex_tariff_config`, `deblex_user_invitations` (todas presentes y con RLS endurecido en P0/P1).
- **Tarifario Deblex real en Staging (`deblex_tariff_config` — `v1.0_20261015`, activo):**
  - Flete internacional: **USD 19.00 / kg**.
  - Logistic Pack: **CABA USD 20.00**, **AMBA USD 34.00**, **Interior USD 43.00**.
  - Modalidad A (ARCA/Aduana): FOB máx **USD 400.00**, peso máx **50.00 kg**, máx **3 unidades** por especie, máx **5 operaciones/año**.
- **Punto crítico identificado:** `ArgentinaCheckoutFlow.tsx` opera explícitamente en **Modo Simulación / Certificación** (compras reales en Amazon/pagos reales desactivadas; pendiente conectar a `create-order` + pasarela real + aprobación comercial).

### B.4 Otros Mercados — SkyPostal (en `main` y `fix/p2-p3-p4-production-readiness`)
- Backend: `supabase/functions/_shared/skypostal/skypostal-client.ts`, `supabase/functions/_shared/adapters/skypostal-adapter.ts`, `supabase/functions/shipping-worker/index.ts`, `supabase/functions/shipping-webhooks/index.ts`.
- Frontend: `frontend/src/lib/marketEngine/marketEngine.ts`, `frontend/src/pages/admin/AdminInternationalMarkets.tsx`, `frontend/src/pages/admin/AdminInternationalMarketPreview.tsx`.
- **Estado real en `international_markets` (idéntico en Staging y Producción):**
  - `UY`: `IMPORT_HUB` | `LIVE` (`public=true`, `checkout=true`, `UYU`).
  - `AR`: `IMPORT_HUB` | `DISABLED` (`public=false`, `checkout=false`, `ARS`, nota: `"En espera de certificación Deblex"`).
  - `CL` (Lead Market), `PE`, `CO`, `EC`: `SKYPOSTAL` | `PREVIEW` (`public=false`, `checkout=false`, `provider_environment=test`).
  - `BR`, `MX`: `SKYPOSTAL` | `DISABLED` (`public=false`, `checkout=false`, `preview=false`).
- **Estado real en `shipping_providers`:** `skypostal` está en `status = 'test_mode'`, `is_active = false`, `environment = 'uat'`, `username = null`, `password_encrypted = null`, `api_url = null`. **No tiene credenciales API en vivo cargadas.**

### B.5 Pagos & Conciliación
- Edge Functions existentes: `create-order`, `create-payment`, `confirm-payment`, `reconcile-payment`, `refund-order`, `mercadopago-webhook`, `create-handy-payment`, `handy-webhook`, `dlocalgo-webhook`, `paypal-webhook` (nuevo P2 en `fix/p2-p3-p4-production-readiness`).
- **PayPal real verificado:**
  - **Producción (`cobtsgkwcftvexaarwmo`):** `payments_paypal_client_id`, `payments_paypal_client_secret`, `payments_paypal_enabled` configurados; `payments_paypal_sandbox = false` (modo **LIVE**).
  - **Staging (`csnudufkpfzveoonjumy`):** `0` filas `payments_paypal_*` en `site_settings`; `paypal-webhook` aún no desplegada en Staging. **No copiar credenciales Live a Staging.**

### B.6 Administración Centralizada, CMS y Radar
- Panel único en `frontend/src/pages/admin/`: `AdminProducts`, `AdminInternationalProducts`, `AdminInternationalMarkets`, `AdminInternationalSync`, `AdminInternationalAmazon`, `AdminZincConfig`, `AdminOrders`, `AdminLogistics`, `AdminBanners`, `AdminRadar`, `AdminAIControlCenter`, `AdminSourcingImport`, `AdminSettings`.

---

## C. Matriz de Implementación

| Módulo | Existe | Funciona | Integración real | Pendiente | Acción |
|---|---|---|---|---|---|
| **Uruguay local** | Sí (`main` + P0–P4) | **Sí (100% operativo)** | Sí (MP, Handy, DAC, SoyDelivery, Distrilogic, vendors, stock) | Ninguno crítico (promover P0–P4 tras Gates 2 y 3) | Preservar intacto |
| **Uruguay Miami** | Sí (`Checkout.tsx` `international_courier_direct`) | **Sí** (pausado por `international_purchases_enabled=false`) | Sí (tabla `international_couriers`, validaciones Miami) | Habilitación comercial futura + soporte carrito mixto multi-orden si se desea permitir en un solo checkout | Reutilizar tal cual; mantener bloqueado hasta autorización |
| **Deblex (Argentina)** | Sí (`feat/argentina-deblex-block2` + tablas Staging) | **Sí en simulación** (tarifario, portal, consolidación, 25 tests) | Parcial (portal/tablas en Staging reales; checkout en **Modo Simulación** sin pago/Zinc real; `AR` mapeado a `IMPORT_HUB` en `international_markets`) | Integrar rama `feat/argentina-deblex-block2` sobre P0–P4; vincular `provider=deblex` sin romper `IMPORT_HUB`; conectar pago real; validar vigencia tarifario `v1.0_20261015` | Consolidar rama tras autorización; no reconstruir |
| **SkyPostal (CL/PE/CO/EC/BR/MX)** | Sí (`main` + P0–P4) | **Sí en unit/simulación** (100/104 tests PASS) | **No certificada con API real** (`username/password/api_url = null`, `status = test_mode`, `is_active = false`) | Credenciales UAT/Prod SkyPostal, pruebas reales de cotización/etiqueta/tracking en UAT, alinear 2 tests legacy con estado post-P0 | Reutilizar adaptador y client; certificar en UAT |
| **Catálogo global** | Sí (`international_products` + D1 + `InternationalMarketTemplate`) | **Sí** (sin duplicación por país ni bloqueos por marca) | Sí (Zinc/Amazon, eBay, Best Buy, Sourcing Intelligence) | Confirmar cobertura/restricciones legales por país al activar cada mercado | Mantener catálogo maestro único |
| **Pagos internacionales** | Sí (PayPal, dLocal Go, MP, Handy) | **Sí en código/unit** (`paypal-webhook` 15/15 PASS) | PayPal Live en Prod; **0 credenciales Sandbox en Staging**; dLocal Go pendiente certificación internacional | Cargar credenciales PayPal Sandbox en Staging (Gate 2) y ejecutar E2E real; definir matriz pasarela-por-país | Completar Gate 2 en Staging |
| **Administración** | Sí (panel único `/admin/*`) | **Sí** | Sí (`AdminInternationalMarkets`, `AdminInternationalProducts`, `AdminBanners`, etc.) | Incorporar `AdminArgentinaLogistics` y `ArgentinaFinancialDashboard` al consolidar rama Deblex | Mantener admin único |
| **Radar y tendencias** | Sí (`AdminRadar`, `ReleaseCalendarPage`, `SourcingIntelligence`) | **Sí** | Sí (enlazable a catálogo global) | Extender rankings por mercado cuando existan mercados activos | Reutilizar motor existente |

---

## D. Riesgos y Dependencias Detectados

1. **Divergencia de ramas (`121` vs `16` commits):** `feat/argentina-deblex-block2` tiene `7` archivos con solapamiento directo respecto a `fix/p2-p3-p4-production-readiness`. Un merge ciego podría sobrescribir protecciones P0–P4 en `App.tsx` o `package.json` (`validate-env.mjs`). Debe integrarse manualmente tras promover P0–P4.
2. **Clasificación `IMPORT_HUB` en Argentina:** En `international_markets`, tanto `UY` como `AR` tienen `logistics_mode = 'IMPORT_HUB'` y `provider = 'import_hub'`. En `UY` debe conservarse intacto (Import Hub + courier Miami). En `AR`, debe resolverse el despacho efectivo hacia Deblex mediante configuración (`metadata.logistics_operator = 'deblex'` o `provider = 'deblex'`) sin migrar ni romper órdenes históricas.
3. **Carritos mixtos Uruguay:** Actualmente bloqueados por diseño en `Checkout.tsx:2250` para impedir mezcla de monedas `UYU`/`USD` en una sola orden. Si en el futuro se habilitan carritos mixtos en un solo flujo, requerirá split de órdenes atómico (`order_local_uyu` + `order_intl_usd`) con pagos separados o conciliación multi-orden.
4. **Tests legacy de SkyPostal desalineados con P0/P1:** 4 aserciones en `skypostal_multicountry_admin_control.test.ts` y `skypostal_phase4_golive_readiness.test.ts` esperaban `AR = LIVE` (`canCheckout = true`) y `BR = PREVIEW`, mientras que el endurecimiento P0/P1 dejó correctamente `AR = DISABLED`, `BR = DISABLED` y `CL.checkout_ready = false`. **No debe revertirse el código productivo**; corresponde actualizar esas 4 aserciones cuando se unifique la rama internacional.
5. **Seguridad de entornos (Vercel Gate 3):** Sin acceso CLI/token a Vercel Dashboard (`VERCEL_TOKEN_SET=False`), la separación de `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, y credenciales Live vs Preview requiere verificación directa del propietario en Vercel Dashboard. El Build Gate local `validate-env.mjs` sí está conectado y certificado (`3/3` PASS).

---

## E. Cambios Aplicados

- **Código reutilizado:** 100% de Uruguay local, Uruguay Miami (`Checkout.tsx`), Catálogo Global, SkyPostal Fases 1–4, P0–P4 (`fix/p2-p3-p4-production-readiness` @ `c3c2f34`) y Deblex (`feat/argentina-deblex-block2` @ `b4363e1`).
- **Código productivo modificado en esta auditoría:** **Ninguno** (se respetó estrictamente la regla de no alterar ramas ni código productivo ante la ambigüedad de ramas candidatas).
- **Documentación nueva generada:** `docs/certification/INTERNATIONAL_INTEGRATION_MASTER_AUDIT.md`.

---

## F. Evidencia de Pruebas Ejecutadas

| Suite | Ejecutados | Aprobados | Fallidos | Límites / Observaciones |
|---|---|---|---|---|
| **P0–P4 + Uruguay Core + Seguridad + Contingencia (23 suites Vitest)** | 210 | **210** | 0 | 100% determinista (`4.63s`). Incluye catálogo resiliente, PayPal webhook contrato, P3 contingencia integrada, MP, Handy, stock, refunds, search y SEO. |
| **SkyPostal + Multi-Country + Storefront Integration (19 suites Vitest)** | 104 | **100** | 4 | 17/19 archivos 100% PASS (tarifas, paridad Excel contractual, peso/dimensiones, fuel, compliance, tracking 2 tramos, idempotencia, E2E Chile simulado, control financiero). Los 4 fallos en 2 archivos son expectativas pre-P0 que pedían `AR=LIVE` y `BR=PREVIEW`. **Nota:** Todas las pruebas SkyPostal son simuladas; **0 llamadas reales a API SkyPostal.** |
| **Playwright E2E (`p0_p1_preprod_certification.spec.ts`)** | 5 | **5** | 0 | Home UY, Shop, Checkout GeoIP=AR bloqueado, rutas DEMO protegidas, `/intl/ar` y `/intl/cl` redirigidos (`12.8s`). |
| **Build + Typecheck + Build Gate (`validate-env.mjs`)** | 4 | **4** | 0 | `npm run build` PASS (`3.11s`); `validate-env.mjs` 3/3 casos PASS. |
| **Deblex (`argentina_deblex_block2.test.ts`, 25 tests)** | — | — | — | Reside en `feat/argentina-deblex-block2` (`b4363e1`); no se cambió de rama ni se fusionó para preservar historial. |
| **APIs externas en vivo (PayPal Sandbox, SkyPostal UAT, Deblex real)** | 0 | 0 | 0 | **No probadas en vivo** por ausencia de credenciales Sandbox/UAT y prohibición de operaciones reales. |

---

## G. Pendientes para Go-Live (Separados por Categoría)

1. **Desarrollo pendiente:**
   - Integrar controladamente `feat/argentina-deblex-block2` sobre `fix/p2-p3-p4-production-readiness` (resolviendo los 7 archivos con solapamiento y unificando las 11 migraciones Deblex con el hardening RLS).
   - Conectar `ArgentinaCheckoutFlow` a creación real de orden y pasarela de pago (reemplazando el Modo Simulación).
   - Alinear los 2 tests legacy de SkyPostal (`skypostal_multicountry_admin_control`, `skypostal_phase4_golive_readiness`) con los defaults seguros post-P0.
2. **Integración pendiente:**
   - Definir mapeo definitivo de `AR` (`IMPORT_HUB` -> proveedor efectivo `deblex`) sin romper `UY` ni órdenes históricas.
   - Definir matriz final de pasarelas de pago por país (PayPal / dLocal Go / MP) y estrategia comercial para carritos mixtos UY.
3. **Credenciales pendientes (en Staging / Secrets, nunca en Git ni tablas públicas):**
   - PayPal Sandbox (`PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`) en Staging (`csnudufkpfzveoonjumy`).
   - SkyPostal UAT (`username`, `password`, `api_url`) en entorno de pruebas.
   - dLocal Go Sandbox (si se selecciona para LATAM).
4. **Validación contractual pendiente:**
   - Confirmar vigencia actual del tarifario Deblex `v1.0_20261015` (USD 19/kg, Logistic Pack CABA 20 / AMBA 34 / Interior 43, Modalidad A USD 400 / 50 kg).
   - Confirmar cobertura y tarifas contractuales vigentes de SkyPostal para Chile (Lead Market) y mercados Tier 2.
5. **Pruebas externas pendientes:**
   - Gate 2: E2E completo de PayPal Sandbox en Staging (creación -> captura -> webhook -> idempotencia -> navegador cerrado).
   - SkyPostal UAT E2E real (cotización -> etiqueta UAT -> tracking -> cancelación en ambiente test).
   - Deblex E2E en Staging con orden real de prueba (sin compra real en Amazon).
6. **Autorizaciones del propietario:**
   - Cerrar Gate 3 en Vercel Dashboard (`collectibles-ecommerce`).
   - Autorizar la estrategia de consolidación de ramas (promover P0–P4 primero y luego integrar Deblex sobre esa base).
   - Autorizar cualquier migración a Producción, deploy productivo o activación futura de países/catálogo internacional.
