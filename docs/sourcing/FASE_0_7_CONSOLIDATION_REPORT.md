# SOURCING INTELLIGENCE — INFORME DE CORRECCIÓN Y CONSOLIDACIÓN TÉCNICA (FASES 0–7)

**Fecha**: 10 de Septiembre, 2026  
**Proyecto**: Collectibles 2026 (`collectibles.uy`)  
**Módulo**: Sourcing Intelligence (Consolidación Fases 0–7)  
**Estado**: **COMPLETADO & VERIFICADO — 82/82 TESTS PASSING**

---

## A. ESTADO ANTES
Antes de esta consolidación, existían pequeñas divergencias conceptuales y de seguridad entre la documentación técnica de las Fases 0 a 7 y la implementación real en código:
1. **Riesgo de Seguridad en Zinc**: La variable `VITE_ZINC_API_KEY` aparecía referenciada en el frontend (`purchasingEngine.ts`), violando el principio de secreto server-side.
2. **Ambigüedad en Capabilities**: Se etiquetaba superficialmente a "Zinc" o "Retailers" como `LIVE` en la UI sin desglosar entre `Zinc Product Lookup`, `Zinc Live Check` y `Zinc Purchasing`.
3. **Falsos Positivos en UI**: `SourcingConnectionStatus.tsx` reportaba a `eBay API` y `Best Buy US` como `LIVE` cuando en realidad sólo contaban con código de adaptador sin credenciales activas (`NOT_CONFIGURED` / `PREPARED_NOT_CONNECTED`).
4. **Colisión de Timestamps de Migración**: Existían timestamps duplicados en `supabase/migrations/` (`20260915000000` y `20260916000000`).

---

## B. PROBLEMAS ENCONTRADOS
- **Seguridad**: Inserción de headers `Authorization: Bearer ${zincToken}` directamente en peticiones originadas en el navegador en `purchasingEngine.ts`.
- **Relación Product Master**: `international_products` carecía de una llave foránea explícita `canonical_product_id` apuntando a `canonical_products`.
- **Desalineación de Estados**: No existía una suite de consolidación única que validara las 15 salvaguardas críticas del sistema (Hard Gates, Variant Protection, Client Secrets, Independence of Scores).

---

## C. CORRECCIONES APLICADAS
1. **Blindaje de Seguridad Zinc**: Se eliminó toda referencia a `VITE_ZINC_API_KEY` o `ZINC_API_KEY` en código frontend de `purchasingEngine.ts`. Las órdenes de compra y verificaciones de Zinc se ejecutan 100% server-side a través de Supabase Edge Functions con autenticación de sesión de usuario y `Deno.env.get('ZINC_API_KEY')`.
2. **Honestidad de Capabilities**: Se desglosó el estado de Zinc en `ZINC_PRODUCT_LOOKUP` (LIVE), `ZINC_LIVE_CHECK` (LIVE) y `ZINC_PURCHASING` (NOT_CONFIGURED).
3. **Clasificación Real de Retailers**: Se corrigió `SourcingConnectionStatus.tsx` para mostrar `Amazon US` como `LIVE` y `eBay API` / `Best Buy US` como `NOT_CONFIGURED` / `PREPARED_NOT_CONNECTED`.
4. **Single Source of Truth para Product Master**: `canonical_products` queda ratificado como el **Product Master** de la plataforma, mientras `international_products` actúa únicamente como la capa comercial/publicada.
5. **Suite de Consolidación Fases 0–7**: Se construyó la suite `frontend/src/tests/sourcing_fase0_7_consolidation.test.ts` con 15 tests unitarios e integrados.

---

## D. ARQUITECTURA FINAL

```text
RETAILERS (Amazon US | eBay US | Best Buy US)
       ↓
RAW LISTINGS & SELLERS (source_listings & source_sellers)
       ↓
PRODUCT NORMALIZATION & MATCHING ENGINE (ProductNormalizationService & ProductMatchingEngine)
       ├── Low Confidence Match → match_reviews (Admin Audit)
       └── High Confidence Match ↓
CANONICAL PRODUCT MASTER (canonical_products, product_identifiers, product_offers)
       ↓
AUTHENTICITY GATE & LANDED COST (authenticityGate & internationalPricing.ts)
       ↓
URUGUAY MARKET BENCHMARK (Mercado Libre UY Scroll API & Import Worker)
       ↓
OPPORTUNITY ENGINE & AUTOPILOT POLICY ENGINE (policyEngine.ts & circuitBreaker.ts)
       ↓
QUEUE & PUBLICATION / SOURCE SWITCHING (autopilot actionQueue & reconciliationEngine)
       ↓
STOREFRONT CATALOG & ECOSYSTEM (Catalog, Radar, AI Search, Personalization, Learning)
```

---

## E. PRODUCT MASTER
- **`canonical_products`**: Entidad única, limpia e inmutable de la figura o coleccionable.
- **`product_offers`**: Múltiples ofertas asociadas por retailer y condición (`NEW` vs `USED`).
- **`international_products`**: Proyección comercial publicada vinculada mediante `canonical_product_id`.

---

## F. MATRIZ DE INTEGRACIONES

| Integración | Estado Normalizado | Evidencia Técnica |
| :--- | :--- | :--- |
| **Amazon US** | `LIVE` | `AmazonSourceAdapter.ts` + Edge Functions `zinc-search-products` & `zinc-live-check-before-payment`. |
| **eBay US** | `NOT_CONFIGURED` | `EbaySourceAdapter.ts` listo en código, en espera de credenciales de eBay Buy API REST. |
| **Best Buy US** | `NOT_CONFIGURED` | `BestBuySourceAdapter.ts` listo en código, en espera de credenciales de Best Buy Developer API. |
| **Mercado Libre UY** | `LIVE` | `ml-import-worker` Edge Function con Scroll Scan API y cola de trabajos relacional. |
| **Supabase DB & RLS** | `LIVE` | Schema completo con 10 migraciones aplicadas e idempotentes + RLS por perfil de admin/usuario. |
| **Pricing Engine** | `LIVE` | `internationalPricing.ts` (100% de paridad matemática probada en suite dedicada). |

---

## G. ZINC CAPABILITIES (SEPARACIÓN FORMAL)

| Capability | Estado Real | Explicación |
| :--- | :--- | :--- |
| **ZINC_PRODUCT_LOOKUP** | `LIVE` | Búsqueda y extracción de catálogos Amazon activa vía `/products/search`. |
| **ZINC_LIVE_CHECK** | `LIVE` | Verificación en vivo de precio y disponibilidad pre-pago activa vía `/products/${asin}`. |
| **ZINC_PURCHASING** | `NOT_CONFIGURED` | Compras automáticas en vivo deshabilitadas por defecto hasta carga de credencial de producción en Vault. |

---

## H. PRICING ENGINE (SINGLE SOURCE OF TRUTH)
- `calculateInternationalPricing` en `frontend/src/lib/internationalPricing.ts` es la **única fuente de verdad** para: Landed Cost, Sales Tax, Freight, Fees de pasarela Prex + IVA, Zinc Fee, Ganancia Mínima ($3.99 USD) y Margen Mínimo (15.0%).

---

## I. REGLAS DE URUGUAY (CENTRALIZADAS)
- Definidas en `sourcing_country_rules` para la clave `'UY'`:
  - Límite por franquicia: `$200.00 USD`.
  - Peso máximo franquicia: `4.40 lbs` (~2 kg).
  - Envíos por año: `3`.
  - Arancel general fuera de franquicia: `60.00%`.
  - IVA importación: `22.00%`.
  - Margen mínimo exigido: `15.00%`.

---

## J. AUTOPILOT
- Modos soportados: `OFF`, `RECOMMENDATION`, `SEMIAUTOMATIC`, `AUTOPILOT`.
- Guardas Inviolables:
  - **Kill Switch**: Interrupción inmediata manual o por sistema (`is_kill_switch_active`).
  - **Circuit Breaker**: Suspensión automática ante 3 errores consecutivos de compra o 5 de retailer.
  - **Financial Limits**: Topes unitarios, diarios, semanales y mensuales.

---

## K. WORKERS / CRON
1. **Reconciliation Worker**: `sourcing-reconciliation` (Cron Postgres + Edge Function) para inspeccionar ofertas activas cada hora.
2. **Mercado Libre Worker**: `ml-import-worker` (Cron Postgres cada 1 min) con `FOR UPDATE SKIP LOCKED`.
3. **Catalog Sync Worker**: `zinc-sync-published-products` (Cron Postgres cada 5 min).

---

## L. LEARNING ENGINE
- Separa estrictamente:
  - **Collector DNA / Personalization**: Afinidades dinámicas del usuario.
  - **Demand Engine**: Peticiones agregadas del mercado.
  - **Learning Engine**: Conversiones, márgenes realizados y retroalimentación de ventas.

---

## M. SEGURIDAD Y CERO SECTETOS EN CLIENTE
- Verificación ejecutada: `0` ocurrencias de claves secretas en frontend bundle. Todas las llamadas autenticadas utilizan bearer tokens de sesión de Supabase o secretos de servidor Deno.

---

## N. MIGRACIONES SUPABASE
- `20260904233000_sourcing_multisource_v2.sql`
- `20260904240000_sourcing_market_cache.sql`
- `20260906000000_sourcing_openai_config.sql`
- `20260910100000_sourcing_fase1_enhancements.sql`
- `20260910120000_sourcing_fase2_canonical_engine.sql`
- `20260915000000_sourcing_fase3_personalization.sql`
- `20260915010000_sourcing_autopilot_fase5.sql`
- `20260916000000_sourcing_fase4_adaptive.sql`
- `20260916010000_sourcing_latam_fase6.sql`
- `20260917000000_sourcing_fase7_ecosystem_integration.sql`

---

## O. RESULTADOS DE SUITE DE TESTS
Se ejecutaron **12 suites con 82 tests**, obteniendo un resultado de **100% PASS**:

```bash
 ✓ src/tests/sourcing_fase0_7_consolidation.test.ts (15 tests)
 ✓ src/tests/sourcing_fase1_canonical.test.ts (10 tests)
 ✓ src/tests/sourcing_fase2_canonical_engine.test.ts (6 tests)
 ✓ src/tests/sourcing_fase3_personalization.test.ts (10 tests)
 ✓ src/tests/sourcing_fase4_adaptive.test.ts (7 tests)
 ✓ src/tests/sourcing_fase6_latam.test.ts (11 tests)
 ✓ src/tests/sourcing_fase7_ecosystem_e2e.test.ts (6 tests)
 ✓ src/tests/sourcing_autopilot_policy.test.ts (5 tests)
 ✓ src/tests/sourcing_autopilot_circuit_breaker.test.ts (4 tests)
 ✓ src/tests/sourcing_autopilot_purchasing.test.ts (4 tests)
 ✓ src/tests/sourcing_autopilot_reconciliation.test.ts (3 tests)
 ✓ src/tests/sourcing_autopilot_street_fighter_e2e.test.ts (1 test)

Test Files  12 passed (12)
Tests       82 passed (82)
```

---

## P. ESCENARIO E2E STREET FIGHTER
Escenario `Jada Toys Street Fighter Ryu / Chun-Li / Ken`:
1. Ingesta Multi-Fuente: Amazon, eBay, Best Buy detectan el producto.
2. Canonical Product: Deduplica 3 listings en `COL-JADA-SF-RYU-001`.
3. Variant Protection: Separa `Ryu Player 2` y `Ryu Exclusive` en canónicos independientes.
4. Authenticity & Landed Cost: Certifica originalidad oficial y calcula costo puesto ($41.24 USD).
5. Autopilot & Storefront: Preselecciona, aplica reglas de margen y expone en catálogo y Radar.

---

## Q. PRODUCCIÓN Y BUILD
- Compilación comprobada: `npm run build` genera bundle sin errores.
- Deploy en producción: Pipeline de GitHub/Vercel desplegado en `https://collectibles.uy`.

---

## R. PENDIENTES REALES Y PRÓXIMOS PASOS
1. Habilitación de API Keys de producción para eBay Buy API y Best Buy API cuando el negocio decida activar dichas fuentes en vivo.
2. Fase 7A: Desarrollo de la experiencia de usuario y diseño UI del panel de Sourcing.

---

## S. MATRIZ DE HONESTIDAD FINAL

| Componente | Estado Real | Evidencia |
| :--- | :--- | :--- |
| **Product Master** | `IMPLEMENTED_VERIFIED` | `canonical_products` consolidado como Product Master en DB y backend. |
| **Amazon US** | `LIVE` | Adaptador y llamadas live activas vía Zinc API v1. |
| **eBay US** | `NOT_CONFIGURED` | Adaptador implementado; en espera de credenciales de eBay Buy API REST. |
| **Best Buy US** | `NOT_CONFIGURED` | Adaptador implementado; en espera de credenciales de Best Buy API. |
| **Mercado Libre UY** | `LIVE` | `ml-import-worker` y Scroll API operando con cola de trabajos. |
| **Zinc Search** | `LIVE` | Búsqueda de catálogo en Amazon US mediante Zinc API v1. |
| **Zinc Live Check** | `LIVE` | Chequeo de precio y stock pre-pago verificado server-side. |
| **Zinc Purchasing** | `NOT_CONFIGURED` | Compras automáticas en vivo deshabilitadas por defecto. |
| **Pricing Engine** | `IMPLEMENTED_VERIFIED` | `internationalPricing.ts` verificado en suites de paridad y profit protection. |
| **Adaptive Sourcing** | `IMPLEMENTED_VERIFIED` | Detección de brechas de catálogo y señales de demanda. |
| **Autopilot** | `IMPLEMENTED_VERIFIED` | Policy Engine, Queue, Purchasing validation y Circuit Breaker. |
| **Reconciliation Worker** | `LIVE` | Tarea programada en Postgres cron + Edge function. |
| **Radar Integration** | `IMPLEMENTED_VERIFIED` | Puente de comunicación entre señales de tendencia y productos canónicos. |
| **AI Search** | `IMPLEMENTED_VERIFIED` | Búsqueda semántica con fallback a PostgreSQL FTS. |
| **Personalization** | `IMPLEMENTED_VERIFIED` | Perfiles dinámicos de interés por dimensión e impresiones CTR. |
| **Learning Engine** | `IMPLEMENTED_VERIFIED` | Registro de señales de conversión y cerrado de bucle. |

---

**FIN DEL INFORME DE CONSOLIDACIÓN TÉCNICA.**
