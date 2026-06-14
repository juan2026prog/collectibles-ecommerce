# Report: Vendor Taxonomy Approval Workflow & Preview Page (/vendor_prueba)

## CLASIFICACIÓN: READY

---

## 1. Tablas Modificadas
Se aplicaron modificaciones estructurales a las siguientes tablas de Supabase:
- **`brands`**:
  - `status` (`text` NOT NULL DEFAULT `'pending_review'`, con CHECK constraint `('pending_review', 'approved', 'rejected', 'merged')`)
  - `merged_into_id` (`uuid` REFERENCES `brands(id)`)
  - `approved_by` (`uuid` REFERENCES `profiles(id)`)
  - `approved_at` (`timestamp with time zone`)
- **`categories`**:
  - `status` (`text` NOT NULL DEFAULT `'pending_review'`, con CHECK constraint `('pending_review', 'approved', 'rejected', 'merged')`)
  - `merged_into_id` (`uuid` REFERENCES `categories(id)`)
  - `approved_by` (`uuid` REFERENCES `profiles(id)`)
  - `approved_at` (`timestamp with time zone`)

---

## 2. Estados Creados
Se crearon y configuraron los siguientes flujos de estados:
### Taxonomías (Marcas y Categorías)
- **`pending_review`**: Estado inicial para toda marca, categoría o subcategoría creada por un vendor.
- **`approved`**: Estado que indica que el administrador aprobó la taxonomía.
- **`rejected`**: Estado que indica que el administrador rechazó la propuesta de taxonomía.
- **`merged`**: Estado que indica que la propuesta fue fusionada con una taxonomía aprobada existente.

### Productos Vendor
- **`pending_taxonomy_review`**: Estado del producto vendor cuando está asociado a alguna marca o categoría pendiente de revisión (`status = 'pending_review'`). Impide que aparezca públicamente en el catálogo principal, pero se muestra en `/vendor_prueba`.
- **`draft` / `published`**: Estados normales del catálogo.

---

## 3. Reglas de Aprobación y RLS (Seguridad)
Se implementaron y aplicaron políticas de seguridad robustas a nivel de base de datos:
- **Público (Invitados)**: Sólo pueden leer marcas/categorías con `status = 'approved'`.
- **Vendors**:
  - Pueden leer marcas/categorías aprobadas y las propuestas pendientes creadas por ellos mismos (`owner_vendor_id = auth.uid()`).
  - Sólo pueden insertar, actualizar o eliminar marcas/categorías en sus propias propuestas en estado `'pending_review'`.
  - No pueden modificar o interferir con taxonomías globales aprobadas.
- **Administradores**: Bypass total de RLS sobre marcas y categorías.
- **Productos**: Se habilitó una política de selección pública especial en `products` que permite ver productos en estados `published`, `pending_taxonomy_review` y `draft` si pertenecen a un vendor (`vendor_id IS NOT NULL`), de modo de que puedan visualizarse correctamente en la página de prueba.

---

## 4. Acciones del Administrador (Admin UI)
Se agregó la pestaña **Taxonomías** en el panel `Admin → Marketplace → KYC / Vendors`:
- **Sección Marcas pendientes**: Muestra las propuestas de marcas pendientes, el vendor creador, el producto relacionado, la fecha de creación y ofrece acciones de Aprobar, Rechazar y Fusionar.
- **Sección Categorías pendientes**: Muestra las propuestas de categorías raíces pendientes con sus respectivas acciones de administración.
- **Sección Subcategorías pendientes**: Muestra las propuestas de subcategorías (las que tienen un `parent_id` asignado) con la relación visual con su categoría padre propuesta.
- **Flujo de Aprobación**: Al hacer clic en "Aprobar", la taxonomía se marca como aprobada. El panel escanea los productos asociados y, si ya no cuentan con otras taxonomías pendientes de revisión, transiciona su estado a `published`.
- **Flujo de Fusión**: Permite al administrador seleccionar una taxonomía de destino aprobada. El sistema reasigna los productos asociados a la marca o categoría destino seleccionada, y luego actualiza el estado de la propuesta a `'merged'` almacenando el ID de la taxonomía de destino.

---

## 5. Ruta de Prueba Pública `/vendor_prueba`
Se implementó una página pública de previsualización:
- **Ruta**: `/vendor_prueba`
- **Filtros**: Permite filtrar por Vendor, Marca, Categoría, Estado de producto (Activo, Pendiente Taxonomía, Pendiente) y disponibilidad de Stock.
- **Tarjetas de Producto**: Siguen la misma estética premium del catálogo general (imagen blanca con fondo limpio, detalles debajo). Muestra el store name del vendor ("Vendido por"), stock, SKU, precio final y badges detallados:
  - `Activo` (Visible)
  - `Pendiente Taxonomía`
  - `Pendiente` (Borrador)
  - `Sin Stock`
  - `Error Sync ML` (si la sincronización falló)
  - Botón "Ver producto" con redirección al detalle público.
- **Optimización y SEO**: La página está configurada con etiquetas `<meta name="robots" content="noindex, nofollow" />` mediante `react-helmet-async` para asegurar que ningún motor de búsqueda la indexe. Tampoco forma parte del sitemap dinámico de la tienda.

---

## 6. Validaciones Realizadas
1. **Migración SQL**: Ejecutada y verificada correctamente en Supabase.
2. **Edge Function**: La función `mercadolibre-sync` fue actualizada con la lógica de verificación de taxonomías pendientes en `curate_create` e `import` de marcas, y se desplegó exitosamente en producción.
3. **Flujos del Vendor**: Creación inline de marcas/categorías e inserciones normales guardan correctamente el `owner_vendor_id` y el estado `pending_review`.
4. **Validación del Catálogo**: El cambio de estado del producto a `pending_taxonomy_review` funciona al guardar o modificar en línea taxonomías no aprobadas, previniendo que se rendericen en el catálogo general.
5. **Colecciones y RLS del Vendor**: Se verificaron las políticas de inserción y restricción de productos propios para las colecciones del vendor.
6. **Compilación y Build**: Ejecutado `npm run build` en el frontend, resultando en compilación exitosa y sin errores de TypeScript.

---

## 7. Riesgos Pendientes
- **Caché en Curation**: Si el vendor tiene cargado la lista de marcas en el formulario y crea una nueva marca inline de forma rápida, se debe asegurar que se refresque el estado de la página para listar el ID correcto que ahora tiene estado `'pending_review'`. Esto se manejó llamando a `fetchMeta()` inmediatamente después de guardar la marca o categoría inline.

---

## 8. Colecciones y Grupos Propios del Vendor
Se habilitó la capacidad para que los vendors gestionen sus propios grupos de productos/colecciones con las siguientes medidas:
- **Estructura de Datos**: Se añadió la columna `owner_vendor_id` a la tabla `product_groups` vinculada a `vendors(id)` para separar los grupos globales de los pertenecientes a cada vendor.
- **Reglas y RLS de Seguridad**:
  - En `product_groups`, los vendors pueden ver los grupos globales o los propios, pero sólo pueden insertar, actualizar y borrar grupos donde `owner_vendor_id` coincida con su ID de usuario (`auth.uid()`).
  - En `product_group_items` (los productos asociados a las colecciones), se configuraron políticas estrictas que impiden a un vendor insertar o actualizar relaciones con productos que no sean suyos (`products.vendor_id = auth.uid()`).
- **Seller UI**: Se creó e integró el panel `VCollections.tsx` en el menú lateral de navegación del vendedor ("Colecciones"). Esta permite al vendedor crear, editar y eliminar grupos de forma manual, buscando y asociando exclusivamente sus productos que tengan estado `'published'`. Los slugs de sus grupos son automáticamente sufijados con un hash de su ID (`-vXXXX`) para evitar colisiones con colecciones globales de otros vendors o del administrador.
- **Promociones**: Se actualizó `VPromotions.tsx` para cargar únicamente las colecciones del propio vendor y las colecciones globales del catálogo general.

