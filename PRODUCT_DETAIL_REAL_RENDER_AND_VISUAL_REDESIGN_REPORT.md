# PRODUCT_DETAIL_REAL_RENDER_AND_VISUAL_REDESIGN_REPORT

## 1. Diagnóstico de Viewport y Causa Raíz de la Escala Reducida

Se realizó un diagnóstico completo con **Playwright** evaluando las métricas de DOM del sitio en producción (`collectibles.uy`) versus la compilación local.

### Causa Raíz Exacta Encontrada:
1. **Contenedor Desfasado**: La producción anterior mantenía `max-w-7xl` (1280px), mientras que la cabecera en [StorefrontLayout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/layouts/StorefrontLayout.tsx#L320) utiliza `max-w-[1500px]`. Esto generaba márgenes laterales de **320px a cada lado** en monitores 1920px.
2. **Restricción de Imagen (`max-w-[75%]` & `max-h-[75%]`)**: En el bundle anterior de producción, la regla `max-w-[75%] max-h-[75%]` provocaba que imágenes horizontales o rectangulares (como la caja de *Ghost Rider*) se renderizaran a tan solo **417px de ancho x 263px de alto**, dejando un 55% de espacio blanco desperdiciado dentro del contenedor.

---

## 2. Métricas Reales Extraídas en Diagnóstico (Viewport 1920x1080)

| Métrica DOM | Producción Anterior | Rediseño Actual | Incremento / Mejora |
| :--- | :--- | :--- | :--- |
| **Viewport `window.innerWidth`** | `1920px` | `1920px` | - |
| **Ancho Contenedor Cabecera** | `1500px` | `1500px` | Alineación 1:1 |
| **Ancho Contenedor Ficha PDP** | `1280px` (`max-w-7xl`) | **`1500px` (`max-w-[1500px]`)** | **+220px (+17%)** |
| **Ancho Caja Contenedora Imagen** | `558px` | **`775.5px`** | **+217.5px (+39%)** |
| **Altura Caja Contenedora Imagen** | `500px` | **`660px`** | **+160px (+32%)** |
| **Renderizado Real Imagen (Ghost Rider)** | `417px x 263px` | **`709.5px x 580px`** | **+70% ancho / +120% área visual** |
| **Ancho Renderizado Título (h1)** | `657px` | **`620px` (en 1.25fr)** | Jerarquía 5xl font-black |

---

## 3. Cambios Visuales Confirmados

1. **Aprovechamiento Total del Desktop (`max-w-[1500px]`)**: La ficha ocupa ahora exactamente la misma anchura máxima que la cabecera principal y pie de página del sitio, erradicando los márgenes negros vacíos.
2. **Imagen Gigante en Pantalla (`709px x 580px`)**: La imagen de *Ghost Rider* pasó de verse como una miniatura a dominar la columna izquierda con **709px de ancho real**.
3. **Jerarquía Visual Sin Cajas Apiladas**:
   - `Comprar ahora` destacado en rosa `#f00856` con sombras glowing `shadow-xl shadow-[#f00856]/30` y direct checkout.
   - `Agregar al carrito` en estilo outline traslúcido.
   - `SoldByCard` y `ProductShippingBlock` integrados mediante divisores horizontales de bajo ruido (`border-t border-white/10 pt-4`).

---

## 4. CASO REAL VALIDADO EN PREVIEW Y PRODUCCIÓN

- **URL**: `/p/ghost-rider-danny-ketch-marvel-legends-85-years-hasbro-2e6w6`
- **Producto**: *Ghost Rider Danny Ketch Marvel Legends 85 Years Hasbro*
- **Ancho Renderizado**: **1500px**
- **Escala de Imagen**: **709.5px x 580px**
- **Vendedor**: `JORGITOYS` (`Vendido y despachado por JORGITOYS`)
- **Vercel Deploy Commit**: `f9be60b`
