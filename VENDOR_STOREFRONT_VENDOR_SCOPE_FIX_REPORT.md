# Reporte: Aislamiento de Vendor Storefront y Corrección de Scope

Este reporte documenta el diagnóstico y la solución implementada para garantizar que la tienda pública del vendor muestre única y exclusivamente sus propios productos.

---

## 1. Causa Raíz Exacta

El componente `VendorStorefront.tsx` realizaba la consulta de productos reutilizando el hook unificado `useProducts` con los siguientes filtros:
```json
{
  "vendor_store_id": store?.id,
  "category_id": currentCategory?.id,
  "brand_id": currentBrand?.brand_id
}
```

Esto generaba dos problemas críticos de aislamiento:
1.  **Parámetros Incorrectos en el Hook (`category_id` y `brand_id`):** El hook `useProducts` espera los slugs (`category` y `brand`), no los UUIDs (`category_id` y `brand_id`). Por lo tanto, al aplicar filtros de categorías o marcas desde la tienda del vendor, la consulta los ignoraba por completo.
2.  **Carga Inicial del Marketplace:** Durante el renderizado inicial, la variable `store` es `null` (mientras se carga desde Supabase). Esto resultaba en un filtro inicial `{ vendor_store_id: undefined }`. Al no tener el filtro del vendor, el hook procedía a consultar y almacenar en su estado interno los primeros 24 productos del marketplace completo (incluyendo productos de Collectibles y otros vendedores).

---

## 2. Cambios y Correcciones Realizadas

### Componente Afectado
*   [VendorStorefront.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/VendorStorefront.tsx)

### Lógica Anterior (Filtros pasados a `useProducts`)
```typescript
  const productFilters = useMemo(() => ({
    vendor_store_id: store?.id,
    search: searchQ || undefined,
    category_id: currentCategory?.id || undefined,
    brand_id: currentBrand?.brand_id || undefined,
    // ...
  }), [store?.id, ...]);
```

### Lógica Corregida
```typescript
  const productFilters = useMemo(() => ({
    // Evita cargar el catálogo global usando un UUID de fallback vacío (00000000...)
    vendor_store_id: store?.id || '00000000-0000-0000-0000-000000000000',
    search: searchQ || undefined,
    category: categorySlug || undefined,
    brand: brandSlug || undefined,
    // ...
  }), [store?.id, searchQ, categorySlug, brandSlug, ...]);
```

---

## 3. Campo Usado para Filtrar el Vendor

El campo utilizado en la base de datos es **`vendor_store_id`** (de tipo `uuid`), el cual hace referencia al identificador único de la tabla `vendor_stores` (para JorgiToys, el id es `'8595277b-f5e4-4233-9524-7eb62b9445a6'`).

---

## 4. Unificación de Scope (Consistencia en Toda la Página)

Hemos verificado que todos los componentes interactivos de la tienda del vendor utilicen el mismo scope para evitar cualquier mezcla de datos:
*   **Grid de Productos:** Consume `useProducts` filtrando por `vendor_store_id = store.id`.
*   **Contador Total:** Utiliza el valor `totalProducts` devuelto por el mismo hook `useProducts` con el filtro del vendor.
*   **Categorías del Sidebar:** Se consulta directamente desde `categories` uniendo con `product_categories!inner(product:products!inner(vendor_store_id))` filtrado por el `vendor_store_id` del store actual.
*   **Marcas del Sidebar:** Se utiliza la función de base de datos `get_brand_facets` pasando el parámetro `p_vendor_store_id` para retornar únicamente marcas que tienen productos asignados a JorgiToys.

---

## 5. QA de Control y Verificación (JorgiToys)

Realizamos pruebas utilizando Playwright visitando `/store/jorgitoys` localmente en el puerto de producción `4173`:
1.  **Aislamiento del Catálogo:** Se confirmó que todos los productos devueltos en la grilla tienen `vendor_store_id` igual al de JorgiToys en base de datos.
2.  **Sin Fallbacks ni Mezclas:** No se renderiza ningún producto global de Collectibles ni de otros vendedores.
3.  **Contador Correcto:** El contador muestra exactamente la cantidad de productos del catálogo de JorgiToys.
4.  **Buscador Aislado:** La búsqueda y filtrado de categorías y marcas se resuelven correctamente respetando el slug en URL.
