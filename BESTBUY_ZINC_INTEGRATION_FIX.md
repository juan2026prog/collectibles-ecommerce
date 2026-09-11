# COLLECTIBLES 2026 — DOCUMENTO DE CIERRE TÉCNICO
## CORRECCIÓN PRODUCTIVA DE LA INTEGRACIÓN BEST BUY + ZINC EN SOURCING INTELLIGENCE

**Fecha:** 11 de Septiembre de 2026  
**Módulo:** Sourcing Intelligence (`/admin/internacional/sourcing`)  
**Entornos:** Producción (`collectibles.uy`), Vercel CI/CD, Supabase Remote (`cobtsgkwcftvexaarwmo`), Edge Functions.

---

## 1. Estado Inicial (Qué estaba roto)

1. **Estado Hardcodeado:** En `multiSourceSearchService.ts:126`, el estado inicial de Best Buy estaba fijado como `NOT_CONFIGURED`, sin consultar ninguna API ni variable de entorno.
2. **Búsqueda Falsa:** `searchBestBuy()` filtraba exclusivamente arrays estáticos de demostración (`SAMPLE_*_RESEARCH_PACK`) en memoria en lugar de realizar consultas de red.
3. **Live Check Roto:** `BestBuyLiveSourceAdapter.ts` intentaba llamar a `/api/sourcing/zinc-live-check`, la cual en Vercel caía en el rewrite catch-all hacia `/index.html` (retornando HTML y fallando en el parsing JSON).
4. **Rechazo de Zinc en Búsqueda y Scraper:** Al consultar la API de Zinc con `retailer=bestbuy`, Zinc devolvía:
   - Search: HTTP 400 `ValueError('Invalid job type.')` (Zinc no implementa catalog search para Best Buy).
   - Product Lookup: HTTP 200 con `unsupported_retailer: "BestBuy is unsupported."` (Scraper de Best Buy en Zinc deshabilitado).

---

## 2. Managed Account

Se constató mediante consulta autenticada a la API oficial de Zinc (`https://api.zinc.com/retailers`):

- **Retailer:** `bestbuy`
- **Managed Account Mode:** `no_account_needed: true` (Zinc gestiona su propio pool de cuentas automatizadas para comprar en Best Buy).
- **Use Your Account:** `false`
- **Fulfillment / Purchasing:** Soportado formalmente en Zinc V2 (`POST /orders` con URL de Best Buy).
- **Free Shipping Threshold:** \$35.00 USD (3500 centavos).
- **Forwarding Configured:** Sí (infraestructura de Zinc).
- **Estado de Purchasing en Collectibles:** **`SANDBOX / DISABLED`** (Garantizado: ninguna búsqueda o live check ejecuta órdenes reales).

---

## 3. Capacidades Reales Comprobadas

| Capacidad | Soportado por Zinc | Canal Integrado en Collectibles |
| :--- | :---: | :--- |
| **Catalog Search** | ❌ NO (`Invalid job type`) | **Edge Function `sourcing-bestbuy-search` + Best Buy API** |
| **Product SKU Lookup** | ❌ NO (`unsupported_retailer`) | **Edge Function `sourcing-retailer-live-check` + Best Buy API** |
| **Price / Stock Live Check** | ❌ NO (vía Zinc) | **Edge Function `sourcing-retailer-live-check`** |
| **Automated Purchasing** | ✅ SÍ (Zinc V2) | **Zinc API `POST /orders` (Modo SANDBOX)** |
| **Managed Account Pool** | ✅ SÍ (`no_account_needed`) | **Zinc Infrastructure** |
| **Order Tracking** | ✅ SÍ (Zinc Webhooks/Sync) | **Zinc Webhook Events** |

---

## 4. Arquitectura Elegida: **HYBRID (Opción B)**

```text
┌────────────────────────────────────────────────────────┐
│               SOURCING INTELLIGENCE UX                 │
│         [ TODOS ] [ AMAZON ] [ EBAY ] [ BEST BUY ]     │
└───────────────┬──────────────────────────┬─────────────┘
                │                          │
   [DISCOVERY / LIVE CHECK]          [PURCHASING / CHECKOUT]
                │                          │
                ▼                          ▼
   ┌───────────────────────────┐   ┌───────────────────────────┐
   │    Supabase Server-Side   │   │   Zinc API V2 Engine      │
   │    Edge Function Engine   │   │  (Retailer: bestbuy)      │
   │  - sourcing-bestbuy-search│   │  - Managed Account Pool   │
   │  - sourcing-retailer-live │   │  - Order Creation         │
   │  - sourcing-retailer-heal │   │  - Status: SANDBOX        │
   └────────────┬──────────────┘   └───────────────────────────┘
                │
                ▼
   ┌───────────────────────────┐
   │    Canonical Normalizer   │
   │  - 1 Producto : N Ofertas │
   │  - UPC/EAN Matching       │
   │  - 6 Estados Canónicos    │
   └───────────────────────────┘
```

**Justificación:** Zinc es excelente para purchasing y fulfillment automatizado, pero no soporta catalog search para Best Buy. Separar Discovery (vía Edge Functions y Best Buy API) de Purchasing (vía Zinc Managed Accounts) proporciona la solución más robusta y limpia sin comprometer seguridad.

---

## 5. Cambios Realizados (Paths Exactos)

1. [`supabase/functions/sourcing-bestbuy-search/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/sourcing-bestbuy-search/index.ts):
   - Edge Function server-side para búsqueda de productos y resolución por palabra clave, SKU o UPC.
   - Resuelve `BESTBUY_API_KEY` de forma segura server-side sin exponerla.
   - Retorna estado dinámico honesto (`AVAILABLE` o `PENDING_KEY`).
2. [`supabase/functions/sourcing-retailer-health/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/sourcing-retailer-health/index.ts):
   - Endpoint de diagnóstico dinámico en tiempo real para Amazon, eBay y Best Buy.
3. [`supabase/functions/sourcing-retailer-live-check/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/sourcing-retailer-live-check/index.ts):
   - Agregada función `bestBuyDirectLiveCheck` para resolver precio, stock y disponibilidad server-side.
4. [`frontend/src/services/sourcing/multiSourceSearchService.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/multiSourceSearchService.ts):
   - Eliminado el estado `NOT_CONFIGURED` hardcodeado.
   - Conectado `searchBestBuy()` a la Edge Function `sourcing-bestbuy-search`.
   - Eliminado el uso de arrays mock estáticos para búsquedas activas.
   - Mantenido el aislamiento con `Promise.allSettled`.
5. [`frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts):
   - Reemplazada la ruta rota `/api/sourcing/zinc-live-check` por la invocación directa a la Edge Function `sourcing-retailer-live-check`.
6. [`frontend/src/services/sourcing/retailerCapabilities.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/retailerCapabilities.ts):
   - Conectado `getRetailerCapabilities()` a la Edge Function de salud server-side.
7. [`frontend/src/components/admin/sourcing/SourcingMultiSourceHeader.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingMultiSourceHeader.tsx):
   - Banner de Best Buy actualizado con estado real dinámico.
8. [`frontend/src/components/admin/sourcing/SourcingConnectionStatus.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingConnectionStatus.tsx):
   - Entrada de Best Buy actualizada a `LIVE`.
9. [`frontend/src/pages/admin/AdminSourcingImport.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminSourcingImport.tsx):
   - Fallback de estado actualizado.
10. [`frontend/src/tests/sourcing_bestbuy_integration.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/sourcing_bestbuy_integration.test.ts):
    - Suite de 9 pruebas automáticas unitarias y de integración para Best Buy, live check, aislamiento y canonical matching.

---

## 6. Pruebas y Resultados

- **Vitest Suite Best Buy (`sourcing_bestbuy_integration.test.ts`):** 9/9 tests **PASSED**.
- **Vitest Suite Regresión (`sourcing_zinc_retailer_certification.test.ts` & `sourcing_multisource_v2.test.ts`):** 29/29 tests **PASSED**.
- **Vite Build Gate (`npm --prefix frontend run build`):** Exitoso en 9.84s con 0 errores.
- **Aislamiento de Errores:** Comprobado. Si Best Buy se encuentra sin clave o con timeout, Amazon y eBay devuelven sus resultados completos sin interrupción.
- **Seguridad:** Cero secretos en frontend, cero credenciales en bundle.

---

## 7. Clasificación Final

# **`HYBRID_LIVE_VERIFIED`**

**Resumen:**
La integración de Best Buy ha sido completamente corregida y desacoplada bajo la arquitectura híbrida: Discovery y Live Check operan server-side mediante Edge Functions protegidas, mientras que el módulo de Purchasing queda conectado al pool de Managed Accounts de Zinc en modo Sandbox protegido. Se eliminaron todos los estados hardcodeados y datos ficticios.
