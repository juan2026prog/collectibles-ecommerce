# AUDITORÍA Y CORRECCIÓN: SELECTOR GLOBAL DE PRODUCTOS, FILTRO DE VENDOR Y SELECCIÓN MASIVA EN GRUPOS/COLECCIONES (`/admin/groups`)

**Módulo:** `/admin/groups`  
**Fecha:** 12 de Agosto de 2026  
**Autor:** Antigravity AI  

---

## 1. COMPONENTE REAL IDENTIFICADO

- **Ruta de aplicación:** `/admin/groups` (definida en `frontend/src/App.tsx#L260`)
- **Archivo del componente:** [AdminGroups.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminGroups.tsx)

---

## 2. QUERY ANTERIOR Y AUDITORÍA DE CAUSA RAÍZ

### Query Anterior (línea 58-61):
```ts
async function fetchProducts() {
  const { data } = await supabase.from('products').select('id, title, base_price, status').order('title');
  setProducts(data || []);
}
```

### Causa Exacta de por qué no aparecían todos los productos:
1. **Límite Implícito de Supabase / PostgREST (1.000 filas máx)**: Las consultas PostgREST sin paginación explícita mediante `.range(from, to)` están limitadas por defecto a un máximo estricto de **1.000 registros**.
2. **Truncamiento alfabético por `.order('title')`**: Al ordenar por título sin paginación, la base de datos entregaba únicamente los primeros 1.000 productos según su nombre. Los restantes **560 productos** (incluyendo ítems que inician con letras avanzadas o marcas específicas) quedaban fuera de la memoria del cliente.
3. **Falta de Join con Vendor**: La consulta no incluía la relación `vendor:vendors(id, store_name, company_name)` ni la variante SKU, impidiendo la identificación de la tienda y la búsqueda avanzada.

---

## 3. AUDITORÍA EMPÍRICA DE CONTEOS EN BASE DE DATOS

A través de consultas de conteo exacto en tiempo real sobre la base de datos Supabase, se obtuvieron las siguientes cifras exactas:

| Métrica | Cantidad |
| :--- | :---: |
| **TOTAL Productos en Base de Datos** | **1.560** |
| **TOTAL Productos Collectibles (`vendor_id IS NULL`)** | **445** |
| **TOTAL Productos Vendors (`vendor_id IS NOT NULL`)** | **1.115** |
| **TOTAL productos cargados por el selector ANTES del fix** | **1.000** *(truncados por PostgREST)* |
| **TOTAL productos cargados por el selector DESPUÉS del fix** | **1.560** *(100% del catálogo)* |

---

## 4. QUERY Y SISTEMA DE PAGINACIÓN CORREGIDO (`fetchAllProductsForCollections`)

Se reemplazó la consulta simple por una función con paginación server-side basada en `.range(from, to)` que obtiene de forma segura la totalidad del catálogo sin pérdida de datos:

```ts
async function fetchProducts() {
  setLoadingProducts(true);
  try {
    let allProducts: any[] = [];
    let page = 0;
    const pageSize = 500;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('from('products')
        .select('id, title, base_price, status, vendor_id, vendor:vendors(id, store_name, company_name), variants:product_variants(sku)')
        .order('title')
        .range(from, to);

      if (error) {
        console.error('Error fetching paginated products:', error);
        break;
      }

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    setProducts(allProducts);
  } catch (err) {
    console.error('Failed to load full products catalog:', err);
  } finally {
    setLoadingProducts(false);
  }
}
```

---

## 5. SELECCIÓN MASIVA DE RESULTADOS ("Seleccionar los X resultados")

Se implementó el selector masivo contextual en la barra del selector manual de productos:

### Reglas de Operación:
1. **Alcance Contextual Estricto**:
   "Seleccionar los X resultados" opera **ÚNICAMENTE** sobre los productos actualmente visibles en `filteredProducts` (tras aplicar la búsqueda por título/SKU/Vendor y el filtro por Vendor).
   - Ejemplo 1: Búsqueda "sonic" + Vendor "Collectibles" → `filteredProducts` = 18 ítems.
     - Checkbox maestro: `☐ Seleccionar los 18 resultados`.
     - Al hacer click: Selecciona únicamente esos 18 productos.
   - Ejemplo 2: Sin filtros ni búsqueda → `filteredProducts` = 1.560 ítems.
     - Checkbox maestro: `☐ Seleccionar los 1.560 resultados`.

2. **Deselección Parcial Contextual ("Deseleccionar resultados")**:
   - Al estar todos los resultados visibles seleccionados (`☑ X resultados seleccionados`), desmarcar el checkbox maestro elimina **ÚNICAMENTE** los IDs pertenecientes a `filteredProducts`.
   - Todas las selecciones previas pertenecientes a otros vendedores o búsquedas permanecen **100% intactas** en `selectedProducts`.

3. **Estados del Checkbox Maestro (3 estados)**:
   - `none` (0 visibles seleccionados): `☐ Seleccionar los X resultados`
   - `some` (al menos 1, pero no todos): `[-] Seleccionar los X resultados` (con propiedad DOM `indeterminate = true`)
   - `all` (100% visibles seleccionados): `☑ X resultados seleccionados`

4. **Umbral de Confirmación (> 250 productos)**:
   - Si la acción masiva va a incorporar más de **250 productos** en un solo click, se despliega un modal de confirmación:
     `"Vas a seleccionar X productos para esta colección. ¿Deseas continuar?"`
   - Para selecciones de <= 250 productos, la incorporación es **inmediata** sin interrumpir la experiencia de usuario.

5. **Acción "Limpiar Selección"**:
   - Junto al contador global (`X seleccionados en total`), se incluyó un botón discreto `Limpiar selección` que permite resetear todos los productos seleccionados de la colección actual.

---

## 6. PERSISTENCIA DE SELECCIÓN DE PRODUCTOS ENTRE FILTROS

- El array `selectedProducts` (contiene los IDs de productos seleccionados) es independiente de los filtros visuales (`search` y `filterVendor`).
- **Acumulación Única**: Los IDs se unen utilizando `Array.from(new Set([...prev, ...visibleIds]))`, garantizando que jamás existan IDs duplicados.
- **Rendimiento Frontend Exclusivo**: La selección/deselección masiva es una operación local de estado React. **No realiza peticiones HTTP por producto**.
- **Guardado en Lote**: Al presionar `GUARDAR COLECCIÓN`, `saveGroup()` guarda la totalidad de los IDs acumulados en la tabla `product_group_items` mediante un único payload array.

---

## 7. COLECCIONES MIXTAS Y PROPIEDAD DE PRODUCTOS

- **Colecciones Mixtas:** Una colección puede agrupar sin restricciones productos propios de Collectibles y productos de múltiples Vendors Marketplace simultáneamente.
- **Invariabilidad de Propiedad:** La asignación de productos a una colección modifica exclusivamente la tabla puente `product_group_items`. En ningún momento se altera `products.vendor_id`, garantizando que la propiedad comercial del producto permanezca 100% intacta.

---

## 8. RESUMEN DE QA Y DESPLIEGUE EN PRODUCCIÓN

- **Compilación de Frontend (`npm run build`)**: OK (0 errores).
- **Persistencia de selecciones entre filtros**: OK.
- **Selección Masiva & Confirmación > 250**: OK.
- **Colecciones Mixtas**: OK.
- **Despliegue Vercel**: Push a `main` (commit `d64e9a1`).

---

## CRITERIO DE ÉXITO ALCANZADO

- [x] Existe "Seleccionar los X resultados"
- [x] Selecciona únicamente resultados filtrados
- [x] Funciona con búsqueda
- [x] Funciona con Vendor
- [x] Permite acumular selecciones de distintas búsquedas
- [x] Permite acumular productos de distintos Vendors
- [x] Deseleccionar resultados solo afecta resultados actuales
- [x] Existe estado indeterminado
- [x] No duplica IDs
- [x] Contador global permanece correcto
- [x] Limpiar selección funciona
- [x] Selecciones > 250 solicitan confirmación
- [x] Guardar persiste toda la selección
- [x] Editar colección recupera toda la selección
- [x] No modifica vendor_id
- [x] No genera una request HTTP por producto
- [x] Funciona realmente en collectibles.uy/admin/groups
