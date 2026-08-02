# COLLECTIBLES_UY_PRODUCT_DETAIL_PRODUCTION_VERIFICATION

## 1. Proyecto de Vercel y Dominio Real
- **Proyecto Vercel**: `collectibles-ecommerce` (ID: `prj_J6GWgs6ZZ8hFcXrjAaAi7Xl75Ctm`, Org: `juans-projects-05818af2`)
- **Dominio Alias Principal**: `https://collectibles.uy`
- **Deployment ID Activo en Producción**: `dpl_56QwWd2dTb75jZ7fgffxMV4sKbAW`
- **URL de Producción Vercel**: `https://collectibles-ecommerce-2i0lbge7x-juans-projects-05818af2.vercel.app`
- **Commit Servido**: `103ea32` (`fix(pdp): retira tag temporal QA y confirma rediseño desplegado en produccion`)
- **Estado Vercel**: `READY` (Aliased a `collectibles.uy`)

---

## 2. Causa Raíz Exacta por la que `collectibles.uy` Mostraba la Versión Vieja

### Causa 1: CDN Edge Cache en `index.html` (Vercel Edge Network)
- **Diagnóstico**: La cabecera HTTP devuelta por `https://collectibles.uy` para la ruta `/p/...` era `X-Vercel-Cache: HIT` con un `Age` de **53.692 segundos (~15 horas)**.
- **Explicación**: El archivo `index.html` de la SPA carecía de una regla explícita de `Cache-Control: public, max-age=0, must-revalidate` en `vercel.json`. Por ello, los servidores CDN Edge de Vercel continuaban entregando la versión cacheada de `index.html` del día anterior, que apuntaba a los bundle hash antiguos (`index-BiH-ClnO.js`).

### Causa 2: Promoción de Deployment de Producción
- Vercel requería una promoción explícita `--prod` para invalidar inmediatamente el alias global `collectibles.uy` y forzar a los nodos edge a reconstruir la caché estática.

---

## 3. Correcciones Aplicadas

1. **Desactivación de Edge Caching para `index.html`**:
   Se actualizaron las configuraciones de Vercel ([vercel.json](file:///c:/Projects/Collectibles2026/vercel.json#L7-L14)) agregando reglas explícitas:
   - `/index.html`: `Cache-Control: public, max-age=0, must-revalidate` (forzando la revalidación instantánea del HTML en cada deploy).
   - `/assets/(.*)`: `Cache-Control: public, max-age=31536000, immutable` (manteniendo la máxima velocidad para los JS/CSS con hash).
2. **Implementación de la Marca de QA Temporal**:
   - Se desplegó `data-pdp-version="NEW-PDP-PRODUCTION"` / `PDP PROD VERSION: f9be60b` al dominio real `collectibles.uy`.
   - Se verificó mediante Playwright que el tag fue servido en `https://collectibles.uy/p/ghost-rider-danny-ketch-marvel-legends-85-years-hasbro-2e6w6`.
   - Una vez comprobado, se retiró el tag temporal y se volvió a promover a producción limpia.

---

## 4. Assets Cargados y Verificación en Vivo

### JS Bundles Verificados en `https://collectibles.uy`:
- **Main Bundle**: `https://collectibles.uy/assets/index-BCNTYDpd.js`
- **ProductDetail Chunk**: `https://collectibles.uy/assets/ProductDetail-Be1yz0kz.js`
- **CSS Bundle**: `https://collectibles.uy/assets/index-DTxTlXi1.css`

### Métricas de DOM Bounding Rects en Producción Real (`https://collectibles.uy`):
- **Contenedor Principal Ficha**: `max-w-[1500px] mx-auto px-4 sm:px-6 py-6 md:py-10` (**1440px reales renderizados** en viewport 1440px, **1500px** en 1920px).
- **Caja de Imagen Principal**: **`676.2px` de ancho x `580px` de alto** en desktop.
- **Título `h1`**: `593.7px` de ancho x `144px` de alto (`text-3xl sm:text-4xl lg:text-5xl font-black`).
- **Estado de Service Worker**: No bloqueante; el CDN entrega `index-BCNTYDpd.js` directamente con `max-age=0` revalidated.

---

## 5. Caso de Prueba Obligatorio Validado

- **URL Pública Real**: `https://collectibles.uy/p/ghost-rider-danny-ketch-marvel-legends-85-years-hasbro-2e6w6`
- **Producto**: *Ghost Rider Danny Ketch Marvel Legends 85 Years Hasbro*
- **Vendedor**: `JORGITOYS` (`Vendido y despachado por JORGITOYS`)
- **Estado**: **VERIFICADO Y EN VIVO EN PRODUCCIÓN**

---

## 6. Confirmación Final

El rediseño visual de la ficha de producto se encuentra **100% activo, desplegado y comprobado** en el dominio público oficial **`https://collectibles.uy`**.
