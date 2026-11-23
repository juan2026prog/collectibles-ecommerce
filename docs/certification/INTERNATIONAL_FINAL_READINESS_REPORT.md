# COLLECTIBLES 2026 — REPORTE FINAL DE CERTIFICACIÓN OPERATIVA INTERNACIONAL

**Fecha:** 2026-11-22  
**Repositorio:** `juan2026prog/collectibles-ecommerce`  
**Rama de trabajo:** `fix/p2-p3-p4-production-readiness`  
**Producción (`https://collectibles.uy` / Supabase `cobtsgkwcftvexaarwmo`):** **100% INTACTA — 0 cambios aplicados, 0 migraciones productivas, 0 deploys, 0 pagos/envíos reales.**

> ## Dictamen Global: **`NO-GO`** para Activación Productiva
> La plataforma **Collectibles Internacional** (Uruguay local + Uruguay Miami + Argentina Deblex + SkyPostal + Catálogo Global + P0–P4) está **técnicamente consolidada y verificada en entorno aislado (`364/364` Vitest, `5/5` Playwright, `validate-env.mjs` 3/3, `npm run build` PASS)**. Sin embargo, el dictamen global permanece **`NO-GO`** porque **Gate 2 (PayPal Sandbox E2E)**, **Gate 3 (verificación de secretos privilegiados en Vercel Preview)**, **SkyPostal UAT real** y **Deblex checkout/tarifario contractual** siguen bloqueados por dependencias externas.

---

## A. Estado Git

- **Rama activa:** `fix/p2-p3-p4-production-readiness` (consolidada sobre `f596ffb` + nueva suite `international_final_certification.test.ts` + este informe).
- **Rama histórica Deblex preservada intacta:** `feat/argentina-deblex-block2` @ `b4363e1`.
- **Rama `main` de referencia intacta:** `99a8ab3` (0 merges, 0 force push, 0 rebases destructivos, 0 ramas nuevas creadas).
- **Árbol de trabajo:** Limpio tras commit atómico final.

---

## B. Certificación de Migraciones Deblex (Fase A)

### B.1 Auditoría Completa de las 11 Migraciones Históricas (`feat/argentina-deblex-block2`)

| Grupo | Cantidad | Contenido Real | Contraste con Staging (`csnudufkpfzveoonjumy`) | Decisión |
|---|---|---|---|---|
| **Migraciones Deblex Core (legítimas)** (`20261015070000`–`20261015130000`, `20261016140000`, `20261022100000`) | **9** | **12 tablas** (`deblex_tariff_config`, `customer_argentina_profiles`, `argentina_packages`, `argentina_consolidations`, `argentina_consolidation_items`, `deblex_pre_alerts`, `argentina_financial_ledger`, `argentina_audit_logs`, `deblex_portal_users`, `deblex_user_invitations`, `argentina_consolidation_history`, `argentina_package_documents`) + **12 RPCs** (`SECURITY DEFINER`). | **12/12 tablas presentes en Staging**, TODAS con `rowsecurity = true`, policies (`1–3`) e índices (`1–6`). **12/12 RPCs presentes**, TODAS con **`anon_exec = false`** (endurecidas por `20271119000200`). | **NO insertar con timestamps viejos `20261015*` en `supabase/migrations/`** (romperían orden frente a Producción `202709*`–`20271119*`). |
| **Stubs temporales de Staging** (`20261015140000_restore_staging_schema_dependencies.sql`, `20261015141000_staging_catalog_stubs.sql`) | **2** | 11 `DROP`s + recreación stub de `feature_toggles`, `promotions`, `products`, `vendors`, `categories`, `brands`, `product_variants`. | Exclusivos para levantar Staging en octubre; incompatibles con Producción. | **EXCLUIDAS PERMANENTEMENTE** de Producción. |

### B.2 Reconstrucción en Base Limpia y Reversión
- **Hallazgo real en `supabase_migrations.schema_migrations` de Staging:** Solo `20261015231148_argentina_consolidation_input_hardening` y `20261016030950_staging_catalog_stubs` figuran en `schema_migrations` con timestamps distintos de los archivos históricos; las demás tablas fueron creadas vía SQL/MCP.
- **Plan reproducible para base nueva o futura promoción:** Generar una única migración incremental idempotente `>= 20271119000500_deblex_argentina_consolidated_schema.sql` consolidando exclusivamente las 9 migraciones legítimas + el endurecimiento `REVOKE EXECUTE ... FROM anon` de `20271119000200`, validada previamente en un Supabase Branch desechable (`with_data=false`) cuando se autorice activar Argentina.
- **Reversión segura:** No ejecutar `DROP TABLE` sobre tablas con datos; desactivar rutas/feature flags y revocar permisos operativos (`REVOKE EXECUTE`) si una instalación fallara.
- **Replay desde cero:** **PENDIENTE** de entorno desechable autorizado (Docker Desktop local apagado; no se aprovisionó Supabase Branch pago sin autorización).

---

## C. Vercel y Gate 3 (Fase B) — Estado: **`BLOCKED`**

- **Acceso autenticado Vercel desde el agente:** No disponible (`VERCEL_TOKEN=False`, sin sesión OAuth local).
- **Build Gate local (`frontend/scripts/validate-env.mjs`):** **VERIFICADO PASS (`3/3`)** y conectado en `frontend/package.json` (`"build": "node scripts/validate-env.mjs && npm run typecheck && vite build"`):
  - `fix/p2-p3-p4-production-readiness` + `cobtsgkwcftvexaarwmo` -> **EXIT 1 (BUILD RECHAZADO)**.
  - `fix/p2-p3-p4-production-readiness` + `csnudufkpfzveoonjumy` -> **EXIT 0 (BUILD PERMITIDO)**.
  - `main` + `cobtsgkwcftvexaarwmo` -> **EXIT 0 (BUILD PERMITIDO)**.
- **Auditoría de secretos privilegiados en Preview (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, pasarelas, couriers):** Clasificados honestamente como **`NO VERIFICADO`** desde el agente al no tener acceso de lectura a Vercel Env Vars. Aunque el propietario realizó ajustes recientes de aislamiento y Vercel Authentication en Preview, **Gate 3 permanece `BLOCKED`** hasta confirmar formalmente que ningún secreto en Preview corresponde a Producción (`cobtsgkwcftvexaarwmo`) ni a cuentas Live de pagos/couriers.

---

## D. PayPal Sandbox y Gate 2 (Fase C) — Estado: **`BLOCKED`**

- **Implementación auditada (código y contrato):** `create-payment`, `confirm-payment`, `_shared/paypal-fx.ts`, `_shared/paypal-webhook-core.ts`, `paypal-webhook` (`verify_jwt=false` con verificación criptográfica fail-closed `/v1/notifications/verify-webhook-signature` + `withEdgeTimeout` 10s), migración `20271119000300_p2_paypal_webhook_and_dead_letter.sql`. **15/15 escenarios unitarios/contrato PASS.**
- **Localización de credenciales (sin exponer valores):**
  - Producción (`cobtsgkwcftvexaarwmo`): configurado en modo **LIVE** (`payments_paypal_sandbox = false`). **No se copió ni se debe copiar a Staging.**
  - Staging (`csnudufkpfzveoonjumy`): **`0` claves `payments_paypal_*`** en `site_settings` y `paypal-webhook` aún no desplegada en Staging.
- **Prueba Sandbox E2E real (10 pasos):** **NO EJECUTADA (`BLOCKED`)** por falta de credenciales PayPal Sandbox (`PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_ID`, `PAYPAL_SANDBOX=true`) en Edge Function Secrets de Staging.

---

## E. Uruguay Miami y Carritos Mixtos (Fase D) — Estado: **`CONDITIONAL GO`**

- **Circuito Uruguay Miami (`Checkout.tsx`):** Reutilizado y verificado (`international_courier_direct` — **«Entrega en tu courier de Miami»**, tabla `international_couriers`, dirección Miami + suite/casillero + ZIP US, excluido de DAC/SoyDelivery y excluido de SkyPostal). Pausado comercialmente en Producción por `international_public_enabled = false` y `international_purchases_enabled = false`.
- **Carrito mixto (`Oficial UYU + Vendor UYU + Internacional USD`):**
  - Verificado en `priceResolver.ts` (`inspectCartCurrencies` devuelve `isMixed = true`, `canonicalCurrency = null`) y en `Checkout.tsx:2250` (`Los productos locales e internacionales deben comprarse por separado.`).
  - **Dictamen técnico:** Este bloqueo es una **decisión deliberada de seguridad financiera P0/P1** (una orden en `orders` posee una única moneda `UYU` o `USD` y una única transacción de cobro). **Se mantiene el bloqueo**; habilitar carritos mixtos en un solo pago requeriría diseñar un split atómico multi-orden (`order_local_uyu` + `order_intl_usd`) con conciliación independiente.

---

## F. Argentina Deblex (Fase E) — Estado: **`NO-GO` (Simulación)**

- **Módulos consolidados y verificados:** Portal Deblex (`/deblex`), `DeblexAuth`, `DeblexUserManagement`, `ArgentinaCheckoutFlow`, `MyPackagesTab`, `MyShipmentsTab`, `pricingEngine`, `suiteConfig`, `taxIdValidator`, `AdminArgentinaLogistics`, `ArgentinaFinancialDashboard`, `deblex-manage-users`. **43/43 tests Deblex PASS + 2 tests dedicados de tarifario/protección PASS.**
- **Tarifario histórico recuperado (`v1.0_20261015`):** USD 19/kg, Logistic Pack CABA USD 20 / AMBA USD 34 / Interior USD 43, Modalidad A FOB máx USD 400 / 50 kg / 3 u. por especie / 5 operaciones/año. **Tratado como configuración histórica; vigencia contractual pendiente de confirmación.**
- **Protecciones activas:** Mercado `AR` en `DISABLED` (`canCheckout = false`); rutas `/checkout/ar` y `/checkout/argentina` protegidas con `<ProtectedRoute requireSuperAdmin>`; `ArgentinaCheckoutFlow` opera en **Modo Simulación / Certificación** (sin compras reales en Amazon ni cobros reales).

---

## G. SkyPostal (Fase F) — Estado: **`NO-GO` (Simulación / UAT Pendiente)**

- **Tests ejecutados:** **104/104 tests SkyPostal y multipaís PASS** (19 suites). Las 4 aserciones actualizadas reflejan exactamente los estados vigentes en DB (`UY=LIVE`, `AR=DISABLED`, `BR=DISABLED`, `CL.checkout_ready=false`, `CL.api_ready=false`).
- **Enrutamiento verificado:** `UY` y `AR` excluidos de SkyPostal (`isSkyPostalMarket = false`); `CL`, `PE`, `CO`, `EC`, `BR`, `MX` resueltos mediante SkyPostal sin checkout público habilitado.
- **Separación honesta de niveles:**
  - Simulación local y contrato API: **VERIFICADO (`104/104` PASS)**.
  - Conectividad UAT real: **BLOCKED** (`shipping_providers.skypostal` en `test_mode`, `is_active = false`, `username/password/api_url = null`).
  - Operación Live: **NO AUTORIZADA (`0` guías/cargos reales).**

---

## H. Evidencia Completa de Regresión (Fase H)

| Suite / Verificación | Nivel | Ejecutados | Aprobados | Fallidos | Tiempo |
|---|---|---|---|---|---|
| **Vitest — P0–P4 + Uruguay + Seguridad + Contingencia (23 suites)** | Unit / Integración aislada | 210 | **210** | 0 | — |
| **Vitest — Argentina Deblex Block 2 (1 suite)** | Unit / Simulación | 43 | **43** | 0 | — |
| **Vitest — SkyPostal Fases 1–4 + Multi-Country + Storefront (19 suites)** | Unit / Simulación | 104 | **104** | 0 | — |
| **Vitest — Certificación Final Internacional (`international_final_certification.test.ts`)** | Contrato / Reglas | 7 | **7** | 0 | — |
| **TOTAL VITEST CONSOLIDADO (44 suites)** | **Aislado (0 red externa)** | **364** | **364** | **0** | **PASS** |
| **Build Gate (`validate-env.mjs`)** | Script de entorno | 3 | **3** | 0 | PASS |
| **TypeScript (`tsc --noEmit`) + Vite Build** | Compilación productiva | 1 | **1** | 0 | PASS |
| **Playwright E2E (`p0_p1_preprod_certification.spec.ts`)** | E2E navegador local | 5 | **5** | 0 | `23.0s` |
| **PayPal Sandbox E2E / SkyPostal UAT / Deblex real** | Proveedores externos | 0 | 0 | 0 | **BLOCKED** |

---

## I. Plan de Despliegue Controlado y Rollback (Fase G — NO EJECUTADO)

### I.1 Secuencia de 10 Etapas (Solo tras `GO` y Autorización Expresa)
1. **Infraestructura y secretos:** Cerrar Gate 3 en Vercel (confirmar aislamiento total de `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, pasarelas y couriers) y confirmar backup/snapshot reciente de Producción.
2. **Migraciones compatibles P0–P4 en Producción (`cobtsgkwcftvexaarwmo`):** Aplicar en orden `20271119000000` -> `20271119000100` -> `20271119000300` -> `20271119000400`. *(Deblex NO se migra hasta etapa 8 con migración consolidada `>= 20271119000500` certificada en branch).*
3. **Edge Functions en Producción:** Desplegar en orden `create-order` -> `create-payment` -> `confirm-payment` -> `paypal-webhook` (con `PAYPAL_WEBHOOK_ID` y `PAYPAL_MERCHANT_ID` Live en Secrets).
4. **Verificación de configuración:** Confirmar `international_public_enabled=false`, `international_purchases_enabled=false`, `AR=DISABLED`, `BR=DISABLED`, `CL/PE/CO/EC=PREVIEW`.
5. **Deploy Frontend (Vercel):** Merge autorizado a `main` -> Build Gate `validate-env.mjs` + `tsc` + `vite build` -> publicación en `https://collectibles.uy`.
6. **Smoke tests post-deploy:** HTTP 200 en `/` y `/api/public-catalog?limit=1`; `/intl/ar` redirige a `/`; `/checkout/ar` redirige a `/login`; `paypal-webhook` sin firma -> HTTP 401.
7. **Regresión Uruguay:** Verificar catálogo UYU, carrito UYU, cálculo DAC/SoyDelivery, inicio de checkout MP/Handy (sin cargos reales) y `notification_outbox` sin errores durante 60 min.
8. **Habilitación gradual de mercados (futura):** Solo tras certificar Deblex/SkyPostal UAT; activar primero en `PREVIEW` admin, luego país por país.
9. **Habilitación posterior de pagos internacionales:** Solo tras Gate 2 (PayPal Sandbox E2E) PASS.
10. **Activación logística real:** Solo tras validación contractual de tarifarios y pruebas UAT reales de SkyPostal/Deblex.

### I.2 Plan de Rollback Sin Pérdida de Datos
- **Versión productiva previa:** `main` @ `99a8ab3`.
- **Frontend / API:** **Vercel Instant Rollback** al deployment de `99a8ab3` *(recordar: esto NO revierte migraciones SQL ni Edge Functions)*.
- **Edge Functions:** Re-desplegar `create-order`, `create-payment`, `confirm-payment` desde `99a8ab3` y pausar webhook PayPal si fuese necesario.
- **Base de datos y órdenes:** **NUNCA ejecutar `DROP COLUMN` ni `DROP TABLE`** sobre `orders`, `payment_transactions` o `paypal_webhook_events`. Las migraciones P0–P4 son aditivas y 100% compatibles con `99a8ab3`.
- **Feature flags / contingencia inmediata:** Mantener `international_public_enabled=false`, `international_purchases_enabled=false`, kill-switch de mercado en `international_markets` y kill-switch D1 `< 1s`.
- **Responsable de autorización:** Propietario del proyecto.

---

## J. Dictamen Final por Sistema

| Sistema / Subsistema | Dictamen | Justificación Exacta |
|---|---|---|
| **Collectibles Uruguay Local (Catálogo, Vendors, MP, Handy, DAC, SoyDelivery)** | **GO** *(dentro del alcance comprobado)* | 100% intacto, 210/210 tests core + 5/5 Playwright PASS, build limpio. |
| **Hardening P0–P4 (Seguridad, Contingencia P3, Catálogo Resiliente, Bundle P4)** | **CONDITIONAL GO** | Técnicamente certificado (`364/364` Vitest), pendiente únicamente de cierre de Gate 2 (PayPal Sandbox) y Gate 3 (Vercel). |
| **Uruguay Internacional — Courier Miami** | **CONDITIONAL GO** | Circuito `international_courier_direct` intacto y carrito mixto protegido; pendiente autorización comercial y Gate 2. |
| **Catálogo Internacional Global** | **CONDITIONAL GO** | Tabla maestra única sin exclusiones por marca; listo para consumir cuando se habilite cada mercado. |
| **PayPal Internacional (Gate 2)** | **NO-GO** | Bloqueado por falta de credenciales PayPal Sandbox y prueba E2E real en Staging. |
| **Vercel Aislamiento Completo (Gate 3)** | **NO-GO** | Bloqueado por verificación pendiente de credenciales privilegiadas (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`, pasarelas/couriers) en Preview. |
| **Argentina — Deblex** | **NO-GO** | Consolidado en código y 43/43 tests PASS, pero en Modo Simulación, con tarifario `v1.0_20261015` pendiente de validación contractual y migración consolidada pendiente de replay en base limpia. |
| **SkyPostal (CL, PE, CO, EC, BR, MX)** | **NO-GO** | 104/104 tests simulados PASS, pero sin credenciales API UAT ni pruebas reales con el proveedor (`is_active = false`). |
| **DICTAMEN GLOBAL DE LIBERACIÓN A PRODUCCIÓN** | **`NO-GO`** | Mantener en rama `fix/p2-p3-p4-production-readiness` hasta cierre de bloqueantes externos y autorización expresa. |
