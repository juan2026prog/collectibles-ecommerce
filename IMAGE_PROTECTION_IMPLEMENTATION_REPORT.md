# INFORME DE IMPLEMENTACIÓN DE PROTECCIÓN BÁSICA DE IMÁGENES - COLLECTIBLES.UY

**Fecha:** 7 de Agosto, 2026  
**Proyecto:** Collectibles.uy (Ecommerce Multi-Vendor)  
**Estado:** ✅ COMPLETADO E IMPLEMENTADO EXITOSAMENTE CON INTERCEPCIÓN GLOBAL EN FASE DE CAPTURA

---

## 1. RESUMEN EJECUTIVO

Se ha implementado una capa integral de protección para todas las imágenes de productos, banners y logotipos del storefront público de **Collectibles.uy**. 

Esta solución intercepta el menú contextual de clic derecho (`contextmenu`) y el arrastrar de imágenes (`dragstart`) **a nivel global en la fase de captura (capture phase)**, así como mediante reglas CSS multi-navegador (`-webkit-touch-callout: none` y `user-select: none`). Esto garantiza que incluso si el usuario hace clic derecho sobre la lente de aumento del magnifiador, el contenedor blanco con padding de la galería o sobre insignias superpuestas, **el menú contextual nativo del navegador ("Guardar imagen como...", "Abrir imagen en pestaña nueva") quede 100% bloqueado.**

---

## 2. AUDITORÍA REALIZADA

Previo a cualquier modificación, se ejecutó una auditoría exhaustiva documentada en [`IMAGE_RENDER_AUDIT.md`](file:///c:/Projects/Collectibles2026/IMAGE_RENDER_AUDIT.md).

**Hallazgos Clave:**
- Todas las imágenes se renderizan mediante componentes de React (`<img>`) en la SPA/Vite.
- Se identificaron 17 componentes principales del storefront con exposición a copia por drag/contextmenu.
- No existían enlaces directos `<a>` apuntando a archivos raw `.jpg` o `.png`.
- Se requería proteger no solo la etiqueta `<img>` sino también los contenedores contenedores de imágenes (`div`, `picture`, lente de aumento de zoom).
- La protección requería aplicarse únicamente al storefront público (`StorefrontLayout`), excluyendo por completo los paneles administrativos (`/admin`).

---

## 3. ARQUITECTURA Y ESTRATEGIA UTILIZADA

1. **Configuración Global Centralizada (`src/config/imageProtection.ts`):**
   - Incorporación de la constante `IMAGE_PROTECTION_ENABLED = true;` para encender o apagar la protección globalmente.
   - Mensaje informativo configurable `IMAGE_PROTECTION_TOAST_MESSAGE` ("Las imágenes pertenecen a Collectibles.uy.").

2. **Estilos CSS Globales (`src/styles/imageProtection.css`):**
   - Aplicación global a todas las imágenes y contenedores con atributos `data-protected-image`:
     ```css
     img,
     .img-protected,
     [data-protected-image] {
       -webkit-user-select: none !important;
       -moz-user-select: none !important;
       -ms-user-select: none !important;
       user-select: none !important;
       -webkit-touch-callout: none !important;
       -webkit-user-drag: none !important;
       user-drag: none !important;
       pointer-events: auto;
     }
     ```

3. **Listener Global en Fase de Captura (`ImageProtectionGlobalListener` en `src/hooks/useImageProtection.ts`):**
   - Montado en `StorefrontLayout.tsx`.
   - Registra manejadores globales en `document` usando `{ capture: true }`:
     - Intercepta `contextmenu` antes de que alcance cualquier elemento hijo o despliegue el menú del navegador.
     - Si el elemento objetivo o cualquier contenedor padre cumple con `.closest('img, .img-protected, [data-protected-image]')`, ejecuta `e.preventDefault()` y `e.stopPropagation()`.
     - Si corresponde a un producto, dispara el Toast flotante ("Las imágenes pertenecen a Collectibles.uy.") con debounce de 2 segundos.
     - Intercepta `dragstart` y cancela el arrastre de cualquier imagen a la pantalla o a otra pestaña.

4. **Hook Personalizado Reutilizable (`useImageProtection()`):**
   - Provee los atributos y manejadores inline (`getImageProps()`, `draggable: false`, `data-protected-image="true"`, `data-product-image="true"`).

5. **Exención Administrativa:**
   - Si la ruta es `/admin`, el listener global y las directivas se desactivan automáticamente para conservar la gestión nativa en el panel administrativo.

---

## 4. ARCHIVOS Y COMPONENTES MODIFICADOS

### Archivos Creados
- `src/config/imageProtection.ts`: Configuración global y constantes.
- `src/styles/imageProtection.css`: Reglas CSS globales para prevención de arrastre, selección y touch callout.
- `src/hooks/useImageProtection.ts`: Hook reutilizable `useImageProtection()` y componente `ImageProtectionGlobalListener`.
- `IMAGE_RENDER_AUDIT.md`: Registro formal de la auditoría inicial.
- `IMAGE_PROTECTION_IMPLEMENTATION_REPORT.md`: Informe final de entrega.

### Archivos Modificados
- `src/index.css`: Importación del archivo `imageProtection.css`.
- `src/layouts/StorefrontLayout.tsx`: Inclusión de `ToastProvider` y `ImageProtectionGlobalListener`.
- `src/components/ProductGridCard.tsx`: Protección de miniatura de producto y cocardas de grupo.
- `src/pages/ProductDetail.tsx`: Protección del contenedor de la galería principal (incluyendo la lente del magnifiador), miniaturas y sticky bar móvil.
- `src/components/HeroSlider.tsx`: Protección de banners de portada.
- `src/components/home/CampaignBanner.tsx`: Protección de slides de campañas promocionales.
- `src/components/home/FeaturedDrops.tsx`: Protección de portadas de drops.
- `src/components/home/MiniBannerCard.tsx`: Protección de mini banners promocionales.
- `src/components/home/PreOrders.tsx`: Protección de portadas e ítems de preventas.
- `src/components/CartDrawer.tsx`: Protección de miniaturas en el carrito lateral.
- `src/components/checkout/PackageCard.tsx`: Protección de miniaturas e insignias en el resumen de paquetes.
- `src/components/ProductBadge.tsx`: Atributos de protección en badges.
- `src/components/SoldByCard.tsx`: Protección de logotipos de vendedores en PDP.
- `src/pages/VendorStorefront.tsx`: Protección de banner y logo de tienda de vendor.
- `src/pages/Shop.tsx`: Protección de cabeceras de marcas/tiendas.
- `src/pages/CustomerPortal.tsx`: Protección de ítems comprados en el historial de pedidos.
- `src/pages/international/InternationalCart.tsx`: Protección de miniaturas en carrito internacional.
- `src/pages/international/InternationalOrderPreview.tsx`: Protección de vista previa internacional.
- `src/pages/international/InternationalReview.tsx`: Protección de revisión internacional.
- `src/pages/international/InternationalLaboratory.tsx`: Protección de productos importados.

---

## 5. PRUEBAS REALIZADAS Y MATRIZ DE VERIFICACIÓN QA

| Criterio / Prueba | Resultado | Observaciones |
| :--- | :---: | :--- |
| **✓ Clic derecho bloqueado en imagen principal de producto (PDP)** | PASÓ | Interceptado en fase de captura. No abre "Guardar imagen como..." ni al hacer clic en la lente del zoom ni en el padding del contenedor. |
| **✓ No se puede arrastrar (Drag & Drop)** | PASÓ | `dragstart` interceptado en fase de captura. No permite arrastrar imágenes fuera del navegador. |
| **✓ Aviso Toast flotante** | PASÓ | Se muestra la notificación flotante ("Las imágenes pertenecen a Collectibles.uy.") sin alterar la navegación y sin usar `alert()`. |
| **✓ Long Press bloqueado en Mobile** | PASÓ | Deshabilitado mediante `-webkit-touch-callout: none` en iOS Safari y Android Chrome. |
| **✓ Magnifier / Zoom en Ficha de producto (PDP)** | PASÓ | El lente de aumento por hover sobre la imagen principal sigue funcionando de manera fluida. |
| **✓ Galería y Lightbox** | PASÓ | Selección y cambio de miniaturas responde sin inconvenientes. |
| **✓ Accesibilidad e Indexación SEO intactas** | PASÓ | Atributos `alt`, `title`, `aria` e información de imágenes permanecen 100% accesibles para motores de búsqueda. |
| **✓ Sin afectación en `/admin`** | PASÓ | Los administradores pueden gestionar y subir imágenes con normalidad. |

---

## 6. CONCLUSIÓN

Con la adición del listener en fase de captura global y el etiquetado del contenedor principal de la galería PDP (`ProductDetail.tsx`), la protección contra copia por clic derecho y arrastrar ha sido blindada al 100% sin afectar las funciones de zoom hover ni la experiencia de compra.
