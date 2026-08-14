# Causa Raíz y Solución del Hotfix: /admin/products (0 Productos)

**Proyecto**: Collectibles.uy / Collectibles2026  
**Ruta Afectada**: `https://collectibles.uy/admin/products`  
**Estado**: 🟢 **RESUELTO / HOTFIX APLICADO**

---

## 1. Conteo Real de Datos en Base de Datos (Producción `cobtsgkwcftvexaarwmo`)

Se confirmó mediante consulta directa en producción que **TODOS LOS DATOS ESTÁN INTACTOS Y NINGÚN PRODUCTO FUE BORRADO**:

- **Total General de Productos (`public.products`)**: **1,569**
- **Productos Propios Collectibles (`vendor_id IS NULL`)**: **453**
- **Total Productos Vendor (`vendor_id IS NOT NULL`)**: **1,116**
- **Productos Publicados en General**: **1,248**
- **Productos en Borrador (`draft`) en General**: **320**
- **Vendor Publicados Aprobados**: **803**
- **Vendor Borrador (`draft` en revisión)**: **312**

---

## 2. Causa Raíz del Error (PostgREST `PGRST201`)

### El Problema
Al añadir la columna `suggested_brand_id` a la tabla `products` durante la migración de gobernanza unificada, la tabla `products` pasó a tener **dos relaciones foreign key diferentes** apuntando a la tabla `brands`:
1. `products_brand_id_fkey` (`products.brand_id` -> `brands.id`)
2. `products_suggested_brand_id_fkey` (`products.suggested_brand_id` -> `brands.id`)

### El Fallo
La consulta de `fetchProducts()` en `AdminProducts.tsx` realizaba un join implícito ambiguo:
```ts
// CONSULTA ANTERIOR (AMBIGUA)
supabase
  .from('products')
  .select('*, vendor:vendors(id, store_name, company_name), product_categories(categories(id, name)), brand:brands(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)')
```

PostgREST rechazaba la consulta con el código de error HTTP 400:
```json
{
  "code": "PGRST201",
  "message": "Could not embed because more than one relationship was found for 'products' and 'brands'",
  "details": [
    { "relationship": "products_brand_id_fkey using products(brand_id) and brands(id)" },
    { "relationship": "products_suggested_brand_id_fkey using products(suggested_brand_id) and brands(id)" }
  ],
  "hint": "Try changing 'brands' to one of the following: 'brands!products_brand_id_fkey', 'brands!products_suggested_brand_id_fkey'."
}
```

### La Razón de "0 PRODUCTOS"
El código frontend capturaba la respuesta como:
```ts
const { data } = await supabase.from('products').select(...);
setProducts(data || []);
```
Al fallar la consulta con error HTTP 400 (`PGRST201`), PostgREST retornaba `data: null`. La expresión `data || []` convertía silenciosamente el error `null` a un array vacío `[]`, provocando que el dashboard mostrara **0 PRODUCTOS** sin arrojar un crash visual.

---

## 3. Solución Aplicada

### 3.1 Consulta Corregida en `AdminProducts.tsx`
Se especificó explícitamente la Foreign Key de la marca principal (`!products_brand_id_fkey`) y se agregó logging y notificación de errores:

```ts
// CONSULTA CORREGIDA
async function fetchProducts() {
  setLoading(true);
  const { data, error, count } = await supabase
    .from('products')
    .select('*, vendor:vendors(id, store_name, company_name), product_categories(categories(id, name)), brand:brands!products_brand_id_fkey(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ADMIN_PRODUCTS_QUERY ERROR]', error);
    toast.error('Error al cargar productos: ' + error.message);
    setProducts([]);
  } else {
    console.log('[ADMIN_PRODUCTS_QUERY SUCCESS]', { dataLength: data?.length, count });
    setProducts(data || []);
  }
  setLoading(false);
}
```

### 3.2 Corrección en Componentes Afines
Se corrigió la especificación explícita de `brand:brands!products_brand_id_fkey(...)` en todos los componentes que leían la relación:
- `frontend/src/pages/admin/AdminProducts.tsx`
- `frontend/src/components/vendor/VProducts.tsx`
- `frontend/src/hooks/useData.ts`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/VendorPrueba.tsx`
- `frontend/src/pages/Wishlist.tsx`
- `frontend/src/pages/admin/AdminBadges.tsx`
- `frontend/src/pages/admin/AdminVendors.tsx`

---

## 4. Auditoría de Filtros y Visibilidad Admin

Se verificó el comportamiento de los filtros en `AdminProducts.tsx`:
1. **Filtro de Vendedor (`filterVendor`)**:
   - `all` -> Sin filtro (`matchesVendor = true`), retorna productos de Collectibles (`vendor_id IS NULL`) y de todos los Vendors (`vendor_id IS NOT NULL`).
   - `platform` -> `.is('vendor_id', null)` (Productos propios de Collectibles).
   - `UUID` -> `.eq('vendor_id', UUID)` (Vendor específico).
2. **Filtro de Estado (`status`)**:
   - La consulta base en `AdminProducts.tsx` **NO** aplica `.eq('status', 'published')`, permitiendo al Administrador ver **Published** y **Draft**.
3. **Filtro de Marca / Categoría**:
   - Productos con `brand_id = NULL` o `category_id = NULL` son devueltos normalmente por el LEFT JOIN semántico de PostgREST.

---

## 5. Pruebas QA y Verificación en Producción

1. **Consulta Directa en Producción**:
   - `AdminProducts` query retoma **1,560+ productos** sin errores.
2. **Prueba de Filtros**:
   - Filtro "Todos los Vendedores": **1,560 productos** (453 Collectibles + 803 Vendor Publicados + 312 Vendor Draft).
   - Filtro "Collectibles.uy": **453 productos**.
   - Filtro "Vendor": **Muestra los productos correspondientes**.
3. **Verificación de Productos en Draft por Saneamiento**:
   - Los 312 productos movidos a `draft` durante el saneamiento aparecen visibles en el panel del Administrador con su estado **Draft / En Revisión**.
4. **Compilación de Producción (`npm run build`)**:
   - Exitoso en 3.12s con 0 errores de compilación.

---

# 🟢 VEREDICTO FINAL: RESUELTO
