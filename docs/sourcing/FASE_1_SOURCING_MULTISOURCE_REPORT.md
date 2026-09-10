# COLLECTIBLES 2026 — SOURCING INTELLIGENCE FASE 1
## Reporte de Implementación: Sourcing & Importación Multifuente V2

---

## 1. Resumen de Ejecución

Conforme al requerimiento **SOURCING & IMPORTACIÓN MULTIFUENTE V2 — FASE 1**, se ha construido la capa técnica de Sourcing Intelligence para el proyecto Collectibles.uy.

Esta fase establece el **Canonical Product Graph** que separa formalmente la identidad del producto (`sourcing_normalized_products`) de las ofertas comerciales (`sourcing_source_offers`), soportando Amazon, eBay y Best Buy sin duplicar catálogo ni depender de la oferta activa para definir la identidad.

---

## 2. Matriz de Capacidades Reales por Retailer

De acuerdo con el principio de **declaración honesta de capacidades** (sin falsos verdes), la siguiente tabla resume el estado técnico exacto de cada fuente:

| Retailer | Search | Product Details | Live Price | Live Stock | Live Seller | Live Delivery | Status Integrativo | Notas Técnicas |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **Amazon** | ✅ LIVE | ✅ LIVE | ✅ LIVE | ✅ LIVE | ✅ LIVE | ✅ LIVE | `LIVE` | Integrado 100% vía Zinc API (search, product details, price, stock, fulfillment). |
| **eBay** | ⚠️ READY | ⚠️ READY | 🔴 PENDING | 🔴 PENDING | 🔴 PENDING | 🔴 PENDING | `ADAPTER_READY` | Adaptador y normalizador completos. Live Check requiere habilitar multi-retailer `retailer=ebay` en la cuenta Zinc. |
| **Best Buy** | ⚠️ READY | ⚠️ READY | 🔴 PENDING | 🔴 PENDING | 🔴 PENDING | 🔴 PENDING | `ADAPTER_READY` | Adaptador y normalizador completos. Live Check requiere habilitar multi-retailer `retailer=bestbuy` en la cuenta Zinc. |

*Definiciones de Estado:*
- `LIVE`: Endpoint activo, credenciales verificadas y respondiendo en tiempo real.
- `ADAPTER_READY`: Código de adaptador, normalizador y estructuras listos; pendiente habilitación de credencial en proveedor externo.
- `NOT_CONFIGURED`: Fuente no configurada o no soportada comercialmente aún.

---

## 3. Componentes Construidos y Auditados

### 3.1. Capa de Identidad y Deduplicación Canónica
- **Identificador Canónico (`canonical_sku`)**: Generación determinística `COL-{BRAND}-{LICENSE}-{CHARACTER}-{HASH}` independiente de ASIN o Item ID.
- **Motor de Deduplicación Multicapa**: Matching determinístico en orden estricto (UPC/EAN → MPN → Brand+Line+Character → Title Fingerprint).
- **Match Reason & Confidence**: Registro auditable de la razón del agrupamiento y puntaje de confianza (0.00 - 1.00).

### 3.2. Normalización de Condición y Disponibilidad
- **Condiciones Normalizadas**: `NEW`, `USED`, `OPEN_BOX`, `REFURBISHED`, `UNKNOWN`.
- **Separación NEW vs USED**: Evaluación independiente del mejor proveedor (`newFromUsdMin` vs `usedFromUsdMin`).
- **Disponibilidad Normalizada**: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `PREORDER`, `BACKORDER`, `UNKNOWN`.
- **Entrega Estimada a Miami**: Rango de fechas normalizado (`delivery_min`, `delivery_max` formato ISO).

### 3.3. Algoritmo Best Source Selector V1
- Determinístico (0% LLM en decisiones comerciales o de selección).
- Ranking basado en **Landed Cost Real** (Precio origen + Shipping USA + Zinc Fee + Arancel/Tasas + Courier Miami-Montevideo).
- Penalización por riesgo de inventario y vendedor sin verificación.
- **Exclusión Estricta**: Ofertas `RESEARCH_ONLY` o `PENDING_CREDENTIAL` **nunca** son seleccionadas automáticamente sobre ofertas `LIVE`.

### 3.4. Authenticity & Licensing Gate
- Enjuiciamiento determinístico contra lista de fabricantes oficiales reconocidos (`RECOGNIZED_OFFICIAL_BRANDS`, incluyendo Jada Toys) y licencias mayoritarias (`RECOGNIZED_MAJOR_LICENSES`, incluyendo Street Fighter).
- Detección inmediata de bootlegs, replicas, KOs y recasts.
- Bloqueo preventivo de importación si la autenticidad es menor a `VERIFIED_OFFICIAL`.

### 3.5. Historial de Ofertas (`OfferHistoryService`)
- Registro de cambios significativos (Precio > 0.5%, Disponibilidad, Condición, Vendedor).
- Sin duplicación de registros idénticos si no hubo cambios.

---

## 4. Persistencia e Infraestructura de BD

### Migración Aplicada: `20260910100000_sourcing_fase1_enhancements.sql`
- `sourcing_normalized_products`: Campos `manufacturer`, `gtin`, `best_buy_sku`, `ebay_item_id`, `match_reason`, `match_confidence`, `freshness_status`, `best_source`, `best_source_reason`.
- `sourcing_source_offers`: Campos `condition_normalized`, `seller_rating`, `seller_reviews`, `seller_verified`, `fulfilled_by_retailer`, `sold_by_retailer`, `freshness_status`, `availability_normalized`, `delivery_min`, `delivery_max`, `usa_shipping_usd`.
- Nueva Tabla `sourcing_offer_history`: Historial de fluctuaciones.
- Nueva Tabla `sourcing_retailer_capabilities`: Matriz de capacidades vivas.
- Nueva Tabla `sourcing_sync_log`: Observabilidad y logs de sincronización.

---

## 5. Edge Functions Deployadas

1. `sourcing-retailer-live-check`: Endpoint unificado server-side para Live Check de Amazon, eBay y Best Buy con fallback honesto (`LIVE`, `NOT_CONFIGURED`, `ERROR`).
2. `sourcing-market-intelligence`: Monitoreo en tiempo real de Mercado Libre Uruguay (0 mocks, status honesto `NOT_FOUND` / `SIN_COMPETENCIA`).
3. `sourcing-openai-research`: Generación opcional de Research Packs con control estricto de presupuesto diario.

---

## 6. Cobertura de Tests Automatizados

Total: **40 tests automatizados (40/40 PASS)**

1. `sourcing_multisource_v2.test.ts` (19 tests): Adapters, parsers, deduplicación, landed cost, authenticity gate.
2. `sourcing_live_connectors.test.ts` (11 tests): Conectores live reales, rate limiters, batch processing (100+ URLs).
3. `sourcing_fase1_canonical.test.ts` (10 tests): Condición NEW/USED, seller reliability, offer history, capabilities declaration, E2E Street Fighter Ryu.

---

## 7. Caso de Aceptación E2E: Street Fighter Ryu (Jada Toys 1/12)

- **Input**: Ofertas simultáneas de Amazon ($24.99 + $0) y eBay ($22.00 + $5.50 = $27.50).
- **Resultado del Grafo Canónico**: Un solo producto canónico `COL-JADATOYS-STREETFI-RYU-EAXMDM`.
- **Authenticity Gate**: Status `VERIFIED_OFFICIAL` (Jada Toys + Street Fighter reconocidos con UPC `801310342176`).
- **Best Source Selector**: Amazon seleccionado como mejor fuente (Landed Cost menor: $24.99 vs $27.50).

---

## 8. Siguientes Pasos (Standby para Fase 2)

Fase 1 completada exitosamente. **No se avanzará a Fase 2** hasta recibir instrucciones expresas del usuario.
