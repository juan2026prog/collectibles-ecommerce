# INFORME DE CONTROL DE CALIDAD Y ENTREGA
## GESTIÓN SIMPLE DE VENDORS Y TIENDAS OFICIALES (ADMIN)

Este informe detalla las vistas creadas, campos visibles, lógica del toggle de "Tienda Oficial", reglas de seguridad implementadas y el proceso de QA realizado para la gestión de vendors y tiendas oficiales en el panel de administración.

---

## 1. VISTAS CREADAS

La gestión se incorporó de forma integrada en la sección de **Marketplace** bajo la pestaña **Vendors** (ruta: `/admin/marketplace?tab=vendors`), evitando la creación de módulos complejos e innecesarios.

Las vistas creadas y mejoradas son:
1. **Dashboard principal de Vendors**:
   - Tabla general de todos los vendors de la plataforma.
   - Panel de estadísticas clave en la parte superior (Total Vendors, Vendors Activos, GMV Bruto de Vendedores, y Comisiones Ganadas a partir de la función RPC de Supabase).
   - Buscador en tiempo real por nombre de tienda y paginación.
2. **Modal de Detalle del Vendor**:
   - Acceso rápido a todos los datos comerciales y de facturación.
   - Lista de usuarios asociados (identificando claramente qué emails y roles pertenecen a qué vendor).
   - Tabla de tiendas del vendor con acciones administrativas directas.
3. **Sub-modal de Productos de Tienda**:
   - Despliegue de los productos cargados bajo esa tienda específica con detalles de stock, precio y visibilidad.

---

## 2. CAMPOS VISIBLES

### A. Tabla Principal de Vendors
* **Vendor / Empresa**: Nombre comercial, logotipo y razón social.
* **Email Principal**: Email del usuario administrador/creador de la cuenta vendor.
* **Teléfono**: Teléfono de contacto comercial.
* **Estado**: Activo / Suspendido.
* **KYC**: Estado de aprobación de la documentación (Aprobado, Pendiente, Rechazado).
* **Tiendas**: Cantidad de tiendas y listado condensado de nombres.
* **Productos**: Cantidad de productos totales asociados al vendor.
* **Mercado Libre**: Indica si tiene cuenta de Mercado Libre vinculada (Sí / No).
* **Fecha Alta**: Fecha de registro en el sistema.

### B. Detalle del Vendor (Modal)
* **Datos del Vendor**: Nombre comercial, Razón social, RUT / Tax ID, Email principal, Teléfono, Estado, Comisión base, Promociones Opt-In (Sí/No) y Conexión Mercado Libre (Sí/No).
* **Usuarios asociados**: Tabla con los campos `Email`, `Rol` y `Estado` para rastrear inequívocamente a los usuarios.
* **Tiendas del Vendor**: Tabla con los campos `Nombre Tienda`, `Slug / URL`, `Estado` (Activa / Suspendida), `Marcas Asociadas` (nombres concatenados), `Tienda Oficial` (Sí / No), cantidad de `Productos` e inline actions.

### C. Productos de la Tienda (Sub-modal)
* **Producto**: Nombre/título del producto.
* **Marca**: Nombre de la marca asociada.
* **Tienda**: Tienda a la que pertenece.
* **Precio**: Precio base.
* **Stock**: Suma de inventario en todas sus variantes.
* **Estado**: Estado de publicación (ej. `published`).
* **Visible**: Si está activo para venta al público (SÍ / NO).

---

## 3. COMPORTAMIENTO DEL TOGGLE "TIENDA OFICIAL"

Se añadió el botón **Hacer Oficial / Quitar Oficial** en cada tienda listada dentro del detalle del vendor.

### Reglas del Flujo:
1. **Activar Tienda Oficial**:
   - `vendor_stores.is_official = true`
   - `vendor_stores.official_badge_text = 'Tienda Oficial'`
   - `vendor_stores.approved_by = [ID del administrador que realiza la acción]`
   - `vendor_stores.approved_at = now()` (timestamp actual)
   - `vendor_stores.status = 'active'` (aprobación automática de la tienda al hacerla oficial)
2. **Desactivar Tienda Oficial**:
   - `vendor_stores.is_official = false`
   - `vendor_stores.official_badge_text = null`
   - `vendor_stores.approved_by = null`
   - `vendor_stores.approved_at = null`
   - (Se mantiene el estado activo/suspendido de la tienda según corresponda)

---

## 4. REGLAS DE SEGURIDAD (TRIGGERS DE BASE DE DATOS)

Para evitar la manipulación maliciosa de estos datos sensibles desde clientes no autorizados, se implementó un trigger a nivel de base de datos en Supabase:

```sql
CREATE OR REPLACE FUNCTION public.check_vendor_store_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Si hay un usuario logueado en la sesión de Supabase Auth, se verifica su rol admin
  IF auth.uid() IS NOT NULL AND NOT (SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = auth.uid()) THEN
    -- Evitar que un no-admin marque una tienda como oficial
    IF NEW.is_official = true AND (OLD.is_official IS NULL OR OLD.is_official = false) THEN
      RAISE EXCEPTION 'Solo los administradores pueden marcar una tienda como oficial.';
    END IF;

    -- Evitar que un no-admin altere los campos de aprobación
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Solo los administradores pueden modificar la aprobacion de tienda oficial.';
    END IF;

    -- Evitar que un no-admin apruebe o active tiendas
    IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Solo los administradores pueden aprobar o activar tiendas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_check_vendor_store_modification
  BEFORE UPDATE ON public.vendor_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vendor_store_modification();
```

Este trigger asegura que las reglas de negocio críticas se cumplan independientemente del canal por el cual se intente realizar el update.

---

## 5. FRONTEND PÚBLICO: CONDICIÓN DEL BADGE

El frontend público (Ficha de producto `ProductDetail.tsx`, tarjeta de catálogo `ProductGridCard.tsx` y tienda pública `VendorStorefront.tsx`) valida la autenticidad del badge "Tienda Oficial" bajo las siguientes condiciones concurrentes:

```typescript
if (
  vendor_store.is_official &&
  vendor_store.status === 'active' &&
  vendor_store.approved_by &&
  vendor_store.approved_at
) {
  // Renderizar Badge "TIENDA OFICIAL"
} else {
  // Ocultar / No mostrar badge
}
```

Esto impide que tiendas auto-declaradas oficiales o sin aprobación explícita muestren el distintivo.

---

## 6. QA REALIZADO & VERIFICACIONES

### Casos de prueba ejecutados con éxito:
1. **Admin ve lista de vendors**: Correcto. El dashboard muestra estadísticas acumuladas dinámicamente y la lista completa con información agregada (tiendas, productos y estado ML).
2. **Admin ve email asociado al vendor**: Correcto. Se despliega la columna "Email Principal" mapeada de la relación `profiles` de Supabase.
3. **Admin entra al detalle del vendor**: Correcto. El modal de detalle carga instantáneamente, mostrando datos del vendor, la tabla de usuarios asociados y la tabla de tiendas.
4. **Admin ve tiendas del vendor**: Correcto. Se visualizan todas las tiendas asociadas con sus slugs, marcas, estado oficial y cantidad de productos.
5. **Admin activa "Tienda Oficial"**: Correcto. Al hacer click en "Hacer Oficial", se actualiza la tienda en base de datos. Se establecen los campos `is_official = true`, `approved_by` con la ID del admin actual y `approved_at` con la fecha.
6. **Badge aparece en producto**: Correcto. Los productos de la tienda muestran el badge "TIENDA OFICIAL" en su detalle, la tarjeta del catálogo y la cabecera de la tienda.
7. **Admin quita "Tienda Oficial"**: Correcto. Al hacer click en "Quitar Oficial", se resetean los campos en base de datos.
8. **Badge desaparece**: Correcto. Tras quitar el atributo oficial, el badge deja de mostrarse en todas las secciones públicas del frontend.
9. **Vendor no puede activarse solo**: Correcto. El trigger Postgres bloquea las transacciones de modificación si el usuario que firma la petición no tiene `is_admin = true` en su perfil.
10. **Build OK**: Correcto. La compilación de producción del cliente mediante Vite finaliza sin errores de tipado o sintaxis (`npm run build` exitoso).

---

## 7. RESOLUCIÓN DE CARGA DE IMÁGENES Y BIBLIOTECA MULTIMEDIA DEL VENDOR

Se detectó y solucionó un problema crítico que impedía a los vendors subir imágenes a sus productos de forma exitosa y verlas reflejadas en su biblioteca multimedia (`VMedia.tsx` / "Mi Biblioteca Multimedia"):

### A. Causa Raíz:
1. **Falta de Políticas RLS en `public-assets`**: No existía una política en el bucket de almacenamiento `public-assets` de Supabase que permitiera a usuarios con rol `is_vendor = true` realizar escrituras (`INSERT`, `UPDATE`, `DELETE`). Solo el rol Admin tenía privilegios de escritura en este bucket.
2. **Falta de scoping en `MediaPickerModal.tsx`**: El selector multimedia utilizado al crear/editar productos no tenía conocimiento de la estructura de carpetas aislada de los vendors (`vendors/{user.id}/`). Intentaba interactuar con la raíz `""` del bucket, lo cual provocaba fallos de acceso denegado y causaba que las imágenes subidas no se guardaran en la carpeta de medios personal del vendor.

### B. Solución Implementada:
1. **Nueva Política RLS en Base de Datos**:
   Se creó y aplicó la migración [20261031000000_vendors_storage_policy.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20261031000000_vendors_storage_policy.sql), permitiendo a los vendors gestionar de manera autónoma sus archivos exclusivamente dentro de su directorio personal:
   ```sql
   CREATE POLICY "Vendors can manage own assets in public-assets" ON storage.objects
   FOR ALL
   USING (
     bucket_id = 'public-assets' AND
     auth.uid() IS NOT NULL AND
     (name LIKE 'vendors/' || auth.uid()::text || '/%') AND
     (SELECT COALESCE(is_vendor, false) FROM public.profiles WHERE id = auth.uid())
   )
   WITH CHECK (
     bucket_id = 'public-assets' AND
     auth.uid() IS NOT NULL AND
     (name LIKE 'vendors/' || auth.uid()::text || '/%') AND
     (SELECT COALESCE(is_vendor, false) FROM public.profiles WHERE id = auth.uid())
   );
   ```
2. **Auto-scoping en el Frontend (`MediaPickerModal.tsx`)**:
   - Se integró el contexto `useAuth()` para detectar el rol del usuario actual.
   - Si el usuario es un vendor (y no un administrador), el componente de carga y selección multimedia (`MediaPickerModal`) automáticamente restringe y redirige todas las operaciones del bucket (listar, subir, renombrar, mover, borrar) bajo el prefijo de ruta `vendors/{user.id}/`.
   - Esto hace que cualquier imagen subida desde la edición de un producto se guarde directamente en su carpeta correspondiente y se muestre en tiempo real en su sección de "Mi Biblioteca Multimedia".

---

## 8. ESTADO FINAL

El hotfix completo (Gestión de Vendors, Tiendas Oficiales, y la Biblioteca de Carga Multimedia para Vendors) está **completado y verificado con éxito en producción**. La compilación es estable y segura.
