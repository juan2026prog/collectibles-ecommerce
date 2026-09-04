# COLLECTIBLES 2026 — FASE 2 VISUAL AUDIT & DESIGN GAP ANALYSIS

## Fecha y Entorno
- **Fecha**: 4 de Septiembre de 2026
- **Entorno auditado**: Producción (`https://collectibles.uy`)
- **Viewports analizados**:
  - `Android_360x740`
  - `iPhoneSE_375x667`
  - `iPhone_390x844`
  - `iPhoneProMax_430x932`
  - `iPad_768x1024`
  - `Desktop_1440x900`
- **Capturas de referencia**: `qa/mobile-ux/phase2-before/`

---

## 1. Diagnóstico Global del Storefront

La plataforma cuenta con una base funcional y de performance sólida certificada en Fase 1 (resolución autoritativa de stock, sincronización de variantes, checkout atómico y optimización móvil base). Sin embargo, el análisis visual y de UX/CRO detecta oportunidades clave de refinamiento para consolidar una **experiencia de ecommerce premium de coleccionismo**:

---

## 2. Hallazgos Específicos por Componente

### A. Tipografía y Jerarquía Visual
- **Problema**: Uso reiterado de `font-black`, `uppercase` y tracking extremo en elementos secundarios y labels, lo que genera una sensación de interfaz sobrecargada ("pesada" o gamer genérica).
- **Oportunidad**:
  - Reservar pesos altos (`font-bold` / `font-black`) para precios, titulares principales (H1) y CTAs principales.
  - Aliviar textos secundarios, descripciones, metadatos y labels a `font-medium` o `font-normal` con tracking estándar (`tracking-normal` o `tracking-tight` sutil).

### B. Product Grid Card (`ProductGridCard.tsx`)
- **Problema**:
  - Si un producto tiene `reviews_count === 0`, en ocasiones se renderizaban estrellas vacías que ocupan espacio vertical y transmiten sensación de producto no calificado en lugar de una tarjeta limpia.
  - El botón de carrito circular debe asegurar siempre un área de toque mínima de 44×44px en mobile.
  - Las cocardas (NEW, PRE-ORDER, SALE, PROMO) necesitan alineación y espaciado consistente sin riesgo de superposición.
  - El badge de vendedor debe ser sutil: un highlight magenta elegante para "Vendido por Collectibles" y un pill neutro y pulido para vendors autorizados.
- **Oportunidad**: Rediseño visual enfocado en una imagen amplia con ratio consistente, tipografía jerárquica limpia, precio prominente y CTA circular de carrito 44×44px.

### C. Header & Búsqueda (`StorefrontLayout.tsx`)
- **Problema**:
  - El input de búsqueda mobile y desktop puede beneficiarse de mejores estados de `:focus` y bordes más sutiles (`border-zinc-800 focus:border-magenta`).
  - Altura del header mobile compacta y consistente en todos los viewports.

### D. Home & Secciones (`Home.tsx`)
- **Problema**:
  - La transición entre el Hero y las secciones de catálogo requiere un ritmo de espaciado vertical más armónico (`py-8 md:py-12`) para evitar que el usuario deba hacer scroll excesivo antes de ver los primeros productos.
  - Títulos de sección ("Nuevos Lanzamientos", "Preventas", "Destacados") con estilo editorial premium.

### E. Shop & Filtros (`Shop.tsx`)
- **Problema**:
  - El drawer de filtros en mobile debe garantizar un touch target de 44px en checkboxes, radios y botones de colapso de categorías.
  - Los botones "Aplicar Filtros" y "Limpiar" deben estar fijos en la parte inferior del drawer con safe-area-inset para fácil acceso con una mano.

### F. Licencias y Themes (`LicensesIndex.tsx`, `ThemesIndex.tsx`)
- **Problema**:
  - Las tarjetas de licencias y themes deben mantener su aspecto editorial cinematográfico respetando los pipelines de proporciones (1200×600 para Licencias, 1600×900 para Themes), con microinteracciones sutiles de hover en desktop y legibilidad clara sobre imágenes oscuras.

### G. Product Detail Page (PDP) (`ProductDetail.tsx`)
- **Problema**:
  - Jerarquía visual por encima del CTA: Galería -> Título -> BuyBox Vendor -> Precio -> Stock Status -> Variantes -> Cantidad -> CTAs.
  - Los dos botones de acción deben tener una jerarquía inequívoca:
    - **Primary CTA**: "COMPRAR AHORA" (fondo magenta dominante, 48px de alto, touch target accesible).
    - **Secondary CTA**: "AGREGAR AL CARRITO" (fondo oscuro / borde magenta sutil o superficie neutra).
  - Selector de cantidad con botones `+` y `-` de 44×44px reales.
  - Sticky Buy Bar: diseño compacto, solo activo cuando el CTA principal sale del viewport, con safe-area inferior.

### H. Cart Drawer, Cart Page & Checkout (`CartDrawer.tsx`, `Cart.tsx`, `Checkout.tsx`)
- **Problema**:
  - Cart Drawer: padding inferior para respetar la barra de navegación de iOS (`env(safe-area-inset-bottom)`).
  - Checkout: inputs con altura mínima de 44px, labels claras, mensaje de error en rojo discreto, WhatsApp FAB debidamente oculto en el flujo de compra para eliminar distracciones.

---

## 3. Plan de Acción Inmediato
1. Refinar tokens en `frontend/src/index.css`.
2. Rediseñar `ProductGridCard.tsx`.
3. Refinar `ProductDetail.tsx` (PDP, jerarquía de CTAs, Sticky Bar).
4. Refinar `Shop.tsx` y Drawer de Filtros.
5. Refinar `StorefrontLayout.tsx` (Header, Menú mobile, Search).
6. Refinar `CartDrawer.tsx`, `Cart.tsx` y `Checkout.tsx`.
7. Ejecutar suite de pruebas y capturar AFTER screenshots.
