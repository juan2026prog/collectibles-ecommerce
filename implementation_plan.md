# Plan de Implementación: Diseño Premium para Tiendas Oficiales

Este plan detalla el diseño, la configuración del vendor y la renderización en el storefront de la variante premium para Tiendas Oficiales.

---

## Cambios Propuestos

### 1. Base de Datos (Completado)
Añadimos tres columnas de personalización a la tabla `public.vendor_stores` mediante migración SQL:
- `banner_mobile_url` (text): URL del banner optimizado para mobile.
- `accent_color` (text): Color de acento en formato hex (ej. `#ff0f6d`).
- `banner_position` (text): Posición vertical del banner (`center`, `left`, `right`).

### 2. Panel del Vendor: Configuración y Previsualización
Modificaremos el componente [VStores.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VStores.tsx) para añadir la sección **Personalización de Tienda**:
- **Selector de Tipo de Tienda:** Toggle o selector entre "Vendor Común" y "Tienda Oficial" (mapeado a `is_official`).
- **Campos Oficiales:** Si se activa Tienda Oficial, habilitar inputs y subida de archivos para `banner_mobile_url`, `accent_color` (con selector de color nativo o input) y `banner_position` (select: Centro, Izquierda, Derecha).
- **Previews Integradas (Desktop & Mobile):** Renderizaremos una maqueta interactiva local dentro del formulario para mostrar en tiempo real cómo se verán el banner, logo, colores y badge de Tienda Oficial.

### 3. Storefront Público Premium
Actualizaremos [VendorStorefront.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/VendorStorefront.tsx):
- **Detección:** Si `store.is_official === true` y su status es activo, renderizaremos la variante premium.
- **Banner Responsive:** Si existe `banner_url`, lo mostramos al ancho completo del contenido principal con un aspect ratio de `aspect-[2.5/1] md:aspect-[5/1]` usando `<picture>` para cargar la versión mobile (`banner_mobile_url`) de manera eficiente.
- **Cabecera Premium:**
  - Línea decorativa superior pintada con el color de acento configurado (o rosa `#f00856` por defecto).
  - Superposición parcial del logo sobre el banner (usando márgenes negativos en desktop y mobile).
  - Badge oficial estilizado de forma discreta pero distinguible, usando un fondo semi-transparente del color de acento.
  - Descripción corta y estadísticas de confianza reales de forma compacta. En mobile, las estadísticas se podrán deslizar horizontalmente si hay desbordamiento.
- **Detalles Visuales Personalizados:**
  - Los indicadores activos de categorías, marcas, inputs de búsqueda y botones de acción (como seguir tienda) utilizarán dinámicamente el color de acento de la tienda oficial.

---

## Plan de Verificación

### Pruebas Automatizadas & Build
- Ejecutaremos `npm run build` para asegurar la compilación limpia sin errores de bundling ni dependencias.

### Verificación Manual
1.  **Tienda Común (JorgiToys):** Comprobar que sigue renderizando el storefront estándar, sin banner ni modificaciones visuales.
2.  **Tienda Oficial:** Activar la tienda oficial de pruebas y validar:
    *   Carga del banner desktop (escala `5:1`).
    *   Carga del banner mobile en viewport menor a 768px.
    *   Superposición del logo, alineación centrada en mobile y lateral en desktop.
    *   Tonalidades del color de acento en badge oficial, botón seguir tienda e indicadores del sidebar.
3.  **Fallback:** Validar que si no se define banner, no se renderizan imágenes rotas y se mantiene un fondo oscuro premium.
4.  **Consola:** Verificar la total ausencia de errores, especialmente `ReferenceError: Cannot access X before initialization`.
