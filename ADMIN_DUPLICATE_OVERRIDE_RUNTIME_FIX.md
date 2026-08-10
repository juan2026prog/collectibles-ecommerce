# ADMIN DUPLICATE OVERRIDE RUNTIME FIX REPORT

**Proyecto**: Collectibles.uy / Collectibles2026  
**Fecha**: 10 de Agosto de 2026  
**Módulo**: Admin Catalog Management (`AdminProducts.tsx` / `product_duplicate_history` / Supabase DB)  
**Estado**: Auditado, Corregido, Compilado y Listo para Producción  

---

## 1. Función Exacta y Líneas Modificadas

- **Archivo**: [AdminProducts.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminProducts.tsx)
- **Función**: `handleSave(options?: { allowDuplicateOverride?: boolean })`
- **Líneas Modificadas**: 238–265 y 332–344 (más la renderización del modal `DuplicateOverrideModal` al final del componente).

---

## 2. Clasificación Anterior vs. Nueva Clasificación

### Clasificación Anterior (Bloqueo Duro / Runtime Exception)
Anteriormente, cuando `supabase.rpc('check_duplicate_product')` devolvía un candidato con una similitud $\ge 95\%$, el código concatenaba el error al arreglo `errors`:
```tsx
if (otherDup) {
  errors.push(`Conflicto de duplicado detectado (Similitud >= 95% con producto ID: ${otherDup.matched_product_id})`);
}

if (errors.length > 0) {
  throw new Error("Reglas de Publicación no cumplidas:\n- " + errors.join("\n- "));
}
```
Esto lanzaba un `throw new Error(...)` que interrumpía la ejecución del formulario y mostraba una alerta roja bloqueante al Administrador, haciendo imposible guardar el producto.

### Nueva Clasificación (Hard Blockers vs. Soft Warnings)
Se dividieron las validaciones en dos categorías estrictas:

1. **Hard Blockers** (Lanzan excepción de publicación y detienen el formulario):
   - Título obligatorio faltante (`!form.title.trim()`).
   - Categoría principal no seleccionada cuando `status === 'published'`.
   - Marca no seleccionada cuando `status === 'published'`.
   - Precio Base $\le 0$.
   - Stock $< 0$.
   - Imagen principal faltante cuando `status === 'published'`.

2. **Soft Warnings** (No lanzan excepción de JavaScript; abren modal de confirmación):
   - Coincidencia de duplicado con similitud $\ge 95\%$ en `check_duplicate_product`.

---

## 3. Flujo del Modal de Advertencia Interactiva

Cuando la similitud sea $\ge 95\%$ y `options?.allowDuplicateOverride` sea `false`:
1. `handleSave` detiene temporalmente la inserción/actualización.
2. Consulta en Supabase los metadatos del producto candidato (`título`, `vendedor/tienda`, `SKU`, `ID`).
3. Abre el modal **Posible Duplicado Detectado** (`DuplicateOverrideModal`) mostrando la información contextual y el porcentaje de similitud.
4. El Administrador puede elegir entre tres acciones:
   - 🔗 **Ver Existente**: Abre la ficha del producto existente en una nueva pestaña.
   - ❌ **Cancelar**: Cierra el modal y deja el formulario intacto sin guardar.
   - ✅ **Crear de Todas Formas**: Ejecuta `handleSave({ allowDuplicateOverride: true })`, forzando el guardado del producto y cerrando la ventana.

---

## 4. Auditoría y Registro de Decisiones de Override

Cuando un Administrador hace clic en **Crear de Todas Formas**, la función `handleSave` registra automáticamente el evento en la tabla `product_duplicate_history` de Supabase:

```sql
INSERT INTO product_duplicate_history (
  product_id,
  related_product_id,
  action_type,
  admin_id,
  details
) VALUES (
  '<new_product_id>',
  '<candidate_product_id>',
  'admin_duplicate_override',
  '<admin_user_id>',
  'Admin override autorizó creación con similitud X% contra candidato Y'
);
```

---

## 5. Auditoría del Caso Real (`d6436dff-23cf-44dc-a082-5047d931c4c4`)

Se investigó el producto candidato que generó el bloqueo en producción:

- **ID**: `d6436dff-23cf-44dc-a082-5047d931c4c4`
- **Título Existente**: `99 Nights in the Forest - Minifiguras- Serie 1 - Incluye códigos DLC canjeables en Roblox`
- **SKU**: `810189761537`
- **Marca**: `PhatMojo`
- **Categoría**: `BlindBoxes`
- **Precio**: `$490.00`
- **Vendedor**: `Collectibles.uy` / Marketplace

**Diagnóstico del Caso**:  
Al intentar publicar un producto idéntico o muy similar desde el Admin, la función `check_duplicate_product` devolvía `similarity_score = 1.0`. Con la nueva solución, el sistema no bloquea la operación con un cartel de error, sino que despliega el modal interactivo con los datos del producto `d6436dff-23cf-44dc-a082-5047d931c4c4` y le permite al Administrador confirmar **Crear de todas formas**.

---

## 6. Pruebas de Compilación y Validación QA

1. **TypeScript Typecheck**: `npx tsc --noEmit` $\rightarrow$ **0 errores**.
2. **Production Build**: `npm run build` $\rightarrow$ **Exitoso (6.01s)**.
3. **Flujo UI y Manejo de Estados**: El modal responde correctamente a las tres acciones (`Ver Existente`, `Cancelar`, `Crear de Todas Formas`).
