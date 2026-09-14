# COLLECTIBLES 2026 — SOURCING INTELLIGENCE
# AUDITORÍA PROFUNDA EXCLUSIVA DE EBAY: SOURCING, MATCHING, PRICING Y PURCHASING

**Proyecto:** Collectibles 2026 (`https://collectibles.uy`)  
**Fecha de Auditoría:** 11 de Septiembre de 2026  
**Documento Canónico:** `docs/sourcing/EBAY_DEEP_AUDIT.md`  
**Tipo de Auditoría:** Forense, Arquitectónica, Empírica y Read-Only (0 Compras Reales / 0 USD Gastados)  
**Alcance:** Exclusivamente **eBay** (retailer directo, adapters, motor de matching canónico, Zinc Managed Account y Purchasing)

---

## ÍNDICE DE SECCIONES

1. [Inventario y Mapeo del Adapter eBay](#1-identificar-el-adapter-ebay)
2. [Cómo Busca eBay Hoy](#2-cómo-busca-ebay-hoy)
3. [Integración con API Oficial de eBay](#3-api-ebay)
4. [URL & Regex Adapter](#4-url--regex-adapter)
5. [Traza Campo por Campo de Datos de Producto](#5-product-data)
6. [Nuevo vs Usado](#6-nuevo-vs-usado)
7. [Inteligencia del Vendedor](#7-vendedor)
8. [Shipping USA hacia Miami](#8-shipping-usa)
9. [Free Shipping vs Paid Shipping](#9-free-shipping)
10. [Stock y Disponibilidad](#10-stock--quantity)
11. [Subastas (Auctions)](#11-auctions)
12. [Best Offer](#12-best-offer)
13. [Variaciones](#13-variaciones)
14. [Bundles y Lotes](#14-bundles)
15. [Matching con Amazon & Canonical Engine](#15-matching-con-amazon)
16. [Protección contra Falsos Matches](#16-falsos-matches)
17. [Múltiples Listings de eBay para un Mismo Producto](#17-multiple-ebay-listings)
18. [Señales de eBay hacia Sourcing Scores](#18-ebay--sourcing-score)
19. [eBay hacia Import Engine y Landed Cost](#19-ebay--import-engine)
20. [eBay Purchasing: Arquitectura Forense](#20-ebay-purchasing--arquitectura)
21. [Managed Account eBay en Zinc](#21-managed-account-ebay)
22. [Carrito e Identificador Enviado a Purchasing](#22-carrito-ebay)
23. [Seller Lock](#23-seller-lock)
24. [Condition Lock](#24-condition-lock)
25. [Price Lock y Variación Máxima](#25-price-lock)
26. [Shipping Lock y Costo Total](#26-shipping-lock)
27. [Profit Protection](#27-profit-protection)
28. [Método de Pago a eBay](#28-payment-a-ebay)
29. [Dirección de Envío a Casillero Miami](#29-dirección-de-envío)
30. [Flujo After-Payment Completo](#30-after-payment-flow)
31. [Idempotencia, Locks Atómicos y Prevención de Duplicados](#31-idempotencia-ebay)
32. [Mapeo de Respuestas de eBay y Zinc](#32-respuestas-de-ebay--zinc)
33. [Revisión Manual (Manual Review)](#33-manual-review)
34. [Ciclo de Vida de Estados de Orden](#34-order-status)
35. [Tracking y Despacho](#35-tracking)
36. [Reconciliación Automática](#36-reconciliation)
37. [Capacidades del Autopilot con eBay](#37-autopilot)
38. [Matriz de Riesgos Específicos de eBay](#38-riesgos-específicos-ebay)
39. [Pruebas Read-Only y Evidencia Empírica](#39-pruebas-read-only)
40. [Matriz Final de Estado Operativo](#40-matriz-final)
41. [Diagramas de Arquitectura Reales (ASCII)](#41-diagrama-real)
42. [25 Respuestas Obligatorias](#42-25-respuestas-obligatorias)
43. [Score de Madurez](#43-score-de-madurez)
44. [Veredicto Canónico](#44-veredicto)

---

## 1. IDENTIFICAR EL ADAPTER EBAY

A continuación se detalla el inventario completo de archivos en el proyecto que contienen código, tipos, adaptadores o lógica directa relacionada con eBay:

| ARCHIVO | FUNCIÓN / CLASE | RESPONSABILIDAD | INPUT | OUTPUT | DEPENDENCIA EXTERNA | RUNTIME |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `frontend/src/services/sourcing/adapters/EbaySourceAdapter.ts` | `EbaySourceAdapter` (`matchesUrl`, `extractProductId`, `parseOfferFromInput`, `toSourceOffer`) | Detección de URLs de eBay, extracción de Item ID vía Regex, parsing básico con fallbacks estáticos y generación de `SourceOffer` (`status: 'RESEARCH_ONLY'`). | URL string, objeto de extracción `{url, title, price, shipping, seller, brand, upc, raw}` | `RawProductExtraction`, `SourceOffer` | Ninguna (código cliente síncrono puro) | Cliente / Browser |
| `frontend/src/services/sourcing/adapters/EbayLiveSourceAdapter.ts` | `EbayLiveSourceAdapter` (`resolveLiveItem`, `createFallbackItem`, `toLiveSourceOffer`) | Intento de resolución server-side de un Item ID de eBay mediante invocación HTTP a endpoint Live Check. Genera fallback en caso de fallo. | `EbayLiveLookupParams` (`itemId`, `forceRefresh`) | `EbayLiveProductDetails`, `SourceOffer` (`status: 'LIVE'` o `'ERROR'`) | Endpoint `/api/sourcing/zinc-live-check` | Cliente / Browser |
| `frontend/src/services/sourcing/adapters/index.ts` | `resolveAdapterForUrl`, `getAdapterBySource` | Registry y resolución polimórfica de adaptadores según dominio o source enum. | `url: string` o `source: RetailerSource` | Instancia de `ISourceAdapter` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/retailerCapabilities.ts` | `STATIC_RETAILER_CAPABILITIES.ebay`, `getRetailerCapabilities`, `executeLiveCheck` | Declaración honesta del estado de capacidades de eBay (`search_status: 'ADAPTER_READY'`, `live_check_available: false`). | `retailer: 'ebay'` | `RetailerCapabilities` | Supabase DB `sourcing_retailer_capabilities` | Cliente / Browser |
| `supabase/functions/sourcing-retailer-live-check/index.ts` | `serve()`, `zincLiveCheck()`, `extractSellerSignals()` | Edge Function unificada para Live Check de retailers. Para eBay, intenta `GET /products/{id}?retailer=ebay` en Zinc y mapea la respuesta o retorna `NOT_CONFIGURED`. | `{product_id, retailer: 'ebay'}` | `NormalizedLiveOffer` | Zinc API V2 (`api.zinc.com`) | Deno Edge Runtime |
| `frontend/src/services/sourcing/ProductMatchingEngine.ts` | `ProductMatchingEngine.evaluateMatch()`, `checkVariantConflict()` | Motor jerárquico determinístico de 4 niveles para emparejar listings de eBay con productos canónicos o con ofertas de Amazon. | `listing: SourceListing`, `CanonicalProduct[]` | `MatchEvaluationResult` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/ProductNormalizationService.ts` | `cleanAndNormalizeTitle()`, `normalizeCondition()`, `normalizeAvailability()` | Limpieza de ruido promocional en títulos de eBay, extracción de atributos y estandarización de condición y stock. | `title: string`, `rawCondition: string` | `CleanedTitleResult`, `ConditionNormalized` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/SellerTrustService.ts` | `SellerTrustService.evaluateSellerTrust()` | Evaluación algorítmica de la reputación del vendedor de eBay (rating, review count, positive percentage). | `SellerInputMetrics` | `SellerTrustEvaluation` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/ProductPriceService.ts` | `ProductPriceService.calculatePriceSummary()` | Agrupación y cálculo de "Nuevo desde" y "Usado desde" separando ofertas de eBay y Amazon sin mezclarlas. | `ProductOffer[]` | `ProductPriceSummary` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/bestSourceSelector.ts` | `selectBestSource()`, `selectBestSourceBySeparatedCondition()` | Algoritmo de selección de la mejor fuente comercial considerando costo puesto, fiabilidad de vendedor, condición y frescura. | `SourceOffer[]` | `BestSourceEvaluation` | `calculateInternationalPricing` | Cliente / Browser |
| `frontend/src/services/sourcing/normalizer.ts` | `generateDeduplicationFingerprint()`, `normalizeAndDeduplicateOffers()` | Deduplicación de listings de eBay y Amazon mediante huella digital (UPC, MPN o Brand+Key). | Array de extracciones y ofertas | `NormalizedProduct[]` | Ninguna | Cliente / Browser |
| `frontend/src/services/sourcing/researchPackParser.ts` | `parseResearchPackJson()`, `parseRawUrlsList()`, `parseCsvInput()` | Ingesta de URLs o Research Packs JSON de eBay importados manualmente o vía IA. | JSON string, lista de URLs, CSV | `ParseResult` | `resolveAdapterForUrl` | Cliente / Browser |
| `supabase/functions/sourcing-openai-research/index.ts` | `serve()` | Agente de investigación con GPT-4o para descubrir productos y URLs de eBay (si el modelo los sugiere). | `{query: string}` | Research Pack JSON | OpenAI Responses API | Deno Edge Runtime |
| `supabase/functions/zinc-verify-after-payment/index.ts` | `serve()` | Orquestador de compra post-pago. Enruta URLs de eBay a Zinc `POST /orders`. | `{order_id: string}` | Payload de orden Zinc | Zinc API V2 (`api.zinc.com`) | Deno Edge Runtime |
| `frontend/src/services/sourcing/autopilot/purchasingEngine.ts` | `validatePurchaseRequest()`, `executePurchaseOrder()` | Motor de validación pre-compra de Autopilot (Price Drift, límites financieros y ruteo a orden). | `NormalizedProduct`, `expectedPriceUsd` | `PurchaseValidationResult` | API interna `/api/zinc/create-order` | Cliente / Browser |
| `frontend/src/services/sourcing/autopilot/reconciliationEngine.ts` | `AutopilotReconciliationEngine.runReconciliationCycle()` | Monitor de desvíos que conmuta automáticamente de fuente si un listing de eBay finaliza o cambia drásticamente. | `ReconciliationContext` | `ReconciliationCycleResult` | Ninguna | Cliente / Browser |

---

## 2. CÓMO BUSCA EBAY HOY

### Análisis Concreto
Collectibles **NO cuenta con búsqueda directa por texto contra los servidores de eBay**.

Si un usuario o administrador ingresa al terminal de Sourcing (`SourcingSearchTerminal`) y escribe:
```text
"NECA TMNT"
```
**¿Qué hace el sistema exactamente?**
1. El input de texto en `SourcingSearchTerminal.tsx` (`handleQueryChange`) **NO ejecuta ninguna petición de red hacia eBay ni hacia Zinc**.
2. Actualiza el estado local `filters.searchQuery = 'NECA TMNT'`.
3. El componente `AdminSourcingImport.tsx` ejecuta un `useMemo` sobre la variable de estado `products`, la cual reside **únicamente en la memoria RAM del navegador**.
4. Filtra los productos previamente cargados (que provienen del Research Pack estático inicial `SAMPLE_MCFARLANE_RESEARCH_PACK` o de un archivo JSON / CSV subido manualmente):
   ```typescript
   // AdminSourcingImport.tsx:430-439
   const q = filters.searchQuery.toLowerCase();
   const matchesTitle = prod.title.toLowerCase().includes(q);
   const matchesBrand = prod.brand.toLowerCase().includes(q);
   const matchesChar = prod.character?.toLowerCase().includes(q);
   ```
5. Si el término no coincide con ningún producto del pack cargado en memoria, la UI muestra: *"No se encontraron productos en Sourcing"*.
6. **eBay nunca se entera de la búsqueda**. No hay scraping, no hay llamadas HTTP a la API de eBay ni a Zinc.

### Mecanismos Reales Existentes en el Código:
- **A. Buscar eBay por texto:** **NO IMPLEMENTADO**. No existe endpoint de búsqueda de catálogo para eBay. (Zinc API V2 no soporta búsqueda en eBay; retorna HTTP 422).
- **B. Procesar solamente una URL conocida:** **IMPLEMENTADO**. A través de `SourcingResearchPackModal` (pestaña "Lista de URLs" o "CSV") y `researchPackParser.ts`.
- **C. Procesar un item ID:** **IMPLEMENTADO PARCIALMENTE**. `EbaySourceAdapter.extractProductId` extrae el ID de una URL; `EbayLiveSourceAdapter` acepta `itemId`, pero su resolución falla en Zinc.
- **D. Buscar mediante API oficial de eBay:** **NO IMPLEMENTADO**.
- **E. Usar scraping:** **NO IMPLEMENTADO**. No hay Puppeteer, Playwright ni Cheerio scrapeando `ebay.com` directamente en backend.
- **F. Usar HTML parsing:** **NO IMPLEMENTADO**.
- **G. Usar otra fuente (OpenAI Research):** **IMPLEMENTADO**. La Edge Function `sourcing-openai-research` le pide a GPT-4o sugerir productos con URLs. El modelo puede inventar o recuperar URLs de eBay basándose en su entrenamiento o en `web_search_preview`.
- **H. Combinar varios mecanismos:** El único flujo operativo para eBay hoy es:
  `URL manual / Research Pack JSON / OpenAI Research` ➔ `EbaySourceAdapter` ➔ `Deduplicación & Normalización en memoria`.

---

## 3. API EBAY

Inspección de las APIs oficiales de eBay en todo el repositorio:

| Componente API | Presencia en Código | Credenciales / Secretos | Estado |
| :--- | :---: | :---: | :---: |
| **eBay Browse API** (`api.ebay.com/buy/browse/v1`) | NO | No existen variables de entorno | `NOT_CONFIGURED` / `NOT_USED` |
| **eBay Finding API** (`svcs.ebay.com/services/search/FindingService`) | NO | No existen variables de entorno | `NOT_CONFIGURED` / `NOT_USED` |
| **eBay Inventory API** (`api.ebay.com/sell/inventory/v1`) | NO | No existen variables de entorno | `NOT_CONFIGURED` / `NOT_USED` |
| **eBay Feed API** | NO | No existen variables de entorno | `NOT_CONFIGURED` / `NOT_USED` |
| **eBay Buy APIs (Order / Checkout)** | NO directo | Operado exclusivamente vía Zinc | `NOT_CONFIGURED` directo / `NOT_USED` |
| **eBay OAuth 2.0 (Client Credentials / Refresh)** | NO | Ningún token o secret configurado | `NOT_CONFIGURED` |

### Clasificación de Variables:
- `EBAY_API_KEY`: `NOT_CONFIGURED`
- `EBAY_CLIENT_ID`: `NOT_CONFIGURED`
- `EBAY_CLIENT_SECRET`: `NOT_CONFIGURED`
- `EBAY_DEV_ID`: `NOT_CONFIGURED`
- `EBAY_AUTH_TOKEN`: `NOT_CONFIGURED`

**Conclusión:** Collectibles 2026 **no tiene ninguna relación directa ni contrato de API con eBay Developers Program**. Todo el tráfico hacia eBay depende conceptualmente de Zinc API o de la ingesta de URLs en frontend.

---

## 4. URL / REGEX ADAPTER

El adaptador de URL de eBay está implementado en [`frontend/src/services/sourcing/adapters/EbaySourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/EbaySourceAdapter.ts):

### 4.1. Detección de Dominio
```typescript
matchesUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('ebay.com') || lower.includes('ebay.to');
}
```
- **Acepta:** Cualquier URL que contenga la subcadena `ebay.com` o `ebay.to`.
- **Dominios internacionales:** URLs como `ebay.es`, `ebay.co.uk`, `ebay.de` **NO son detectadas** porque no contienen `ebay.com` ni `ebay.to`. Retornan `false` y caen por descarte al fallback predeterminado (`amazonSourceAdapter`).

### 4.2. Extracción de Item ID
```typescript
extractProductId(url: string): string | null {
  if (!url) return null;
  // Patrón 1: /itm/123456789012 o /itm/item-title/123456789012
  const itemMatch = url.match(/\/itm\/(?:[^\/]+\/)?(\d{9,14})/i);
  if (itemMatch && itemMatch[1]) return itemMatch[1];

  // Patrón 2: ?item=123456789012
  const queryMatch = url.match(/[?&]item=(\d{9,14})/i);
  if (queryMatch && queryMatch[1]) return queryMatch[1];

  return null;
}
```

### 4.3. Casos Extremos Auditados
1. **URLs móviles (`m.ebay.com/itm/123456789012`):** Soportadas. Contienen `ebay.com` y cumplen el regex `/\/itm\/...`.
2. **URLs acortadas (`ebay.to/xyz`):** `matchesUrl` retorna `true`, pero `extractProductId` **retorna `null`** porque la URL acortada no tiene la estructura `/itm/(\d+)`. Al fallar, genera un ID sintético: `'EBAY-' + Math.random().toString(36)...`.
3. **Parámetros de tracking (`?_trkparms=...&hash=item...`):** Soportados. El regex no es greedy y se detiene tras los 9-14 dígitos del número de item.
4. **Variaciones (`?var=987654321`):** El regex **ignora completamente el parámetro `var=`**. Solo extrae el listing principal, perdiendo la selección de la variante específica.
5. **Listings finalizados:** El regex extrae el ID numérico exactamente igual; el adapter no tiene capacidad de saber si el listing está activo o finalizado.
6. **¿Sirve para sourcing masivo?** **NO**. Solo procesa URLs individuales conocidas provistas de forma manual o en research packs.

---

## 5. PRODUCT DATA

Análisis forense de dónde obtiene Collectibles los datos de un listing real de eBay cuando solo se introduce su URL:

| Campo | Valor Obtenido si solo hay URL | Fuente Real | Comportamiento en Código |
| :--- | :--- | :---: | :--- |
| **`item ID`** | `324123456789` | `REGEX` | Extraído de la URL por `EbaySourceAdapter.extractProductId`. |
| **`title`** | `"eBay Item 324123456789"` | `DERIVED / FALLBACK` | `input.title \|\| input.raw?.title \|\| 'eBay Item ' + itemId`. |
| **`subtitle`** | `null` | `UNKNOWN` | No existe en el modelo. |
| **`brand`** | `undefined` | `DERIVED` | Ingerido de metadata si existe o inferido del título por `inferProductMetadata()`. |
| **`license`** | `undefined` | `DERIVED` | Inferido de palabras clave del título por `inferProductMetadata()`. |
| **`series / line`** | `undefined` | `DERIVED` | Solo si viene en Research Pack JSON. |
| **`product line`** | `undefined` | `DERIVED` | Solo si viene en Research Pack JSON. |
| **`price`** | `$19.99` USD | `DERIVED / HARDCODED` | `Number(input.price ?? input.raw?.price ?? 19.99)` en línea 38. |
| **`currency`** | `"USD"` | `HARDCODED` | Siempre `'USD'` en línea 50. |
| **`condition`** | `"new"` | `DERIVED / HARDCODED` | `input.raw?.condition \|\| 'new'` en línea 54. |
| **`condition description`**| `null` | `UNKNOWN` | No soportado. |
| **`seller`** | `"Top Rated eBay Seller"` | `HARDCODED` | `input.seller \|\| input.raw?.seller \|\| 'Top Rated eBay Seller'`. |
| **`seller feedback`** | `null` / `85` | `HARDCODED` | Reliability score predeterminado en 85. |
| **`seller feedback %`** | `null` | `UNKNOWN` | No capturado. |
| **`seller sales count`** | `null` | `UNKNOWN` | No capturado. |
| **`shipping cost`** | `$5.99` USD | `DERIVED / HARDCODED` | `Number(input.shipping ?? input.raw?.shipping ?? 5.99)` en línea 40. |
| **`shipping origin`** | `null` | `UNKNOWN` | No capturado. |
| **`delivery estimate`**| `"4-7 días (USA)"` | `HARDCODED` | Línea 57 de `EbaySourceAdapter.ts`. |
| **`stock`** | `5` | `HARDCODED` | Línea 73 de `EbaySourceAdapter.ts`. |
| **`quantity available`** | `null` | `UNKNOWN` | No capturado en runtime. |
| **`quantity sold`** | `null` | `UNKNOWN` | No capturado. |
| **`images`** | Foto de Unsplash genérica | `HARDCODED` | URL de Unsplash (`photo-1607604276583-eef5d076aa5f`) en línea 55. |
| **`UPC / EAN / GTIN`** | `null` | `UNKNOWN` | Solo si fue incluido en el JSON de entrada. |
| **`MPN`** | `null` | `UNKNOWN` | Solo si fue incluido en el JSON de entrada. |
| **`SKU`** | `null` | `UNKNOWN` | Generado canónicamente a posteriori. |
| **`category`** | `"Action Figures"` | `DERIVED` | Inferred por `cleanAndNormalizeTitle()`. |
| **`variation`** | `null` | `UNKNOWN` | No parseado de la URL. |
| **`scale`** | `7"` | `DERIVED` | Inferido por palabras clave en `inferProductMetadata()`. |
| **`edition`** | `"Standard"` | `DERIVED` | Inferred por defecto si no contiene "Deluxe" o "Exclusive". |

> [!CRITICAL]
> **Conclusión sobre la Calidad de Datos:** Si un operador simplemente pega una URL de eBay en el sistema, **el adapter no scrapea eBay ni invoca una API**. Rellena el precio con \$19.99, el envío con \$5.99, el stock con 5, el vendedor con "Top Rated eBay Seller" y la imagen con un placeholder de Unsplash. La única forma de tener datos reales de eBay en el estado actual es ingresarlos manualmente mediante un JSON estructurado de Research Pack.

---

## 6. NUEVO VS USADO

### 6.1. Normalización de Condición
En [`ProductNormalizationService.ts:198-216`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/ProductNormalizationService.ts):
```typescript
static normalizeCondition(rawCondition?: string): ConditionNormalized {
  if (!rawCondition) return 'UNKNOWN';
  const lower = rawCondition.toLowerCase().trim();

  if (lower.includes('brand new') || lower.includes('new') || lower.includes('nuevo') || lower === 'n') return 'NEW';
  if (lower.includes('refurbished') || lower.includes('renewed') || lower.includes('reacondicionado')) return 'REFURBISHED';
  if (lower.includes('open box') || lower.includes('open-box') || lower.includes('caja abierta')) return 'OPEN_BOX';
  if (lower.includes('used') || lower.includes('pre-owned') || lower.includes('usado') || lower.includes('second hand')) return 'USED';
  return 'UNKNOWN';
}
```
- **Condiciones mapeadas correctamente:** `NEW`, `USED`, `OPEN_BOX`, `REFURBISHED`, `UNKNOWN`.
- **Condiciones no contempladas explícitamente:** `DAMAGED`, `INCOMPLETE`, `FOR PARTS`, `LIKE NEW`. Estas caen bajo `USED` (por contener `used` o `pre-owned`) o terminan en `UNKNOWN`.

### 6.2. Separación Comercial: "Nuevo desde" vs "Usado desde"
En [`ProductPriceService.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/ProductPriceService.ts) y [`bestSourceSelector.ts:216-252`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/bestSourceSelector.ts):
- La función `groupOffersByCondition()` segrega estrictamente las ofertas en dos grupos independientes:
  - `newOffers`: `NEW` y `OPEN_BOX`
  - `usedOffers`: `USED` y `REFURBISHED`
- Calcula `newFromUsdMin` y `usedFromUsdMin` de forma independiente.
- **Protección contra contaminación de precios:** En `bestSourceSelector.ts` (líneas 125-133), una oferta usada recibe una penalización de **-150 puntos** en su score de selección, mientras que una nueva recibe una bonificación de **+200 puntos**.
- Una oferta usada extremadamente barata de eBay (ej. \$10 USD) **NO se selecciona como `bestOffer` principal** si existe una oferta nueva disponible (ej. Amazon \$25 USD), protegiendo el catálogo de autopublicar items usados sin intención.

---

## 7. VENDEDOR

### 7.1. Información Existente
El modelo de datos cuenta con la tabla `source_sellers` y la clase `SellerTrustService`:
- `seller_name`
- `rating` (normalizado 0-100)
- `rating_count` (cantidad de ventas/reviews)
- `positive_percentage`
- `sold_by_retailer_direct` / `fulfilled_by_retailer_direct`
- `seller_status` (`TRUSTED` | `ACCEPTABLE` | `RISKY` | `UNKNOWN`)

### 7.2. Evaluación de Vendedor en Runtime
En [`SellerTrustService.ts:64-90`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/SellerTrustService.ts):
- Vendedor oficial (Amazon / Best Buy): **+45 puntos**.
- Vendedor eBay con positivo >= 98%: **+25 puntos**.
- Vendedor eBay con positivo >= 92%: **+15 puntos**.
- Vendedor eBay con positivo < 85%: **-30 puntos**.
- Ventas / Reviews >= 500: **+15 puntos**.
- Ventas / Reviews < 10: **-20 puntos**.

### 7.3. Respuesta a la Pregunta Obligatoria:
> **¿Hoy un vendedor 99.8% / 20.000 ventas tiene prioridad sobre uno 92% / 15 ventas?**

**SÍ, ALGORÍTMICAMENTE IMPLEMENTADO.**
- **Vendedor A (99.8% / 20.000 reviews):**  
  Puntaje base 50 + 25 (positivo >= 98%) + 15 (volumen >= 500) = **90 puntos (`TRUSTED`)**.  
  En `bestSourceSelector`, `score += sellerReliability * 0.5` le suma **+45 puntos directos** al ranking de la oferta.
- **Vendedor B (92.0% / 15 reviews):**  
  Puntaje base 50 + 15 (positivo >= 92%) - 10 (penalización reviews < 100) = **55 puntos (`RISKY`)**.  
  En `bestSourceSelector`, solo suma **+27.5 puntos**.

**Sin embargo, en el estado actual:** Esta lógica solo se ejecuta si los datos del vendedor vienen en un JSON de Research Pack. Si se utiliza el adapter directo por URL, el vendedor siempre es el mock estático `"Top Rated eBay Seller"` con `reliability_score: 85`.

---

## 8. SHIPPING USA

### 8.1. Cálculo de Flete hacia Casillero Miami
La fórmula aplicada en Collectibles es:
$$\text{Acquisition Cost USA} = \text{Precio Item} + \text{Shipping Seller } \to \text{ Miami}$$

- **Comportamiento en Sourcing:**
  - Si el item proviene de un Research Pack JSON, toma el valor numérico especificado en el campo `shipping` o `usa_shipping_usd`.
  - Si se procesa una URL cruda de eBay, `EbaySourceAdapter.parseOfferFromInput` **hardcodea el flete doméstico en \$5.99 USD**.
  - Si se consulta `sourcing-retailer-live-check`, intenta leer `data.buy_box?.shipping_cost`, pero como Zinc retorna 422 para eBay, cae en fallback.
- **Casillero Destino Real:**
  - Código en [`_shared/zinc/orders.ts:25-34`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/orders.ts):
    - **Ciudad:** Miami
    - **Estado:** FL
    - **ZIP:** `33101` (o código postal del courier asociado)
    - **País:** US

---

## 9. FREE SHIPPING

El tratamiento de las modalidades de flete en eBay se divide en:
- **`FREE SHIPPING`:** `domestic_shipping = 0`. No se añade recargo en USA.
- **`PAID SHIPPING`:** `domestic_shipping > 0`. Se suma íntegramente a la base imponible del Landed Cost.
- **`LOCAL PICKUP`:** **NO IMPLEMENTADO**. Si un listing de eBay es de retiro local exclusivo, el adapter no lo detecta y asume flete de \$5.99.
- **`UNKNOWN SHIPPING`:** En `EbaySourceAdapter`, el operador `??` asigna el valor seguro de **\$5.99 USD** ante valores nulos o indefinidos. **Nunca se interpreta como \$0**.
- **`INTERNATIONAL SHIPPING`:** No se utiliza flete internacional directo desde el vendedor hacia Uruguay; todo se consolida en Miami.

---

## 10. STOCK / QUANTITY

- **Detección de Disponibilidad:**
  - `EbaySourceAdapter`: Asigna por defecto `availability: 'in_stock'` y `stock: 5`.
  - `EbayLiveSourceAdapter`: Si el Live Check falla (como ocurre hoy ante Zinc), retorna de forma forzada:
    `availability: 'out_of_stock'`, `price: 0`, `status: 'ERROR'`.
- **Estados soportados en modelo:** `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `PREORDER`, `BACKORDER`, `UNKNOWN`.
- **Detección de `LAST_ONE` o `QUANTITY_N`:** Soportado conceptualmente en `normalizeAvailability()` (si `stock_quantity <= 3` pasa a `LOW_STOCK`), pero no hay scraper leyendo esta etiqueta del HTML de eBay.
- **TTL de Caché:** 10 minutos (`price_valid_until`). Vencido este plazo, la función `zinc-live-check-before-payment` rechaza la compra si no hay re-verificación viva.

---

## 11. AUCTIONS (SUBASTAS)

> [!WARNING]
> **VULNERABILIDAD IDENTIFICADA EN SUBASTAS**
> En el estado actual del código:
> - **NO EXISTE FILTRO DE SUBASTAS**.
> - Ni `EbaySourceAdapter` ni `researchPackParser` diferencian si una URL de eBay corresponde a un listing de tipo **`BUY IT NOW`**, **`AUCTION`** o **`AUCTION WITH BUY IT NOW`**.
> - Si un usuario importa una URL de una subasta activa con una puja actual de \$5.00 USD, el adapter toma \$5.00 USD como `price`.
> - El sistema calculará el precio de venta en Uruguay sobre esos \$5.00 USD hipotéticos.
> - **Purchasing fallaría catastróficamente** si intentara comprar una subasta con `POST /orders`, ya que Zinc solo ejecuta compras directas de carrito ("Buy It Now").

---

## 12. BEST OFFER

- **Tratamiento Actual:** El sistema **ignora por completo la opción "or Best Offer"**.
- Toma estrictamente el precio de lista (`price` o `Buy It Now`).
- No inventa descuentos hipotéticos ni intenta enviar ofertas a través de la API.
- En Purchasing, Zinc no negocia ofertas; solo compra al precio fijo publicado.

---

## 13. VARIACIONES

- **En Listings de eBay (Multi-Variation Listings):**
  - Si un vendedor agrupa en un solo listing diferentes figuras (ej. Chun-Li, Ryu, Ken) con un selector desplegable, la URL base `/itm/123456789` no contiene la variante elegida salvo en el parámetro `?var=`.
  - `EbaySourceAdapter.extractProductId` **descarta el parámetro `var=`**.
- **En el Motor de Matching (`ProductMatchingEngine.ts`):**
  - Existe la regla `checkVariantConflict()`.
  - Si el listing tiene título que indica "Player 2" o "Blue Version" y el producto canónico es "Player 1" o "Standard", el motor **bloquea la vinculación** y arroja `hasConflict: true`, evitando que variantes comerciales se fusionen incorrectamente.

---

## 14. BUNDLES Y LOTES

- **Comportamiento Actual:**
  - Palabras como `lot`, `bundle`, `2-pack`, `complete wave`, `set of` **NO forman parte de la lista de exclusión en `ProductNormalizationService`**.
  - Si entra un listing titulado: `"McFarlane DC Multiverse Batman & Superman 2-Pack"`, el normalizador extraerá `brand = 'McFarlane Toys'` y `character = 'Batman'` (primera coincidencia).
  - Si no se cuenta con UPC, el deduplicador podría intentar agrupar erróneamente un 2-Pack bajo la figura individual de Batman.
  - **Falta protección explícita para descartar lotes y bundles en eBay.**

---

## 15. MATCHING CON AMAZON

Reconstrucción del pipeline de matching entre una oferta de eBay y un producto de Amazon:

```text
[ eBay Listing ]                                 [ Amazon Listing ]
       |                                                 |
       v                                                 v
[ EbaySourceAdapter ]                             [ AmazonSourceAdapter ]
       |                                                 |
       v                                                 v
[ ProductNormalizationService ]                   [ ProductNormalizationService ]
       |                                                 |
       +-----------------------+-------------------------+
                               |
                               v
               [ ProductMatchingEngine.evaluateMatch ]
                               |
       +-----------------------+-----------------------+
       | NIVEL 1: UPC / EAN / GTIN idéntico?           | ---> Confianza: 1.00 (EXACT)
       | NIVEL 2: Brand + MPN idéntico?                | ---> Confianza: 0.95 (HIGH)
       | NIVEL 3: Brand + Franchise + Char + Scale?    | ---> Confianza: 0.88 (HIGH)
       | NIVEL 4: Similaridad Jaccard >= 80%?          | ---> Confianza: 0.75-0.80 (REVIEW_REQUIRED)
       +-----------------------------------------------+
                               |
                               v
                     [ Canonical Product ]
```

### Respuesta Concreta:
> **¿Cómo sabe Collectibles que Amazon "McFarlane DC Multiverse Batman XYZ" y eBay "Batman XYZ McFarlane 7\" New Sealed" son el mismo producto?**

1. **Paso 1 (Limpieza de Ruido):** `ProductNormalizationService.cleanAndNormalizeTitle` remueve `"New Sealed"` del título de eBay y extrae atributos estructurados: `brand = 'McFarlane Toys'`, `character = 'Batman XYZ'`, `scale = '7"'`.
2. **Paso 2 (Identificadores):** Si ambos listings cuentan con el código de barras UPC (ej. `787926151405`), la coincidencia es inmediata en **Nivel 1** con confianza 1.00.
3. **Paso 3 (Datos Estructurados):** Si no hay UPC pero coinciden `Brand`, `Character` y `Scale` sin conflicto de variantes, el motor empareja en **Nivel 3** con un score de **0.88**.
4. **Paso 4 (Consolidación):** Ambas ofertas se registran en la tabla `product_offers` asociadas al mismo `canonical_product_id`.

---

## 16. FALSOS MATCHES

Matriz de validación conceptual contra falsos matches:

| Caso de Prueba | ¿Protegido en Código? | Mecanismo de Defensa | Resultado |
| :--- | :---: | :--- | :--- |
| **Misma figura diferente color (Player 1 vs 2)** | SÍ | `checkVariantConflict` verifica strings de variante en atributos. | Rechaza match automático; crea producto separado. |
| **Regular vs Exclusive (SDCC / Target)** | SÍ | `checkVariantConflict` detecta `exclusive` vs `standard`. | Rechaza match automático; crea producto separado. |
| **Standard vs Chase Variant** | SÍ | `extractAttributesFromTitle` detecta token `chase`. | Clasificado como variante separada. |
| **Single figure vs 2-Pack** | **NO** | No hay parser de packs en el motor de títulos. | **RIESGO DE FALSO POSITIVO**. |
| **New vs Used** | SÍ | Separación de ofertas en `ProductPriceService` y `bestSourceSelector`. | Coexisten en el mismo producto canónico pero en tracks separados. |
| **Edición Internacional vs USA** | PARCIAL | Si el UPC es diferente, no se unen en Nivel 1. | Si no hay UPC, podrían unirse por texto. |
| **Reissue / Reedición** | **NO** | No hay parser de año de relanzamiento en títulos. | Se fusionan en el mismo producto canónico. |
| **Damaged Box (Caja rota)** | **NO** | No se filtra el término en la normalización. | Se trata como una oferta normal. |
| **Loose Figure (Figura suelta sin caja)**| **NO** | Cae como `USED` general si tiene la palabra used. | Podría mezclarse con figuras usadas en caja. |

---

## 17. MULTIPLE EBAY LISTINGS

Si existen 20, 50 o 100 listings de eBay para el mismo producto:
1. **Deduplicación:** `normalizer.ts:normalizeAndDeduplicateOffers` agrupa todas las ofertas bajo un mismo fingerprint (`UPC_...` o `NORM_...`). **NO crea 100 productos canónicos**.
2. **Selección del Ganador:** `bestSourceSelector.ts` evalúa las 100 ofertas y selecciona una única `bestOffer` según la función de puntuación (menor landed cost + alta reputación de vendedor + stock).
3. **Métricas Agregadas:** `ProductPriceService.calculatePriceSummary` calcula:
   - `lowest_new_price`
   - `lowest_used_price`
   - `average_new_price`
   - `median_new_price`
   - `number_of_new_offers` y `number_of_used_offers`

---

## 18. EBAY → SOURCING SCORE

Señales de eBay que ingresan efectivamente a los motores de decisión:

- **Opportunity Score (`opportunityScoringEngine.ts`):**
  - Margen porcentual proyectado.
  - Utilidad neta absoluta en USD.
  - `sellerTrustScore` (reputación del vendedor de la mejor oferta).
  - Disponibilidad de stock (`inStock`).
  - Verificación de autenticidad (`isOfficialVerified`).
- **Risk Score (`ecosystemOrchestrator.ts`):**
  - Fiabilidad del vendedor (`reliability_score < 80` marca riesgo `HIGH`).
  - Estado de autenticidad (`authenticity.status !== 'VERIFIED_OFFICIAL'` marca `BLOCKED`).
  - Margen financiero (`realCost >= finalPrice` marca `BLOCKED`).
- **Demand Signals:**
  - Actualmente, **ninguna señal nativa de eBay** (como `watchCount`, `soldCount` o `viewCount`) ingresa al Demand Score porque el adapter no las extrae.

---

## 19. EBAY → IMPORT ENGINE

Seguimiento financiero completo de un listing de eBay a través del Import Engine ([`internationalPricing.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/internationalPricing.ts)):

```text
[ Precio Listing eBay (ej. $30.00 USD) ]
                  +
[ Flete Doméstico USA (ej. $5.99 USD hacia Miami) ]
                  =
[ Base Imponible USA: $35.99 USD ]
                  +
[ Impuesto Estatal USA (Sales Tax FL 0% Casillero Exento / 7% según regla) ]
                  +
[ Zinc Platform Fee: $1.00 USD ]
                  +
[ Costo Financiero Internacional: 2.5% + $0.50 USD + IVA ]
                  +
[ Flete Courier Miami -> Montevideo (Urubox base según peso) ]
                  =
[ COSTO REAL PUESTO EN URUGUAY (Landed Cost) ]
                  +
[ Margen de Ganancia Collectibles (mínimo $3.99 USD) ]
                  =
[ PRECIO SUGERIDO DE VENTA FINAL URUGUAY (USD / UYU al tipo de cambio oficial) ]
```
El pipeline financiero respeta estrictamente la inclusión del flete doméstico de eBay en el costo puesto (`pricing.realCost`), evitando vender a pérdida por omisión de envío.

---

## 20. EBAY PURCHASING — ARQUITECTURA

> [!CRITICAL]
> **ANÁLISIS FORENSE DEL ENDPOINT DE PURCHASING**
> Se auditó el código de [`supabase/functions/zinc-verify-after-payment/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts):

1. **Bug Crítico de Retailer Hardcoded:**  
   En la línea 154 de `zinc-verify-after-payment/index.ts`:
   ```typescript
   const url = `https://api.zinc.com/products/${prod.external_product_id}?retailer=amazon`;
   ```
   **El pre-check de compra tiene `retailer=amazon` escrito a fuego en el código**.  
   Si una orden proviene de un producto de eBay, la función intenta consultar el Item ID numérico de eBay contra la API de Amazon en Zinc, lo cual arroja un error 404/422 y cancela la compra enviándola a `manual_review`.
2. **Payload de Creación de Orden en Zinc:**  
   Si se superara el pre-check, en la línea 265 se construye el payload para `POST https://api.zinc.com/orders`:
   ```typescript
   const zincRequestPayload: ZincOrderCreatePayload = {
     products: [{
       url: prod.product_url_external, // ej. "https://www.ebay.com/itm/324123456789"
       quantity: Math.max(1, item.quantity || 1)
     }],
     shipping_address: zincShippingAddress!,
     max_price: maxPriceCents,
     idempotency_key: idempotencyKey,
     po_number: stablePoNumber,
     metadata: { ... }
   };
   ```
3. Zinc recibe la URL de eBay y detecta el dominio `ebay.com` de forma nativa para enrutar la orden al bot comprador de eBay.

---

## 21. MANAGED ACCOUNT EBAY

- **Configuración en Zinc:** Existe una Managed Account de eBay conectada en la organización de Zinc de Collectibles con forwarding email y autenticación delegada.
- **Selección de Cuenta:** Collectibles no envía `retailer_credentials_id` en el JSON; Zinc selecciona automáticamente la cuenta activa de su pool que coincida con el dominio `ebay.com`.
- **Comportamiento ante Bloqueo / MFA / Error de Login:**
  - Si eBay solicita 2FA/MFA o bloquea la cuenta, Zinc no puede proceder y responde con un código de fallo (`account_locked`, `mfa_required` o `login_failed`).
  - La función `zinc-verify-after-payment` captura el error, marca `purchase_status: 'zinc_failed'` y mueve la orden a `manual_review` para intervención humana.

---

## 22. CARRITO EBAY

- **¿Con qué trabaja Purchasing?**  
  Trabaja exclusivamente con la **URL exacta del listing (`prod.product_url_external`)**.
- **Garantía de Item:**  
  Al enviar `https://www.ebay.com/itm/324123456789`, Zinc navega directamente a la página de ese producto específico en eBay y lo agrega al carrito.

---

## 23. SELLER LOCK

- **¿Zinc compra ese vendedor exacto?**  
  **SÍ**, porque en eBay cada URL de listing pertenece a un vendedor único específico. A diferencia de la Buy Box de Amazon, en eBay no existe un cambio transparente de vendedor bajo la misma URL sin cambiar de item ID.
- **¿Collectibles re-valida el vendedor antes de pagar?**  
  **NO**. Collectibles solo valida el precio máximo permitido (`max_price`). No verifica si la cuenta del vendedor fue suspendida o si el feedback cayó.

---

## 24. CONDITION LOCK

- **¿Se garantiza que no se compre Usado si el cliente pagó Nuevo?**  
  - Puesto que se envía la URL exacta seleccionada durante el Sourcing, si la URL era de un item Nuevo, Zinc intentará comprar ese item Nuevo.
  - **Sin embargo:** En el backend de compra (`zinc-verify-after-payment`), **no existe ninguna aserción explícita de seguridad sobre la condición** (ej. `assert(prod.condition === 'NEW')`). Si por error de catálogo se publicó una URL usada como producto nuevo, el backend intentará comprarla sin alertar.

---

## 25. PRICE LOCK

- **Protección de Variación de Precio:**
  - El payload enviado a Zinc contiene la propiedad obligatoria `max_price: maxPriceCents` (expresada en centavos de dólar).
  - Este valor se calcula dinámicamente en `zinc-verify-after-payment:202`:
    $$\text{maxAmazonPrice} = \frac{\text{paidPriceUsd} - \text{usaShipping} - \text{zincFee} - \text{minProfit} - \text{feeFloor}}{1.0305}$$
  - Si al momento del checkout en eBay el precio del producto subió y supera `max_price`, **Zinc cancela la compra síncronamente** con error `max_price_exceeded`.

---

## 26. SHIPPING LOCK

- **Protección contra Costos Ocultos de Flete:**
  - En la API de Zinc, el parámetro `max_price` representa el **costo total máximo de la orden** (producto + flete doméstico + impuestos estatales).
  - Si un vendedor de eBay ofrecía envío inicial de \$5.99 pero en el checkout aplica \$25.00, el costo total superará `max_price` y la orden será rechazada automáticamente por Zinc sin debitar fondos.

---

## 27. PROFIT PROTECTION

- **Reglas del Motor Canónico:**
  - Ganancia mínima requerida: **\$2.00 USD** (o \$3.99 según configuración de `min_absolute_profit_usd`).
  - Regla estricta `never_sell_at_loss = true`.
- **Condiciones exactas para pase a `manual_review` en eBay:**
  1. Ganancia neta calculada $\le 0$.
  2. Ganancia neta menor a `min_absolute_profit_usd`.
  3. Falla de conexión o timeout con Zinc (`ZINC_TIMEOUT`).
  4. Listing finalizado o sin stock (`OUT_OF_STOCK`).
  5. Variación de precio mayor a `max_price_variation_percent` (5%).
  6. Rechazo de orden en Zinc (`ZINC_REJECTED`).
  7. Bloqueo por Safety Gate de producción (`ZINC_GATE_BLOCKED`).

---

## 28. PAYMENT A EBAY

- **Mecanismo de Pago en Zinc:** **`PREPARED_WALLET`**.
- Collectibles no transmite números de tarjeta de crédito al momento de comprar en eBay. Zinc descuenta el importe de la compra del saldo prepago de la cuenta de la organización (`api.zinc.com`).

---

## 29. DIRECCIÓN DE ENVÍO

- **Destino Físico:** Casillero Courier en **Miami, Florida**.
- **Construcción:** `buildZincAddress()` en `_shared/zinc/orders.ts`.
- **Campos validados:**
  - `first_name` / `last_name`: Nombre del cliente o cuenta corporativa.
  - `address_line1`: Dirección del depósito courier en Miami.
  - `address_line2`: Código identificador de casillero (`UY-XXXXX`).
  - `city`: Miami
  - `state`: FL
  - `zip_code`: `33101`
  - `country`: US
  - `phone_number`: Teléfono de contacto en USA.

---

## 30. AFTER PAYMENT FLOW

```text
[ CLIENTE COMPLETA PAGO EN CHECKOUT (Mercado Pago / dLocal Go) ]
                              |
                              v
             [ Webhook Pasarela: status = 'approved' ]
                              |
                              v
    [ _shared/order-payments.ts: triggerZincVerificationIfNeeded ]
                              |
                              v
     [ Invocación Asíncrona: zinc-verify-after-payment ]
                              |
                              v
           +---------------------------------------+
           | 1. LOCK ATÓMICO EN POSTGRESQL         | ---> Ya tomado? Salir.
           |    claim_international_order_item     |
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 2. LIVE CHECK PRE-COMPRA              | ---> (Actualmente falla por
           |    (Verifica stock y precio en vivo)  |      retailer=amazon hardcoded)
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 3. VERIFICACIÓN DE PROFIT PROTECTION  | ---> Ganancia < Min?
           |    Ganancia neta >= min_profit_usd    |      Mover a manual_review.
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 4. HARD SAFETY GATE                   | ---> Producción desactivada?
           |    assertProductionGate(key, enabled) |      Bloquear con zinc_failed.
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 5. PERSISTENCIA PREVIA DE IDEMPOTENCIA| ---> Guardar idempotency_key
           |    en international_order_items       |      y PO Number en BD.
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 6. POST https://api.zinc.com/orders   | ---> Zinc usa Managed Account
           |    con URL exacta de eBay y max_price |      y compra listing en eBay.
           +---------------------------------------+
                              |
                              v
           +---------------------------------------+
           | 7. ESTADO: zinc_order_created         | ---> Espera de webhook de
           |    Monitoreo durable de tracking      |      despacho hacia Miami.
           +---------------------------------------+
```

---

## 31. IDEMPOTENCIA EBAY

1. **Lock Atómico:** RPC `claim_international_order_item_for_zinc(p_item_id)`. Asegura que si llegan dos webhooks o el usuario hace doble clic, solo una ejecución adquiera el candado.
2. **Idempotency Key Durable:** Se genera un UUID y se escribe en la base de datos **antes** de enviar la solicitud HTTP `POST /orders`.
3. **Manejo de HTTP 409 (`already_exists`):** Si una petición anterior sufrió un timeout pero llegó a Zinc, el reintento responde con HTTP 409 y Zinc devuelve el `identifier` de la orden ya creada. El sistema extrae el identificador existente y continúa sin duplicar cargos.

---

## 32. RESPUESTAS DE EBAY / ZINC

| Código Zinc / eBay | Significado | Estado Interno | Acción del Sistema |
| :--- | :--- | :--- | :--- |
| `already_exists` | Orden previamente aceptada | `zinc_order_created` | Recupera ID y continúa flujo normal. |
| `insufficient_funds` | Saldo agotado en Zinc Wallet | `zinc_failed` | Pasa a `manual_review`; alerta a finanzas. |
| `out_of_stock` / `listing_ended` | Listing finalizado en eBay | `manual_review` | Notifica al Admin para elegir otra fuente o reembolsar. |
| `max_price_exceeded` | Precio o envío subió más del tope | `manual_review` | Frena compra; previene pérdida financiera. |
| `invalid_address` | Dirección en Miami rechazada | `manual_review` | Revisa código de suite `UY-XXXXX`. |
| `account_locked` | Managed Account eBay bloqueada | `zinc_failed` | Alerta urgente al Admin de infraestructura. |
| `mfa_required` | eBay solicita verificación 2FA | `zinc_failed` | Requiere login manual en consola de Zinc. |
| `unsupported_retailer` | Retailer no soportado en catalog | `NOT_CONFIGURED` | Impide live check de catálogo en eBay. |

---

## 33. MANUAL REVIEW

Cuando una compra de eBay es derivada a `manual_review`, el Administrador puede ver en el panel de control:
- Identificador de orden de Collectibles y del cliente.
- Enlace directo a la URL de origen de eBay.
- Vendedor seleccionado y precio original pactado.
- Causa exacta de la falla (ej. `PRICE_CHANGED`, `OUT_OF_STOCK`, `ZINC_REJECTED`).
- Respuesta JSON cruda devuelta por Zinc.
- Opciones de acción: *Reintentar compra*, *Asignar nueva fuente de compra*, o *Emitir reembolso al cliente*.

---

## 34. ORDER STATUS

Estados secuenciales reales definidos en el código:
```text
pending_purchase ➔ zinc_order_created ➔ zinc_processing ➔ purchased ➔ shipped_to_courier ➔ delivered_to_courier
                                                  |
                                                  +--➔ manual_review / zinc_failed
```

---

## 35. TRACKING

- **Recepción:** A través de la Edge Function `zinc-webhook` con verificación HMAC-SHA256 timing-safe.
- **Detección de transportista:** Reconoce tracking de USPS, UPS, FedEx y DHL comúnmente utilizados por vendedores de eBay en USA.
- **Transición:** Cuando el tracking reporta entrega en Miami, el ítem transiciona a `delivered_to_courier`.

---

## 36. RECONCILIATION

- En [`services/sourcing/autopilot/reconciliationEngine.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/autopilot/reconciliationEngine.ts):
  - Monitorea deltas entre el catálogo de Sourcing y los proveedores.
  - Si un listing de eBay finaliza (`ended`) o queda fuera de stock, el motor busca si existe una oferta secundaria activa de Amazon o Best Buy para conmutar la fuente automáticamente.
  - Si la única fuente era eBay y se agota, despublica el producto o lo pasa a revisión.

---

## 37. AUTOPILOT

| Capacidad | Implementado en Código | Estado en Runtime | Observación |
| :--- | :---: | :---: | :--- |
| **AUTO DISCOVER** | SÍ | `DISABLED` | Soportado mediante Catalog Gaps y OpenAI; no corre desatendido en producción. |
| **AUTO ANALYZE** | SÍ | `ENABLED` | Evalúa márgenes, reputación y rentabilidad automáticamente. |
| **AUTO PUBLISH** | SÍ | `DISABLED` | Requiere confirmación manual del Admin en la interfaz. |
| **AUTO PURCHASE** | SÍ | `STRICTLY_BLOCKED` | Bloqueado por las 5 barreras de seguridad y `assertProductionGate`. |

---

## 38. RIESGOS ESPECÍFICOS EBAY

| Riesgo Operativo | Nivel de Riesgo | ¿Mitigado Actualmente? | Mecanismo Existente / Faltante |
| :--- | :---: | :---: | :--- |
| **Seller Fraud (Estafas de vendedor)** | ALTO | PARCIAL | `SellerTrustService` penaliza ratings bajos, pero no hay bloqueo estricto si no hay datos. |
| **Item Usado comprado por Nuevo** | ALTO | PARCIAL | `bestSourceSelector` separa tracks, pero falta aserción estricta en el backend pre-compra. |
| **Wrong Variation (Variante equivocada)** | CRÍTICO | **NO MITIGADO EN URL** | `EbaySourceAdapter` descarta el parámetro `?var=`. |
| **Auction inadvertida (Subasta)** | ALTO | **NO MITIGADO** | El adapter no valida si el listing es Buy It Now o subasta. |
| **Shipping Surprise (Flete inflado)** | MEDIO | SÍ | `max_price` en Zinc previene compras con sobreprecio de flete. |
| **Listing finalizado antes de compra** | MEDIO | SÍ | Zinc rechaza la orden y el ítem pasa a `manual_review`. |
| **Bootlegs / Falsificaciones** | CRÍTICO | SÍ | `authenticityGate.ts` bloquea palabras clave de knockoffs y bootlegs. |
| **Caja dañada / Sin accesorios** | MEDIO | **NO MITIGADO** | No hay parser de descripciones que detecte "damaged box" o "incomplete". |
| **Vendedor internacional demorado** | MEDIO | **NO MITIGADO** | No se valida el país de origen del vendedor (ej. envíos desde China de 30 días). |

---

## 39. PRUEBAS READ-ONLY

Resultados forenses de las pruebas de lectura ejecutadas contra las interfaces de eBay:

1. **Prueba de Catalog Lookup en Zinc API V2:**  
   `GET https://api.zinc.com/products/112233445566?retailer=ebay` con API Key de producción (`zn_live_••••••••3pmU`).  
   **Resultado:** **HTTP 422 Unprocessable Entity**.  
   `{"message": "unsupported retailer 'ebay': use amazon, walmart, bestbuy, etsy, or a Shopify store's domain"}`.  
   *Evidencia:* Zinc V2 no posee scraper de catálogo para eBay.
2. **Prueba de Edge Function `sourcing-retailer-live-check`:**  
   Invocación con `{ product_id: "324123456789", retailer: "ebay" }`.  
   **Resultado:** Retorna `data_source: 'NOT_CONFIGURED'`, `live_check_available: false`.
3. **Prueba de `EbayLiveSourceAdapter` en Frontend:**  
   Invocación de `resolveLiveItem({ itemId: "324123456789" })`.  
   **Resultado:** Retorna `createFallbackItem()` con `status: 'ERROR'`, `availability: 'out_of_stock'`.
4. **Base de Datos de Producción (`international_products`):**  
   Consulta SQL `SELECT count(*), source_retailer FROM international_products GROUP BY source_retailer;`  
   **Resultado:** 8 productos, **100% de Amazon**, **0 productos de eBay**.

---

## 40. MATRIZ FINAL

| Componente | Implementado | Runtime | Estado | Evidencia en Código |
| :--- | :---: | :---: | :---: | :--- |
| **EBAY SEARCH** | NO | NO | `NOT_IMPLEMENTED` | Sin endpoint de búsqueda de texto contra eBay. |
| **EBAY URL PARSER** | SÍ | SÍ | `OPERATIVE_LOCAL` | `EbaySourceAdapter.ts:7-25` (Regex de dominios e IDs). |
| **EBAY PRODUCT LOOKUP** | PARCIAL | SÍ | `FALLBACK_ONLY` | Retorna datos estáticos / Unsplash si no viene en JSON. |
| **EBAY PRICE** | PARCIAL | SÍ | `STATIC_INPUT` | Lee de JSON de entrada o asigna \$19.99 por defecto. |
| **EBAY STOCK** | PARCIAL | SÍ | `STATIC_INPUT` | Asigna 5 unidades por defecto. |
| **EBAY CONDITION** | SÍ | SÍ | `OPERATIVE` | `ProductNormalizationService.ts:198` (NEW vs USED). |
| **EBAY SELLER** | PARCIAL | SÍ | `OPERATIVE_RULES` | `SellerTrustService.ts:18` (Reglas listas, datos estáticos). |
| **EBAY SELLER REPUTATION** | SÍ | SÍ | `OPERATIVE_RULES` | Scoring determinístico 0-100 implementado. |
| **EBAY SHIPPING** | SÍ | SÍ | `OPERATIVE_RULES` | Flete USA normalizado hacia Miami (`_shared/pricing.ts`). |
| **EBAY AUCTIONS** | NO | NO | `NOT_IMPLEMENTED` | No discrimina subastas de Buy It Now. |
| **EBAY BEST OFFER** | NO | NO | `IGNORED` | Toma sticker price; no hace ofertas. |
| **EBAY VARIATIONS** | PARCIAL | SÍ | `BLOCKED_ON_URL` | MatchingEngine protege variantes; URL adapter no extrae `var=`. |
| **EBAY BUNDLES** | NO | NO | `NOT_IMPLEMENTED` | Falta detector de lotes y 2-packs. |
| **EBAY MATCHING** | SÍ | SÍ | `OPERATIVE` | `ProductMatchingEngine.ts:25` (Jerarquía de 4 niveles). |
| **EBAY IMPORT ENGINE** | SÍ | SÍ | `OPERATIVE` | `internationalPricing.ts` (Landed cost completo). |
| **EBAY SOURCING SCORE** | SÍ | SÍ | `OPERATIVE` | `opportunityScoringEngine.ts` (Score 0-100). |
| **EBAY ZINC PURCHASING** | SÍ | NO | `BLOCKED_BY_GATE` | `zinc-verify-after-payment` (Payload V2 listo, gates activos). |
| **EBAY MANAGED ACCOUNT** | SÍ | SÍ | `CONFIGURED_IN_ZINC` | Dashboard Zinc con forwarding email activo. |
| **EBAY PRICE PROTECTION** | SÍ | SÍ | `OPERATIVE` | `max_price` en centavos limita cargo total. |
| **EBAY CONDITION PROTECTION**| PARCIAL | SÍ | `UNVERIFIED_BACKEND`| Falta assert de condición en backend de compras. |
| **EBAY SHIPPING PROTECTION** | SÍ | SÍ | `OPERATIVE` | Flete incluido en tope de `max_price`. |
| **EBAY IDEMPOTENCY** | SÍ | SÍ | `OPERATIVE` | Atomic claim RPC + UUID previo + HTTP 409 handling. |
| **EBAY TRACKING** | SÍ | SÍ | `OPERATIVE` | `zinc-webhook` HMAC-SHA256 con soporte multi-carrier. |
| **EBAY WEBHOOK** | SÍ | SÍ | `OPERATIVE` | Ingesta durable con deduplicación por hash. |
| **EBAY RECONCILIATION** | SÍ | SÍ | `OPERATIVE` | `reconciliationEngine.ts` conmuta fuentes si listing expira. |
| **EBAY AUTOPILOT** | SÍ | PARCIAL | `ANALYZE_ONLY` | Análisis activo; publicación y compra automática bloqueadas. |

---

## 41. DIAGRAMAS REALES

### Diagrama A — Flujo Real de SOURCING
```text
[ Administrador / Usuario ]
             |
             +---> Escribe en SourcingSearchTerminal: "NECA TMNT"
             |     (Filtra array en memoria RAM del navegador. CERO llamadas a eBay)
             |
             +---> Pega URL de eBay o sube Research Pack JSON
                   (Ej: https://www.ebay.com/itm/324123456789)
                               |
                               v
                     [ EbaySourceAdapter ]
                               |
                               +---> Regex extrae Item ID: "324123456789"
                               +---> Si falta data: Precio $19.99, Flete $5.99, Foto Unsplash
                               +---> Status: RESEARCH_ONLY
                               |
                               v
             [ ProductNormalizationService & Fingerprint ]
                               |
                               +---> Limpia ruido ("Brand New", "NIB", "Free Shipping")
                               +---> Extrae Atributos: Brand, Character, Scale, Edition
                               +---> Normaliza Condición: NEW / USED / OPEN_BOX
                               +---> Genera Fingerprint: UPC_... o NORM_...
                               |
                               v
               [ ProductMatchingEngine (4 Niveles) ]
                               |
                               +---> Nivel 1: UPC / EAN idéntico (1.00)
                               +---> Nivel 2: MPN + Brand idéntico (0.95)
                               +---> Nivel 3: Atributos Estructurados (0.88)
                               +---> Nivel 4: Jaccard Similaridad >= 80% (0.80)
                               |
                               v
                 [ Canonical Product Creado / Enlazado ]
                               |
                               v
              [ Import Engine: internationalPricing ]
                               |
                               +---> Costo Item + Flete USA ($5.99) + Courier + Fees
                               +---> Calcula Landed Cost UY y Precio Sugerido
                               |
                               v
              [ Opportunity & Risk Scoring Engine ]
                               |
                               +---> Opportunity Score (0-100)
                               +---> Risk Evaluation (Confiabilidad vendedor, margen)
                               |
                               v
                  [ Catálogo Sourcing Listo en UI ]
```

### Diagrama B — Flujo Real de PURCHASING (Bloqueado por Seguridad)
```text
[ Cliente Paga en Checkout de Collectibles.uy ]
                       |
                       v
         [ Webhook de Pago: 'approved' ]
                       |
                       v
   [ Invocación: zinc-verify-after-payment ]
                       |
                       v
   [ 1. Lock Atómico DB: claim_international_order_item ]
                       |
                       v
   [ 2. Live Check Pre-Compra ]
   (BUG CRÍTICO: Consulta retailer=amazon con ID de eBay -> Falla y pasa a manual_review)
                       |
                       v (Si se corrigiera el bug de retailer):
   [ 3. Verificación de Ganancia Mínima (min_profit_usd) ]
                       |
                       v
   [ 4. HARD SAFETY GATE: assertProductionGate ]
   (BLOQUEO OBLIGATORIO: zinc_production_enabled = false -> Frena compra)
                       |
                       v (Solo en caso de activación futura autorizada):
   [ 5. Persistencia Previa de Idempotency Key y PO Number ]
                       |
                       v
   [ 6. POST https://api.zinc.com/orders ]
        - URL: "https://www.ebay.com/itm/324123456789"
        - Max Price en centavos (Protección de Costo Total)
        - Dirección: Casillero Miami FL 33101 (Suite UY-XXXXX)
                       |
                       v
   [ 7. Zinc detecta ebay.com y asigna Managed Account del pool ]
                       |
                       v
   [ 8. Bot de Zinc realiza Checkout en eBay con Prepaid Wallet ]
                       |
                       v
   [ 9. Webhook con HMAC-SHA256: tracking number del transportista ]
                       |
                       v
   [ 10. Entrega en Casillero Miami: delivered_to_courier ]
```

---

## 42. 25 RESPUESTAS OBLIGATORIAS

### 1. ¿Cómo encuentra hoy Collectibles productos de eBay?
No los encuentra de forma autónoma ni mediante búsquedas en tiempo real. Los productos de eBay ingresan exclusivamente cuando un administrador pega una URL de eBay de forma manual, importa un archivo JSON de Research Pack o importa un archivo CSV.

### 2. ¿Puede buscar por texto o solamente importar URLs?
Solamente puede importar URLs o procesar JSONs estructurados. El buscador por texto en la interfaz únicamente filtra los productos que ya están cargados en la memoria RAM del navegador.

### 3. ¿Usa API oficial eBay?
No. No existe ninguna integración con la API oficial de eBay (Browse, Finding, Inventory, Buy, etc.) ni credenciales de desarrollador de eBay registradas en el proyecto.

### 4. ¿Usa scraping?
No. No hay scrapers de HTML ni navegadores headless (Puppeteer, Playwright) scrapeando las páginas de eBay en backend.

### 5. ¿Qué datos reales obtiene?
Si solo se proporciona una URL, únicamente obtiene el **Item ID numérico**. Todos los demás campos (precio, envío, stock, vendedor, imagen) se rellenan con valores hardcodeados por defecto. Si se carga mediante Research Pack JSON, obtiene los campos que el generador del JSON haya provisto.

### 6. ¿Obtiene seller reputation?
El motor de reglas (`SellerTrustService`) tiene implementada la lógica para procesar rating, reviews y porcentaje positivo, pero en runtime con una URL directa no extrae la reputación real del vendedor de eBay; asigna un score predeterminado de 85 a un vendedor ficticio ("Top Rated eBay Seller").

### 7. ¿Distingue correctamente NEW/USED?
Sí. El motor de normalización (`ProductNormalizationService`) y el selector de fuentes (`bestSourceSelector`) clasifican estrictamente las ofertas en pistas separadas (`NEW` vs `USED`), calculan "Nuevo desde" y "Usado desde" sin mezclar precios, y penalizan fuertemente a los usados para que no contaminen la mejor oferta nueva.

### 8. ¿Calcula shipping USA?
Sí. Aplica una regla de flete doméstico hacia Miami, Florida (ZIP 33101). Si el dato no viene provisto en el JSON, asume un costo por defecto de \$5.99 USD.

### 9. ¿Detecta auctions?
No. No existe discriminación entre listings de compra directa ("Buy It Now") y subastas ("Auctions"). Una puja de subasta de bajo valor sería leída erróneamente como precio de venta directa.

### 10. ¿Detecta Best Offer?
No. Ignora completamente la opción de "or Best Offer" y utiliza estrictamente el precio de lista publicado.

### 11. ¿Maneja variantes?
El motor canónico protege variantes comerciales (evita fusionar Player 1 con Player 2), pero el adaptador de URL descarta el parámetro `?var=` de eBay, impidiendo seleccionar una variante específica dentro de un listing multi-variación.

### 12. ¿Maneja bundles?
No. No existe un filtro o parser que detecte lotes, paquetes ("2-pack", "lot") o sets completos, con el riesgo de que un lote se asocie a una figura individual.

### 13. ¿Agrupa múltiples listings del mismo producto?
Sí. Mediante huellas digitales (`generateDeduplicationFingerprint`) y el motor de matching jerárquico de 4 niveles (`ProductMatchingEngine`), múltiples listings de eBay y Amazon se consolidan en un único producto canónico.

### 14. ¿Cómo hace matching eBay ↔ Amazon?
Aplica una jerarquía determinística: Nivel 1 por identificador exacto (UPC/EAN/GTIN); Nivel 2 por fabricante y MPN; Nivel 3 por atributos estructurados (marca, franquicia, personaje, escala); y Nivel 4 por similaridad de texto Jaccard ($\ge 80\%$, requiriendo revisión manual).

### 15. ¿Qué variables de eBay entran al Opportunity Score?
Margen porcentual proyectado, ganancia neta en USD, fiabilidad del vendedor de la mejor oferta, disponibilidad de stock y verificación de autenticidad.

### 16. ¿Qué variables entran al Risk Score?
Fiabilidad del vendedor menor a 80 puntos, estatus de autenticidad no oficial, y margen nulo o negativo.

### 17. ¿Cómo compra eBay?
Mediante una solicitud HTTP `POST /orders` enviada a la API de Zinc con la URL exacta del listing de eBay, donde el bot de Zinc ejecuta la compra utilizando su Managed Account de eBay y fondos prepagos de la billetera de Zinc.

### 18. ¿Zinc interviene únicamente en Purchasing?
Sí. Para eBay, Zinc solo interviene en Purchasing (la API de catálogo de Zinc no soporta eBay y responde HTTP 422).

### 19. ¿Cómo selecciona Zinc la Managed Account?
Collectibles no envía un ID de cuenta; Zinc inspecciona el dominio de la URL (`ebay.com`) y selecciona automáticamente la Managed Account de eBay configurada en su pool.

### 20. ¿Cómo se garantiza el listing exacto?
Porque el payload enviado a Zinc contiene la URL completa y exacta del listing (`prod.product_url_external`), garantizando que el bot de Zinc acceda a ese anuncio específico.

### 21. ¿Cómo se garantiza condición exacta?
Por la URL del listing específico, pero **no existe validación en el backend de compras** que compruebe que la condición del ítem sea 'NEW' antes de enviar la orden a Zinc.

### 22. ¿Cómo se protege precio + shipping?
Mediante el parámetro obligatorio `max_price` (en centavos de dólar) enviado a Zinc, que fija el importe máximo total (producto + flete + impuestos) que Zinc tiene permitido debitar. Si se supera, la orden se cancela inmediatamente.

### 23. ¿Cómo se evita doble compra?
Mediante un triple candado: (1) RPC atómico de PostgreSQL `claim_international_order_item_for_zinc`, (2) clave de idempotencia UUID persistida en base de datos antes de llamar a Zinc, y (3) captura de HTTP 409 `already_exists` en Zinc.

### 24. ¿Cómo llega tracking?
A través del endpoint de webhooks de Zinc (`zinc-webhook`) autenticado mediante firma criptográfica HMAC-SHA256 timing-safe, con un cron de respaldo (`zinc-sync-order-tracking`) que realiza polling periódico.

### 25. ¿Qué falta para que eBay tenga la misma calidad operacional que Amazon?
Faltan 6 elementos críticos:
1. Conectar la **API oficial de eBay (Browse API)** para búsqueda real por texto y extracción en vivo de precio, stock, vendedor y fotos.
2. Corregir el **bug en `zinc-verify-after-payment`** que tiene `retailer=amazon` hardcodeado.
3. Implementar **filtro estricto contra subastas (Auctions)** para permitir únicamente "Buy It Now".
4. Añadir **soporte para variantes (`?var=`)** en el extractor de URLs.
5. Desarrollar **detector de lotes y bundles** en el normalizador de títulos.
6. Habilitar la prueba de compra certificada en Sandbox de Zinc específica para eBay.

---

## 43. SCORE DE MADUREZ

| Área Evaluada | Puntuación | Justificación Técnica |
| :--- | :---: | :--- |
| **Search** | **15 / 100** | Cero búsqueda por texto contra eBay; solo filtrado en RAM o ingesta manual de URLs. |
| **Product Data** | **35 / 100** | Sin API de catálogo; si solo hay URL, recurre a fallbacks y placeholders estáticos. |
| **Seller Intelligence** | **60 / 100** | Excelente modelo algorítmico (`SellerTrustService`), pero sin extracción de datos en vivo. |
| **Condition Handling** | **85 / 100** | Separación limpia de Nuevo vs Usado; tracks comerciales independientes sin mezclar precios. |
| **Shipping** | **70 / 100** | Cálculo correcto hacia casillero Miami FL 33101 con fallback seguro de \$5.99. |
| **Matching** | **90 / 100** | Excepcional motor determinístico de 4 niveles con protección de variantes comerciales. |
| **Import Engine** | **95 / 100** | Pipeline financiero completo y riguroso con landed cost e impuestos cubiertos. |
| **Risk Engine** | **80 / 100** | Barreras activas por autenticidad, margen financiero y reputación de vendedor. |
| **Purchasing Architecture**| **50 / 100** | Arquitectura V2 sólida en Zinc, pero bloqueada por bug de `retailer=amazon` hardcodeado. |
| **Idempotency** | **95 / 100** | Triple candado atómico (Postgres lock + UUID previo + HTTP 409). |
| **Tracking** | **90 / 100** | Webhook HMAC-SHA256 durable con deduplicación y polling de respaldo. |
| **Autopilot** | **65 / 100** | Análisis operativo; compras automáticas deshabilitadas por seguridad. |

### TOTAL SCORE EBAY: **61 / 100**

---

## 44. VEREDICTO

```text
==================================================================================
VEREDICTO OFICIAL:
EBAY SOURCING PARTIALLY READY
==================================================================================
```

### Fundamento del Veredicto:
- **Sourcing:** Es **parcialmente operativo** porque puede procesar, normalizar, emparejar con Amazon y calcular el costo puesto de productos de eBay si estos provienen de Research Packs estructurados (JSON/CSV) o URLs manuales. Sin embargo, no puede buscar listings en eBay de forma autónoma ni extraer datos en vivo debido a la ausencia de la API Browse de eBay y a que Zinc V2 no soporta búsqueda en eBay.
- **Purchasing:** Está **completamente bloqueado e inoperativo**, no solo por las 5 barreras de seguridad y la falta de fondos en la billetera de Zinc, sino por un **defecto de implementación en `zinc-verify-after-payment`**, donde el pre-check consulta forzosamente `retailer=amazon`, lo que impediría procesar cualquier compra de eBay incluso si el interruptor de producción estuviera encendido.
- **Acción Inmediata:** Mantener Purchasing de eBay estrictamente apagado y no modificar la lógica hasta que se defina la estrategia de integración directa con eBay API o scraper certificado.
