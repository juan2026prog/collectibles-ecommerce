# SOURCING INTELLIGENCE — FASE 2: AUDITORÍA Y ARQUITECTURA DE IMPLEMENTACIÓN

**Fecha**: 10 de Septiembre, 2026  
**Proyecto**: Collectibles 2026 (`collectibles.uy`)  
**Módulo**: Sourcing Intelligence — Fase 2 (Product Canonicalization + Offer Engine)  

---

## 1. ESTADO ACTUAL Y COMPONENTES EXISTENTES (FASE 0 Y FASE 1)

### 1.1 Base de Datos (Migraciones Supabase)
- `20260904233000_sourcing_multisource_v2.sql`:
  - `sourcing_research_packs`: Registro y estado de packs de investigación.
  - `sourcing_normalized_products`: Tabla plana de productos normalizados (híbrido de producto canónico y oferta principal).
  - `sourcing_source_offers`: Ofertas por retailer (`amazon`, `ebay`, `bestbuy`, etc.).
  - `uruguay_market_stores`: Catálogo de tiendas locales en Uruguay.
- `20260910100000_sourcing_fase1_enhancements.sql`:
  - `sourcing_offer_history`: Historial de cambios en precio, stock, seller, disponibilidad.
  - `sourcing_retailer_capabilities`: Declaración honesta de capacidades por retailer.
  - `sourcing_sync_log`: Observabilidad de operaciones de sincronización.
  - Extensión de columnas en `sourcing_normalized_products` y `sourcing_source_offers` (`condition_normalized`, `availability_normalized`, `freshness_status`, `seller_rating`, `delivery_min/max`, `gtin`, `match_confidence`).

### 1.2 Servicios de Frontend & Dominio
- `frontend/src/types/sourcing.ts`: Tipos principales (`NormalizedProduct`, `SourceOffer`, `CanonicalProductView`, `ConditionNormalized`, `AvailabilityNormalized`, `RetailerCapabilities`).
- `frontend/src/services/sourcing/adapters/`: Adaptadores para Amazon, eBay, Best Buy y Mercado Local.
- `frontend/src/services/sourcing/normalizer.ts`:
  - `cleanKeyString`, `generateDeduplicationFingerprint` (basado en UPC/MPN/palabras del título).
  - `generateCanonicalSku` (código `COL-[BRAND]-[LICENSE]-[CHAR]-[HASH]`).
  - `inferProductMetadata`.
- `frontend/src/services/sourcing/bestSourceSelector.ts`:
  - `groupOffersByCondition` (separación `NEW` vs `USED` vs `OPEN_BOX`).
  - `calculateSellerReliabilityScore` (cálculo de score de seller 0-100).
- `frontend/src/services/sourcing/authenticityGate.ts`: Verificación de licencias oficiales y banderas de riesgo.
- `frontend/src/services/sourcing/offerHistoryService.ts`: Detección de variaciones significativas (umbral 0.5%).
- `frontend/src/services/sourcing/sourcingService.ts`: Orquestación de procesamiento de research packs.

### 1.3 Vista Admin & UI
- `frontend/src/pages/admin/AdminSourcingImport.tsx`: Vista principal de sourcing import.
- `frontend/src/components/admin/sourcing/`: Componentes UI (`SourcingTable`, `SourcingFilters`, `SourcingCanonicalProductView`, `SourcingExpandedDetail`, etc.).

---

## 2. QUÉ FUNCIONA

1. **Parseo y Adaptación de Ofertas**: Extracción básica desde URLs de Amazon, eBay y Best Buy vía adaptadores.
2. **Deduplicación en Memoria por Fingerprint**: Agrupación por UPC/MPN durante el procesamiento batch.
3. **Separación de Ofertas Nuevo vs Usado**: Discriminación funcional de ofertas `NEW` y `USED` para cálculo de mejor oferta independiente.
4. **Calculadora de Costos e Impuestos**: Integración con `internationalPricing.ts` (cálculo de costo puesto en Uruguay).
5. **Historial de Ofertas Básicas**: Detección de cambios de precio y stock persistidos en `sourcing_offer_history`.

---

## 3. QUÉ ESTÁ INCOMPLETO Y QUÉ FALTA PARA FASE 2

### 3.1 Deficiencias de Arquitectura Actual
- **Mezcla Conceptual entre Producto y Oferta**: La tabla `sourcing_normalized_products` actúa como producto y a la vez conserva atributos de la primera oferta o de la "mejor oferta", en lugar de ser un producto canónico puro con su propio ciclo de vida.
- **Sin Entidad de Identificadores Múltiples (`product_identifiers`)**: Los identificadores (`UPC`, `EAN`, `GTIN`, `MPN`, `ASIN`, `SKU`) están planos en la tabla de producto y no admiten múltiples registros verificados o referencias por retailer.
- **Sin Entidad de Vendedores Normalizados (`source_sellers`)**: El seller es un simple `string` en `source_offers` con columnas sueltas de rating. No existe `source_sellers` como entidad normalizada con reputación determinística y estado (`TRUSTED`, `ACCEPTABLE`, `RISKY`, `UNKNOWN`).
- **Sin Entidad de Raw Listings (`source_listings`)**: No se almacena la evidencia cruda recibida de cada retailer antes de la normalización.
- **Falta de Pipeline Determinístico de Normalización de Títulos**: No se limpia de forma estricta el ruido promocional (`NEW IN BOX`, `LIMITED!!!`, `FREE SHIPPING`, `SALE`) separándolo de los atributos reales (`brand`, `character`, `scale`, `variant`, `edition`).
- **Matching Engine Incompleto (4 Niveles)**: Falta el `ProductMatchingEngine` determinístico formal con ponderación por niveles (Identificadores Exactos -> MFR+MPN -> Datos Estructurados -> Similaridad Textual) y reglas estrictas de anti-false match.
- **Falta de Protección Estricta de Variantes (`variant_protection`)**: Actualmente dos variantes como `Standard` vs `Exclusive`, `Player 1` vs `Player 2`, `Blue Version` vs `Red Version` o escalas `1:12` vs `1:10` podrían agruparse erróneamente si comparten marca y personaje.
- **Falta de Familias de Productos (`product_families`)**: No existe la entidad relacional para vincular variantes comerciales dentro de la misma línea/franquicia manteniendo productos canónicos independientes.
- **Falta de Interfaz de Auditoría y Match Review Manual (`match_reviews`)**: No existe pantalla admin dedicada para auditar coincidencias dudosas (`REVIEW_REQUIRED`), aprobar, rechazar o forzar la creación de productos separados.
- **Sin Exposición de Servicio para Radar**: Falta la capa de consulta relacional preparada para que el módulo Radar consulte productos canónicos vinculados a franquicias/marcas/series.

---

## 4. DEPENDENCIAS DE FASE 0 Y FASE 1

- Compatibilidad estricta con `sourcing_normalized_products` y `sourcing_source_offers` para mantener operativas las vistas y flujos vigentes de FASE 1.
- Reutilización de `internationalPricing.ts`, `authenticityGate.ts` y adaptadores de retailers existentes.

---

## 5. RIESGOS Y ESTRATEGIA DE MITIGACIÓN

1. **Riesgo: Falsos Positivos en Matching Cross-Retailer**  
   *Mitigación*: Implementar un pipeline de matching estricto en 4 niveles donde la similaridad textual NUNCA sea causa suficiente para fusionar productos sin coincidencia de identificadores o atributos estructurales exactos. Si hay duda, se asigna `REVIEW_REQUIRED`.

2. **Riesgo: Romper la Interfaz Existente del Admin**  
   *Mitigación*: Mantener adaptadores/transformadores en el Service Layer que proyecten los datos relacionales canónicos (`canonical_products` + `product_offers`) al tipo `CanonicalProductView` / `NormalizedProduct` que consume el frontend actual.

3. **Riesgo: Duplicación en Ingestión Concurrente**  
   *Mitigación*: Constraints únicas relacionales en base de datos (`(identifier_type, identifier_value)`, `(source, external_id)`) y transacciones idempotentes (`upsert`).

---

## 6. MIGRACIONES Y ESTRUCTURA DE BASE DE DATOS NECESARIA

Se creará la migración SQL: `20260910120000_sourcing_fase2_canonical_engine.sql` definiendo:

1. `product_families` (`id`, `name`, `franchise`, `brand`, `created_at`, `updated_at`).
2. `canonical_products` (`id`, `family_id`, `brand`, `manufacturer`, `franchise`, `series`, `character`, `product_name`, `canonical_title`, `category`, `subcategory`, `scale`, `edition`, `variant`, `color_variant`, `release_year`, `gtin`, `ean`, `upc`, `mpn`, `sku_reference`, `primary_image`, `additional_images`, `description`, `specifications`, `package_dimensions`, `package_weight`, `product_status`, `created_at`, `updated_at`).
3. `product_identifiers` (`id`, `canonical_product_id`, `identifier_type`, `identifier_value`, `source`, `verified`, `created_at`).
4. `source_listings` (`id`, `source`, `external_id`, `url`, `raw_title`, `raw_description`, `raw_brand`, `raw_price`, `raw_currency`, `raw_condition`, `raw_stock`, `raw_images`, `seller_external_id`, `raw_payload`, `first_seen_at`, `last_seen_at`).
5. `source_sellers` (`id`, `source`, `external_seller_id`, `seller_name`, `rating`, `rating_count`, `positive_percentage`, `seller_status`, `first_seen_at`, `last_seen_at`).
6. `product_offers` (`id`, `canonical_product_id`, `source_listing_id`, `retailer`, `seller_id`, `condition`, `condition_normalized`, `price`, `currency`, `original_price`, `sale_price`, `shipping_us`, `shipping_estimated`, `availability`, `estimated_delivery_min`, `estimated_delivery_max`, `offer_url`, `is_best_new_offer`, `is_best_used_offer`, `first_seen_at`, `last_seen_at`, `updated_at`).
7. `match_reviews` (`id`, `source_listing_id`, `suggested_canonical_product_id`, `confidence_score`, `reasons`, `status`, `manual_action`, `reviewed_by`, `reviewed_at`, `created_at`).

---

## 7. PLAN EXACTO DE IMPLEMENTACIÓN

```text
FASE 2 ARCHITECTURE
===================
1. DATA LAYER (Migración Supabase + DB Engine)
   ├── Tablas relacionales: product_families, canonical_products, product_identifiers,
   │   source_listings, source_sellers, product_offers, match_reviews
   └── Constraint idempotentes e índices relacionales

2. CORE SERVICE LAYER (TypeScript Domain Engines)
   ├── ProductNormalizationService.ts (Title Normalization Pipeline + Cleaning)
   ├── ProductMatchingEngine.ts (4-Level Matching + Variant Protection)
   ├── SellerTrustService.ts (Deterministic Seller Reputation & Data Completeness)
   ├── ProductPriceService.ts (NEW / USED Separation + Aggregations)
   ├── ProductFamilyService.ts (Family hierarchy & variant grouping)
   └── RadarIntegrationService.ts (Bridge para futura consulta desde Radar)

3. INTEGRATION LAYER
   ├── sourcingService.ts (Orquestación idempotente completa)
   └── Proyección retrocompatible para vistas existentes

4. ADMIN & AUDIT UI LAYER
   ├── SourcingCanonicalMatchReviewModal.tsx (Panel de auditoría y revisión de matches)
   └── Extensión de SourcingCanonicalProductView.tsx con inspección de Sellers, Listings u Ofertas

5. TEST & E2E VALIDATION LAYER
   ├── Suite de Tests Unitarios y E2E: sourcing_fase2_canonical_engine.test.ts
   └── Fixtures Chun-Li 1/12 Jada Toys (3 retailers -> 1 producto canónico + 3 offers)
       + Chun-Li Player 2 (Producto Canónico separado en la misma familia).
```

---
