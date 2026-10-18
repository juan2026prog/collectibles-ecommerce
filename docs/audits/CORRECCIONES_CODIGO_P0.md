# AUDITORÍA DETALLADA Y CORRECCIONES DE CÓDIGO (P0 / P1)
**Proyecto:** Collectibles (`collectibles.uy`)  
**Fecha de Emisión:** 18 de octubre de 2026  
**Alcance:** Revisión profunda de los 5 archivos identificados con defectos de arquitectura, concurrencia o rendimiento.

---

## 1. ARCHIVO 1: `api/merchant-feed.js` (CRÍTICO P0)

### 1.1 Código Problemático Exacto
En [api/merchant-feed.js](file:///c:/Projects/Collectibles2026/api/merchant-feed.js#L73-L169):
```javascript
// 1. Paginated fetch for ALL published active products
let allProducts = [];
let page = 0;
const pageSize = 1000;
let hasMore = true;
while (hasMore) {
  const { data: batch, error } = await supabase.from('products')
    .select(`id, title, slug, description, short_description, base_price, condition, brand_id, metadata`)
    .eq('is_active', true).eq('status', 'published')
    .range(page * pageSize, (page + 1) * pageSize - 1);
  // ... concatena en memoria ...
}

// 2. Paginated fetch for ALL product images
while (hasMore) {
  const { data: batch, error } = await supabase.from('product_images')
    .select('product_id, url, is_primary')
    .range(page * pageSize, (page + 1) * pageSize - 1);
}

// 3. Paginated fetch for ALL active brands
while (hasMore) {
  const { data: batch, error } = await supabase.from('brands')
    .select('id, name').eq('is_active', true)
    .range(page * pageSize, (page + 1) * pageSize - 1);
}
```
Y en las cabeceras finales de [api/merchant-feed.js](file:///c:/Projects/Collectibles2026/api/merchant-feed.js#L248):
```javascript
res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200');
```
**Anulación por Vercel en [vercel.json](file:///c:/Projects/Collectibles2026/vercel.json#L31-L47):**
```json
{
  "source": "/api/:path*",
  "headers": [
    { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" },
    { "key": "CDN-Cache-Control", "value": "no-store" },
    { "key": "Vercel-CDN-Cache-Control", "value": "no-store" }
  ]
}
```

### 1.2 Condiciones de Ejecución y Frecuencia Medida
- **Disparador:** Solicitudes GET a `/merchant-feed.xml` provenientes de Googlebot, Bingbot, bots de IA (OpenAI, Reflectionbot) o scrapers.
- **Frecuencia Observada:** Varias veces por hora, con ráfagas consecutivas al rastrear mapas de sitio.
- **Consultas Generadas por Cada Request:** Entre **6 y 10 consultas SQL masivas de 1.000 filas cada una** (`products`, `product_images` en múltiples páginas, `brands`).
- **Impacto:** Carga en la memoria de Node.js cientos de kilobytes de JSON, genera escaneos de miles de filas en PostgreSQL y, debido a la anulación de cabeceras en `vercel.json`, **Vercel jamás cachea la respuesta en el CDN** (`X-Vercel-Cache: MISS`).
- **Evidencia en Producción:** Hoy 18/10 a las 15:00:03 UTC se observó en los logs de Supabase la ráfaga de consultas de `merchant-feed` desde `node` inmediatamente antes del congelamiento de PostgreSQL.

### 1.3 Corrección Propuesta
1. Excluir explícitamente `/api/merchant-feed` de la regla `no-store` en `vercel.json` o servir el archivo XML pre-generado.
2. Implementar deduplicación de promesas en vuelo (*in-flight promise deduplication*): si entran 5 solicitudes simultáneas, solo 1 ejecuta la consulta a Supabase y las 4 restantes esperan el mismo resultado.
3. Incorporar timeout estricto de 15 segundos y cliente protegido `createPublicSupabase()`.
4. Si la base no responde, devolver un feed en caché persistente o un documento RSS mínimo válido con código HTTP 200 para evitar que Google desactive la cuenta de Merchant.

---

## 2. ARCHIVO 2: `api/_lib/public-catalog.js` (CRÍTICO P0)

### 2.1 Código Problemático Exacto
En [api/_lib/public-catalog.js](file:///c:/Projects/Collectibles2026/api/_lib/public-catalog.js#L161-L182):
```javascript
async function refresh() {
  const signal = AbortSignal.timeout(10000);
  let settingsQuery = client.rpc('get_international_public_status');
  if (typeof settingsQuery.abortSignal === 'function') settingsQuery = settingsQuery.abortSignal(signal);
  const { data: status, error } = await settingsQuery;
  if (error) throw new Error(`Catalog settings unavailable...`);
  
  const internationalEnabled = status?.international_public_enabled === true;
  const snapshotRows = (table, fields, configure, order = 'id') => readAll(table, fields, configure, order, signal);
  
  // OCHO O NUEVE CONSULTAS PARALELAS DISPARADAS CON PROMISE.ALL
  const [local, international, categories, brands, licenses, themes, licenseThemes, groups] = await Promise.all([
    snapshotRows('products', '...', q => q.eq('status','published').eq('is_active',true)),
    internationalEnabled ? snapshotRows('international_products', '...', q => q.eq('status','published')) : [],
    snapshotRows('categories', '...', q => q.eq('is_active',true).eq('status','approved')),
    snapshotRows('brands', '...', q => q.eq('is_active',true).eq('is_public',true).eq('status','approved')),
    snapshotRows('licenses', '...', q => q.eq('is_active',true)),
    snapshotRows('themes', '...', q => q.eq('is_active',true)),
    snapshotRows('license_themes', 'license_id,theme_id', q => q, 'license_id,theme_id'),
    snapshotRows('product_groups', 'id,name,slug', q => q.eq('is_active',true)),
  ]);
  snapshot = prepareCatalog({ local, international, categories, brands, licenses, themes, licenseThemes, groups, internationalEnabled });
  loadedAt = now(); retryAt = 0;
  return snapshot;
}
```

### 2.2 Validación de la Concurrencia y Aislamiento Serverless
- **¿Realmente son 8 descargas simultáneas?** **SÍ.** Se ejecutan:
  1. `rpc/get_international_public_status`
  2. `products`
  3. `international_products`
  4. `categories`
  5. `brands`
  6. `licenses`
  7. `themes`
  8. `license_themes`
  9. `product_groups`
  (Total: 1 RPC inicial + 7 u 8 consultas en `Promise.all`).
- **¿Se ejecutan simultáneamente?** Sí, `Promise.all` las despacha concurrentemente.
- **¿Qué ocurre entre múltiples visitantes?**
  - La variable `let snapshot = null;` está en la **memoria RAM local de una única instancia Serverless de Vercel**.
  - Si 5 visitantes o bots acceden simultáneamente desde distintas ubicaciones, Vercel levanta 5 instancias Serverless distintas (lambdas independientes).
  - Cada una de las 5 instancias encuentra su memoria vacía y dispara su propio `refresh()`, generando **5 × 8 = 40 consultas simultáneas** contra PostgreSQL.
- **¿Qué ocurre ante un error?**
  - Si `client.rpc('get_international_public_status')` tarda más de 10 segundos (lo cual ocurrió hoy a las 16:52 UTC), la función arroja una excepción, activa `retryAt = now() + 30000;` y devuelve **HTTP 503**.
  - Durante 30 segundos, **todas las peticiones que entren a esa instancia son rechazadas inmediatamente con 503** ("El catálogo está temporalmente demorado").
  - Al cumplirse los 30 segundos, vuelve a disparar las 8 consultas, repitiendo el ciclo si la base sigue degradada.

### 2.3 Solución Diseñada (Circuit Breaker y Catálogo de Contingencia)
1. **Fallback Persistente:** En lugar de depender de la memoria volátil de Node.js, guardar una copia del snapshot del catálogo en un archivo estático o CDN cacheado (`/catalog-snapshot.json`).
2. **Circuit Breaker:** Si Supabase no responde en 3 segundos o está en estado de error, **NO lanzar HTTP 503**:
   - Servir inmediatamente el catálogo desde el snapshot de contingencia.
   - Devolver cabecera `X-Catalog-Source: stale-fallback-snapshot`.
   - Responder HTTP 200 con cabecera `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`.

---

## 3. ARCHIVO 3: `frontend/src/hooks/useData.ts` (P1)

### 3.1 Código Problemático Exacto
En [frontend/src/hooks/useData.ts](file:///c:/Projects/Collectibles2026/frontend/src/hooks/useData.ts#L67-L72):
```typescript
filters.group ? supabase.from('product_groups').select('id').eq('slug', filters.group).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
filters.category ? supabase.from('categories').select('id').eq('slug', filters.category).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
filters.brand ? supabase.from('brands').select('id').eq('slug', filters.brand).eq('status', 'approved').eq('is_active', true).eq('is_public', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
filters.license ? supabase.from('licenses').select('id').eq('slug', filters.license).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
filters.theme ? supabase.from('themes').select('id').eq('slug', filters.theme).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
filters.collection_id ? supabase.from('vendor_store_collection_products').select('product_id').eq('collection_id', filters.collection_id) : Promise.resolve({ data: null, error: null }),
```

### 3.2 Impacto
- Cada vez que un usuario interactúa con los filtros en la interfaz de usuario, el frontend dispara hasta **6 consultas directas a PostgreSQL** a través de PostgREST, omitiendo la caché pública y consumiendo conexiones y CPU de la base.
- Se contabilizaron **111 llamadas directas `supabase.from()`** en todo el frontend.

### 3.3 Corrección
- Reemplazar estas llamadas individuales por el hook [fetchPublicTaxonomies()](file:///c:/Projects/Collectibles2026/frontend/src/lib/publicCatalog.ts#L20-L28), que ya obtiene todas las taxonomías consolidadas desde `/api/public-catalog?mode=facets` y las mantiene en la memoria del navegador durante 1 hora.

---

## 4. ARCHIVO 4: `frontend/src/lib/imageUtils.ts` (P1)

### 4.1 Código Problemático Exacto
En [frontend/src/lib/imageUtils.ts](file:///c:/Projects/Collectibles2026/frontend/src/lib/imageUtils.ts#L99-L132):
```typescript
if (product.images && Array.isArray(product.images) && product.images.length > 0) {
  // AGREGA LAS IMÁGENES EN EL ORDEN RECIBIDO SIN PRIORIZAR is_primary NI sort_order
  const imageUrls = product.images.map((img: any) => typeof img === 'string' ? img : img.url).filter(Boolean);
  list.push(...imageUrls);
}
```
Y en [frontend/src/components/ProductGridCard.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/ProductGridCard.tsx#L122):
```typescript
loading="lazy" fetchPriority="low"
```
Todas las tarjetas (incluyendo las 4 primeras visibles al entrar) están forzadas a `fetchPriority="low"`.

### 4.2 Impacto
- Una tarjeta pequeña de 220 px termina cargando un archivo PNG secundario no optimizado de **927 KB** (caso comprobado de la cápsula Minecraft), mientras existía una imagen principal WebP de solo **136 KB** (85% menos peso).
- Las tarjetas de la primera pantalla tardan en aparecer porque el navegador posterga su descarga debido a `fetchPriority="low"`.

### 4.3 Corrección
1. Ordenar `product.images` priorizando deterministamente `img.is_primary === true` y menor `img.sort_order`.
2. Asignar `fetchPriority="high"` y `loading="eager"` a los primeros 4 productos del grid visible.
3. Generar variantes de imagen (`160w`, `320w`, `640w`) con `srcset` para miniaturas.

---

## 5. ARCHIVO 5: `frontend/vite.config.ts` (P1)

### 5.1 Código Problemático Exacto
En [frontend/vite.config.ts](file:///c:/Projects/Collectibles2026/frontend/vite.config.ts#L25):
```typescript
if (id.includes('/components/admin/') || id.includes('/pages/admin/')) {
  return 'admin-chunk';
}
```
Y en [frontend/src/components/StorefrontLayout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/StorefrontLayout.tsx#L32):
```typescript
import { Toast } from './admin/Toast';
```

### 5.2 Impacto
- Como `StorefrontLayout.tsx` (que envuelve toda la tienda pública) importa `Toast.tsx` desde `/components/admin/`, Vite empaqueta todo el paquete de administración (`admin-chunk`) dentro de los scripts que el navegador precarga (`modulepreload`) en `/shop`.
- **Resultado medido:** El visitante de la tienda descarga **4,8 MB de JavaScript descomprimido** de funciones administrativas que jamás utilizará como comprador, aumentando el tiempo de bloqueo del hilo principal (*Total Blocking Time*).

### 5.3 Corrección
- Mover `Toast.tsx` a `frontend/src/components/common/Toast.tsx` y corregir las importaciones en `StorefrontLayout.tsx` y `useImageProtection.ts`.
- Verificar con `npm run build` que el `admin-chunk` quede completamente aislado y no aparezca en el HTML de `/shop`.
