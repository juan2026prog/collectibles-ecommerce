# REPORT: PRODUCT DETAIL MARKETPLACE UI HOTFIX

## Causa Raíz
La ficha de producto y componentes asociados del marketplace contenían lógica y textos heredados del modelo anterior (por ejemplo, "Vendido por" mostrando la marca del producto, insignias no aprobadas mostradas de forma automática como "Distribuidor Oficial", y la sección "Buy Box Winner" o "Otras opciones de compra") que no representaban de forma fidedigna la arquitectura Marketplace de Collectibles ni su flujo de aprobaciones de Administrador.

---

## Componentes Modificados

1. **`frontend/src/hooks/useData.ts`**:
   - Se actualizó la consulta Supabase select del hook `useProduct` para traer los campos `company_name` de la tabla `vendors` y `status, is_official` de la tabla `vendor_stores`.

2. **`frontend/src/pages/ProductDetail.tsx`**:
   - Se removió por completo el bloque "Otras opciones de compra" (Buy Box) y el bloque del Trophy/Winner ("Buy Box Winner").
   - Se re-estructuró la sección lateral (sidebar):
     - **MARCA**: Muestra el encabezado "MARCA", el logo de la marca (`brand.logo_url` si existe) y su nombre. No muestra avatar/iniciales si no hay logo.
     - **Insignia Tienda Oficial**: Dentro del bloque Marca se renderiza el distintivo "TIENDA OFICIAL" (español) o "Official Store" (inglés) si y solo si la tienda cumple con: `vendor_store.status === 'active'`, la insignia tiene `badge_key === 'official_store'`, y la asignación tiene `status === 'active'` con `approved_by` y `approved_at` no nulos.
     - **Vendido y despachado por**: Muestra de forma limpia el nombre del vendedor/tienda utilizando `SoldByCard` con badges en `[]` (sin insignias secundarias en este bloque).

3. **`frontend/src/components/ProductGridCard.tsx`**:
   - Se adaptó para resolver el nombre de tienda usando la jerarquía de fallbacks, mostrando "Collectibles.uy" si `vendor_id` es nulo, y mostrando el badge de "TIENDA OFICIAL" o "Official Store" bajo las mismas reglas estrictas de validación.

4. **`frontend/src/pages/VendorStorefront.tsx`**:
   - Se filtraron las insignias para que no muestren etiquetas unapproved/prohibidas ("Distribuidor Oficial", "Verified", "Premium", "Official Seller") y localicen correctamente la insignia "TIENDA OFICIAL".
   - Se actualizó el título "Distribuidor Autorizado:" por "Marcas Oficiales:".

5. **`frontend/src/components/CartDrawer.tsx`**:
   - Se actualizó la etiqueta superior a "Tienda" para reflejar correctamente el concepto.

6. **`frontend/src/pages/Checkout.tsx`**:
   - Se actualizaron las referencias de fallbacks del store name de "Collectibles" a "Collectibles.uy".

7. **`frontend/src/pages/CustomerPortal.tsx`**:
   - Se actualizó la selección del query a la base de datos para traer `company_name` del vendor y se estructuró la cadena de fallbacks correcta para el nombre de la tienda.

8. **`frontend/src/components/vendor/VendorLabelPreviewModal.tsx`**:
   - Se agregó la prioridad de fallbacks para el store name.

9. **`frontend/src/components/ShipmentLabelModal.tsx`**:
   - Se modificó la consulta a la base de datos para traer el `vendor_store` (`store_name`, `logo_url`) en caso de existir un `vendor_store_id`, y se resolvió `senderName` usando la cadena de prioridades del store name.

---

## Nueva Jerarquía de Conceptos

- **Marca = Marca**: Se refiere exclusivamente a la franquicia/fabricante del producto (e.g. Hot Toys, Hasbro, Lego, Marvel). Se muestra su logo oficial y nombre.
- **Tienda = Tienda**: Se refiere al establecimiento minorista asociado en el marketplace (e.g. Hot Toys Uruguay, Hasbro Uruguay). Representa el valor de la Tienda Oficial.
- **Vendor = Empresa**: Representa la entidad jurídica (empresa) asociada al vendor. Se usa como fallback si no hay nombres específicos de tienda.

### Prioridades de Fallback de Nombre de Tienda:
1. `vendor_store.display_name`
2. `vendor_store.name`
3. `vendor_store.store_name`
4. `vendor.company_name`
5. `vendor.store_name`
6. `Collectibles.uy` (si `vendor_id` es `null`)

---

## Eliminación del Buy Box
Se removió toda la lógica de renderizado del componente Buy Box Winner, otras opciones de compra, y los estilos asociados. La ficha de producto muestra directamente el precio base de la variante actual del producto y los datos del vendor original del producto, de modo que el checkout procesa directamente la orden a dicho vendedor sin bifurcación de ofertas.

---

## Validación del Badge "Tienda Oficial"
Se implementó una validación estricta a nivel de interfaz de usuario. El badge no aparece automáticamente por el hecho de tener `is_official = true` o la asignación de la insignia en crudo.
La insignia se renderiza únicamente si:
- El estado de la tienda es activo (`vendor_store.status === 'active'`).
- La asignación de insignia (`vendor_store_badge_assignments`) tiene estado `'active'`.
- La asignación de insignia fue aprobada por un Administrador (`approved_by IS NOT NULL` y `approved_at IS NOT NULL`).
- El identificador clave de la insignia es exactamente `'official_store'`.

Se ocultaron los badges no aprobados o prohibidos por directiva en los listados del storefront, carritos, detalles de producto y rejillas de catálogo.

---

## QA Realizado

1. **Compilación de Código**:
   - Se ejecutó `npx tsc --noEmit` completando de manera exitosa sin errores de tipado.
2. **Build de Producción**:
   - Se ejecutó `npm run build` completando en 2.12s sin advertencias de dependencias ni fallas de empaquetado.
3. **Verificación Visual y Flujos**:
   - Se comprobó la jerarquía de textos y prioridades de visualización para productos propios y de vendors.
   - Las vistas de etiquetas de envío, PDF de facturas y Packing Slips heredan el nombre de remitente (`senderName`) bajo la misma cadena de prioridades.

---

## Estado Final
**READY**
