# SOURCING INTELLIGENCE — FASE 2: WALKTHROUGH DE ENTREGABLE

**Fecha**: 10 de Septiembre, 2026  
**Proyecto**: Collectibles 2026 (`collectibles.uy`)  
**Módulo**: Sourcing Intelligence — Fase 2 (Product Canonicalization + Offer Engine)  

---

## 1. RESUMEN DE LO CONSTRUIDO

En la **FASE 2** de Sourcing Intelligence se ha implementado el motor relacional y algorítmico completo para transformar la ingesta de listings internacionales en un catálogo canónico unificado de productos con sus respectivas ofertas comerciales independientes.

El sistema deja de considerar cada publicación de Amazon, eBay o Best Buy como un producto aislado. Ahora determina si pertenecen al **mismo producto físico canónico**, separando conceptualmente la identidad del coleccionable de sus fuentes, vendedores, precios, condiciones (`NEW`, `USED`, `REFURBISHED`), disponibilidad y tiempos de entrega.

---

## 2. ARQUITECTURA FINAL

```text
SOURCES (Amazon / eBay / Best Buy)
   ↓
RAW LISTINGS (source_listings)
   ↓
NORMALIZATION (ProductNormalizationService — Limpieza de ruido + extracción)
   ↓
MATCHING ENGINE (ProductMatchingEngine — 4 Niveles + Variant Protection)
   ↓
CANONICAL PRODUCT (canonical_products + product_identifiers + product_families)
   ↓
OFFERS (product_offers)
   ↓
SELLERS / PRICE / AVAILABILITY (SellerTrustService + ProductPriceService)
```

---

## 3. BASE DE DATOS (TABLAS CREADAS Y MODIFICADAS)

Se creó la migración oficial Supabase:
`supabase/migrations/20260910120000_sourcing_fase2_canonical_engine.sql`

- `product_families`: Agrupamiento de familias comerciales (ej. `Street Fighter — Jada Toys Chun-Li`).
- `canonical_products`: Entidad canónica principal (`brand`, `manufacturer`, `franchise`, `series`, `character`, `product_name`, `canonical_title`, `scale`, `edition`, `variant`, `color_variant`, `release_year`, `gtin`, `ean`, `upc`, `mpn`, `sku_reference`, `primary_image`, `specifications`, `package_dimensions`, `package_weight_lbs`, `product_status`).
- `product_identifiers`: Relación 1-N para múltiples identificadores por producto (`UPC`, `EAN`, `GTIN`, `MPN`, `ASIN`, `BESTBUY_SKU`, `EBAY_ITEM_ID`, `RETAILER_SKU`).
- `source_listings`: Registro persistente de listings crudos por retailer.
- `source_sellers`: Vendedores normalizados con estado reputacional determinístico (`TRUSTED`, `ACCEPTABLE`, `RISKY`, `UNKNOWN`).
- `product_offers`: Ofertas comerciales independientes desacopladas por retailer, condición, precio, shipping y rango estimado de entrega.
- `match_reviews`: Auditoría e interacción manual de coincidencias con estado `REVIEW_REQUIRED`.

---

## 4. REGLAS DE MATCHING Y NIVELES

1. **Nivel 1 — Exact Identifiers**: Coincidencia por `GTIN`, `EAN`, `UPC`, `MPN`. Confianza: `1.0 (EXACT)`.
2. **Nivel 2 — Manufacturer + MPN**: Confianza alta: `0.95 (HIGH)`.
3. **Nivel 3 — Datos Estructurados**: Cruce de `brand`, `franchise`, `character`, `scale`, `series`, `variant`, `edition`. Confianza: `0.85 – 0.90 (HIGH/MEDIUM)`.
4. **Nivel 4 — Similaridad Textual (Apoyo)**: Medición Jaccard como apoyo. Nunca se auto-fusiona solo por similaridad textual; requiere `REVIEW_REQUIRED`.
5. **Protección de Variantes (`variant_protection`)**: Bloquea fusiones erróneas entre:
   - `Standard Edition` vs `Exclusive Edition`
   - `Player 1` vs `Player 2` / `Player 3`
   - `Blue Version` vs `Red Version`
   - Escalas distintas (`1:12` vs `1:10` vs `1/6` vs `7"`)

---

## 5. EVIDENCIA DE EJECUCIÓN (EJEMPLO CHUN-LI COMPLETO)

### Caso de Referencia: Jada Toys Street Fighter Chun-Li 1/12
Simulados/procesados listings de:
- **Amazon Listing**: `JADA TOYS Street Fighter II Chun Li 1:12 Action Figure NEW IN BOX!!!` (USD $89.00, NEW)
- **eBay Listing**: `Jada Toys Chun Li 1:12 Scale Figure Street Fighter II Sealed` (USD $84.00, NEW)
- **Best Buy Listing**: `Jada Toys - Street Fighter II Chun-Li 6" Figure` (USD $92.00, NEW)

### Resultado Verificado:
- **1 Canonical Product**: `COL-JADATOYS-STREETFI-CHUN-LI-801310`
- **3 Source Listings**: Amazon, eBay, Best Buy
- **3 Product Offers**: Amazon ($89.00), eBay ($84.00), Best Buy ($92.00)
- **Nuevo desde**: `USD $84.00` (Oferta eBay)
- **Mejor oferta**: eBay (por menor costo de origen)
- **Chun-Li Player 2**: Se genera como un **Producto Canónico SEPARADO** (`can-chunli-p2`) vinculado a la misma **Product Family** (`Street Fighter — Jada Toys Chun-Li`).

---

## 6. TABLA DE TESTS Y RESULTADOS

| TEST | TIPO | RESULTADO |
| :--- | :--- | :--- |
| `UPC exact match` | Unit / Engine | **PASS** |
| `MPN match` | Unit / Engine | **PASS** |
| `Variant protection (Player 1 vs 2, Standard vs Exclusive)` | Unit / Engine | **PASS** |
| `Cross retailer (Amazon + eBay + Best Buy)` | E2E Reference | **PASS** |
| `New/Used separation (Nuevo desde / Usado desde)` | Commercial Price Engine | **PASS** |
| `Best offer selection` | Commercial Price Engine | **PASS** |
| `Idempotency (Double processing)` | Normalizer & Deduplication | **PASS** |
| `Seller Trust Evaluation (Trusted vs Risky)` | Seller Trust Service | **PASS** |
| `Title Normalization (Noise stripping)` | Normalization Pipeline | **PASS** |
| `Database Schema Integrity` | Supabase SQL Migration | **PASS** |
| `Build Gate (npm run build)` | Production Build | **PASS** |

---

## 7. PENDIENTES DE FASES FUTURAS

- Conexión con compras automáticas y checkout con Zinc (Fases posteriores).
- Publicación automática en Mercado Libre Uruguay (Fases posteriores).
- Cálculo final de régimen simplificado uruguayo y franquicias aduaneras (Fase 3+).

---

## 8. ARCHIVOS MODIFICADOS Y CREADOS

- `SOURCING_PHASE_2_AUDIT.md`
- `SOURCING_PHASE_2_WALKTHROUGH.md`
- `supabase/migrations/20260910120000_sourcing_fase2_canonical_engine.sql`
- `frontend/src/types/sourcing.ts`
- `frontend/src/services/sourcing/ProductNormalizationService.ts`
- `frontend/src/services/sourcing/ProductMatchingEngine.ts`
- `frontend/src/services/sourcing/SellerTrustService.ts`
- `frontend/src/services/sourcing/ProductPriceService.ts`
- `frontend/src/services/sourcing/ProductFamilyService.ts`
- `frontend/src/services/sourcing/RadarIntegrationService.ts`
- `frontend/src/components/admin/sourcing/SourcingCanonicalMatchReviewModal.tsx`
- `frontend/src/tests/sourcing_fase2_canonical_engine.test.ts`

---

## 9. MIGRACIONES DE BASE DE DATOS

- `supabase/migrations/20260910120000_sourcing_fase2_canonical_engine.sql`

---

## 10. ESTADO FINAL

```text
FASE 2: COMPLETE
```
