# SOURCING INTELLIGENCE — FASE 8 — AUDITORÍA GENERAL DEL SISTEMA

**Fecha de ejecución:** 2026-09-10  
**Entorno:** Collectibles 2026 (Production Hardening & QA Certification)  
**Versión:** 2.0-PHASE8-AUDIT  

---

## 1. RESUMEN EJECUTIVO DE LA AUDITORÍA

Se ha realizado una auditoría exhaustiva del código fuente, arquitectura, adaptadores de retailers, motores de matching, motor financiero de importación, Autopilot, integración con Zinc, motor de personalización (Collector DNA), observabilidad y base de datos Supabase en el repositorio `Collectibles2026`.

El sistema cuenta con una arquitectura de Sourcing Intelligence altamente avanzada, modular y desacoplada construida a lo largo de las Fases 0–7. Sin embargo, la auditoría identificó fallas puntuales, comportamientos con fallos silenciosos y dependencias de valores por defecto/fallback que deben ser endurecidos antes de declarar la certificación de producción.

---

## 2. MAPEO DE COMPONENTES E INVENTARIO SISTÉMICO

| Componente | Archivo / Ubicación Principal | Estado Actual | Conectado DB/API | Pruebas Unit/E2E | Depende de Mocks/Fallbacks | Riesgo Detectado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Amazon Adapter** | `AmazonSourceAdapter.ts` | IMPLEMENTADO | SÍ (vía Zinc Edge) | SÍ | `Math.random` ASIN fallback, price fallback 24.99 | ALTO (Falso ASIN / Precio) |
| **eBay Adapter** | `EbaySourceAdapter.ts` & `EbayLiveSourceAdapter.ts` | IMPLEMENTADO | SÍ (Zinc API) | SÍ | Fallback price 0 con status LIVE en error API | ALTO (Precio 0 en UI) |
| **Best Buy Adapter** | `BestBuySourceAdapter.ts` & `BestBuyLiveSourceAdapter.ts` | IMPLEMENTADO | SÍ (Zinc API) | SÍ | Fallback price 0 con status LIVE en error API | ALTO (Precio 0 en UI) |
| **Normalization** | `ProductNormalizationService.ts` | IMPLEMENTADO | SÍ | SÍ | Ninguno (Algoritmo determinístico) | NINGUNO |
| **Matching Engine** | `ProductMatchingEngine.ts` | IMPLEMENTADO | SÍ | SÍ | Jerarquía Nivel 1-4 + Variant Protection | BAJO |
| **Price Service** | `ProductPriceService.ts` | IMPLEMENTADO | SÍ | SÍ | Separación NEW vs USED estricta | NINGUNO |
| **Seller Trust** | `SellerTrustService.ts` | IMPLEMENTADO | SÍ | SÍ | Scored 0-100 por rating, reviews, official direct | NINGUNO |
| **Import Engine** | `internationalPricing.ts` | IMPLEMENTADO | SÍ | SÍ | Canonical Dynamic Pricing + Profit Protection | NINGUNO |
| **Uruguay Market** | `uruguayMarketIntelligence.ts` & Edge Function | IMPLEMENTADO | SÍ (MLU API) | SÍ | Syntax bug en Edge Function (sin comillas/string template) | CRÍTICO (Fallo Edge Function) |
| **Best Source Selector**| `bestSourceSelector.ts` | IMPLEMENTADO | SÍ | SÍ | Landed Cost Ranking + Condition Split | NINGUNO |
| **Sourcing Service** | `sourcingService.ts` | IMPLEMENTADO | SÍ | SÍ | `importProductsToCatalog` ignora error DB y simula éxito | CRÍTICO (Falso Éxito Importación) |
| **Autopilot Policy** | `autopilot/policyEngine.ts` | IMPLEMENTADO | SÍ | SÍ | Authenticity Gate + Margin + Opportunity Score | NINGUNO |
| **Autopilot Execution** | `autopilot/executionEngine.ts` | IMPLEMENTADO | SÍ | SÍ | Dry Run, Shadow Mode, Auto-Publish, Queue | NINGUNO |
| **Autopilot Purchasing**| `autopilot/purchasingEngine.ts` | IMPLEMENTADO | SÍ | SÍ | Generaba ID de orden Zinc falso sin confirmación real | ALTO (Falsa Orden Compra) |
| **Circuit Breaker** | `autopilot/circuitBreaker.ts` | IMPLEMENTADO | SÍ | SÍ | 3 errores compra / 5 errores retailer -> Trip | NINGUNO |
| **Personalization Engine**| `personalizationEngine.ts` | IMPLEMENTADO | SÍ | SÍ | Cold-start fallback determinístico | NINGUNO |
| **Dynamic Merchandising**| `DynamicMerchandisingService.ts` | IMPLEMENTADO | SÍ | SÍ | Filtra agotados real-time | NINGUNO |
| **AI Search Engine** | `aiSearchService.ts` & Edge Function | IMPLEMENTADO | SÍ | SÍ | Funciona con OPENAI=OFF (fallback a reglas/DB) | NINGUNO |
| **Zinc Live Check** | `zinc-live-check/index.ts` & `sourcing-retailer-live-check` | IMPLEMENTADO | SÍ (Zinc API) | SÍ | API key resolution fallback producción/sandbox | BAJO |

---

## 3. HALLAZGOS Y VULNERABILIDADES DETECTADAS

### 3.1. Riesgos Críticos de Éxitos Falsos o Fallos Silenciosos (CRITICAL)

1. **`sourcingService.ts` — Importación Falsa en Error de BD:**
   En `importProductsToCatalog`, si Supabase devuelve un error en la inserción (ej. restricción RLS o SKU duplicado), el sistema ejecuta `console.warn('Error inserting to DB (fallback simulated for demo)...')` e incrementa `importedCount++` reportando éxito al usuario en lugar de bloquear el conteo y registrar el error.

2. **`sourcing-market-intelligence/index.ts` — Bug de Sintaxis en Edge Function:**
   Línea 81 y 83 de la Edge Function contienen errores de interpolación de variables sin comillas o backticks en TypeScript (`const queryPrimary = gtin || upc || mpn || ${brand} .trim() || title;`), lo que provoca fallos en tiempo de ejecución al consultar Mercado Libre Uruguay en vivo.

3. **`purchasingEngine.ts` — Falsa Confirmación de Compra Zinc:**
   En `executePurchaseOrder`, cuando se habilita la compra, se generaba un ID sintético `ZINC_TIMESTAMP_RANDOM` y se retornaba `success: true` sin haber recibido la confirmación webhook/HTTP sincrónica real del servidor de Zinc API.

### 3.2. Dependencia de Mocks / Fallbacks Comerciales (HIGH)

1. **`EbayLiveSourceAdapter.ts` & `BestBuyLiveSourceAdapter.ts` — Fallback Status LIVE con Precio 0:**
   Cuando la llamada API del retailer falla o no responde, `createFallbackItem` devolvía `price: 0`, `status: 'LIVE'`, lo que podía distorsionar comparativas de precios o mostrar ofertas sin precio como disponibles en tiempo real.

2. **`AmazonSourceAdapter.ts` — Generación de ASIN sintético y Precio 24.99:**
   Si la URL no contenía un ASIN válido, el adaptador generaba `AMZ-Math.random()` y asignaba un precio por defecto `$24.99`. Debe lanzar error o asignar estado `UNMATCHED` / `INVALID_URL`.

3. **`seo-prerender.js` — ReferenceError `fullPath` en Suite de Prerender:**
   Durante la ejecución del test runner se detectó `ReferenceError: fullPath is not defined` en `api/seo-prerender.js:1089`.

---

## 4. MATRIZ DE COMPONENTES OPERATIVOS

| Componente / Sub-sistema | Estado Verificado | Criterio de Aprobación |
| :--- | :--- | :--- |
| **Retailer Live Adapters** | `OPERATIVO CON ADVERTENCIA` | Requiere eliminar fallbacks de precio $0 / status LIVE falso. |
| **Matching & Protection Engine** | `OPERATIVO` | Pasa 100% de tests de protección de variantes y matching jerárquico. |
| **Import & Pricing Engine** | `OPERATIVO` | Fórmulas exactas para Franquicia $200 UY y Régimen 60% + Profit Protection. |
| **Autopilot & Guardrails** | `OPERATIVO` | Circuit breaker, policy evaluation y límites financieros operan estrictamente. |
| **Uruguay Market Intelligence** | `ERROR (CORRECCIÓN EN PROCESO)` | Requiere fix de sintaxis en Edge Function. |
| **Zinc Real Integration** | `NO CONFIGURADO (HONESTO)` | Retorna `NOT_CONFIGURED` en ausencia de token real sin simular órdenes. |
| **Personalization & Merchandising** | `OPERATIVO` | Maneja cold-start y señales de Collector DNA sin inventar interacciones. |
| **AI Search & OpenAI OFF Mode** | `OPERATIVO` | Opera transparentemente con fallback estructurado a DB cuando `OPENAI=OFF`. |

---

## 5. PLAN DE ACCIÓN FASE 8

1. **Corregir bugs de sintaxis y fallos silenciosos:**
   - Reparar `supabase/functions/sourcing-market-intelligence/index.ts`.
   - Reparar `sourcingService.ts` para que reporte errores reales de BD sin simular importación.
   - Reparar `purchasingEngine.ts` para requerir respuesta real de Zinc o retornar `NO CONFIGURADO` / `PENDIENTE_CREDENCIALES`.
   - Reparar `createFallbackItem` en adapters para marcar `status: 'ERROR'` o `'NO_VERIFICADO'` en lugar de `'LIVE'` con precio $0.
   - Reparar `fullPath` en `api/seo-prerender.js`.

2. **Generar matrices y reportes oficiales:**
   - `docs/sourcing/phase-8-e2e-matrix.md`
   - `docs/sourcing/phase-8-failure-matrix.md`
   - `docs/sourcing/phase-8-production-readiness.md`

3. **Ejecutar Suite E2E / Build Gate / Despliegue:**
   - Ejecutar `npm run build` en `frontend`.
   - Ejecutar suite de pruebas unitarias e integración.
   - Desplegar a producción vía `collectibles-production-deploy` (git push a main) y verificar `https://collectibles.uy`.
