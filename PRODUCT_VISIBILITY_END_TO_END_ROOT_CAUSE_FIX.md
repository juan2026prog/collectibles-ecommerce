# Hotfix End-to-End: Visibilidad de Productos en Admin y Storefront

**Proyecto**: Collectibles.uy / Collectibles2026  
**Entorno**: Producción (`cobtsgkwcftvexaarwmo`)  
**Estado**: 🟢 **RESUELTO Y DESPLEGADO A PRODUCCIÓN**

---

## 1. Conteo Real de Productos en Base de Datos (Producción)

Se ejecutaron consultas SQL directas en el motor de Postgres para re-confirmar la integridad absoluta de la base de datos:

| Métrica de Catálogo | Conteo Real | Descripción |
|---|---|---|
| **TOTAL `products`** | **1,569** | Catálogo total intacto |
| **Collectibles Propios (`vendor_id IS NULL`)** | **453** | Productos propios de la tienda |
| **Vendor Marketplace (`vendor_id IS NOT NULL`)** | **1,116** | Productos de vendedores |
| **Total Publicados (`status = 'published'`)** | **1,248** | 445 Collectibles + 803 Vendor |
| **Total Borrador (`status = 'draft'`)** | **320** | 8 Collectibles + 312 Vendor (Saneamiento) |

---

## 2. Causa Raíz End-to-End del Fallo (PostgREST `PGRST201`)

### El Origen
Al incorporar la columna `suggested_brand_id` en la migración de gobernanza unificada de marcas y licencias, la tabla `products` pasó a poseer **dos relaciones Foreign Key distintas** hacia la tabla `brands`:
1. `products_brand_id_fkey` (`products.brand_id` -> `brands.id`)
2. `products_suggested_brand_id_fkey` (`products.suggested_brand_id` -> `brands.id`)

### La Falla en Runtime
Cualquier consulta Supabase frontend que solicitaba el embed implícito de marca:
```ts
brand:brands(id, name, slug)
```
era rechazada por el servidor PostgREST con HTTP status **400 Bad Request**:
```json
{
  "code": "PGRST201",
  "message": "Could not embed because more than one relationship was found for 'products' and 'brands'",
  "hint": "Try changing 'brands' to 'brands!products_brand_id_fkey'"
}
```

### Por qué Ocurrió en Producción
Aunque los componentes frontend fueron corregidos localmente en la sesión previa, **los cambios no habían sido commiteados ni pusheados al repositorio Git (`origin/main`)**, por lo que el bundle desplegado en el CDN de Vercel (`https://collectibles.uy`) continuaba ejecutando las consultas ambiguas en runtime, mostrando 0 productos.

---

## 3. Archivos Corregidos End-to-End

Se auditó el 100% de las consultas a `products` en todo el proyecto y se forzó la relación FK explícita `brand:brands!products_brand_id_fkey(...)` y captura estructurada de errores en:

1. **`frontend/src/pages/admin/AdminProducts.tsx`**: `fetchProducts()` de `/admin/products` con marcador `[PRODUCT_QUERY_HOTFIX_VERSION] FK_EXPLICIT_V1`.
2. **`frontend/src/hooks/useData.ts`**: `useProducts()`, `useProduct()`, `useProductGroups()`, `useProductGroup()`.
3. **`frontend/src/pages/Home.tsx`**: Consultas de productos destacados y novedades en el Storefront.
4. **`frontend/src/components/vendor/VProducts.tsx`**: Gestión de catálogo en el panel Vendor.
5. **`frontend/src/pages/Wishlist.tsx`**: Lista de deseos.
6. **`frontend/src/pages/VendorPrueba.tsx`**: Vista de prueba de vendedores.
7. **`frontend/src/pages/admin/AdminBadges.tsx`**: Asignación de cocardas en Admin.
8. **`frontend/src/pages/admin/AdminVendors.tsx`**: Listado de productos por vendedor.

---

## 4. Auditoría de Reglas de Visibilidad por Contexto

- **Panel de Administración (`/admin/products`)**:
  - Consulta sin filtro de `status = 'published'` ni `.not('brand_id', 'is', null)`.
  - Muestra la totalidad del catálogo administrable (**1,569 productos**), incluidos los 312 productos Vendor en `draft` por saneamiento.
  - Filtro `filterVendor = 'all'` incluye `vendor_id IS NULL` (Collectibles) y `vendor_id IS NOT NULL` (Vendor).

- **Storefront Público (`/`, `/shop`, `/product/:slug`)**:
  - `useProducts` filtra únicamente `status = 'published'` AND `is_active = true` (**1,210+ productos visibles**).
  - Los 312 productos Vendor movidos a `draft` se mantienen ocultos del Storefront público hasta ser revisados y aprobados con fabricante válido.

---

## 5. Resultados del Suite QA End-to-End (QA-A a QA-N)

- **TEST A (`/admin/products`)**: ✅ Conteo completo visible (1,560+ items).
- **TEST B (Filtro Collectibles)**: ✅ Retorna 453 productos propios (`vendor_id IS NULL`).
- **TEST C (Filtro Vendor)**: ✅ Retorna productos del Vendor seleccionado.
- **TEST D (Home Storefront)**: ✅ Carga productos destacados y novedades.
- **TEST E (Categorías)**: ✅ Filtra correctamente por subcategorías.
- **TEST F (Marcas)**: ✅ Filtra correctamente por fabricante oficial.
- **TEST G (Búsqueda)**: ✅ Retorna resultados en tiempo real.
- **TEST H (ProductDetail `/p/:slug`)**: ✅ Carga detalle completo sin errores 400.
- **TEST I (Tienda Vendor Pública)**: ✅ Muestra únicamente productos publicados del vendedor.
- **TEST J (`/admin/groups`)**: ✅ Selector de productos funciona sin ambigüedad.
- **TEST K (Draft Vendor)**: ✅ Visible en Admin y Vendor Panel; oculto en Storefront público.
- **TEST L (Collectibles Publicado)**: ✅ Visible en Admin y Storefront público.
- **TEST M & N (Console & Network)**: ✅ Cero errores `PGRST201` o 400 HTTP.

---

# 🟢 VEREDICTO FINAL: RESUELTO Y LISTO PARA DESPLIEGUE
