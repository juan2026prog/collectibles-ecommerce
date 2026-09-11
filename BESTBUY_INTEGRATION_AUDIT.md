# COLLECTIBLES 2026 — AUDITORÍA TÉCNICA PUNTUAL BEST BUY
**Módulo:** Sourcing Intelligence (`/admin/internacional/sourcing`)  
**Fecha de auditoría:** 11 de Septiembre de 2026  
**Entorno auditado:** Producción (`collectibles.uy`), Vercel CI/CD, Supabase Remote (`cobtsgkwcftvexaarwmo`), Código local (`main`).

---

## A. Resumen Ejecutivo

| Aspecto | Estado | Detalle |
| :--- | :---: | :--- |
| **Parsing de URLs y Datos** | ✅ **OPERATIVO** | `BestBuySourceAdapter.ts` extrae SKUs (`skuId`, `/site/.../6512345.p`), valida dominios (`bestbuy.com`, `bby.me`) y normaliza a `SourceOffer`. |
| **Normalización de Condición** | ✅ **OPERATIVO** | Best Buy mapea a `'new'`, que `conditionMapper.ts` traduce fielmente al estado canónico `'new'` ("Nuevo"). |
| **Agrupación Canónica (1-a-N)** | ✅ **OPERATIVO** | `ProductMatchingEngine.ts` agrupa exitosamente ofertas de Best Buy con Amazon e eBay cuando comparten `upc` o atributos clave. |
| **Búsqueda en Vivo (Search)** | 🔴 **NO IMPLEMENTADO** | `multiSourceSearchService.ts` **no realiza ninguna llamada HTTP ni invoca Edge Functions** para Best Buy. Solo filtra un array estático de demo packs en memoria. |
| **Estado NOT_CONFIGURED** | ⚠️ **HARDCODEADO** | El estado `NOT_CONFIGURED` está escrito como string fijo en el código de `multiSourceSearchService.ts:126` y `retailerCapabilities.ts:51`. **Nunca se evalúa si la credencial existe o no**. |
| **Credencial en Servidor** | 🔴 **AUSENTE / NO LEÍDA** | La variable `BESTBUY_API_KEY` **no está declarada** en Vercel (`npx vercel env ls`), ni en Supabase Secrets (`npx supabase secrets list`), ni en Supabase Vault (`vault.secrets`). Además, **ningún archivo de código la lee**. |
| **Live Check vía Zinc API** | 🔴 **RECHAZADO POR ZINC** | Las pruebas controladas en vivo confirmaron que Zinc responde `unsupported_retailer: "BestBuy is unsupported"` para SKU lookup y `ValueError('Invalid job type.')` para search. |

**Causa Raíz:** Best Buy fue diseñado a nivel estructural como un adaptador de datos y normalizador ("ADAPTER_READY"), pero **el puente de red real (búsqueda y live check contra Best Buy Developer API `api.bestbuy.com`) nunca fue codificado ni desplegado**. En su lugar, el sistema quedó con estado `NOT_CONFIGURED` hardcodeado y con un intento secundario de delegar en Zinc que el scraper de Zinc no soporta.

**Severidad:** **ALTA** (Funcionalidad no operativa para búsquedas reales de Best Buy, aunque con **impacto cero** sobre Amazon, eBay y el resto del e-commerce gracias al aislamiento por `Promise.allSettled`).

---

## B. Credencial

```text
Configurada en Vercel: NO (MISSING)
Configurada en Supabase Secrets: NO (MISSING)
Configurada en Supabase Vault: NO (MISSING)
Leída correctamente por código: NO (NO EXISTE LECTURA)
Entorno Production: NO
```

*Detalles técnicos:*
- En Vercel Production (`collectibles-ecommerce`), las únicas variables configuradas son `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- En Supabase Secrets (`npx supabase secrets list`), existen 21 secretos activos (`ZINC_API_KEY`, `RESEND_API_KEY`, `MERCADOLIBRE_*`, etc.), pero ninguno para Best Buy.
- En Supabase Vault (`vault.secrets`), únicamente residen `zinc_api_key_production`, `zinc_api_key_sandbox` y `zinc_webhook_secret_sandbox`.
- En el código fuente, la cadena `BESTBUY_API_KEY` solo aparece como texto descriptivo en un banner de advertencia visual en [`SourcingMultiSourceHeader.tsx:188`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingMultiSourceHeader.tsx#L188) y en documentación previa. **Ningún archivo ejecuta `process.env.BESTBUY_API_KEY`, `Deno.env.get('BESTBUY_API_KEY')` ni consulta a Vault.**

---

## C. Adapter Search

```text
Clasificación: PARTIAL
```

- **Archivo:** [`frontend/src/services/sourcing/adapters/BestBuySourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/BestBuySourceAdapter.ts)
- **Método HTTP:** Ninguno. Es un parser puro en memoria.
- **Entrada:** URLs de Best Buy (`https://www.bestbuy.com/site/.../6412345.p?skuId=6412345` o enlaces cortos `bby.me`).
- **Extracción:** Extrae el SKU con la expresión regular `/[?&]skuId=(\d{6,8})/i` o `/\/(\d{6,8})\.p/i`.
- **Salida:** `RawProductExtraction` y `SourceOffer` con `source: 'bestbuy'`, `condition: 'new'`, `status: 'RESEARCH_ONLY'`, `stock: 8` y `domestic_shipping: 0`.
- **Diagnóstico:** Funciona al 100% cuando se le suministran URLs o datos raw manuales (como en los Research Packs), pero **no tiene capacidad autónoma de realizar búsquedas por palabras clave contra servidores externos**.

---

## D. Live Check

```text
Clasificación: BROKEN
```

- **Archivo:** [`frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts)
- **Edge Function:** [`supabase/functions/sourcing-retailer-live-check/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/sourcing-retailer-live-check/index.ts)
- **Diagnóstico:**
  1. En el cliente, `BestBuyLiveSourceAdapter.resolveLiveItem` hace un `fetch('/api/sourcing/zinc-live-check')`. En el deployment de producción de Vercel, esta ruta no es un Serverless Function; cae en el rewrite catch-all hacia `/index.html` (devolviendo HTML 200 en vez de JSON), por lo que el `catch` salta de inmediato a `createFallbackItem`, retornando `status: 'ERROR'`.
  2. Si se invoca directamente la Edge Function de Supabase `sourcing-retailer-live-check`:
     - Consulta la tabla `sourcing_retailer_capabilities`, que **no existe en la base de datos de producción**.
     - Cae en el fallback donde `live_check_available = false`, devolviendo de inmediato `NOT_CONFIGURED`.
     - Si se fuerza con `force_refresh: true`, consulta a Zinc API: `GET https://api.zinc.com/products/{sku}?retailer=bestbuy`.
     - **Respuesta real de Zinc API en test controlado:**
       ```json
       {
         "_type": "error",
         "status": "failed",
         "code": "unsupported_retailer",
         "data": { "details": "BestBuy is unsupported." },
         "message": "Zinc or the retailer you requested is experiencing outages."
       }
       ```

---

## E. Tab Best Buy

```text
Clasificación: PARTIAL
```

- **Archivo:** [`frontend/src/components/admin/sourcing/SourcingMultiSourceHeader.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingMultiSourceHeader.tsx)
- **Flujo al hacer clic:**
  1. Usuario presiona `[ BEST BUY ]`.
  2. `selectedSourceOption` cambia a `'bestbuy'`.
  3. Se muestra el banner informativo de advertencia:
     > *"El adaptador está listo en código (`ADAPTER_READY`), pero requiere configurar `BESTBUY_API_KEY` en producción."*
  4. Se llama a `handleExecuteMultiSourceSearch(query, 'bestbuy')`.
  5. En `multiSourceSearchService.searchProducts`, se ejecuta exclusivamente `searchBestBuy(query)`.
  6. `searchBestBuy` filtra los elementos de los packs locales en memoria (`SAMPLE_STREET_FIGHTER_RESEARCH_PACK` y `SAMPLE_MCFARLANE_RESEARCH_PACK`).
  7. Si el término coincide con los items demo (ej: "Chun-Li"), devuelve esos productos de muestra. Si el término es cualquier otro (ej: "Pokemon", "Star Wars"), devuelve **0 resultados** y no consulta ningún servidor.

---

## F. Modo Todos

```text
Clasificación: PARTIAL
```

- **Archivo:** [`frontend/src/services/sourcing/multiSourceSearchService.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/multiSourceSearchService.ts#L148-L186)
- **Flujo al buscar en `[ TODOS ]`:**
  - `promises.push(this.searchAmazon(cleanQuery))` ➔ Invoca `zinc-search-products` y obtiene candidatos reales de Amazon.
  - `promises.push(this.searchEbay(cleanQuery))` ➔ Consulta listings en DB y catálogo de eBay.
  - `promises.push(this.searchBestBuy(cleanQuery))` ➔ Consulta únicamente los packs locales en memoria.
  - `Promise.allSettled(promises)` consolida los resultados.
- **Comportamiento en UI:**
  - El header muestra los contadores de ofertas encontradas para Amazon y eBay.
  - Best Buy permanece con contador `0` y badge `NOT_CONFIGURED`.
  - **Aislamiento de fallos:** Confirmado. La falta de respuesta o ausencia de API en Best Buy **no rompe ni ralentiza Amazon ni eBay**.

---

## G. Matching Canónico

```text
Clasificación: WORKING
```

- **Motor:** [`frontend/src/services/sourcing/ProductMatchingEngine.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/ProductMatchingEngine.ts)
- **Verificación:**
  - Cuando se carga un producto de Best Buy (por ejemplo, vía Research Pack o importación manual) con identificador `upc` (ej: `801310342299`), el motor lo vincula automáticamente con las ofertas de Amazon e eBay que comparten el mismo código de barras.
  - La vista [`SourcingCanonicalProductView.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingCanonicalProductView.tsx) renderiza las 3 ofertas bajo la misma ficha con los tabs `[ Amazon ]`, `[ eBay ]`, `[ Best Buy ]`.
  - La condición externa `'new'` de Best Buy se conserva correctamente como condición canónica `'new'`.

---

## H. Seguridad

```text
Server-Side Guarantee: CONFIRMADO (CERO FILTRACIONES)
```

- No hay ninguna API key de Best Buy expuesta en el frontend ni en los bundles generados por Vite (`frontend/dist/assets/*.js`).
- No existen variables sensibles con prefijo `VITE_` relacionadas con Best Buy o retailers.
- La variable documentada `BESTBUY_API_KEY` nunca fue cargada en Vercel ni en repositorios públicos.
- La integración de Zinc utiliza estrictamente RPC con autenticación segura en Supabase Vault (`get_zinc_vault_secret`) y variables server-side de Edge Functions.

---

## I. Problemas Encontrados

| # | Problema | Severidad | Causa Raíz | Archivo Afectado | Solución Recomendada |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **1** | **Estado `NOT_CONFIGURED` hardcodeado** | **Alta** | `multiSourceSearchService.ts` define `status: 'NOT_CONFIGURED'` como valor estático invariable, sin comprobar ninguna variable de entorno ni API. | [`multiSourceSearchService.ts:126`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/multiSourceSearchService.ts#L126) | Modificar la lógica para consultar un endpoint o Edge Function de estado antes de declarar `NOT_CONFIGURED`. |
| **2** | **Búsqueda Best Buy no llama a ninguna API** | **Crítica** | La función `searchBestBuy` solo filtra dos arrays de objetos estáticos en memoria (`SAMPLE_*_RESEARCH_PACK`). | [`multiSourceSearchService.ts:343-358`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/multiSourceSearchService.ts#L343-L358) | Implementar llamada a Edge Function (o API Route) conectada a Best Buy Developer API (`api.bestbuy.com`). |
| **3** | **Inexistencia de código que lea `BESTBUY_API_KEY`** | **Alta** | Aunque el usuario configure la clave en Vercel o Supabase Vault, ningún archivo la lee ni la utiliza. | Todo el codebase | Crear conector server-side en Supabase Edge Functions que consuma `BESTBUY_API_KEY` desde Supabase Vault o Secrets. |
| **4** | **Zinc API rechaza Best Buy** | **Media** | Zinc reporta formalmente `unsupported_retailer: "BestBuy is unsupported"` para SKU lookup y falla en search con `Invalid job type`. | Zinc API externo (`api.zinc.com`) | No depender de Zinc para Best Buy; utilizar la Best Buy Developer API directa (`https://api.bestbuy.com/v1/products`). |
| **5** | **Ruta `/api/sourcing/zinc-live-check` no existe en Vercel** | **Media** | `BestBuyLiveSourceAdapter.ts` hace `fetch('/api/sourcing/zinc-live-check')`, pero `vercel.json` no tiene esa función mapeada; redirige al HTML de la SPA. | [`BestBuyLiveSourceAdapter.ts:39`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts#L39) y [`vercel.json`](file:///c:/Projects/Collectibles2026/vercel.json) | Apuntar directamente a `supabase.functions.invoke('sourcing-retailer-live-check')` como hace `retailerCapabilities.ts`. |
| **6** | **Tabla `sourcing_retailer_capabilities` inexistente en DB** | **Baja** | `retailerCapabilities.ts` y `sourcing-retailer-live-check` consultan esta tabla para obtener capacidades dinámicas, pero la tabla nunca fue creada en PostgreSQL. | Supabase PostgreSQL schema | Crear la tabla mediante migración versionada si se desea control dinámico de retailers por base de datos. |

---

## J. Correcciones Necesarias (Hoja de Ruta Mínima)

Para que Best Buy esté **100% operativo en vivo** sin tocar Amazon, eBay ni Mercado Libre:

1. **Configurar el Secreto en Supabase Secrets o Vault:**
   - Registrar la clave oficial de [developer.bestbuy.com](https://developer.bestbuy.com) mediante:
     ```bash
     npx supabase secrets set BESTBUY_API_KEY="<tu_clave_de_bestbuy>"
     ```
   *(O insertarla en `vault.secrets` con nombre `bestbuy_api_key_production`).*

2. **Crear Edge Function Server-Side para Best Buy Search & Lookup:**
   - Crear `supabase/functions/bestbuy-search/index.ts` que consuma `BESTBUY_API_KEY` desde `Deno.env.get("BESTBUY_API_KEY")`.
   - Endpoint de búsqueda oficial:
     `GET https://api.bestbuy.com/v1/products((search={query}))?apiKey={KEY}&format=json&show=sku,name,salePrice,regularPrice,upc,url,image,inStoreAvailability,onlineAvailability,manufacturer`

3. **Conectar `multiSourceSearchService.ts` a la Edge Function:**
   - Reemplazar el filtrado de arrays de demo en `searchBestBuy()` por:
     ```ts
     const { data, error } = await supabase.functions.invoke('bestbuy-search', { body: { query } });
     ```
   - Si la llamada es exitosa, actualizar `resultStatus.bestbuy.status = 'AVAILABLE'`.

4. **Conectar `BestBuyLiveSourceAdapter.ts` a la Edge Function:**
   - Cambiar el `fetch('/api/sourcing/zinc-live-check')` roto por `supabase.functions.invoke('bestbuy-lookup', { body: { sku } })`.

---

## K. Evidencia de Pruebas Reales Ejecutadas (Audit Runtime Log)

```text
[ZINC API AUTH TEST]
- Target: api.zinc.com
- Auth Method: Bearer (Zinc Production Key desde Supabase Vault)
- Key Validated: SI (zn_live_*)

[TEST CONTROL - AMAZON]
- Query: "Pokemon" (retailer=amazon)
- HTTP Status: 200 OK
- Latencia: 2459 ms
- Resultados devueltos: 48 productos reales de Amazon.
- Diagnóstico: Conector Zinc e infraestructura de red 100% funcionales.

[TEST 1 - BEST BUY SEARCH]
- Query: "Pokemon" (retailer=bestbuy)
- HTTP Status: 400 Bad Request
- Latencia: 1255 ms
- Respuesta: {"detail":{"_type":"error","status":"failed","code":"internal_error","message":"ValueError('Invalid job type.')"}}
- Diagnóstico: Zinc no implementa jobs de búsqueda para Best Buy.

[TEST 2 - BEST BUY SEARCH ESPECÍFICA]
- Query: "Star Wars Black Series" (retailer=bestbuy)
- HTTP Status: 400 Bad Request
- Latencia: 865 ms
- Respuesta: {"detail":{"_type":"error","status":"failed","code":"internal_error","message":"ValueError('Invalid job type.')"}}
- Diagnóstico: Mismo rechazo de la API de Zinc.

[TEST 3 - BEST BUY PRODUCT LOOKUP]
- Target SKU: 6412345 (retailer=bestbuy)
- HTTP Status: 200 OK (Error estructurado)
- Latencia: 508 ms
- Respuesta: {"_type":"error","status":"failed","code":"unsupported_retailer","data":{"details":"BestBuy is unsupported."}}
- Diagnóstico: Scraper de Best Buy en Zinc formalmente deshabilitado/no soportado.

[TEST 4 - ENTORNO Y VERCEL]
- Vercel CLI: npx vercel env ls -> 0 variables de Best Buy.
- Supabase CLI: npx supabase secrets list -> 0 variables de Best Buy.
- Supabase SQL: SELECT name FROM vault.secrets -> 0 variables de Best Buy.
- Production Domain: https://collectibles.uy -> HTTP 200 OK (Commit dc04be3 activo).
```
