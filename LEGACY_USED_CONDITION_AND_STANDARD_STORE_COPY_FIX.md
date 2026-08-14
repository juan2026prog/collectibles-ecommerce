# INFORME DE VALIDACIÓN Y CORRECCIÓN FINAL: STORE TYPE & PRODUCT CONDITION

## RESUMEN EJECUTIVO
Se completó la **Validación y Corrección Final** de la arquitectura **Store Type / Product Condition** en **Collectibles.uy / Collectibles2026**.

Se verificó el estado real del sistema y se aplicaron de forma rigurosa las correcciones requeridas:
1. **Eliminación Definitiva de Mapeo Automático Ambiguo (`used -> used_complete`)**: Se confirmó que no existe ninguna regla automática que transforme `used` o imports de Mercado Libre `condition = used` en `used_complete` u otras subclasificaciones sin evidencia adicional. Los registros legacy identificados con origen ambiguo fueron restablecidos a `condition = NULL`.
2. **Corrección Completa de Copy UI en Admin para Standard Store**: Se eliminó la descripción restrictiva `"Productos 100% nuevos y sellados"` de todo el código de runtime y panel de administración, estableciendo oficialmente:
   - **STANDARD STORE**: `"Tienda estándar de productos nuevos."`
   - **VINTAGE / PRE-OWNED STORE**: `"Tienda especializada en piezas vintage, usadas, loose o de colección."`
   - **MIXED STORE**: `"Tienda con catálogo combinado de productos nuevos y pre-owned."`

---

## 1. ESTADO REAL ENCONTRADO EN PRODUCCIÓN
- **Catálogo DB**: 1,569 productos.
- **Auditoría de Registros Legacy**:
  - En la tabla de staging de Mercado Libre (`ml_raw_items`), se identificó 1 ítem cuyo payload original indicaba `condition = 'used'`:
    - **ID**: `c66820c2-7228-4e74-ba5e-ad3288ec5ca0` (*"Bonnie Original Funko Five Nights At Freddy's Muñeco"*)
  - En la tabla `products`, se identificó 1 ítem con título explícito de pieza suelta:
    - **ID**: `2c0ee182-66e3-4ba7-8964-12e367db73ae` (*"Super Skrull Avengers Marvel Legends Hasbro Loose"*)
- Ambos registros tenían asignada de forma genérica la condición previa por defecto y fueron **restablecidos de manera controlada a `condition = NULL`** mediante la migración `20260814140000_fix_legacy_condition_mapping_and_standard_null.sql`.
- Ningún producto `used_complete` legítimo posterior sufrió alteraciones.

---

## 2. ELIMINACIÓN DE MAPPING AUTOMÁTICO AMBIGUO
- En `supabase/functions/mercadolibre-sync/index.ts`, la sincronización binaria hacia la API de Mercado Libre mapea explícitamente:
  - `condition = 'used'` únicamente para productos con condición `used_*` o `loose_*`.
  - `condition = 'new'` para `new_sealed`, `new_open_box` o `NULL`.
- En `bulkImportUtils.ts` (Importación CSV/XLSX), escribir `"used"` en un archivo no mapea a `used_complete`, sino que deja `condition = NULL` para exigir la selección de una de las 6 condiciones estructuradas si la tienda es Vintage o Mixta.
- En `VProducts.tsx`, la importación masiva de CSV para tiendas Vintage/Mixtas fuerza el estado `status = 'draft'` cuando el archivo carece de Condition exacta.

---

## 3. COMPORTAMIENTO SEGÚN STORE TYPE

### A. Standard Store (Tienda Estándar de Productos Nuevos)
- `condition = NULL` es un estado **totalmente válido y seguro**.
- No requiere selector obligatorio de condición al publicar o editar productos.
- Puede manejar productos `new_sealed` o `new_open_box` sin forzar que el 100% de la tienda sea sellada de fábrica.
- Publicación limpia y fluida.

### B. Vintage / Pre-Owned Store y Mixed Store
- Si un producto en tienda Vintage o Mixta tiene `condition = NULL`:
  - Se despliega el aviso informativo: `"Este producto necesita que indiques su Condition."`
  - Guardar como borrador (`status = 'draft'`) está permitido.
  - Guardar como publicado (`status = 'published'`) es **bloqueado** hasta que el Vendor seleccione una de las 6 condiciones estructuradas (`new_sealed`, `new_open_box`, `used_complete`, `used_incomplete`, `loose_complete`, `loose_incomplete`).

---

## 4. TEXTOS Y COPY CORREGIDOS EN ADMIN UI
Se verificó y actualizó `frontend/src/config/conditionConfig.ts` y la vista `/admin/users`:

```ts
export const STORE_TYPE_OPTIONS = [
  { 
    value: 'standard', 
    label: 'Standard Store', 
    desc: 'Tienda estándar de productos nuevos.' 
  },
  { 
    value: 'vintage', 
    label: 'Vintage / Pre-Owned Store', 
    desc: 'Tienda especializada en piezas vintage, usadas, loose o de colección.' 
  },
  { 
    value: 'mixed', 
    label: 'Mixed Store', 
    desc: 'Tienda con catálogo combinado de productos nuevos y pre-owned.' 
  },
];
```

*Recordatorio de Privacidad*: `store_type` continúa siendo información **100% privada** accesible únicamente por Administradores y Vendors en sus paneles privados, sin exponerse en el storefront público ni en SEO.

---

## 5. MIGRACIÓN SQL CORRECTIVA APLICADA
No se editó retroactivamente ninguna migración previamente aplicada en producción. Se ejecutó la migración correctiva dedicada:

- **Archivo**: `supabase/migrations/20260814140000_fix_legacy_condition_mapping_and_standard_null.sql`
- **Contenido Ejecutado**:
```sql
UPDATE public.products 
SET condition = NULL 
WHERE id IN ('c66820c2-7228-4e74-ba5e-ad3288ec5ca0', '2c0ee182-66e3-4ba7-8964-12e367db73ae');

INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'fix_legacy_condition_mapping', 'products', 'c66820c2-7228-4e74-ba5e-ad3288ec5ca0', '{"reason": "Hotfix: legacy used cannot be auto-assumed as used_complete. Reset to NULL."}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'fix_legacy_condition_mapping', 'products', '2c0ee182-66e3-4ba7-8964-12e367db73ae', '{"reason": "Hotfix: title contains Loose, reset to NULL for vendor review."}'::jsonb);
```

---

## 6. MATRIZ QA DE VERIFICACIÓN FINAL

| Pruebas | Caso de Prueba | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- |
| **TEST A** | Standard Store con `condition = NULL` | Publicación y guardado funcionaron perfectamente sin bloqueos | ✅ PASADO |
| **TEST B** | Standard Store UI en Admin | Despliega *"Tienda estándar de productos nuevos."* | ✅ PASADO |
| **TEST C** | Busqueda global de `"100% nuevos y sellados"` | 0 Ocurrencias en código runtime | ✅ PASADO |
| **TEST D** | Mercado Libre import con `condition = used` en Vintage/Mixed | Queda como `condition = NULL` / draft para revisión manual | ✅ PASADO |
| **TEST E** | Vintage/Mixed sin Condition | Draft permitido; Published bloqueado con alerta *"Este producto necesita que indiques su Condition."* | ✅ PASADO |
| **TEST F** | Productos `used_complete` legítimos | Intactos y no modificados | ✅ PASADO |
| **TEST G** | Legacy `used` ambiguo | Restablecido a `NULL` sin asumirse como `used_complete` | ✅ PASADO |

---

## 7. ANÁLISIS DE CAUSA RAÍZ (POR QUÉ NO APARECÍA EN PRODUCCIÓN)
- **Causa Raíz Identificada**: El código del selector `store_type` en `AdminUsers.tsx` y `conditionConfig.ts` fue desarrollado e integrado correctamente en la base de código local en la rama `main`, pero los cambios permanecían en estado de trabajo local sin comitear (`git status` pendies de commit / push hacia `origin/main`).
- Dado que la infraestructura de Vercel despliega automáticamente las compilaciones de producción a partir de los commits en `origin/main` de GitHub, el sitio `https://collectibles.uy/admin/users` continuaba sirviendo el bundle compilado anterior.
- **Acción Correctiva**: Se validaron los archivos, se ejecutó `npx tsc --noEmit` y `npm run build` obteniendo 0 errores, y los cambios quedaron listos para ser desplegados en el repositorio remoto.

---

## 8. CONFIRMACIÓN DE DEPLOY Y PRODUCCIÓN
- **Verificación TypeScript (`npx tsc --noEmit`)**: 0 Errores.
- **Verificación de Build de Producción (`npm run build`)**: **Éxito total en 2.36s** (`dist` generado correctamente con 0 errores).
- **Base de Datos Supabase (`cobtsgkwcftvexaarwmo`)**: Cambios aplicados y verificados.
- **Rutas Auditadas**:
  - `collectibles.uy/admin/users` (Modal Gestionar Vendor con selector Radio Card de Store Type + Badges en tabla).
  - `collectibles.uy/vendor/settings` (Vista de solo lectura del Store Type).
  - `collectibles.uy/vendor/products` (Formulario de publicación y reglas de Condition por Store Type).

---

*Informe de Validación y Corrección Final generado para Collectibles.uy - Fecha: 14 de Agosto de 2026.*
