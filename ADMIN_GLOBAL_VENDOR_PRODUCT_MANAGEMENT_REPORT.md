# REPORT: AMPLIACIÓN DEL ADMIN GENERAL DE PRODUCTOS — VISIÓN GLOBAL DE COLLECTIBLES + VENDORS

**Módulo:** `/admin/products`  
**Fecha:** 11 de Agosto de 2026  
**Autor:** Antigravity AI  

---

## 1. QUERY ANTERIOR

Anteriormente, el archivo `frontend/src/pages/admin/AdminProducts.tsx` realizaba la consulta de productos a Supabase mediante la siguiente expresión:

```ts
const { data } = await supabase
  .from('products')
  .select('*, product_categories(categories(id, name)), brand:brands(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)')
  .is('vendor_id', null)
  .order('created_at', { ascending: false });
```

---

## 2. POR QUÉ NO APARECÍAN VENDORS

La consulta original incluía la restricción explícita `.is('vendor_id', null)`.  
En la arquitectura multivendor de Collectibles:
- `vendor_id = NULL`: Productos propios de Collectibles.
- `vendor_id = UUID`: Productos pertenecientes a un Vendor Marketplace.

Debido a esa condición estricta, la consulta excluía sistemáticamente el 100% de los productos pertenecientes a Vendors Marketplace, impidiendo al Administrador General tener una visión integral del catálogo global.

---

## 3. QUERY NUEVA

Se eliminó el filtro `.is('vendor_id', null)` en el Administrador General y se incorporó el join con la tabla `vendors` para obtener la información de la tienda:

```ts
const { data } = await supabase
  .from('products')
  .select('*, vendor:vendors(id, store_name, company_name), product_categories(categories(id, name)), brand:brands(id, name), images:product_images(id, url), variants:product_variants(id, inventory_count, sku)')
  .order('created_at', { ascending: false });
```

> **Nota de Aislamiento:** Las consultas en el panel exclusivo de cada Vendor (`VProducts.tsx`) se mantienen intactas manteniendo `.eq('vendor_id', user.id)`, garantizando que ningún Vendor pueda visualizar o interferir con productos ajenos.

---

## 4. COLUMNA "VENDEDOR" Y DIFERENCIACIÓN VISUAL

En la tabla principal del módulo AdminProducts, se añadió la columna **VENDEDOR** posicionada entre Marca y Stock:

| PRODUCTO | PRECIO | CATEGORÍA | MARCA | VENDEDOR | STOCK | VISIBLE | ESTADO | FECHA |

- **Productos Collectibles (`vendor_id = NULL`)**:
  - Badge distintivo azul corporativo: `COLLECTIBLES`
  - Tooltip informativo: `"Producto propio de Collectibles"`
- **Productos Vendor Marketplace (`vendor_id = UUID`)**:
  - Badge neutro Slate/Gris con el nombre de la tienda (`store_name` o `company_name`): `JorgiToys`
  - Tooltip informativo: `"Producto vendido por JorgiToys"`

---

## 5. FILTRO POR VENDEDOR Y SINCRONIZACIÓN CON URL

Se agregó el selector desplegable **"Todos los vendedores"** en la barra superior de filtros, cargado dinámicamente desde la tabla `vendors`:

- `Todos los vendedores` (`all`): Muestra el catálogo global (Collectibles + todos los Vendors).
- `Collectibles` (`platform`): Muestra únicamente productos propios de Collectibles (`vendor_id IS NULL`).
- `<Vendor Name>` (`vendor_uuid`): Muestra únicamente los productos pertenecientes a ese Vendor específico.

### Sincronización URL (`useSearchParams`):
El estado del filtro Vendor se sincroniza bidireccionalmente con el parámetro URL:
- `/admin/products?vendor=platform`
- `/admin/products?vendor=2f619...`
- `/admin/products` (cuando el filtro es "Todos")

---

## 6. COMBINACIÓN DE FILTROS

El filtro de Vendedor se evalúa de forma conjunta en `filteredProducts` (memoizado) junto con:
1. Búsqueda por texto (Título, SKU y Nombre de Vendor).
2. Filtro por Categoría.
3. Filtro por Marca.
4. Paginación y límite por página (50 / 200 / Todos).
5. Ordenamiento por cualquier columna (incluyendo la nueva columna Vendedor).

Ningún cambio en el filtro de Vendedor resetea los filtros de Categoría o Marca seleccionados.

---

## 7. EDICIÓN SEGURA DE PRODUCTOS

- Al abrir el modal de edición de un producto de Vendor (ej. `JorgiToys`), el campo `vendor_id` del formulario se carga con el UUID de `JorgiToys`.
- Al guardar las modificaciones (`handleSave`), la carga útil de actualización (`payload.vendor_id`) preserva el `vendor_id` correspondiente.
- **Garantía Anti-Conversión:** La edición por parte de un Administrador **NO** convierte accidentalmente productos de Vendors en productos propios de Collectibles.

---

## 8. COMPORTAMIENTO AL CREAR Y DUPLICAR PRODUCTOS

- **Creación desde Admin (`openCreate`)**:
  - El formulario incluye el widget **Vendedor / Propiedad** con el valor por defecto: `Collectibles (Propio)` (`vendor_id = NULL`).
  - El administrador puede opcionalmente seleccionar asignar la creación directa a cualquier Vendor activo del Marketplace.
- **Duplicación (`handleDuplicate`)**:
  - Se corrigió la función para copiar directamente `product.vendor_id || null`, asegurando que la copia de un producto Vendor se mantenga como producto del mismo Vendor, y la copia de un producto Collectibles se mantenga en Collectibles.

---

## 9. PAGINACIÓN Y CONTADOR DINÁMICO

- El contador de productos en la cabecera (`1.575 Productos` o `1.098 Productos`) y los checkboxes masivos ("Página" y "Todos") leen dinámicamente `filteredProducts.length`.
- Al aplicar un filtro por Vendor, los contadores y las selecciones de checkbox se ajustan exactamente al subconjunto filtrado visible.

---

## 10. PERFORMANCE Y PREVENCION DE N+1

- La resolución de los nombres de los vendedores se realiza en una **única consulta relacional Supabase**: `vendor:vendors(id, store_name, company_name)`.
- No se ejecutan consultas N+1 por fila ni iteraciones asíncronas individuales por producto.

---

## 11. REGLAS DE SEGURIDAD (RLS)

- Las políticas de seguridad a nivel de fila (RLS) permiten al rol `authenticated` con perfil Administrador realizar `SELECT`, `UPDATE` y `DELETE` sobre cualquier registro de la tabla `products`.
- Los componentes de Vendors Marketplace continúan aislados bajo su contexto de autenticación estricto.

---

## 12. MATRIZ QA EJECUTADA EN `/admin/products`

| Caso de Prueba | Resultado | Observaciones |
| :--- | :---: | :--- |
| **A. Todos los vendedores** | ✅ PASÓ | Muestra la lista completa combinada de Collectibles + Vendors Marketplace. |
| **B. Filtro Collectibles** | ✅ PASÓ | Muestra únicamente productos con `vendor_id IS NULL`. |
| **C. Filtro Vendor específico** | ✅ PASÓ | Muestra exclusivamente productos pertenecientes al UUID del Vendor seleccionado. |
| **D. Vendor + Marca** | ✅ PASÓ | Aplica intersección correcta (ej. Vendor X + Hasbro). |
| **E. Vendor + Categoría** | ✅ PASÓ | Aplica intersección correcta (ej. Vendor X + Figuras de Acción). |
| **F. Editar producto de Vendor** | ✅ PASÓ | Permite modificar datos y guarda preservando el `vendor_id` del Vendor. |
| **G. Editar producto Collectibles** | ✅ PASÓ | Guarda el producto manteniendo `vendor_id = NULL`. |
| **H. Crear producto Collectibles** | ✅ PASÓ | Asigna por defecto `vendor_id = NULL`. |
| **I. Crear producto asignado a Vendor** | ✅ PASÓ | Asigna el `vendor_id` del Vendor seleccionado. |
| **J. Paginar con filtro Vendor** | ✅ PASÓ | Cambia de página manteniendo activo el vendedor seleccionado. |
| **K. Cambiar cantidad (50/200/Todos)**| ✅ PASÓ | Mantiene los filtros aplicados y recalcula la paginación. |
| **L. Sincronización URL y Refresco** | ✅ PASÓ | Carga automáticamente el filtro especificado en `?vendor=<uuid>`. |

---

## CONCLUSIÓN Y ESTADO FINAL

El módulo `/admin/products` ha sido actualizado exitosamente. El Administrador General cuenta ahora con una visión global, transparente y segura de todo el inventario del ecosistema Collectibles, con diferenciación visual clara, filtros potentes y resguardo absoluto de la propiedad de cada producto.
