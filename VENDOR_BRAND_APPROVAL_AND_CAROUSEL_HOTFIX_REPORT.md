# VENDOR BRAND APPROVAL & CAROUSEL SPEED HOTFIX REPORT

**Project**: Collectibles E-Commerce (Uruguay)  
**Issue**: Imported/created vendor brands appearing on the public Home page / filters without admin approval, and the brand carousel scroll speed being too fast.  
**Severity**: High  
**Resolution**: Completed (Isolation rules enforced, existing database contamination cleaned up, carousel speed optimized).

---

## 1. Causa Raíz

1. **Omisión de Filtros Públicos**: La consulta de marcas en el hook `useBrands` solo filtraba por `.eq('is_active', true)`. Como las marcas propuestas por vendors se creaban anteriormente con `is_active: true` y no existía un campo `is_public` o control estricto de estado de taxonomía, estas marcas pasaban directamente a la Home y a la lista de filtros de marcas.
2. **Definición Incompleta en Importaciones**: Tanto el webhook de sincronización manual (`mercadolibre-sync/index.ts`) como el worker masivo (`ml-import-worker/index.ts`) creaban propuestas de marcas con `is_active: true` y sin clasificar su fuente o visibilidad.
3. **Velocidad del Carrusel**: El carrusel de marcas usaba una animación de 20 segundos configurada de forma general en Tailwind, lo que resultaba en un scroll extremadamente rápido y poco legible en dispositivos móviles y de escritorio.

---

## 2. Archivos Corregidos

### Backend / Base de Datos
* **`supabase/migrations/20261021000000_add_brand_source_public.sql` [NUEVO]**:
  - Agrega columnas `source` (TEXT) y `is_public` (BOOLEAN) a la tabla `brands`.
  - Inicializa marcas aprobadas globales con `is_public = true` y `source = 'manual'`.
* **`supabase/functions/mercadolibre-sync/index.ts` [MODIFICADO]**:
  - Modifica la creación de marcas para guardarlas con `is_active: false`, `is_public: false` y `source: 'vendor_import'`.
* **`supabase/functions/ml-import-worker/index.ts` [MODIFICADO]**:
  - Aplica las mismas reglas de inserción de marca inactiva/privada durante la importación masiva de Mercado Libre.

### Frontend
* **`frontend/src/hooks/useData.ts` [MODIFICADO]**:
  - Hook `useBrands()`: Ahora filtra marcas usando `.eq('status', 'approved').eq('is_active', true).eq('is_public', true)`.
  - Hook `useProducts()`: Se agregó el filtro de seguridad de marcas (`status = 'approved'`, `is_active = true`, `is_public = true`) en la resolución de slugs de marcas.
* **`frontend/src/components/vendor/VProducts.tsx` [MODIFICADO]**:
  - Al proponer una nueva marca manualmente al guardar un producto o duplicarlo, la marca se guarda con `is_active = false, is_public = false, source = 'manual'`.
  - Al guardar/editar/duplicar un producto, si este está asociado a una marca o categoría pendiente, se fuerza `is_active = false` y `status = 'pending_taxonomy_review'`.
* **`frontend/src/components/vendor/VBrands.tsx` [MODIFICADO]**:
  - Las nuevas marcas creadas por el vendor en su panel de control se insertan con `is_active = false, is_public = false, source = 'manual'`.
* **`frontend/src/pages/admin/AdminTaxonomies.tsx` [MODIFICADO]**:
  - Se modificaron los encabezados y celdas de la tabla de marcas pendientes para mostrar: *Marca propuesta*, *Vendor*, *Producto asociado*, *Fuente (Mercado Libre / Manual)*, *Fecha* y *Estado*.
  - En la acción `handleApprove`, si se aprueba una marca, se actualiza en base de datos con `is_public = true` e `is_active = true`.
* **`frontend/src/pages/Home.tsx` [MODIFICADO]**:
  - Se ajustó el estilo del carrusel (`.animate-marquee`) en la etiqueta `<style>` inyectada para usar una velocidad lenta en Desktop (`60s`), aún más lenta en Mobile (`90s`), pausarse al hacer hover (`play-state: paused`), y deshabilitarse limpiamente si el usuario configuró `prefers-reduced-motion` en su sistema operativo.

---

## 3. Consultas Públicas Filtradas

Todas las consultas públicas y hooks de resolución de marcas ahora aplican el siguiente filtro estricto:
```typescript
supabase
  .from('brands')
  .select('*')
  .eq('status', 'approved')
  .eq('is_active', true)
  .eq('is_public', true)
```

---

## 4. Marcas Contaminadas Corregidas (Limpieza de Datos)

Se ejecutó una consulta de remediación directa en producción para regularizar las marcas que se habían colado al público:
1. Todas las marcas con `owner_vendor_id IS NOT NULL` en estado `pending_review` se cambiaron a `is_active = false` e `is_public = false` (incluyendo Poppy Playtime, Child's Play, Batman, Street Fighter, etc.).
2. Todos los productos asociados a estas marcas pendientes se movieron a `status = 'pending_taxonomy_review'` e `is_active = false` para retirarlos del catálogo público inmediatamente.

---

## 5. Pruebas Realizadas

1. **Creación/Importación de Marca**: Se validó que las marcas creadas por importaciones de Mercado Libre o manuales de vendors entren con `status = 'pending_review'`, `is_active = false`, `is_public = false`.
2. **Ocultamiento en Catálogo**: Comprobado que marcas en estado `pending_review` no aparecen en el marquee de la Home ni en los filtros de búsqueda pública.
3. **Bloqueo de Productos**: Se verificó que los productos con marcas pendientes queden bloqueados en `pending_taxonomy_review` y no se listen en el catálogo general.
4. **Administración en Panel**: Verificado el correcto renderizado de las columnas *Fuente* y *Estado* en el panel del administrador, y que al aprobarlas se activen públicamente de forma correcta.
5. **Velocidad del Carrusel**: Comprobado el scroll lento y fluido en desktop (60s) y responsivo en mobile (90s).
6. **Compilación de Código**: `npm run build` y `npx tsc --noEmit` completados exitosamente sin errores de compilación ni de tipos.

---

## 6. Estado Final

El flujo queda completamente blindado. Los vendors ya no pueden colar marcas al carrusel público ni sus productos aparecerán en el catálogo hasta que un administrador revise y apruebe/fusione la taxonomía correspondiente.
