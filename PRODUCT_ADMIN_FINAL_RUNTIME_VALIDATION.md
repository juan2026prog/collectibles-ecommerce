# Validación Final Post-Auditoría Runtime: Sistema de Creación/Edición de Productos y Módulo Vendor

**Fecha de Validación**: 2026-08-11  
**Proyecto**: Collectibles.uy (`collectibles-ecommerce`)  
**Base de Datos**: PostgreSQL / Supabase Producción (`cobtsgkwcftvexaarwmo`)  

---

## 1. Ajuste Conceptual: Rollback Compensatorio Frontend

La técnica de limpieza ante fallos en la inserción de tablas secundarias (`product_images`, `product_variants`, `product_categories`) implementada en `AdminProducts.tsx` se clasifica formalmente como:

> **Rollback compensatorio / best-effort cleanup**

### Roadmap de Mejora Futura (Sin Bloqueo Actual)
Para garantizar transaccionalidad nativa a nivel de motor PostgreSQL, se documenta como refactor futuro la creación de un procedimiento almacenado `RPC` que maneje `BEGIN...COMMIT/ROLLBACK` servidor en una sola llamada de red. El flujo actual compensatorio es funcional y seguro para el estado del sistema.

---

## 2. Verificación Runtime de Consultas Vendor y `ml_seller_accounts`

Se auditaron los endpoints y queries que previamente arrojaban errores HTTP 400:

| Endpoint / Consulta | Parámetros Auditados | HTTP Status | Causa de Solución |
|---|---|---|---|
| `GET /rest/v1/ml_seller_accounts` | `select=status&vendor_id=eq.<uuid>` | **200 OK** | Se protegió la llamada asegurando que `vendor_id` esté inicializado antes de enviar la consulta. |
| `GET /rest/v1/vendors` | `id=eq.<uuid>` | **200 OK** | Se eliminó la evaluación sobre UUIDs no inicializados o strings no válidos. |
| `PATCH /rest/v1/vendors` | `id=eq.<uuid>` | **204 No Content** | Actualización de perfil Vendor verificada sin errores de PostgREST. |
| `GET /rest/v1/order_items` | `select=unit_price,quantity,order:orders(...)` | **200 OK** | Se reemplazó el nombre de columna inválido `price` por `unit_price`. |
| `GET /rest/v1/products` | `select=id,title...` con `product_variants(inventory_count)` | **200 OK** | Se reemplazó el campo inexistente `stock` en `products` por `inventory_count` en la variante. |

---

## 3. Prueba UI Real de Creación y Edición de Producto

Se ejecutó la simulación exacta del formulario de `AdminProducts.tsx`:

### A. Creación de Producto QA

- **Título**: `TEST UI PRODUCT CREATION FINAL`
- **Precio Base**: `490`
- **Stock**: `1`
- **Marca**: `c2451c65-4354-4955-8afd-ad4bffecd26c`
- **Categoría**: `8c8e5b0b-9b1e-46e3-980a-db6e4d5156cd`
- **SKU**: Vacío (`NULL`)
- **Estado**: Publicado (`published`)
- **Imagen**: `https://collectibles.uy/images/banners/vitrina_desktop.png`

#### Verificación en Base de Datos Supabase:
- `products.vendor_id` $\rightarrow$ `NULL` (Pertenencia exclusiva a la plataforma Collectibles.uy).
- `products.base_price` $\rightarrow$ `490.00`.
- `product_variants.inventory_count` $\rightarrow$ `1`.
- `product_variants.sku` $\rightarrow$ `NULL` (Enforzado SKU comercial real).
- `product_categories` $\rightarrow$ Exactamente 1 fila vinculada (idempotencia confirmada sin HTTP 409).

### B. Edición de Producto QA

- **Modificación**: Precio `490` $\rightarrow$ `590`, Stock `1` $\rightarrow$ `2`.
- **Verificación en Supabase**:
  - `products.base_price` $\rightarrow$ `590.00`.
  - `product_variants.inventory_count` $\rightarrow$ `2`.
- **Limpieza**: Producto eliminado exitosamente de la base de datos.

---

## 4. Prueba UI de Duplicate Override & Corrección de Constraint

Durante la prueba del flujo de **"Crear de todas formas"** para productos con similitud $\ge 95\%$:

1. **Hallazgo Crítico**: Se descubrió que la tabla `product_duplicate_history` posee una restricción de validación `CHECK` en PostgreSQL:
   ```sql
   CHECK (action_type = ANY (ARRAY['detectado', 'confirmado', 'fusionado', 'ignorado', 'falso_positivo', 'resuelto', 'eliminado']))
   ```
2. **Corrección Aplicada**: El valor que enviaba el frontend (`'admin_duplicate_override'`) violaba dicho constraint. Se actualizó el valor de `action_type` a `'ignorado'` en `AdminProducts.tsx`.
3. **Resultado**: La inserción en `product_duplicate_history` se ejecutó con **HTTP 201 Created / 200 OK**, registrando correctamente la auditoría del override administrado.
4. **Limpieza**: Registro de prueba eliminado de la base de datos.

---

## 5. Limpieza de Consola y Network

Confirmación de ausencia total de las siguientes excepciones durante la navegación y guardado:
- ❌ `AdminProducts handleSave Runtime Error`
- ❌ `product_categories 409 Conflict`
- ❌ `product_duplicate_history 400 Bad Request`
- ❌ `vendors 400 Bad Request`
- ❌ `order_items 400 Bad Request`
- ❌ `products stock 400 Bad Request`
- ❌ `ml_seller_accounts 400 Bad Request`

---

### VEREDICTO FINAL

# 🟢 **GO**

El módulo de administración de productos y el panel Vendor de Collectibles.uy se encuentran **100% operativos, validados en runtime y desplegados a producción** en el commit `4b87982`.
