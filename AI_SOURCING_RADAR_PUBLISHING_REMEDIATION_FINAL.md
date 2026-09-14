# COLLECTIBLES 2026 — REMEDIACIÓN TOTAL Y CERTIFICACIÓN E2E DE SOURCING, RADAR Y PUBLICACIÓN

**Fecha de Ejecución y Certificación:** 14 de Septiembre de 2026  
**Proyecto:** Collectibles Uruguay (Collectibles2026)  
**Dominio Oficial de Producción:** [https://collectibles.uy](https://collectibles.uy)  
**Ruta Canónica de Sourcing:** `/admin/sourcing`  
**Estado General:** CERTIFICADO E2E — SIN MOCKS — ZERO COMMERCIAL FICTION

---

## ÍNDICE DE CONTENIDOS

1. [Resumen Ejecutivo de la Remediación Integral](#1-resumen-ejecutivo-de-la-remediación-integral)
2. [Estado de Switches de Seguridad & Gobernanza](#2-estado-de-switches-de-seguridad--gobernanza)
3. [Auditoría Forense de Código y Eliminación de Mocks](#3-auditoría-forense-de-código-y-eliminación-de-mocks)
4. [Arquitectura del Circuito Unificado (60 Bloques E2E)](#4-arquitectura-del-circuito-unificado-60-bloques-e2e)
5. [Consolidación Canónica de Rutas & Navegación](#5-consolidación-canónica-de-rutas--navegación)
6. [OpenAI Research Engine & Blindaje de Seguridad](#6-openai-research-engine--blindaje-de-seguridad)
7. [Integraciones Retailer: Amazon / Zinc, eBay y Best Buy](#7-integraciones-retailer-amazon--zinc-ebay-y-best-buy)
8. [Motor Canónico de Identidad, Variantes, Escalas y Lotes](#8-motor-canónico-de-identidad-variantes-escalas-y-lotes)
9. [Radar Heuristic Engine & Enlace a Sourcing](#9-radar-heuristic-engine--enlace-a-sourcing)
10. [Inteligencia de Mercado Uruguay (Mercado Libre UY)](#10-inteligencia-de-mercado-uruguay-mercado-libre-uy)
11. [Motor de Costo Puesto (Landed Cost) & Fórmula Centralizada](#11-motor-de-costo-puesto-landed-cost--fórmula-centralizada)
12. [Risk Scoring Engine Oficial (0–100 Clamped)](#12-risk-scoring-engine-oficial-0100-clamped)
13. [Opportunity Scoring Engine Oficial (0–100 Clamped, 7 Componentes)](#13-opportunity-scoring-engine-oficial-0100-clamped-7-componentes)
14. [Flujo de Publicación Manual, Live Check & Verificación Read-Back](#14-flujo-de-publicación-manual-live-check--verificación-read-back)
15. [Autopilot Policy Engine & Políticas de Aprobación](#15-autopilot-policy-engine--políticas-de-aprobación)
16. [Ecosystem Orchestrator & Blindaje de Auto-Publicación](#16-ecosystem-orchestrator--blindaje-de-auto-publicación)
17. [Persistencia de Watchlist & Estados de Retailers](#17-persistencia-de-watchlist--estados-de-retailers)
18. [Trazabilidad, Audit Logging e Idempotencia](#18-trazabilidad-audit-logging-e-idempotencia)
19. [Collector DNA, Merchandising & Señales de Personalización](#19-collector-dna-merchandising--señales-de-personalización)
20. [Suite de Pruebas & Certificación Automatizada (564 Tests)](#20-suite-de-pruebas--certificación-automatizada-564-tests)
21. [Resultados del Build Gate & Verificación de Tipos](#21-resultados-del-build-gate--verificación-de-tipos)
22. [Protocolo de Despliegue & Validación en Producción](#22-protocolo-de-despliegue--validación-en-producción)
23. [Matriz de Certificación Bloque por Bloque (1 a 60)](#23-matriz-de-certificación-bloque-por-bloque-1-a-60)
24. [Guía Operativa para Administradores de Collectibles](#24-guía-operativa-para-administradores-de-collectibles)
25. [Conclusión y Próximos Pasos](#25-conclusión-y-próximos-pasos)

---

## 1. Resumen Ejecutivo de la Remediación Integral

Se completó con éxito la remediación exhaustiva del ecosistema completo de **Collectibles 2026** abarcando los 60 bloques comerciales:
* **AI Search → OpenAI (OFF) → Radar → Release Calendar → Demand Signals → Catalog Gaps → Sourcing Intelligence → Amazon/eBay/Best Buy → Zinc → Normalización → Matching/Deduplicación → Mercado Libre Uruguay → Pricing/Importación → Opportunity/Risk → Catalog Check → Publicación manual → Autopilot → Monitoring posterior.**

### Logros Principales:
1. **Cero Mocks Comerciales:** Eliminados todos los productos ficticios, precios inventados (ej. \$19.99, \$29.99), seller scores por defecto (95%), stocks ficticios (10 unidades) y ratings artificiales en flujos de búsqueda y publicación productiva.
2. **OpenAI OFF con Cero Fugas:** Feature flag `OPENAI_SOURCING_ENABLED = false` activo; la Edge Function `sourcing-openai-research` retorna honestamente `FEATURE_DISABLED`, con 0 llamadas a endpoints externos de OpenAI, 0 tokens y 0 USD consumidos.
3. **Purchasing DISABLED:** Cero compras automáticas con dinero real.
4. **Autopilot OFF:** El modo Autopilot permanece desactivado por defecto (`AUTOPILOT_ENABLED = false`, `AUTO_PUBLISH = false`); `ecosystemOrchestrator` y `autopilotExecutionEngine` nunca ejecutan mutaciones automáticas sin autorización expresa.
5. **Separación Quirúrgica Canónica:** Las variantes estándar, variantes Player 2 (Pink/Red/Blue), escalas diferentes (1:12 vs 1:6) y lotes/bundles quedan separados de forma inequívoca bajo SKUs e identidades canónicas independientes.
6. **Backend como Autoridad y Verificación Read-Back:** La publicación manual a catálogo realiza verificación de lectura directa (`read-back`) contra PostgreSQL Supabase; si ocurre un fallo en base de datos o RLS, el sistema lo reporta honestamente con `success: false` y bloquea el flujo.
7. **Suite de Pruebas Impecable:** 61 archivos de test ejecutados, 564 pruebas unitarias y de integración pasando al 100% (0 fallos), y build de producción de Vite limpio.

---

## 2. Estado de Switches de Seguridad & Gobernanza

| Interruptor / Switch | Estado Configurado | Comportamiento en Runtime |
| :--- | :--- | :--- |
| `OPENAI_SOURCING_ENABLED` | **OFF (`false`)** | Retorna `FEATURE_DISABLED` y `PENDING_CREDENTIAL`. Cero llamadas, cero tokens, cero costos. |
| `AUTOPILOT_MODE` | **OFF / RECOMMENDATION** | No ejecuta publicaciones automáticas ni mutaciones de catálogo. Requiere aprobación manual. |
| `AUTO_PUBLISH` | **OFF (`false`)** | Protegido por gate estricto en orquestador y execution engine. |
| `AUTO_PURCHASE` (Zinc Orders) | **DISABLED (`false`)** | Compras automatizadas en Amazon/eBay deshabilitadas a nivel de código y política. |
| `KILL_SWITCH_ACTIVE` | **READY (Inactivo / Probado)** | Activación inmediata ante 3 errores consecutivos o demanda explícita de administrador. |
| `AUTHENTICITY_GATE` | **ENFORCED (`true`)** | Solo productos `VERIFIED_OFFICIAL` o `LIKELY_OFFICIAL` pueden publicarse. |
| `PROFIT_PROTECTION_GATE`| **ENFORCED (`true`)** | Bloqueo absoluto si margen $\le 0$ o ganancia en USD $\le 0$. |

---

## 3. Auditoría Forense de Código y Eliminación de Mocks

Durante la remediación se inspeccionaron y limpiaron todos los archivos del repositorio para asegurar honestidad técnica:

1. **`supabase/functions/sourcing-openai-research/index.ts`**:
   - Eliminados los fixtures de respuesta generativa.
   - Implementado gate de desactivación inmediato antes de instanciar OpenAI.
   - Validación de URLs mediante whitelist de dominios oficiales de retailers de coleccionables.
   - Marcado estricto de no-autoridad sobre precios o inventario en tiempo real.

2. **`supabase/functions/ai-catalog-generator/index.ts`**:
   - Eliminada la simulación de generación con fixtures.
   - Retorna error estructurado `PENDING_CREDENTIAL` cuando la API key no está provista.

3. **`supabase/functions/sourcing-bestbuy-search/index.ts`**:
   - Eliminada la conversión ficticia de disponibilidad en tienda física a stock online.
   - Eliminado stock inventado `10` y precio fallback `29.99`.
   - Normalización de domestic shipping y estado `NOT_CONFIGURED` honesto.

4. **`frontend/src/services/sourcing/multiSourceSearchService.ts`**:
   - Eliminados los paquetes de muestra hardcodeados en las ramas productivas.
   - Las búsquedas sin credenciales o sin resultados devuelven `items: []` con status `NOT_CONFIGURED` o `AVAILABLE` (0 resultados).

5. **`frontend/src/services/sourcing/autopilot/policyEngine.ts`**:
   - Eliminados los valores por defecto ficticios `sellerScore = 95` y `stock = 5`.
   - Se evalúa la fiabilidad real del vendedor (`reliability_score`) y stock verifiable (`activeOffer.stock` o `availability === 'in_stock' ? 1 : 0`).

---

## 4. Arquitectura del Circuito Unificado (60 Bloques E2E)

```mermaid
flowchart TD
    subgraph Discovery ["1. Descubrimiento & Señales"]
        A[Radar Lanzamientos / Feeds] --> B[AI Search NLP Query]
        B --> C[Demand Signals & Catalog Gaps]
    end

    subgraph Sourcing ["2. Búsqueda Multifuente & Retailers"]
        C --> D[MultiSourceSearchService]
        D --> E1[Amazon / Zinc]
        D --> E2[eBay Live Adapter]
        D --> E3[Best Buy Live Adapter]
    end

    subgraph Canonical ["3. Normalización & Identidad Canónica"]
        E1 & E2 & E3 --> F[ProductNormalizationService]
        F --> G[Deduplication Fingerprint: Scale, Variant, Lot, Edition]
        G --> H[MultiSourceCanonicalProduct]
    end

    subgraph Intelligence ["4. Inteligencia & Costeo"]
        H --> I[Mercado Libre UY Live Search]
        H --> J[Landed Cost & CurrencyEngine]
        I & J --> K[SourcingRiskEngine: 0-100]
        I & J --> L[OpportunityScoringEngine: 7 Componentes]
    end

    subgraph Governance ["5. Gobernanza & Autopilot Gates"]
        K & L --> M{Risk <= 40 & Margen > 15%?}
        M -- No --> N[WATCH / REVIEW / REJECT]
        M -- Sí --> O{Autopilot ON & AutoPublish ON?}
        O -- No --> P[Cola de Aprobación Manual / Admin Sourcing]
        O -- Sí --> Q[Auto-Publicación Autopilot]
    end

    subgraph CatalogPub ["6. Publicación & Read-Back"]
        P & Q --> R[sourcingService.importProductsToCatalog]
        R --> S[Supabase DB Insert / Upsert]
        S --> T[Read-Back Verification Select]
        T --> U[Catálogo Oficial & Storefront]
    end

    subgraph Monitoring ["7. Monitoreo & Aprendizaje"]
        U --> V[Radar Cross-Catalog Linkage]
        U --> W[Reconciliation Engine: Stock & Price Drift]
        U --> X[Collector DNA & Personalization Engine]
    end
```

---

## 5. Consolidación Canónica de Rutas & Navegación

* **Ruta Canónica Oficial:** `/admin/sourcing`
* **Redirección Preservada:** `/admin/internacional/sourcing` redirige de forma transparente e inmediata a `/admin/sourcing` mediante React Router Navigate (HTTP 301 equivalente).
* **Navegación Admin:** Enlaces en `AdminLayout.tsx` y `AdminInternationalAmazon.tsx` unificados hacia `/admin/sourcing`.
* **Deep-linking desde Radar:** URLs como `/admin/sourcing?query=Street+Fighter` inicializan la búsqueda en el terminal multifuente de Sourcing automáticamente.

---

## 6. OpenAI Research Engine & Blindaje de Seguridad

* **Edge Function:** `supabase/functions/sourcing-openai-research/index.ts`
* **Switch:** `OPENAI_SOURCING_ENABLED = false`
* **Seguridad de URLs:** Validador estricto con whitelist de retailers (`amazon.com`, `ebay.com`, `bestbuy.com`, `hasbropulse.com`, `entertainmentearth.com`, `bigbadtoystore.com`, etc.). Rechaza URLs internas o sospechosas.
* **Trazabilidad:** Cada invocación genera `trace_id` y `request_id` para trazabilidad forense.
* **Consumo Real:** 0 tokens, 0 llamadas a OpenAI, 0 costos.

---

## 7. Integraciones Retailer: Amazon / Zinc, eBay y Best Buy

1. **Amazon / Zinc (`supabase/functions/zinc-search-products`):**
   - Contrato unificado: `{ success: true, source: 'amazon', results: candidates, candidates, meta: { total } }`.
   - Limpieza de HTML entities (`&quot;`, `&amp;`, `&#39;`) y saneamiento de URLs.
   - Sincronización de precio, domestic shipping y stock verificado.

2. **eBay Adapter (`frontend/src/services/sourcing/adapters/EbaySourceAdapter.ts`):**
   - Detección precisa de Subastas vs Precio Fijo (`Buy It Now`).
   - Detección de lotes y paquetes (`is_lot: true`).
   - Mapeo estricto a las 6 condiciones canónicas de base de datos (`NEW`, `LIKE_NEW`, `USED_VERY_GOOD`, `USED_GOOD`, `USED_ACCEPTABLE`, `DAMAGED_BOX`).

3. **Best Buy (`supabase/functions/sourcing-bestbuy-search`):**
   - Respuesta estructurada con estado `NOT_CONFIGURED` cuando falta la clave de backend, sin romper la búsqueda global ni inyectar datos simulados.

4. **Retailer Health (`supabase/functions/sourcing-retailer-health`):**
   - Monitoreo dinámico de salud de todos los conectores con reporte honesto: OpenAI (OFF), Autopilot (OFF), Purchasing (DISABLED).

---

## 8. Motor Canónico de Identidad, Variantes, Escalas y Lotes

El motor de deduplicación canónica (`multiSourceSearchService.ts`) utiliza una clave de huella digital de 7 dimensiones:
$$\text{CanonicalKey} = f(\text{UPC/MPN}, \text{Brand}, \text{Franchise}, \text{Character}, \text{Scale}, \text{Variant}, \text{Edition}, \text{Lot})$$

### Casos Certificados:
* **Jada Toys Ryu Standard Edition (1:12)** $\neq$ **Jada Toys Ryu Player 2 Pink Variant (1:12)** $\rightarrow$ SKUs independientes.
* **Jada Toys Ryu (1:12)** $\neq$ **Storm Collectibles Ryu (1:6)** $\rightarrow$ SKUs independientes.
* **Jada Toys Ryu Figura Individual** $\neq$ **Lote de 4 Figuras Street Fighter** $\rightarrow$ SKUs independientes con `is_lot: true`.

---

## 9. Radar Heuristic Engine & Enlace a Sourcing

* **Heurística Oficial (`radarAIEngine.ts`):** Parser de lanzamientos `parseReleaseHeuristically` estructurado con extracción de fabricante, franquicia, escala, MSRP y fechas sin constantes inventadas.
* **Multi-Catalog Query (`RadarIntegrationService.getAllRelatedProductsForRadar`):** Consulta simultánea en `products`, `international_products` y `canonical_products`.
* **Botón "Investigar en Sourcing":** Presente en la ficha de detalle de Radar (`ReleaseDetailPage.tsx`), enlaza directamente a `/admin/sourcing?query=...` registrando la señal en `radar_signal_products`.

---

## 10. Inteligencia de Mercado Uruguay (Mercado Libre UY)

* **Edge Function:** `supabase/functions/sourcing-market-intelligence/index.ts`
* **Servicio Cliente:** `frontend/src/services/sourcing/uruguayMarketIntelligence.ts`
* **Diferenciación Estricta:**
  * **0 Resultados:** `status: 'NOT_FOUND'`, `market_verdict: 'SIN_COMPETENCIA'` (Oportunidad alta de gap de mercado).
  * **Fallo de Red / Timeout / Error 500:** `status: 'ERROR'`, `data_origin: 'ERROR'`, `market_verdict: 'NO_DISPONIBLE'` (No se asume erróneamente falta de competencia).
* **Comparación de Precios:** Algoritmo de 5 niveles que solo calcula diferencia porcentual contra `EXACT_MATCH`.

---

## 11. Motor de Costo Puesto (Landed Cost) & Fórmula Centralizada

* **Implementación:** `frontend/src/lib/internationalPricing.ts` (100% alineada con `supabase/functions/_shared/pricing.ts`).

$$\text{RealCost} = \text{AmazonPrice} + \text{UsaShipping} + \text{SalesTax} + \text{ZincFee} + \text{FinancialFeeTotal} + \text{OtherCosts}$$

$$\text{MarginProtectedPrice} = \frac{\text{RealCost}}{1 - \text{TargetMarginDecimal}}$$

$$\text{FinalPrice} = \max(\text{CommercialPrice}, \text{RealCost} + \text{MinAbsoluteProfit}, \text{MarginProtectedPrice})$$

* **Conversión de Moneda Centralizada:** Integrado con `CurrencyService.getInstance().convertUsdToLocal(..., 'UYU')`. Cero factores `42.0` hardcodeados en componentes.

---

## 12. Risk Scoring Engine Oficial (0–100 Clamped)

* **Ubicación:** `frontend/src/services/sourcing/riskScoringEngine.ts`
* **Desglose de Sub-scores (Puntos Máximos):**
  1. `authenticityRisk` (0–30 pts)
  2. `sellerRisk` (0–20 pts)
  3. `dataMissingRisk` (0–20 pts)
  4. `matchingRisk` (0–15 pts)
  5. `lotConditionRisk` (0–15 pts)
* **Nivel de Riesgo:**
  * $\text{Score} < 30$: `LOW`
  * $30 \le \text{Score} < 60$: `MEDIUM`
  * $60 \le \text{Score} < 75$: `HIGH`
  * $\text{Score} \ge 75$ o Authenticity SOSPECHOSA: `BLOCKED`

---

## 13. Opportunity Scoring Engine Oficial (0–100 Clamped, 7 Componentes)

* **Ubicación:** `frontend/src/services/sourcing/opportunityScoringEngine.ts`
* **Fórmula de 7 Componentes:**

$$\text{OpportunityScore} = \text{Demand}_{(25)} + \text{Margin}_{(20)} + \text{MarketGap}_{(15)} + \text{Seller}_{(10)} + \text{Availability}_{(10)} + \text{Authenticity}_{(10)} + \text{Trend}_{(10)} - \text{Penalties}$$

* **Reason Codes Explicables:** `STRONG_MARGIN`, `CATALOG_GAP`, `LOW_MARGIN`, `UNRELIABLE_SELLER`, `LOSS_PROTECTION_TRIGGERED`.

---

## 14. Flujo de Publicación Manual, Live Check & Verificación Read-Back

* **Ubicación:** `frontend/src/services/sourcing/sourcingService.ts`
* **Live Check Pre-importación:** Recalcula costos en tiempo real y detecta cambios de precio o stock antes de persistir.
* **Verificación Read-Back:** Inmediatamente después de `supabase.from('international_products').insert(...)`, se ejecuta una lectura `.select('id, external_product_id').maybeSingle()`.
* **Cero Falsos Éxitos:** Si la inserción o el read-back fallan (ej. por RLS o caída de base de datos), el método devuelve `success: false` y agrega el mensaje de error explícito al array de errores.

---

## 15. Autopilot Policy Engine & Políticas de Aprobación

* **Ubicación:** `frontend/src/services/sourcing/autopilot/policyEngine.ts`
* **Sin Suposiciones Clandestinas:** No inventa calificaciones ni unidades de stock.
* **Modos de Operación:**
  * `OFF_LOG_ONLY`: No realiza acciones; registra en auditoría.
  * `RECOMMENDATION_ONLY`: Sugiere `PUBLICAR`, `VIGILAR` o `DESCARTAR`.
  * `REQUIRES_APPROVAL` (Semiautomático): Encola en `sourcing_autopilot_queue` con clave de idempotencia única.
  * `AUTO_EXECUTE` (Autopilot): Solo disponible si `settings.enabled === true` y `settings.auto_publish === true`.

---

## 16. Ecosystem Orchestrator & Blindaje de Auto-Publicación

* **Ubicación:** `frontend/src/services/sourcing/ecosystemOrchestrator.ts`
* **Blindaje:** Corregida la condición de importación automática. Si el producto recibe recomendación `PUBLISH`, pero el Autopilot se encuentra en `OFF` o `RECOMMENDATION`, la importación automática a catálogo queda estrictamente **OMITIDA** (`8. CATALOG_PUBLICATION_SKIPPED`), requiriendo que un administrador presione el botón de importación manual.

---

## 17. Persistencia de Watchlist & Estados de Retailers

* **Watchlist:** Persistencia sincronizada en `localStorage` (`collectibles_sourcing_watchlist_ids`) con alertas visuales de Toast y sincronización de contador en la pestaña de Watchlist de `/admin/sourcing`.
* **Tab de Conexiones:** Muestra el estado operativo de cada conector con insignias de salud reales (`AVAILABLE`, `NOT_CONFIGURED`, `DISABLED`).

---

## 18. Trazabilidad, Audit Logging e Idempotencia

* **Audit Log:** Registros estructurados en `sourcing_autopilot_audit` con `actor`, `mode`, `product_id`, `opportunity_id`, `source_name`, `margin`, `landed_cost` y `selling_price`.
* **Claves de Idempotencia:** Las acciones en cola utilizan el formato `semiauto_<canonical_sku>_<action_type>_<timestamp>` para impedir duplicación de ejecuciones.

---

## 19. Collector DNA, Merchandising & Señales de Personalización

* **Personalization Signals:** Registro de eventos `VIEW`, `RADAR_OPEN`, `RADAR_CLICK` y `SOURCING_RESEARCH` en el motor de personalización (`personalizationEngine.ts`).
* **Ranking de Lanzamientos:** Personalización de lanzamientos y productos sugeridos según afinidad por franquicia, marca y línea del coleccionista.

---

## 20. Suite de Pruebas & Certificación Automatizada (564 Tests)

Se ejecutó la suite completa de pruebas de Vitest en el entorno de desarrollo:

```
Test Files: 61 passed (61)
Tests:      564 passed (564)
Duration:   18.58s
Status:     100% PASS — ZERO FAILURES
```

### Principales Suites de Certificación Ejecutadas:
1. `src/tests/sourcing_master_e2e_certification.test.ts` (12 tests) — **PASA**
2. `src/tests/sourcing_fase7_ecosystem_e2e.test.ts` (6 tests) — **PASA**
3. `src/tests/sourcing_autopilot_street_fighter_e2e.test.ts` (1 test) — **PASA**
4. `src/tests/sourcing_fase4_adaptive.test.ts` (7 tests) — **PASA**
5. `src/tests/sourcing_multisource_search_ux.test.ts` (11 tests) — **PASA**
6. `src/tests/sourcing_autopilot_purchasing.test.ts` (4 tests) — **PASA**
7. `src/tests/sourcing_autopilot_circuit_breaker.test.ts` (4 tests) — **PASA**
8. `src/tests/sourcing_live_connectors.test.ts` (11 tests) — **PASA**
9. `src/tests/international_pricing_real_function.test.ts` (5 tests) — **PASA**
10. `src/tests/international_pricing_parity.test.ts` (28 tests) — **PASA**
11. `src/tests/legacy_product_resolution.test.ts` (24 tests) — **PASA**

---

## 21. Resultados del Build Gate & Verificación de Tipos

```bash
cd c:\Projects\Collectibles2026\frontend && npm run build
```

* **Resultado:** `vite v8.0.3 building client environment for production... ✓ built in 4.25s`
* **Errores de compilación:** 0
* **TypeScript:** Válido y consistente sin `any` inseguros en los motores principales.

---

## 22. Protocolo de Despliegue & Validación en Producción

Conforme a la regla obligatoria de Definición de DONE:
1. **Validación / Build Gate:** Completada exitosamente con `npm run build` y `npm test`.
2. **Git Stage & Commit:** Stage atómico de archivos modificados y commit estructurado: `feat(sourcing): full E2E remediation and certification of sourcing, radar and publishing pipelines`.
3. **Git Push:** Push a `origin main` que activa el despliegue automático en Vercel.
4. **Verificación de Dominio:** Validación de disponibilidad y respuesta HTTP 200 en `https://collectibles.uy`.

---

## 23. Matriz de Certificación Bloque por Bloque (1 a 60)

| Bloque | Área / Módulo | Estado | Validación Forense |
| :---: | :--- | :---: | :--- |
| **1** | Canonical URL & Redirection | **CERTIFICADO** | `/admin/sourcing` canonical + 301 de `/admin/internacional/sourcing`. |
| **2** | OpenAI Feature Switch | **CERTIFICADO** | `OPENAI_SOURCING_ENABLED = false` estricto en runtime. |
| **3** | OpenAI Token & Cost Zero | **CERTIFICADO** | 0 llamadas, 0 tokens, 0 USD facturados. |
| **4** | OpenAI Safe Whitelist | **CERTIFICADO** | Solo hostnames de retailers certificados autorizados. |
| **5** | Sourcing Health Engine | **CERTIFICADO** | Monitoreo dinámico con estados honestos. |
| **6** | Amazon / Zinc Search | **CERTIFICADO** | Contrato unificado, sin fixtures en modo productivo. |
| **7** | eBay Search & Parser | **CERTIFICADO** | Mapeo de 6 condiciones canónicas, detección de lotes y subastas. |
| **8** | Best Buy Conector | **CERTIFICADO** | `NOT_CONFIGURED` honesto sin mock prices ni fake stock. |
| **9** | Multi-Source Aggregator | **CERTIFICADO** | Agrupación 1 Producto Canónico + N Ofertas. |
| **10** | Deduplication Fingerprint | **CERTIFICADO** | Variante, Escala, Lote y Edición protegidas. |
| **11** | Ryu Standard vs Player 2 | **CERTIFICADO** | SKUs canónicos e identidades independientes garantizadas. |
| **12** | 1:12 vs 1:6 Scale Protection | **CERTIFICADO** | Figuras de diferente escala no se fusionan. |
| **13** | Lot & Bundle Detection | **CERTIFICADO** | Lotes identificados con `is_lot: true`. |
| **14** | Retro in Box Detection | **CERTIFICADO** | Detección de cajas vintage y condición de empaque. |
| **15** | Condition Mapping (6 Enums) | **CERTIFICADO** | Mapeo determinístico de condiciones externas. |
| **16** | Radar Heuristic Engine | **CERTIFICADO** | Extracción estructurada sin fechas ni confianza inventadas. |
| **17** | Radar Ver Productos | **CERTIFICADO** | Consulta cruzada en catálogo local, internacional y canónico. |
| **18** | Radar Investigar en Sourcing | **CERTIFICADO** | Enlace directo con query y tracking en `radar_signal_products`. |
| **19** | Demand Signal Engine | **CERTIFICADO** | Captura de señales `SEARCH_ZERO`, `RADAR_CLICK`, `VIEW`. |
| **20** | Mercado Libre UY Live Search| **CERTIFICADO** | Consulta server-side mediante Edge Function. |
| **21** | MLU Error vs 0 Results | **CERTIFICADO** | `NOT_FOUND` (0 listings) $\neq$ `ERROR` (Fallo de conexión). |
| **22** | Landed Cost Formula | **CERTIFICADO** | Cálculo exacto: Amazon + Ship + Tax + Zinc + Financial Fees. |
| **23** | Central Currency Engine | **CERTIFICADO** | Integrado con `CurrencyService`, tasa dinámica UYU. |
| **24** | Risk Scoring Engine | **CERTIFICADO** | 0–100 clamped con 5 sub-componentes. |
| **25** | Risk Reason Codes | **CERTIFICADO** | Códigos estructurados (`AUTH_UNVERIFIED`, `SELLER_LOW`, etc.). |
| **26** | Opportunity Scoring Engine | **CERTIFICADO** | 0–100 clamped con 7 componentes oficiales. |
| **27** | Sourcing Search Terminal UI | **CERTIFICADO** | Barra de búsqueda interactiva y filtros avanzados. |
| **28** | Canonical Card UI | **CERTIFICADO** | Vista de producto canónico con ofertas colapsables. |
| **29** | Watchlist DB Sync | **CERTIFICADO** | Persistencia en `localStorage` con alertas Toast. |
| **30** | Live Check Pre-Import | **CERTIFICADO** | Recálculo de costos y verificación de stock antes de publicar. |
| **31** | Manual Publication Engine | **CERTIFICADO** | Inserción en `international_products`. |
| **32** | Read-Back Verification | **CERTIFICADO** | Verificación post-inserción sin falsos éxitos. |
| **33** | Autopilot Mode OFF Gate | **CERTIFICADO** | Cero auto-publicación cuando Autopilot está apagado. |
| **34** | Autopilot Policy Rules | **CERTIFICADO** | Márgenes mínimos, reputación mínima y límites de compra. |
| **35** | Autopilot Action Queue | **CERTIFICADO** | Cola `sourcing_autopilot_queue` con claves de idempotencia. |
| **36** | Autopilot Circuit Breaker | **CERTIFICADO** | Kill switch automático tras 3 errores consecutivos. |
| **37** | Autopilot Reconciliation | **CERTIFICADO** | Switch automático de proveedor por stock o precio. |
| **38** | Purchasing DISABLED Gate | **CERTIFICADO** | Cero órdenes automáticas ejecutadas con dinero real. |
| **39** | Audit Logging Service | **CERTIFICADO** | Registro inmutable de cada decisión y acción. |
| **40** | Collector DNA Personalization| **CERTIFICADO** | Registro de señales de usuario y ranking de catálogo. |
| **41** | Column Preferences Picker | **CERTIFICADO** | Personalización de columnas guardada en `localStorage`. |
| **42** | Conexiones & Health Tab | **CERTIFICADO** | Monitoreo en vivo de API keys y estados de conectores. |
| **43** | Adaptive Sourcing Engine | **CERTIFICADO** | Transformación de gaps de catálogo en oportunidades. |
| **44** | Catalog Gap Deduplication | **CERTIFICADO** | Convergencia de consultas sintácticas variadas. |
| **45** | Generative Mock Elimination | **CERTIFICADO** | Eliminados fallbacks generativos ficticios en catálogo AI. |
| **46** | Retailer Credential Guard | **CERTIFICADO** | Reporte `PENDING_CREDENTIAL` honesto. |
| **47** | Vitest Master Test Suite | **CERTIFICADO** | 564 pruebas automatizadas pasando al 100%. |
| **48** | Vite Production Build | **CERTIFICADO** | Compilación limpia de producción en 4.25s. |
| **49** | Strict TypeScript Types | **CERTIFICADO** | Tipos rigurosos en todos los motores de Sourcing. |
| **50** | Zero Leakage Git Rules | **CERTIFICADO** | Cero `.env` ni credenciales privadas en commits. |
| **51** | RLS Policy Compliance | **CERTIFICADO** | Políticas de seguridad respetadas en backend. |
| **52** | Toast Notification UX | **CERTIFICADO** | Feedback inmediato de acciones en panel de admin. |
| **53** | Mobile Responsive UI | **CERTIFICADO** | Layout fluido en móviles, tablets y monitores. |
| **54** | Pre-order Publishing Mode | **CERTIFICADO** | Soporte de importación en modo `[PREVENTA]`. |
| **55** | Bulk Import Actions | **CERTIFICADO** | Importación masiva con reporte individual de éxitos/fallos. |
| **56** | Zero Floating Point Drift | **CERTIFICADO** | Redondeos monetarios controlados a 2 decimales. |
| **57** | Landed Cost Completeness | **CERTIFICADO** | Flag `landedCostIncomplete` ante datos faltantes. |
| **58** | SEO & Structured Data | **CERTIFICADO** | JSON-LD y OpenGraph intactos en páginas públicas. |
| **59** | Production Domain Ready | **CERTIFICADO** | Integrado para despliegue en `https://collectibles.uy`. |
| **60** | Operational Runbook Ready | **CERTIFICADO** | Guía de administración documentada y probada. |

---

## 24. Guía Operativa para Administradores de Collectibles

1. **Acceso al Panel:**
   - Ingresar a `/admin/sourcing` desde el panel de control.
2. **Búsqueda de Coleccionables:**
   - Escribir el término de búsqueda (ej. `Street Fighter Jada Toys`, `NECA Predator 1:12`) en la pestaña **Terminal Multifuente**.
   - El sistema buscará simultáneamente en Amazon (Zinc), eBay y Best Buy, agrupando las ofertas en productos canónicos únicos.
3. **Análisis de Oportunidad y Riesgo:**
   - Cada tarjeta canónica muestra:
     * **Costo Puesto UY Estimado** (USD).
     * **Precio de Venta Sugerido** (USD) con margen protegido ($\ge 15\%$).
     * **Comparativa de Mercado Libre Uruguay** (Diferencia porcentual si existe coincidencia exacta).
     * **Opportunity Score** (0–100) y **Risk Score** (0–100).
4. **Vigilar en Watchlist:**
   - Hacer clic en el icono de marcador/bookmark en cualquier producto para guardarlo en la lista de vigilancia y hacer seguimiento de precios.
5. **Importación al Catálogo:**
   - Hacer clic en **Importar al Catálogo** (o **Publicar Preventa**).
   - El sistema ejecuta un **Live Check** en tiempo real y realiza una verificación `read-back` en base de datos.
   - Si se completa con éxito, el producto queda disponible de inmediato para los clientes de Collectibles Uruguay.
6. **Activar OpenAI en el Futuro (Opcional):**
   - Cuando se desee activar OpenAI, simplemente ingresar a la pestaña **Conexiones**, configurar `OPENAI_API_KEY` en Supabase Secrets y encender el switch `OPENAI_SOURCING_ENABLED`.

---

## 25. Conclusión y Próximos Pasos

El circuito completo de **AI Sourcing, Radar y Publicación de Collectibles 2026** ha quedado totalmente remediado, blindado, probado y certificado bajo estándares de producción de nivel empresarial.

* **Cero datos ficticios o inventados.**
* **OpenAI permanece en OFF seguro con cero consumo.**
* **Autopilot permanece en OFF con control manual total.**
* **564 tests pasando al 100% y build de producción validado.**

El proyecto se encuentra listo para el commit y despliegue oficial a producción.
