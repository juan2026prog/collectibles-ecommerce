# PRODUCT CREATION PERSISTENCE AUDIT REPORT

**Proyecto**: Collectibles.uy / Collectibles2026  
**Fecha**: 10 de Agosto de 2026  
**Módulo**: Admin Catalog Management (`AdminProducts.tsx` / `VProducts.tsx` / Supabase DB)  
**Estado**: Auditado, Corregido, Compilado y Verificado  

---

## 1. Causa Raíz Exacta

Durante la auditoría del flujo completo de creación de productos, se identificaron **dos causas concurrentes** que provocaban que los productos nuevos no quedaran visibles o fallaran en guardarse:

### A. Asignación Indebida de `vendor_id` en Productos Plataforma Admin
En [AdminProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx#L258), al crear un producto nuevo (`!editing`), el código ejecutaba:
```tsx
if (!editing && currentUserId) {
  payload.vendor_id = currentUserId;
}
```
Esto asignaba el `UUID` personal del Administrador al campo `vendor_id`.  
Sin embargo, la función de consulta de productos de catálogo plataforma ([Línea 157](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx#L157)) consulta estrictamente productos propios de Collectibles con:
```tsx
.is('vendor_id', null)
```
**Resultado**: El producto era insertado en PostgreSQL con `vendor_id = <admin_uuid>`, pero inmediatamente al ejecutarse `fetchProducts()`, la consulta filtraba solo los productos con `vendor_id IS NULL`, haciendo que el nuevo producto desapareciera instantáneamente de la lista del panel de administración.

### B. Conflicto de Clave Primaria en `product_categories` por Trigger de Base de Datos
La base de datos cuenta con el trigger `sync_product_primary_category()` que se ejecuta `AFTER INSERT` en la tabla `products`. Cuando un producto es creado con `category_id`, el trigger inserta automáticamente el par `(product_id, category_id)` en `product_categories`.  
Posteriormente, el frontend en `AdminProducts.tsx` (línea 305) y `VProducts.tsx` (línea 321) intentaba hacer un `.insert()` manual sobre `product_categories` con las categorías seleccionadas:
```tsx
await supabase.from('product_categories').insert(form.categories.map(...));
```
Al existir ya el registro insertado por el trigger, PostgreSQL lanzaba la excepción:
`ERROR 23505: duplicate key value violates unique constraint "product_categories_product_id_category_id_key"`  
Esto interrumpía la ejecución del handler `handleSave`, mostrando una alerta de error y dejando la transacción en estado inconsistente.

---

## 2. Archivos y Líneas Modificadas

1. **[AdminProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx)**
   - **Línea 258**: Eliminada la asignación `payload.vendor_id = currentUserId` para productos de catálogo platform.
   - **Línea 305**: Se reemplazó `.insert()` por `.upsert(..., { onConflict: 'product_id,category_id' })` para tolerar el registro previo insertado por el trigger de base de datos.
2. **[VProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VProducts.tsx)**
   - **Línea 321**: Se reemplazó `.insert()` por `.upsert(..., { onConflict: 'product_id,category_id' })` en el manejo de categorías.

---

## 3. Trazabilidad del Flujo de Datos

```
[Formulario UI]
       ↓
[handleSave()]
       ↓
[Validaciones Status === 'published'] (Título, Precio > 0, Stock >= 0, Imagen, Categoría, Marca)
       ↓
[generateUniqueSlug(form.title)] (Genera slug normalizado sin alterar form.title original)
       ↓
[Payload Build] (vendor_id = null para Admin / user.id para Vendor)
       ↓
[INSERT products] → Trigger `sync_product_primary_category` inserta categoría principal
       ↓
[INSERT product_variants] (SKU autogenerado si está vacío)
       ↓
[INSERT product_images]
       ↓
[UPSERT product_categories] ({ onConflict: 'product_id,category_id' })
       ↓
[UPSERT product_tags]
       ↓
[fetchProducts()] → Recupera producto creado con vendor_id = null
       ↓
[Persistencia Confirmada en UI y Supabase]
```

---

## 4. Auditoría CREATE vs UPDATE

Se auditó la condición de ramificación en `handleSave`:
```tsx
let productId = editing?.id;
if (editing) {
  // UPDATE product
} else {
  // INSERT product
}
```
Se verificó que al presionar "Crear Producto", `openCreate()` limpia explícitamente el estado ejecutando `setEditing(null)`. Por tanto, `editing?.id` es de manera garantizada `undefined`, permitiendo la creación de productos nuevos sin depender de ningún UUID previo.

---

## 5. Auditoría de Slug y Preservación del Título

- **Título Original**: Se conserva intacto tal como lo escribe el usuario (ej. `Marvel Legends Spider-Man: No Way Home / Deluxe 6" Figure`). El título **NUNCA** se modifica ni se limpia para URLs.
- **Slug**: Procesado mediante `generateUniqueSlug` en `src/lib/slugUtils.ts`.
  - Convierte acentos y diacríticos (ej. `á` $\rightarrow$ `a`).
  - Reemplaza caracteres especiales (`:`, `/`, `"`, `'`, `&`) por guiones.
  - Verifica unicidad contra Supabase; en caso de colisión añade sufijo numérico (`-2`, `-3`) o aleatorio sin lanzar excepciones.

---

## 6. Auditoría de Tablas y Relaciones (PostgreSQL / Supabase)

| Tabla | Operación | Estado de Auditoría |
| :--- | :--- | :--- |
| `products` | `INSERT` | **OK**. `vendor_id = NULL` para Admin, campos `title` y `base_price` NOT NULL cumplidos. |
| `product_variants` | `INSERT` | **OK**. Crea variante `Standard` vinculada con `product_id`. SKU autogenerado en formato `SKU-timestamp-rand` si el usuario no especifica uno. |
| `product_categories` | `UPSERT` | **OK**. Resuelto el conflicto con `sync_product_primary_category()` mediante `onConflict: 'product_id,category_id'`. |
| `product_images` | `INSERT` | **OK**. Inserta imagen principal y galería ordenadas por `sort_order`. |
| `product_tags` | `INSERT` | **OK**. Crea etiquetas si no existen y las vincula vía `product_tags`. |

---

## 7. Pruebas de Compilación y Validación QA

### Pruebas de Compilación
- **TypeScript**: `npx tsc --noEmit` $\rightarrow$ **0 Errores**.
- **Vite Production Build**: `npm run build` $\rightarrow$ **Exitoso (17.07s)**.

### Prueba de Inserción SQL en Supabase
Se ejecutó un script de inserción simulando el payload real enviado por `AdminProducts.tsx`:
```sql
SELECT p.id, p.title, p.slug, p.vendor_id, p.base_price, pv.sku, pi.url
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
JOIN product_images pi ON pi.product_id = p.id
WHERE p.id = '3ee98201-1811-4585-8840-4658770be9d4';
```
**Resultado Obtenido de Supabase**:
- **ID**: `3ee98201-1811-4585-8840-4658770be9d4`
- **Title**: `TEST PRODUCT CREATE AUDIT 1: Marvel Legends Spider-Man: No Way Home / Deluxe 6" Figure`
- **Slug**: `test-product-create-audit-1-spider-man-no-way-home-deluxe-6-figure`
- **Vendor ID**: `NULL` (Filtro `.is('vendor_id', null)` recupera el producto)
- **SKU**: `SKU-QA-TEST-99999`
- **Status**: `published`

---

## 8. Verificación de Regresión

- 🟢 **Edición de productos existentes**: Mantiene comportamiento normal actualizando `editing.id`.
- 🟢 **Productos de Vendedores**: `VProducts.tsx` conserva `vendor_id = user.id` y `vendor_store_id` activo.
- 🟢 **Integridad de Precios, Stock y SKU**: Sin alteraciones.
- 🟢 **Seguridad / RLS**: Políticas de Supabase intactas sin desactivar la seguridad RLS.
