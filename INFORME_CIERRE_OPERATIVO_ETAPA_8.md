# COLLECTIBLES 2026 — INFORME DE CIERRE OPERATIVO DE LA ETAPA 8
## AUDITORÍA CHROMIUM NETWORK, RESILIENCIA DE FALLBACK Y PREPARACIÓN DE ACTIVACIÓN GRADUAL

**Fecha:** 21 de Octubre de 2026  
**Entorno:** Producción Oficial (`https://collectibles.uy`)  
**Worker Público:** `collectibles-catalog-api.pixelsncodes-uy.workers.dev` (Version ID: `cb0292d1-c680-4ae7-a24d-23157ad81a24`)  
**Base de Datos Borde:** Cloudflare D1 (`collectibles-catalog`)  
**Base de Datos Transaccional:** Supabase PostgreSQL (`cobtsgkwcftvexaarwmo`)  
**Ventana de Observación de 24 Horas:** ACTIVA Y EN CURSO (21/10 12:40 UY — 22/10 12:40 UY)  
**Cron Trigger Cloudflare:** DESACTIVADO (`cron_enabled: false`, triggers comentados en `wrangler.toml`)  
**pg_cron Supabase:** PRESERVADO SIN ALTERACIONES (`release_expired_reservations` intacto)

---

## 1. AUDITORÍA REAL DE RED EN PRODUCCIÓN (CHROMIUM NETWORK TRACE)

Se ejecutó una auditoría real y desatendida mediante Chromium Headless en `https://collectibles.uy`, interceptando el 100% de las solicitudes salientes de red hacia **Cloudflare Workers** y **Supabase PostgREST/RPC/Functions**:

| Página Auditada | Peticiones a Cloudflare D1 | Peticiones a Supabase | Latencia de Carga | Hallazgo Principal |
| :--- | :---: | :---: | :---: | :--- |
| **Home (`/`)** | 2 | 8 | Normal | `runtime-config` en D1. Golpean Supabase: `site_config`, `promotions`, `intl_status`, `banners`, `groups`, `feature_toggles`, `meta-capi`. |
| **Shop (`/shop`)** | 2 | 7 | Rápido | Grilla principal servida por D1/Caché. Golpean Supabase: `site_config`, `promotions`, `intl_status`, `feature_toggles`, `category_facets`, `meta-capi`. |
| **Ficha (`/producto/...`)** | 3 | 9 | Fluido | Ítems relacionados servidos por D1 (`/api/v1/products?category=figuras&limit=12`). Golpean Supabase: producto primario, `product_questions`, `site_config`, `feature_toggles`. |
| **Comparador (`/compare`)** | 7 | 14 | Instantáneo | Productos destacados y taxonomías servidos por D1 (`/api/v1/products`, `/banners`, `/taxonomies`). Golpean Supabase: banners e imágenes de Supabase Storage. |
| **Wishlist (`/wishlist`)** | 2 | 8 | Instantáneo | Verificación de runtime en D1. Solicitudes comunes de layout a Supabase (`site_config`, `promotions`, `intl_status`). |
| **My Vault (`/vault`)** | 7 | 14 | Instantáneo | Recomendaciones de colección servidas por D1 (`/api/v1/products?featured=true`, `/banners`, `/taxonomies`). |

### Conclusión Técnica del Tráfico de Red
- El catálogo público de exploración (Shop, productos relacionados, banners en comparador, recomendaciones de vault) **ya está siendo servido por Cloudflare D1**.
- Se identificó un patrón de **5 consultas redundantes de configuración** que se disparan en todas las páginas hacia Supabase:
  1. `public_site_config`
  2. `feature_toggles`
  3. `promotions`
  4. `rpc/get_international_public_status`
  5. Edge Function `meta-capi` (telemetría de conversiones de Meta)
- Al activar los dominios **Settings** y **Promotions** en D1, estas 4 consultas masivas de configuración quedarán consolidadas en una sola petición al Worker (`/api/v1/settings`), reduciendo drásticamente las conexiones concurrentes a Supabase.

---

## 2. AUDITORÍA DE FALLBACK Y BLINDAJE CONTRA RÁFAGAS (FAIL-SAFE)

Se auditó el comportamiento de cada adaptador ante caídas simuladas, errores 500/503 o timeouts de Cloudflare Worker:

```
[Cliente Navegador]
       │
       ▼
¿Worker D1 responde OK?
  ├── SI ──► Almacenar en Memory Cache (TTL 60s) + LocalStorage Snapshot (1h)
  │          Retornar datos al componente.
  │
  └── NO (Timeout > 4500ms o HTTP 5xx)
       │
       ▼
  ¿Circuit Breaker Abierto? (>= 3 fallos consecutivos en 30s)
       ├── SI ──► Servir Snapshot Local Stale (Sin tocar red ni saturar Supabase)
       │
       └── NO ──► Activar Fallback Seguro y Acotado a Supabase:
                   • StorefrontSearchBar: Debounce 250ms + longitud mínima >= 2 caracteres.
                   • CompareTray / ComparePage: Búsqueda PK indexada acotada a máximo 4 IDs.
                   • Wishlist: Búsqueda acotada a `wishlist.slice(0, 50)` (límite duro contra inyecciones masivas).
                   • VaultDashboard: `limit(8)` en búsqueda y `limit(50)` en completitud.
```

### Garantías Implementadas
1. **Límite de Tiempo Estricto:** AbortController de 4.500ms en `fetchFromCloudflareCatalog`.
2. **Circuit Breaker Bidireccional:** Si Cloudflare devuelve 3 errores seguidos, el circuito se abre por 30 segundos, sirviendo exclusivamente snapshots locales previos y protegiendo a Supabase de estampidas ("thundering herd").
3. **Kill-Switch en Runtime (< 1 segundo):** Si el Worker devuelve cabecera `X-Catalog-Kill-Switch: active` o HTTP 503 con `kill_switch_active`, el frontend conmuta inmediatamente en memoria y `sessionStorage`, derivando el tráfico a Supabase sin requerir recompilación de código.

---

## 3. COMPROBACIÓN DE MONEDAS DUALES Y STOCK AUTORITATIVO

Se verificó directamente sobre la base D1 de producción (`collectibles-catalog`) y la base Supabase PostgreSQL:

### Distribución de Monedas en D1
| Tipo de Producto | Moneda Canónica | Total en D1 | Rango de Precio Base | Cumplimiento |
| :--- | :---: | :---: | :---: | :---: |
| **Stock Local Uruguay** | **UYU** | **1.205** | $ 56,02 a $ 44.900 UYU | **100% Correcto** |
| **Importación Internacional** | **USD** | **8** | $ 34,99 a $ 48,95 USD | **100% Correcto** |
| **TOTAL CATÁLOGO** | — | **1.213** | — | **0 Discrepancias** |

### Stock Autoritativo
- La disponibilidad en D1 (`stock` y `stock_status`) es **estrictamente informativa para navegación**.
- El stock de compra y checkout **se valida exclusivamente en Supabase PostgreSQL** mediante `CommerceOperationsProvider.validateCartBeforeCheckout` y `InventoryAuthorityProvider.getAuthoritativeStock` (`SELECT ... FOR UPDATE` ACID). D1 jamás autoriza una venta ni descuenta inventario por su cuenta.

---

## 4. PREPARACIÓN DE SEARCH, PROMOTIONS, SETTINGS Y RADAR

Se prepararon los modelos y datos en Cloudflare D1 para los 4 dominios que estaban inactivos:

1. **Búsqueda Pública (`/api/v1/search`):**
   - Probada la consulta SQL directa en D1 remote sobre los 1.213 productos.
   - Tiempo de ejecución observado: **1,53ms**.
   - Devuelve productos, tiendas oficiales, marcas y categorías en una sola respuesta JSON.
2. **Promociones Comerciales (`/api/v1/promotions`):**
   - Pobladas las 2 promociones en D1 (`public_promotions`).
   - Tiempo de consulta en D1 remote: **0,26ms**.
   - Mapeo pre-agrupado de `targets_json`, `exclusions_json` y `tiers_json`.
3. **Radar & Lanzamientos (`/api/v1/radar` y `/radar/:slug`):**
   - Poblados los lanzamientos publicados en D1 (`public_radar_releases`).
   - Tiempo de consulta en D1 remote: **0,27ms**.
   - Ordenamiento determinista por `release_date ASC, hype_score DESC`.
4. **Settings y Toggles Públicos (`/api/v1/settings`):**
   - Poblados los 15 `feature_toggles`, el estado de importación internacional y los 11 `public_badges` en D1.
   - Desplegado Worker con versión `cb0292d1-c680-4ae7-a24d-23157ad81a24` con soporte para fallback directo a `settingsMap`.
   - Tiempo de consulta batch en D1 remote: **0,25ms**.

> [!IMPORTANT]
> **ESTADO DE ACTIVACIÓN:** Conforme a las instrucciones del usuario, los feature flags de estos 4 dominios (`search`, `promotions`, `radar`, `settings`) **permanecen desactivados (`false`) en producción** en el registro `runtime_routing_config` de D1. Están 100% preparados y validados en datos y código, a la espera de autorización expresa para su activación en caliente.

---

## 5. MÉTRICAS REALES DE PRODUCCIÓN DE SUPABASE

Medición en caliente sobre `pg_stat_database` y `pg_stat_activity` en Supabase PostgreSQL (`cobtsgkwcftvexaarwmo`):

| Métrica de Infraestructura | Valor Observado | Estado de Salud | Límite Seguro |
| :--- | :---: | :---: | :---: |
| **Conexiones Totales del Pool** | **20** | Óptimo | < 60 (Hobby pool max) |
| **Conexiones Activas Ejecutando Query** | **1** | Óptimo | < 10 concurrentes |
| **Ratio de Aciertos de Caché (Cache Hit Ratio)** | **99,77%** | Extraordinario | > 95% requerido |
| **Tasa de Rollback de Transacciones** | **0,15%** (25 / 16.404) | Extremadamente estable | < 1% |
| **Latencia de Respuesta PostgREST** | **~240ms** | Estable | < 1.000ms |
| **Latencia de Respuesta Cloudflare D1** | **0,25ms a 8ms** | Ultra-rápido | < 50ms |

---

## 6. MATRIZ FINAL POR MÓDULO

| Módulo del Sistema | Clasificación | Destino en Arquitectura | Estado Operativo | Observaciones Técnicas |
| :--- | :---: | :--- | :---: | :--- |
| **Shop & Catálogo General** | Clase A | Cloudflare D1 + CDN | **MIGRADO Y ACTIVO** | 1.213 productos públicos servidos desde el borde con paginación y filtros. |
| **Ficha de Producto (`/producto/:slug`)** | Clase A | Cloudflare D1 + CDN | **MIGRADO Y ACTIVO** | Búsqueda por slug, resolución de wave products y variantes en D1. |
| **Taxonomías (Categorías, Marcas, Licencias)** | Clase A | Cloudflare D1 + CDN | **MIGRADO Y ACTIVO** | 63 categorías, 29 marcas, 67 licencias y facetas agregadas servidas desde D1. |
| **Banners de Portada (`useBanners`)** | Clase A | Cloudflare D1 + CDN | **MIGRADO Y ACTIVO** | 6 banners activos servidos desde D1 con fallback a Supabase. |
| **SEO, Sitemaps y Feeds XML/CSV** | Clase A | Cloudflare D1 + Worker | **MIGRADO Y ACTIVO** | `/api/v1/sitemap.xml` y `/api/v1/feeds/*` generados directamente desde D1. |
| **Comparador (`CompareTray` y `ComparePage`)** | Clase A | Cloudflare D1 + Fallback | **MIGRADO Y ACTIVO** | Consultas adaptadas a D1 (`/products?ids=`), fallback al RPC `get_products_for_comparison`. |
| **Barra de Búsqueda / Autocomplete Storefront** | Clase A | Cloudflare D1 + Fallback | **MIGRADO Y ACTIVO** | Autocomplete conectado a D1 (`/products?q=`), blindando a PostgREST contra ráfagas. |
| **Wishlist (Favoritos de usuario)** | Clase C | D1 (Catálogo) + Supabase (Auth) | **MIGRADO Y ACTIVO** | Hidratación de tarjetas vía D1 con límite duro de 50 ítems. Sesión y pertenencia en Supabase. |
| **My Vault (Colección personal)** | Clase C | D1 (Catálogo) + Supabase (Auth) | **MIGRADO Y ACTIVO** | Búsqueda de ítems y cálculo de completitud vía D1. Pertenencia y valuación privada en Supabase. |
| **Search Dedicado (`/api/v1/search`)** | Clase A | Cloudflare D1 + Worker | **DESARROLLADO E INACTIVO** | Código y datos en D1 listos (1,53ms). Flag `search: false` hasta autorización. |
| **Promociones Comerciales (`/api/v1/promotions`)**| Clase A | Cloudflare D1 + Worker | **DESARROLLADO E INACTIVO** | Código y 2 promociones en D1 listos (0,26ms). Flag `promotions: false` hasta autorización. |
| **Radar & Release Calendar (`/api/v1/radar`)** | Clase A | Cloudflare D1 + Worker | **DESARROLLADO E INACTIVO** | Código y 9 lanzamientos en D1 listos (0,27ms). Flag `radar: false` hasta autorización. |
| **Settings Bundle (`/api/v1/settings`)** | Clase A | Cloudflare D1 + Worker | **DESARROLLADO E INACTIVO** | Código, 45 settings, 15 toggles y 11 badges en D1 listos (0,25ms). Flag `settings: false` hasta autorización. |
| **Academy & Contenido Editorial** | Clase A/B | D1 / Edge Cache | **PARCIALMENTE MIGRADO** | Artículos públicos servidos desde CDN; progreso de alumno en Supabase. |
| **Checkout, Validación Stock y Pagos** | Clase B | Supabase PostgreSQL ACID | **RESERVADO EN SUPABASE** | Blindaje contra sobreventas (`SELECT FOR UPDATE`), pasarelas de pago y webhooks. |
| **Admin Backoffice & Operaciones** | Clase B | Supabase PostgreSQL ACID | **RESERVADO EN SUPABASE** | CRUD interno con RLS, auditoría y permisos de superadministrador. |
| **Portal de Vendedores (Vendors)** | Clase B | Supabase PostgreSQL ACID | **RESERVADO EN SUPABASE** | Multi-tenant B2B restringido por `vendor_id` y RLS en Postgres. |
| **Sourcing B2B & Zinc/Amazon Engine** | Clase B | Supabase PostgreSQL ACID | **RESERVADO EN SUPABASE** | Cotizaciones en tiempo real, márgenes y scraping selectivo B2B. |
| **Star2Fan & Creadores** | Clase B | Supabase PostgreSQL ACID | **RESERVADO EN SUPABASE** | Mensajes privados, videos personalizados y comisiones de creadores. |

---

## 7. PROTOCOLO DE OBSERVACIÓN Y PRÓXIMOS PASOS

1. **Ventana de Observación de 24 Horas:** Continúa activa y bajo monitoreo hasta el **jueves 22/10/2026 a las 12:40 UY**.
2. **Cero Alteraciones Críticas:**
   - No se ha modificado ningún `pg_cron` en Supabase.
   - El Cron Trigger de Cloudflare permanece desactivado.
   - Las reglas comerciales, pagos y reservas permanecen intactos.
3. **Activación de Dominios Listos:**
   - Los dominios `settings`, `promotions`, `search` y `radar` están 100% listos en D1.
   - Para activarlos en caliente sin rebuild del frontend, solo se requerirá ejecutar:
     ```bash
     POST /api/v1/internal/runtime-mode
     { "domains": { "search": true, "promotions": true, "radar": true, "settings": true } }
     ```
     *Queda a la espera de la autorización expresa del usuario antes de proceder.*
