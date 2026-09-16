# PERFORMANCE BASELINE — COLLECTIBLES 2026

**Fecha:** 16 de Septiembre de 2026  
**Ambiente:** Pre-Remediación (Commit Base `origin/main`)  
**URL de Producción:** `https://collectibles.uy`  

---

## 1. Bundle & Build Baseline

### Chunks Principales (`npm run build`)
* **Total Chunks JS:** 56 archivos
* **Storefront Chunk (`storefront-chunk`):** `199.61 kB` raw / `54.22 kB` gzip
* **Vendor React Chunk (`vendor-react`):** `176.71 kB` raw / `55.96 kB` gzip *(Contaminado con `lucide-react` por precedencia de regex en `vite.config.ts`)*
* **Vendor Supabase Chunk (`vendor-supabase`):** `0 kB` *(absorbido en vendor-libs / storefront)*
* **Vendor Libs (`vendor-libs`):** `3.56 kB` raw / `1.57 kB` gzip
* **Portal Chunk (`portal-chunk`):** `842.65 kB` raw / `175.88 kB` gzip
* **Admin Chunk (`admin-chunk`):** `3,796.59 kB` raw / `920.77 kB` gzip
* **CSS Global (`index-*.css`):** `251.04 kB` raw / `35.87 kB` gzip
* **HTML Base (`index.html`):** `8.82 kB` raw / `2.61 kB` gzip

---

## 2. Critical Path & Network Waterfall Baseline

### A. Hero Slider (Home Pública)
* **Banners activos configurados:** 6 banners
* **Estrategia actual:** 
  * `useEffect` pre-instancia `new Image()` para los 6 banners completos (desktop + mobile simultáneos).
  * Descarga total estimada en carga fría: **~7.9 MB** de imágenes sin viewport gate.
  * Innecesario cálculo y decodificación de 12 imágenes (6 desktop + 6 mobile) en el arranque.

### B. Entrada de Tráfico & SEO Serverless
* **Rutas afectadas:** `/`, `/shop`, `/producto/:slug`, `/categoria/:slug`, `/marca/:slug`, etc.
* **Comportamiento en `vercel.json`:**
  * Todas las rutas públicas de usuarios son reescritas a `/api/seo-prerender`.
  * La función serverless Node se ejecuta para TODOS los usuarios humanos, consulta Supabase, genera etiquetas de metadata y retorna HTML con headers `Cache-Control: no-cache, no-store, must-revalidate, max-age=0`.
  * Los humanos pagan latencia de función serverless y cold-start de Node.js en vez de recibir el `index.html` estático desde CDN Edge.

### C. Providers & Contextos Globales en `App.tsx`
* **12 Providers anidados en el arranque global:**
  1. `AnalyticsProvider`
  2. `ReferralTracker`
  3. `AuthProvider`
  4. `AdminModeProvider`
  5. `MetaPixelTracker`
  6. `WishlistProvider`
  7. `CartProvider`
  8. `CompareProvider` *(Cargando estado sin importar si el usuario usa el comparador)*
  9. `InternationalCartProvider` *(Cargando estado sin importar si el usuario compra internacional)*
  10. `FeatureToggleProvider`
  11. `LocaleProvider` *(Consulta independiente a open.er-api.com/v6/latest/UYU)*
  12. `CurrencyProvider` *(Consulta independiente DUPLICADA a open.er-api.com/v6/latest/UYU)*
* **Suspense Fallback:** `<Suspense fallback={null}>` provocando sensación de congelamiento en navegación SPA entre rutas lazy.

### D. Consultas a Base de Datos (Critical Path de Home & Layout)
* **Home:** Inicia consultas paralelas a `useBanners`, `useCategories`, `useProducts` (featured), `useProducts` (new arrivals), `useBrands`, `useProductGroups`, `getPersonalizedShelves`.
* **StorefrontLayout:** Inicia independientemente consultas a `useCategories`, `useBrands`, `useLicenses`, `useThemes`, `useSiteSettings`, `useInternationalSettings`.
* **International Settings:** Intenta leer `international_sync_settings` que falla para visitantes anónimos por RLS, hace fallback a RPC `get_international_public_status` y suscribe un canal Supabase Realtime para cada visitante anónimo.
* **Product Card Queries:** `useProducts` en `useData.ts` incluye relaciones pesadas (`category`, `brand`, `images`, `variants`, `vendor`, `vendor_store`, `product_group_items`, `product_groups`) innecesarias para renderizar una card básica.

---

## 3. Métricas de Referencia Estimadas (Baseline)

| Métrica / Dimensión | Estado Baseline |
| :--- | :--- |
| **Hero Images Transferidas (Cold Load)** | ~7.9 MB (6 banners desktop + mobile) |
| **Initial JS Bundles (Critical Storefront)** | ~450 kB raw (Storefront + Vendor React + App) |
| **Vendor React Chunks** | 176.71 kB (incluye lucide-react erróneamente) |
| **Exchange Rate Requests** | 2 requests duplicados por sesión |
| **Realtime Subscriptions (Anónimos)** | 1 abierta innecesariamente (`international_sync_settings`) |
| **Suspense Fallback** | `null` (pantallas vacías/congeladas en navegación) |
| **TTFB Usuarios Humanos** | Alto (interceptado por Serverless Function `/api/seo-prerender` con `no-store`) |
| **SEO Bot Rendering** | Funcional pero acoplado a la ruta del usuario humano |
