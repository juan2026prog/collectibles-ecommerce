# INFORME DE IMPLEMENTACIÓN: ZONA VINTAGE - STORE TYPE PER VENDOR Y SISTEMA DE CONDITION DE PRODUCTOS

## RESUMEN EJECUTIVO
Se completó de forma exitosa la implementación de la arquitectura **Zona Vintage / Pre-Owned & Product Condition System** en **Collectibles.uy / Collectibles2026**.

Este sistema permite a los Administradores de Collectibles clasificar a los Vendors según su modelo comercial (**Standard Store**, **Vintage / Pre-Owned Store**, o **Mixed Store**), garantizando que las tiendas Vintage y Mixtas declaren obligatoriamente la condición comercial exacta de cada pieza coleccionable antes de su publicación.

---

## 1. CAMBIOS REALIZADOS EN BASE DE DATOS (MIGRACIONES SUPABASE)

- **Archivo de migración ejecutado**: `supabase/migrations/20260814130000_vendor_store_type_and_product_condition.sql`
- **Tablas afectadas**:
  - `public.vendors`: Añadida columna `store_type VARCHAR(20) NOT NULL DEFAULT 'standard'` con Check Constraint `('standard', 'vintage', 'mixed')`.
  - `public.vendor_stores`: Añadida columna `store_type VARCHAR(20) NOT NULL DEFAULT 'standard'` con Check Constraint `('standard', 'vintage', 'mixed')`.
  - `public.products`:
    - `condition VARCHAR(30)` con Check Constraint `('new_sealed', 'new_open_box', 'used_complete', 'used_incomplete', 'loose_complete', 'loose_incomplete')`.
    - `condition_notes TEXT`.
- **Triggers de Seguridad y Sincronización**:
  1. `tr_secure_vendor_store_type`: Bloquea permanentemente intentos de modificación de `store_type` por parte de los Vendors (solo administradores autenticados o service_role pueden actualizar este campo).
  2. `tr_sync_vendor_store_type`: Sincroniza automáticamente `vendors.store_type` hacia `vendor_stores.store_type`.
- **Migración de Datos Legacy**:
  - Productos existentes marcados como `'new'` fueron migrados a `'new_sealed'`.
  - Productos existentes marcados como `'used'` fueron migrados a `'used_complete'`.

---

## 2. MODIFICACIONES EN PANEL ADMINISTRATIVO (`/admin/users` Y `/admin/products`)

1. **Gestión de Vendor en `/admin/users` (`AdminUsers.tsx`)**:
   - Incorporada sección **TIPO DE TIENDA (STORE TYPE)** en el modal "Gestionar Vendor".
   - Opciones disponibles:
     - 🏢 **Standard Store**: Productos 100% nuevos y sellados.
     - ⏳ **Vintage / Pre-Owned Store**: Piezas vintage,usadas, sueltas o de colección.
     - 🔄 **Mixed Store**: Catálogo mixto (nuevos y pre-owned).
   - Añadidas insignias discretas (`STANDARD`, `VINTAGE`, `MIXED`) en la lista general de usuarios de auditoría.
   - Registrado evento audit log en `audit_logs` con `action = 'update_vendor_store_type'`.
2. **Listado de Productos Admin (`AdminProducts.tsx`)**:
   - Añadida columna **Condition** en el catálogo global de administración para ver la condición comercial exacta o `—` si es producto estándar no especificado.

---

## 3. MODIFICACIONES EN PANEL VENDOR (`/vendor/settings` Y `/vendor/products`)

1. **Configuración de Tienda (`VSettings.tsx`)**:
   - Añadido campo de solo lectura **Tipo de Tienda (Store Type)** dentro de la pestaña Perfil de la Tienda.
   - Muestra la etiqueta oficial configurada por Admin con la nota informativa *"El tipo de tienda es configurado por Collectibles."*
2. **Formulario de Publicación de Productos (`VProducts.tsx`)**:
   - Si la tienda es **Vintage** o **Mixed**:
     - Se despliega el selector obligatorio **Condition (Estado del Producto)** con los 6 niveles estructurados:
       1. `new_sealed`: Nuevo (Sellado de fábrica)
       2. `new_open_box`: Nuevo (Open Box / Caja abierta)
       3. `used_complete`: Usado (Completo con caja)
       4. `used_incomplete`: Usado (Incompleto / Con detalles)
       5. `loose_complete`: Loose (Suelto sin caja - Completo)
       6. `loose_incomplete`: Loose (Suelto sin caja - Incompleto)
     - Campo opcional **Condition Notes** para describir detalles de caja, accesorios faltantes o desgaste.
     - **Regla de Publicación**: Si el Vendor intenta guardar en estado `status = 'published'` sin seleccionar Condition, el sistema bloquea el guardado lanzando la excepción *"No podés publicar este producto todavía. Seleccioná el estado del producto (Condition)."* (Permite guardar borradores sin bloquear).
   - **Formulario de Tiendas Standard**: Permanece 100% limpio y ágil sin requerir selección de condición.

---

## 4. INTEGRACIONES DE IMPORTACIÓN (MERCADO LIBRE Y CSV)

1. **Mercado Libre (`ml-import-worker`)**:
   - Al importar items de tiendas Vintage o Mixtas, si la condición del producto no puede resolverse con absoluta certeza entre las 6 opciones estructuradas, el producto se registra como borrador/revisión requerida (`status = 'draft'` / `review_needed`).
2. **Importación Masiva CSV/XLSX (`bulkImportUtils.ts`)**:
   - Actualizado el parser para aceptar las columnas `condition` y `condition_notes`.
   - Soporta alias y sinónimos (`condition`, `estado`, `condición`, `condition_notes`, `notas_estado`).
   - Plantilla descargable (`Plantilla_Productos.xlsx`) actualizada con el ejemplo de campo `loose_complete`.

---

## 5. STOREFRONT Y EXPERIENCIA PÚBLICA

- **Privacidad Absoluta de `store_type`**: La propiedad `store_type` de la tienda NO se muestra en el storefront, ni en badges públicos de tienda, ni afecta al SEO.
- **Ficha de Producto (`ProductDetail.tsx`)**:
  - Muestra la insignia y la especificación en Ficha Técnica únicamente cuando el producto tiene definida una `condition` (ej. `🏷️ Loose (Suelto sin caja - Completo)` y sus notas de condición).
- **Product Card (`ProductGridCard.tsx`)**:
  - Muestra insignias discretas en piezas no selladas para orientación clara del comprador:
    - `LOOSE`: Para productos `loose_complete` y `loose_incomplete`.
    - `USED`: Para productos `used_complete` y `used_incomplete`.
    - `OPEN BOX`: Para productos `new_open_box`.
    - `new_sealed`: No muestra insignia (comportamiento estándar por defecto).
- **Filtro de Catálogo (`Shop.tsx` y `useData.ts`)**:
  - Añadido el filtro comercial de **Estado** en el panel lateral del catálogo:
    - **New**: `new_sealed` + `new_open_box` + productos estándar sin condición.
    - **Used**: `used_complete` + `used_incomplete`.
    - **Loose**: `loose_complete` + `loose_incomplete`.

---

## 6. MATRIZ DE VERIFICACIÓN

| Caso de Prueba | Resultado Esperado | Estado |
| :--- | :--- | :--- |
| Nuevo Vendor registrado | Asignación automática de `store_type = 'standard'` | ✅ PASADO |
| Admin cambia vendor a `vintage` | Guardado en DB + Audit Log + visualización en modal | ✅ PASADO |
| Vendor intenta modificar `store_type` vía API | Bloqueado por Trigger `tr_secure_vendor_store_type` | ✅ PASADO |
| Tienda Vintage intenta publicar producto sin Condition | Error "No podés publicar este producto todavía..." | ✅ PASADO |
| Tienda Vintage guarda borrador sin Condition | Guardado exitoso como Draft | ✅ PASADO |
| Tienda Standard publica producto | Formulario limpio sin selector ni bloqueos de Condition | ✅ PASADO |
| Item en catálogo con condición `loose_complete` | Card muestra badge discreto `LOOSE` + Ficha muestra spec | ✅ PASADO |
| Filtro Storefront seleccionado `Loose` | Consulta RPC/Supabase retorna únicamente items sueltos | ✅ PASADO |
| Compilación TypeScript (`npx tsc --noEmit`) | 0 Errores | ✅ PASADO |

---

*Informe generado para Collectibles.uy - Fecha: 14 de Agosto de 2026.*
