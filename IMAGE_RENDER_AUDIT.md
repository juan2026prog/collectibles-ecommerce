# AUDITORÍA DE RENDERIZADO DE IMÁGENES - COLLECTIBLES.UY

**Fecha:** 7 de Agosto, 2026  
**Proyecto:** Collectibles.uy (Ecommerce Multi-Vendor)  
**Objetivo:** Identificar todos los componentes y vistas que renderizan imágenes en el storefront público para implementar una capa integral de protección contra copia casual (deshabilitar drag, bloqueo de clic derecho en productos, evitar selección y long press) sin afectar el SEO, rendimiento ni la accesibilidad.

---

## 1. RESUMEN DE LA AUDITORÍA DE COMPONENTES

| Componente | Ruta de Archivo | Tipo de Imagen | Permite Drag | Permite Clic Derecho | Abre Imagen Directa | Lazy Loading | Etiqueta Usada | Oportunidades de Mejora |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **ProductGridCard** | `src/components/ProductGridCard.tsx` | Miniatura de producto, Badges de grupo, Cocardas | Sí (defecto) | Sí (defecto) | No (link `/p/:slug`) | Sí (`lazy`, `async`) | `<img>` | Aplicar `useImageProtection`, `draggable="false"`, `onContextMenu` blocking + Toast, `user-select: none`. |
| **ProductDetail** | `src/pages/ProductDetail.tsx` | Galería principal, Miniaturas, Sticky buy bar | Sí (defecto) | Sí (defecto) | No (Hover zoom & Selector) | Parcial | `<img>` | Proteger imagen principal y miniaturas; mantener funcional el zoom hover y responsive touch. |
| **HeroSlider** | `src/components/HeroSlider.tsx` | Sliders y Banners de la Home | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Deshabilitar drag sin interferir con el touch/swipe del carrusel. |
| **CampaignBanner** | `src/components/home/CampaignBanner.tsx` | Banners de campañas promocionales | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | `draggable="false"`, CSS protection class. |
| **FeaturedDrops** | `src/components/home/FeaturedDrops.tsx` | Tarjetas de drops destacados | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar protección de arrastre y selección. |
| **MiniBannerCard** | `src/components/home/MiniBannerCard.tsx` | Mini banners de la portada | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | `draggable="false"`, CSS protection class. |
| **PreOrders** | `src/components/home/PreOrders.tsx` | Productos en Preventa | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Protegido vía `ProductGridCard` / imágenes custom. |
| **CartDrawer** | `src/components/CartDrawer.tsx` | Miniaturas de productos en carrito lateral | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar `draggable="false"`, CSS de protección. |
| **Cart Page** | `src/pages/Cart.tsx` | Miniaturas de productos en página de carrito | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar `draggable="false"`, CSS de protección. |
| **Checkout & PackageCard** | `src/pages/Checkout.tsx`<br/>`src/components/checkout/PackageCard.tsx` | Miniaturas de orden y logos de vendors | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar `draggable="false"`, CSS de protección. |
| **Wishlist** | `src/pages/Wishlist.tsx` | Rejilla de favoritos | Sí | Sí | No | Sí | `<img>` | Hereda protección de `ProductGridCard`. |
| **VendorStorefront** | `src/pages/VendorStorefront.tsx` | Logo de tienda vendor, Banner de cabecera | Sí (defecto) | Sí (defecto) | No | Sí (productos) | `<img>` | Proteger banner y logo de tienda; productos protegidos por `ProductGridCard`. |
| **Shop Page** | `src/pages/Shop.tsx` | Logo de vendor emparejado, Banners | Sí (defecto) | Sí (defecto) | No | Sí | `<img>` | Proteger cabeceras de tienda/marca. |
| **CustomerPortal** | `src/pages/CustomerPortal.tsx` | Miniaturas de items comprados | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar `draggable="false"`, CSS de protección. |
| **International Pages** | `src/pages/international/*` | Productos importados de Amazon | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | Aplicar `draggable="false"`, CSS de protección. |
| **ProductBadge** | `src/components/ProductBadge.tsx` | Cocardas e imágenes de badges | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | `draggable="false"`, `user-select: none`. |
| **SoldByCard** | `src/components/SoldByCard.tsx` | Logo del vendedor en PDP | Sí (defecto) | Sí (defecto) | No | No / Defecto | `<img>` | `draggable="false"`, `user-select: none`. |

---

## 2. HALLAZGOS Y EVALUACIÓN DE ARQUITECTURA

1. **Ausencia de Directivas de Arrastre:**  
   La gran mayoría de las etiquetas `<img>` no especifican `draggable="false"` ni capturan el evento `ondragstart`. Esto permite que cualquier usuario arrastre la imagen fuera del navegador a su escritorio o a otra pestaña.

2. **Clic Derecho Habilitado:**  
   Ningún componente de producto restringe el evento `contextmenu`. Cualquier clic derecho despliega el menú contextual con opciones como "Guardar imagen como...", "Copiar dirección de la imagen", etc.

3. **Inexistencia de Directivas Touch/Selection CSS:**  
   No existen reglas CSS globales como `-webkit-touch-callout: none` ni `user-select: none` aplicadas a contenedores de imágenes, lo que permite en móviles el menú contextual emergente por pulsación prolongada (*long press*).

4. **Navegación e Imagen Directa:**  
   No se detectaron enlaces `<a>` apuntando directamente a URLs de archivos `.jpg`/`.png`. Las imágenes abren fichas de producto (`/p/:slug`) o controlan zooms internos.

5. **Exclusión Explicita de Paneles Administrativos:**  
   El panel de `/admin` y el `/vendor` hub contienen editores, vistas previas y administradores de medios (`MediaPickerModal.tsx`). La protección DEBE circunscribirse exclusivamente al storefront público (rutas bajo `StorefrontLayout`).

---

## 3. PLAN DE ACCIÓN Y ARQUITECTURA PROPUESTA

1. **Constante de Configuración (`src/config/imageProtection.ts`):**  
   `export const IMAGE_PROTECTION_ENABLED = true;`

2. **Estilos CSS Globales (`src/styles/imageProtection.css`):**  
   Clases utilitarias (`.img-protected`, `.no-drag`, `.no-select`, `.no-touch-callout`) con compatibilidad multi-navegador (Chrome, Firefox, Safari, Edge, Mobile Safari, Android Chrome).

3. **Hook Personalizado (`src/hooks/useImageProtection.ts`):**  
   Hook reutilizable que provee props para imágenes (`draggable={false}`, `onDragStart`, `onContextMenu`, etc.) y muestra un aviso Toast minimalista ("Las imágenes pertenecen a Collectibles.uy.") cuando se intenta hacer clic derecho en un producto.

4. **Refactorización e Integración de Componentes:**  
   Aplicar las directivas y el hook en `ProductGridCard`, `ProductDetail`, `HeroSlider`, `CampaignBanner`, `CartDrawer`, `VendorStorefront`, etc.

5. **Verificación QA:**  
   Asegurar que el zoom, la galería, el scroll, el SEO (tags `alt` intactas) y la velocidad de carga no se vean afectados en lo absoluto.
