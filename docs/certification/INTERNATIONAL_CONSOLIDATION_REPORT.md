# COLLECTIBLES 2026 — INFORME DE CONSOLIDACIÓN CONTROLADA DE INTERNACIONAL

**Fecha:** 2026-11-22  
**Rama consolidada:** `fix/p2-p3-p4-production-readiness` (partiendo de `e9b730a`)  
**Rama histórica preservada intacta:** `feat/argentina-deblex-block2` @ `b4363e1`  
**Rama `main` y Producción (`https://collectibles.uy` / Supabase `cobtsgkwcftvexaarwmo`):** **100% INTACTAS — 0 merges, 0 migraciones aplicadas, 0 deploys productivos, 0 ramas nuevas creadas.**

> ## Estado Global para Activación Productiva: **`NO-GO`**
> La consolidación técnica de **Uruguay + SkyPostal + Argentina Deblex + Catálogo Global + P0–P4** en `fix/p2-p3-p4-production-readiness` está **completa y 100% en verde (`357/357` Vitest, `5/5` Playwright, `npm run build` PASS)**. Sin embargo, el paso a Producción y la activación comercial internacional permanecen bloqueados (**`NO-GO`**) hasta cerrar **Gate 2 (PayPal Sandbox E2E)**, **Gate 3 (verificación final de credenciales privilegiadas en Vercel)** y las certificaciones externas de **SkyPostal UAT** y **Deblex real**.

---

## 1. Archivos Recuperados Selectivamente (18 Archivos Exclusivos de Deblex)

Recuperados limpiamente desde `feat/argentina-deblex-block2` (`b4363e1`) sin sobreescribir ningún archivo de P0–P4:

- **Componentes y Portal Deblex (6):**
  - `frontend/src/components/argentina/ArgentinaCheckoutFlow.tsx`
  - `frontend/src/components/argentina/DeblexAuth.tsx`
  - `frontend/src/components/argentina/DeblexPortal.tsx`
  - `frontend/src/components/argentina/DeblexUserManagement.tsx`
  - `frontend/src/components/argentina/MyPackagesTab.tsx`
  - `frontend/src/components/argentina/MyShipmentsTab.tsx`
- **Motores, Tarifario, Casilla Miami y Aduana (6):**
  - `frontend/src/lib/argentina/pricingEngine.ts`
  - `frontend/src/lib/argentina/suiteConfig.ts`
  - `frontend/src/lib/argentina/taxIdValidator.ts`
  - `frontend/src/lib/argentina/excelExporter.ts`
  - `frontend/src/lib/argentina/zincFulfillmentAdapter.ts`
  - `frontend/src/lib/argentina/types.ts`
- **Páginas, Administración y Reportes (4):**
  - `frontend/src/pages/ArgentinaCheckoutPage.tsx`
  - `frontend/src/pages/DeblexEntryPage.tsx`
  - `frontend/src/pages/admin/AdminArgentinaLogistics.tsx`
  - `frontend/src/pages/admin/ArgentinaFinancialDashboard.tsx`
- **Edge Function y Suite de Tests (2):**
  - `supabase/functions/deblex-manage-users/index.ts`
  - `frontend/src/tests/argentina_deblex_block2.test.ts` (43 tests)

---

## 2. Resolución de Conflictos y Archivos Solapados (9 Archivos + 11 Migraciones)

| Archivo / Grupo | Estrategia Aplicada | Justificación |
|---|---|---|
| `frontend/src/App.tsx` | **Integración manual quirúrgica** | Se agregaron `/deblex`, `/portal`, `/admin/argentina/logistics`, `/admin/argentina/finances`, `/admin/deblex/portal` y `/checkout/ar` + `/checkout/argentina` **protegidos con `<ProtectedRoute requireSuperAdmin>`** (preservando protección P0/P1 contra acceso anónimo a checkout simulado y conservando `/franquicias`). |
| `frontend/src/components/ProtectedRoute.tsx` | **Integración manual quirúrgica** | Se incorporó preservación de `?redirect=` manteniendo todas las protecciones de rol y compatibilidad E2E. |
| `frontend/src/pages/Login.tsx` | **Integración manual quirúrgica** | Se incorporó soporte a `?redirect=` con **guard anti-open-redirect** (`/^\/(?!\/)/`) para impedir redirecciones externas. |
| `frontend/src/layouts/StorefrontLayout.tsx` | **Integración manual quirúrgica** | Se agregó `isDedicatedPortal` para ocultar `CompareTray` y `CollectiblesAIAssistant` en `/deblex`, `/portal`, `/account`. |
| `supabase/config.toml` | **Integración manual quirúrgica** | Se agregó `[functions.deblex-manage-users]` (`verify_jwt = true`) preservando `[functions.paypal-webhook]` (`verify_jwt = false`) de P2. |
| `frontend/package.json` y `frontend/scripts/validate-env.mjs` | **Conservado P0–P4 íntegro** | Ya incluía el Build Gate `node scripts/validate-env.mjs && npm run typecheck && vite build` certificado 3/3. |
| `frontend/src/pages/CustomerPortal.tsx` | **Conservado P0–P4 íntegro** | Tuvo 12+ commits productivos posteriores en `main` (Handy, cancelaciones/devoluciones unificadas, ocultado de órdenes, UYU, notificaciones). No se sobreescribió; el portal Deblex opera aislado en `/deblex`. |
| `frontend/src/lib/meta/metaCapi.ts` | **Conservado P0–P4 íntegro** | Evita exigir `VITE_META_CAPI_ENABLED=true` que podría apagar Meta CAPI en Producción Uruguay si la variable no está definida. |
| `11` migraciones SQL `20261015*`–`20261022*` | **No mezcladas en `supabase/migrations/`** | 2 archivos (`140000`, `141000`) son stubs temporales de Staging y los 9 restantes tienen timestamps anteriores al historial productivo actual (`202709*`..`20271119*`) y ya existen en Staging (`csnudufkpfzveoonjumy`, endurecidos por `20271119000200`). Permanecen intactos en `feat/argentina-deblex-block2`. |

---

## 3. Cambios Conservados de P0–P4, Enrutamiento y Catálogo Global

- **P0–P4 intactos:** Hardening RLS/RPCs, `create_order_atomic_v2`, reconciliación FX PayPal, `paypal-webhook` asíncrono + dead-letter, catálogo resiliente SHA-256 + failover, motor de contingencia P3 (`Checkout.tsx`, `exchangeRates.ts`, `HALF_OPEN` single-probe), índices P4 y split `vendor-xlsx`/`vendor-exceljs`.
- **Enrutamiento logístico preservado:**
  - Uruguay stock local -> DAC, SoyDelivery, Distrilogic, Retiro.
  - Uruguay internacional -> `international_courier_direct` («Entrega en tu courier de Miami»), pausado por `international_purchases_enabled = false`.
  - Argentina internacional -> Deblex (tarifario `v1.0_20261015`, mercado `DISABLED` hasta certificación).
  - Otros mercados (CL, PE, CO, EC, BR, MX) -> SkyPostal (`test_mode` / `PREVIEW` o `DISABLED`).
- **Catálogo internacional global:** Tabla maestra única (`international_products`), sin duplicación por país ni exclusiones arbitrarias por marca.

---

## 4. Resultados de Pruebas (Fase 5 — 100% Verde)

| Suite / Verificación | Ejecutados | Aprobados | Fallidos | Observación |
|---|---|---|---|---|
| **Vitest — P0–P4 + Uruguay + Seguridad + Contingencia (23 suites)** | 210 | **210** | 0 | Catálogo resiliente, PayPal webhook contrato, P3 contingencia, MP, Handy, stock, carrito UYU, refunds, cancelaciones, search, SEO. |
| **Vitest — Argentina Deblex Block 2 (`argentina_deblex_block2.test.ts`)** | 43 | **43** | 0 | Tarifario Deblex, zonas CABA/AMBA/Interior, Modalidad A (USD 400 / 50 kg / 3 u.), CUIL/CUIT, consolidación, prealertas. |
| **Vitest — SkyPostal Fases 1–4 + Multi-Country + Storefront (19 suites)** | 104 | **104** | 0 | **4 expectativas obsoletas corregidas** en `skypostal_multicountry_admin_control.test.ts` y `skypostal_phase4_golive_readiness.test.ts` (pre-P0 esperaban `AR=LIVE`, `BR=PREVIEW` y `CL.checkout_ready=true`, contradiciendo las reglas vigentes en Producción y Staging). |
| **TOTAL VITEST CONSOLIDADO (43 suites)** | **357** | **357** | **0** | **100% PASS en `14.44s`.** |
| **TypeScript (`tsc --noEmit`) + `validate-env.mjs` + Vite Build** | 1 | **1** | 0 | **PASS (`10.37s`)**. `DeblexEntryPage` lazy-loaded (`84.50 kB` / gzip `17.28 kB`). |
| **Playwright E2E (`p0_p1_preprod_certification.spec.ts`)** | 5 | **5** | 0 | **PASS (`24.8s`)**: Home UY, Shop, Checkout GeoIP=AR bloqueado, rutas DEMO protegidas, `/intl/ar` y `/intl/cl` redirigidos. |

---

## 5. Estado de Gates (Fase 6)

| Gate / Control | Estado | Realidad Verificada |
|---|---|---|
| **Gate 1 — Migraciones SQL P0/P1** | **PASS** | Certificado en branch aislado; migraciones P2/P4 validadas vs Producción. |
| **Gate 2 — PayPal Sandbox E2E** | **BLOCKED** | 0 claves PayPal Sandbox en Staging (`csnudufkpfzveoonjumy`); Producción sigue en modo LIVE (`payments_paypal_sandbox = false`, no copiado a Staging). |
| **Gate 3 — Vercel Aislamiento y Credenciales Privilegiadas** | **PENDIENTE / BLOCKED** | Se reconocen los ajustes recientes de aislamiento y protección de Preview realizados por el propietario; sin acceso autenticado CLI (`VERCEL_TOKEN_SET=False`) no puede darse por cerrado hasta verificar formalmente `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET` y ausencia de credenciales Live en Preview. |
| **SkyPostal** | **TEST / UAT (Simulado)** | `shipping_providers.skypostal` en `test_mode`, `is_active = false`, sin credenciales API UAT/Prod. |
| **Deblex (Argentina)** | **SIMULACIÓN (Sin cobros/envíos reales)** | `ArgentinaCheckoutFlow` en Modo Simulación; rutas `/checkout/ar` y `/checkout/argentina` protegidas con `requireSuperAdmin`. |

---

## 6. Funcionalidades Todavía Simuladas y Riesgos Pendientes

- **Simuladas (sin operación real):**
  1. `ArgentinaCheckoutFlow.tsx` (compras en Amazon/Zinc y pagos reales desactivados).
  2. API SkyPostal (`skypostal-client.ts` / `skypostal-adapter.ts` probados únicamente por simulación, 0 llamadas a UAT real).
  3. PayPal Sandbox E2E real (pendiente credenciales en Staging).
- **Riesgos pendientes:**
  1. Cierre formal de **Gate 2** (PayPal Sandbox E2E) y **Gate 3** (auditoría de credenciales privilegiadas en Vercel Preview).
  2. Migración futura controlada de las 9 tablas/RPCs Deblex hacia Producción (requiere crear migraciones ordenadas `>= 20271119000500` con el endurecimiento RLS de `20271119000200`, solo cuando se autorice activar Argentina).
  3. Validación contractual de vigencia del tarifario Deblex `v1.0_20261015` y tarifas SkyPostal UAT.
  4. Carrito mixto Uruguay bloqueado por diseño (`UYU/USD` separados) hasta eventual soporte multi-orden.
