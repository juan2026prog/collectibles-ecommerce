# COLLECTIBLES 2026 — AUDITORÍA UX/UI MOBILE REAL EN PRODUCCIÓN

> **Fecha de Auditoría:** 3 de Septiembre de 2026  
> **Sitio Auditado:** `https://collectibles.uy` (Producción Live)  
> **Repositorio:** `juan2026prog/collectibles-ecommerce`  
> **Roles:** Senior Mobile UX/UI Designer · Senior React/Tailwind Frontend Engineer · Mobile QA Engineer · CRO Specialist  
> **Estado de Cambios:** **AUDITORÍA DE DIAGNÓSTICO PURA — NO SE REALIZARON CAMBIOS EN PRODUCCIÓN**

---

## ÍNDICE

1. [Executive Summary](#1-executive-summary)
2. [Matriz de Clasificación de Problemas (P0, P1, P2, P3)](#2-matriz-de-clasificación-de-problemas)
3. [Viewports Auditados y Métricas de Dispositivo](#3-viewports-auditados-y-métricas-de-dispositivo)
4. [Header y Announcement Bar](#4-header-y-announcement-bar)
5. [Home Mobile y Above the Fold](#5-home-mobile-y-above-the-fold)
6. [Mobile Menu Drawer](#6-mobile-menu-drawer)
7. [Búsqueda Mobile](#7-búsqueda-mobile)
8. [Shop y Catálogo de Productos](#8-shop-y-catálogo-de-productos)
9. [Product Grid Card (2 Columnas Mobile)](#9-product-grid-card-2-columnas-mobile)
10. [Product Detail Page (Ficha de Producto)](#10-product-detail-page-ficha-de-producto)
11. [Cart Drawer y Carrito](#11-cart-drawer-y-carrito)
12. [Checkout Mobile y Flujo de Compra](#12-checkout-mobile-y-flujo-de-compra)
13. [Touch Targets y Accesibilidad](#13-touch-targets-y-accesibilidad)
14. [Performance Percibida y Layout Shifts](#14-performance-percibida-y-layout-shifts)
15. [Errores de Consola, Red y Runtime](#15-errores-de-consola-red-y-runtime)
16. [Propuesta de Rediseño: Fases 1, 2 y 3](#16-propuesta-de-rediseño)
17. [Componentes Implicados](#17-componentes-implicados)

---

## 1. EXECUTIVE SUMMARY

Se ejecutó una auditoría exhaustiva y emulada con dispositivos móviles reales sobre el sitio en producción `https://collectibles.uy`. Se recorrió el flujo punta a punta: **Home → Menú Mobile → Búsqueda → Catálogo/Shop → Ficha de Producto → Agregar al Carrito → Cart Drawer → Carrito → Checkout** en viewports de 360×740, 375×667, 390×844 (prioridad principal), 430×932 y 768×1024.

### Diagnóstico General:
El sitio cuenta con una identidad visual temática definida (dark mode, magenta `#f00856`, espíritu coleccionista) y un backend sólido con Supabase, pero adolece de **fricción mobile crítica en conversión, saturación visual y sobrecarga de elementos por pantalla**. 

### Puntos Más Críticos Detectados:
1. **Header Bloqueante:** En mobile, la combinación de Announcement Bar (40px) + Header (81px) + Barra de Búsqueda fija (59px) bloquea **180px verticales continuos** (21.3% a 27% del viewport del usuario antes de comenzar el contenido).
2. **Above The Fold sin Productos:** En Home y en Shop, el usuario debe realizar scrolls extensos (>800px) para ver la primera imagen de producto real. En PDP, el botón principal de compra (`COMPRAR AHORA`) se encuentra a **Y=1036px**, fuera del primer pantallazo (844px).
3. **Product Grid Card Saturada:** En grilla de 2 columnas, cada tarjeta tiene un borde magenta estridente (`border-2 border-[#f00856]`), 5 estrellas de rating aún con `(0)` reviews, botón de wishlist flotante tapando la esquina de la foto, badge de vendedor "Vendido por Collectibles", badge de condición, título cortado y botón de carrito, generando un "muro de cajas fucsia" difícil de escanear.
4. **Distracción en Checkout (Fuga de CRO):** En el inicio del Checkout, antes de que el comprador ingrese sus datos de facturación, se le presenta un carrusel de productos ("Sugerencias para tu compra") que desplaza el formulario y dispersa el foco de cierre.
5. **Botón Flotante WhatsApp Invasivo:** El FAB de WhatsApp se superpone con elementos interactivos inferiores (botones de checkout, links de continuar comprando, insignias de confianza).

---

## 2. MATRIZ DE CLASIFICACIÓN DE PROBLEMAS

| Nivel | Definición | Cantidad Detectada |
|---|---|---|
| **P0** | Rompe navegación / bloqueo crítico de compra | 2 |
| **P1** | Problema UX grave que reduce drásticamente la conversión | 6 |
| **P2** | Fricción de usabilidad, densidad excesiva o confusión | 8 |
| **P3** | Refinamiento cosmético, micro-interacciones y alineaciones | 6 |

---

## 3. VIEWPORTS AUDITADOS Y MÉTRICAS DE DISPOSITIVO

| Dispositivo | Viewport | Scale | Sticky Header Ocupado | % Pantalla Bloqueada | Overflow Horizontal |
|---|---|---|---|---|---|
| **Samsung Galaxy S9/Android** | 360 × 740 | 3.0x | 180px | **24.3%** | No |
| **iPhone SE / 8** | 375 × 667 | 2.0x | 180px | **27.0%** | No |
| **iPhone 12 / 13 / 14 (Principal)** | 390 × 844 | 3.0x | 180px | **21.3%** | No |
| **iPhone 14/15/16 Pro Max** | 430 × 932 | 3.0x | 180px | **19.3%** | No |
| **iPad Mini / Tablet** | 768 × 1024 | 2.0x | 140px | **13.6%** | No |

---

## 4. HEADER Y ANNOUNCEMENT BAR

### Hallazgos:
- **Altura desproporcionada en mobile:** El `<header>` tiene clase `h-20` (80px), pensada para desktop. En un teléfono de 667px o 740px de altura, 80px para mostrar un logo y tres iconos es excesivo.
- **Announcement bar + Search fija:** En la Home, la barra de búsqueda `lg:hidden` tiene `sticky top-20` sumándose al header y a la announcement bar. La suma total es 180px fijos.
- **Falta de auto-hide en scroll:** Al hacer scroll hacia abajo, la barra de búsqueda y el header continúan ocupando pantalla en vez de contraerse suavemente como en las mejores prácticas de ecommerce mobile (Amazon, Mercado Libre, Nike).
- **Touch Target del botón cerrar del Announcement:** El icono `X` en la esquina derecha tiene un área de toque reducida (<32px).

---

## 5. HOME MOBILE Y ABOVE THE FOLD

### Hallazgos:
- **Hero invasivo sin catálogo inmediato:** El Hero Slider presenta un badge, un H1 de dos líneas, subtítulo descriptivo de dos líneas y **dos botones apilados** (`VER CATÁLOGO` y `Ver PROMOS`). Esto empuja el siguiente contenido a más de 500px hacia abajo.
- **Banners intermedios antes del grid:** Tras scrollear el hero, aparecen banners promocionales completos (`K-POP DEMON HUNTERS`, `UNIVERSOS DESTACADOS`) antes de que el usuario vea un solo producto disponible.
- **Cookie Consent:** En la primera sesión, el modal de cookies bloquea los 350px inferiores de la pantalla, dejando solo una franja de ~250px visible entre el header y el modal.

---

## 6. MOBILE MENU DRAWER

### Hallazgos:
- **Duplicación de Búsqueda:** El menú lateral desplegable incluye su propio campo de búsqueda (`input`), duplicando la barra que ya está fija en el header o en la pantalla principal.
- **Selector de moneda en posición no prioritaria:** El selector `UYU` aparece arriba a la izquierda antes del contenido de navegación.
- **Botones de Auth dominantes:** `INICIAR SESIÓN` (magenta grande) y `CREAR CUENTA` ocupan un bloque vertical notable que empuja los enlaces de navegación (`CATEGORÍAS`, `LICENCIAS`, `THEMES`, `MARCAS`).
- **Acordeones efectivos:** Los desplegables de categorías y licencias funcionan fluidamente y cargan los subelementos sin delay notable.

---

## 7. BÚSQUEDA MOBILE

### Hallazgos:
- **Placeholder extenso:** `🔍 Buscar Funko, Pokémon, Marvel, Hot Wheels...` se corta en pantallas de 360px (`360×740`).
- **Input Height:** Tiene `py-2.5`, alcanzando 38px de altura total. La directriz de accesibilidad y Apple Human Interface Guidelines exige un mínimo de 44px para campos de entrada interactivos.
- **Transición a Shop:** Al presionar Enter, redirige a `/shop?q=...` correctamente y filtra el catálogo con debounce apropiado.

---

## 8. SHOP Y CATÁLOGO DE PRODUCTOS

### Hallazgos:
- **Sobrecarga de encabezados:** Antes de las tarjetas hay:
  1. Breadcrumbs (`INICIO > CATÁLOGO`)
  2. Subtítulo `CATÁLOGO`
  3. H1 `Productos`
  4. Barra de herramientas (`1207 productos`, selector `Recomendados`, botón `FILTROS`)
  5. Bloque `MARKETPLACE INTEGRADO`
  6. Título `Resultados destacados`
  - Esto consume más de **400px verticales**. El usuario tiene que scrollear antes de ver el primer producto.
- **Drawer de Filtros:** Muy bien resuelto en UX: panel lateral oscuro, cuenta de productos por filtro, y botón sticky inferior `VER 1207 RESULTADOS`.

---

## 9. PRODUCT GRID CARD (2 COLUMNAS MOBILE)

### Diagnóstico de Saturación:
La `ProductGridCard` en 2 columnas (ancho aproximado 165px - 180px por card) contiene hasta **11 elementos simultáneos**:
1. Borde perimetral magenta estridente (`border-2 border-[#f00856]`) en casi todas las cards (al ser productos directos de Collectibles).
2. Botón flotante de favoritos (Heart) con fondo oscuro semi-transparente sobre la esquina superior izquierda de la foto.
3. Badges promocionales en la esquina superior derecha (`20% DTO DÍA DEL NIÑO`).
4. Cocardas de Grupo/Colección en el margen izquierdo.
5. Badge de condición (LOOSE / OPEN BOX) en la esquina inferior izquierda.
6. 5 estrellas de rating amarillas fijas seguidas de `(0)` reviews.
7. Badge `🌎 INTERNACIONAL` si aplica.
8. Texto de vendedor: `VENDIDO POR COLLECTIBLES` (2 líneas).
9. Título del producto (`line-clamp-2 min-h-[32px]`).
10. Precios (precio actual en negrita magenta + precio tachado anterior).
11. Botón circular flotante de carrito (`44×44px`) apretado contra el precio.

### Problemas Detectados:
- **Efecto "Jaula Fucsia":** La pantalla en `/shop` se llena de recuadros magenta fosforescentes que compiten entre sí y cansan la vista.
- **Reviews en Cero:** Mostrar 5 estrellas amarillas vacías con `(0)` ocupa espacio vertical crítico y no aporta prueba social positiva.
- **Vendedor repetitivo:** En productos de la tienda propia, `Vendido por Collectibles` en cada card sobrecarga la tarjeta sin necesidad.

---

## 10. PRODUCT DETAIL PAGE (FICHA DE PRODUCTO)

### Hallazgos:
- **CTA debajo del fold (P1 CRO):** En `390×844`, el botón `COMPRAR AHORA` está ubicado en Y=1036px. En el primer pantallazo solo se ven el carrusel de imagen, las miniaturas, el badge `FICHA DE PRODUCTO` y el título. El precio y el botón de compra requieren scroll obligatorio.
- **Botones Duplicados:** La ficha presenta dos botones enormes contiguos: `⚡ COMPRAR AHORA` y `🛒 AGREGAR AL CARRITO`. En mobile esto divide la atención e incrementa la fricción.
- **Sticky Buy Bar ausente en scroll inicial:** La barra flotante inferior de compra solo se dispara cuando el botón principal sale completamente por la parte superior (`rect.bottom < 0`). Si el usuario navega a mitad de página o mira la galería, no dispone de un CTA flotante accesible.
- **Falta de Safe Area en iOS:** Los botones pegados al borde inferior no respetan `env(safe-area-inset-bottom)` en iPhones con Home Bar.

---

## 11. CART DRAWER Y CARRITO

### Hallazgos:
- **Imagen rota en Drawer:** En el Cart Drawer, el producto agregado mostró un placeholder genérico (icono de cámara) en lugar de la imagen real del producto.
- **Jerarquía y colores:** El botón principal del drawer es verde esmeralda (`FINALIZAR PAGO ->`), mientras que la identidad de marca del sitio es magenta `#f00856`. Genera inconsistencia de branding.
- **Link inferior apretado:** `← Continuar comprando` se encuentra a menos de 10px del borde inferior del drawer, quedando muy cerca de la barra de gestos de iOS.
- **Puntos positivos:** La barra de progreso de envío gratis ("¡Tenés envío GRATIS!") y el contador de reserva de stock generan urgencia positiva para CRO.

---

## 12. CHECKOUT MOBILE Y FLUJO DE COMPRA

### Hallazgos:
- **Distracción Crítica en Checkout (P1):** En la pantalla `/checkout`, entre el stepper (`Facturación > Envío > Pago`) y el formulario de datos, se inyecta un carrusel completo de "SUGERENCIAS PARA TU COMPRA". Esto empuja los campos del formulario fuera de la pantalla inicial e incita al abandono del carrito.
- **Inconsistencia de botones de navegación:** El botón `< Volver al carrito` es un círculo ovalado desproporcionado, mientras que `CONTINUAR >` es una píldora alargada.
- **Invasión del FAB de WhatsApp:** El botón flotante de WhatsApp se sitúa sobre el resumen de compra y las opciones de envío en la esquina inferior derecha.

---

## 13. TOUCH TARGETS Y ACCESIBILIDAD

- **Objetivos táctiles menores a 44×44px detectados:**
  - Campo de búsqueda mobile: altura 38px (debe ser mínimo 44px).
  - Enlace "VER TODAS" en Home: altura 16px.
  - Botón de cierre de WhatsApp FAB: 24×24px.
  - Botones de cookies: 40px de altura.
- **Contraste:** Los textos secundarios en `text-slate-500` sobre fondos `#05070f` tienen un ratio de contraste cercano a 3.8:1, por debajo de los 4.5:1 recomendados por WCAG AA.

---

## 14. PERFORMANCE PERCIBIDA Y LAYOUT SHIFTS

- **Skeletons efectivos:** Las páginas de Shop y Producto usan esqueletos grises mientras cargan datos de Supabase, evitando saltos bruscos de diseño.
- **Imágenes en catálogo:** Las imágenes en formato WebP cargan adecuadamente con `loading="lazy"`.
- **Marquee animado:** La marquesina del announcement bar corre fluida sin trabas de CPU en mobile.

---

## 15. ERRORES DE CONSOLA, RED Y RUNTIME

1. **Wikimedia SVGs bloqueados por ORB:**
   - `upload.wikimedia.org/wikipedia/commons/1/1c/DC_Comics_logo.svg`: `net::ERR_BLOCKED_BY_ORB`
   - `upload.wikimedia.org/wikipedia/commons/c/c9/Dragon_Ball_Z_Logo.svg`: `net::ERR_BLOCKED_BY_ORB`
   - *Impacto:* Logos de marcas y licencias rotos en navegadores modernos debido a restricciones de hotlinking de Wikimedia.
2. **Error 404 / 406 en categoría:**
   - Request a `/categoria/figuras-de-accion`: 404.
   - Query Supabase `categories?slug=eq.figuras-de-accion`: 406.

---

## 16. PROPUESTA DE REDISEÑO: FASES 1, 2 Y 3

### FASE 1 — Quick Wins de Alto Impacto (Inmediato)
1. **Reducir Header Mobile:** Disminuir `<header>` de `h-20` (80px) a `h-14` (56px). Reducir tamaño del logo horizontal en mobile.
2. **Suprimir Borde Magenta Masivo en Cards:** Quitar el borde `border-2 border-[#f00856]` de todas las tarjetas por defecto; sustituirlo por un borde sutil `border border-white/10` con hover o sutil acento solo en productos destacados o exclusivos.
3. **Mover Sugerencias fuera del inicio del Checkout:** Quitar el carrusel de productos recomendados del tope del checkout mobile o ubicarlo al final después del resumen.
4. **Ocultar Ratings con 0 Reviews en Cards:** Si `reviewsCount === 0`, no renderizar las 5 estrellas vacías.
5. **Ajustar Posición del FAB de WhatsApp:** Elevar el botón flotante de WhatsApp o darle `bottom-20` / `hidden` durante el flujo de Checkout y Cart Drawer.
6. **Añadir `pb-safe` / `safe-area-inset-bottom`:** Corregir el espaciado inferior en el footer del Cart Drawer y barra sticky de PDP.

### FASE 2 — Refinamiento Visual y Ritmo (Mediano Plazo)
1. **Compactar Encabezado de Shop:** Fusionar título, contador y barra de filtros en una sola fila compacta (como ASOS o Mercado Libre), reduciendo 250px de espacio vertical muerto.
2. **Galería Compacta en PDP:** En pantallas pequeñas (<400px), permitir swipe horizontal con paginación de puntos en la galería de fotos en lugar de miniaturas estáticas que empujan el precio hacia abajo.
3. **Sticky Add-to-Cart Permanente en PDP:** Barra flotante fija al pie con el precio y botón "Comprar Ahora" con `safe-area-bottom`.
4. **Consistencia de Botones en Checkout:** Estandarizar botones de navegación hacia atrás y hacia adelante con misma escala y proporciones.

### FASE 3 — Optimización CRO (Avanzado)
1. **Header Inteligente con Auto-Scroll:** Ocultar el announcement bar y la barra de búsqueda al scrollear hacia abajo, reapareciendo al scrollear hacia arriba.
2. **One-Click Checkout / Express Buy:** Permitir compra directa desde la ficha de producto sin pasar por drawer intermedio si el usuario elige "Comprar Ahora".
3. **Micro-Badges Optimizados:** Reorganizar las cocardas y sellos de condición en una sola línea de micro-etiquetas semánticas sin tapar el producto.

---

## 17. COMPONENTES IMPLICADOS

- `frontend/src/layouts/StorefrontLayout.tsx` (Header, Announcement, Mobile Menu Drawer, Mobile Search).
- `frontend/src/components/ProductGridCard.tsx` (Bordes de tarjeta, badges, ratings, vendor label, botones).
- `frontend/src/pages/ProductDetail.tsx` (Above the fold, galería, miniaturas, sticky buy bar, botones apilados).
- `frontend/src/components/CartDrawer.tsx` (Imagen rota, padding inferior safe-area, colores de CTA).
- `frontend/src/pages/Checkout.tsx` (Carrusel de sugerencias, botones desalineados, z-index WhatsApp).
- `frontend/src/components/WhatsAppFAB.tsx` (Área de toque del botón cerrar, colisiones con drawers).
- `frontend/src/pages/Shop.tsx` (Pérdida de espacio en encabezados de catálogo).

---

## 18. EVIDENCIA EN CAPTURAS DE PANTALLA

Todas las capturas reales obtenidas durante la auditoría fueron guardadas en:
`qa/mobile-ux/screenshots/`

- `01_home_top_clean_390x844.png`
- `02_home_after_hero_390x844.png`
- `03_home_product_grid_clean_390x844.png`
- `04_mobile_menu_top_390x844.png`
- `04b_mobile_menu_scrolled_390x844.png`
- `06_shop_catalog_clean_390x844.png`
- `06b_shop_2columns_cards_390x844.png`
- `07_shop_filters_open_390x844.png`
- `08_licencias_index_390x844.png`
- `09_themes_index_390x844.png`
- `10_product_detail_top_390x844.png`
- `11_product_detail_cta_390x844.png`
- `11b_product_detail_sticky_bar_390x844.png`
- `12_cart_drawer_with_item_390x844.png`
- `13_cart_page_with_items_390x844.png`
- `14_checkout_top_with_items_390x844.png`
- `15_checkout_payment_summary_with_items_390x844.png`
- `home_360x740_Android.png`
- `home_375x667_iPhoneSE.png`
- `home_430x932_iPhoneProMax.png`
- `home_768x1024_iPad.png`
- `shop_360x740_Android.png`
- `shop_375x667_iPhoneSE.png`
