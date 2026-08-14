# Informe de Entrega: Integración Gestión Vendor + Tienda + Permisos de Catálogo en `/admin/users`

**Fecha:** 14 de Agosto, 2026  
**Proyecto:** Collectibles.uy  
**Módulo Modificado:** `/admin/users` ("Usuarios & Auditoría")  
**Estado:** **GO (100% Operativo y Verificado en Runtime)**

---

## 1. Auditoría Inicial y Componente Real Modificado

- **Ruta real**: `/admin/users`
- **Pantalla real**: "Usuarios & Auditoría"
- **Componente Frontend principal**: `c:\Projects\Collectibles2026\frontend\src\pages\admin\AdminUsers.tsx`
- **Componentes relacionados**:
  - `c:\Projects\Collectibles2026\frontend\src\components\vendor\VProducts.tsx`
  - `c:\Projects\Collectibles2026\supabase\functions\ml-import-worker\index.ts`
  - `c:\Projects\Collectibles2026\supabase\functions\mercadolibre-sync\index.ts`

---

## 2. Esquema Real de Base de Datos y Relaciones

### Entidades y Claves Foráneas:
- `auth.users(id)` ↔ `public.profiles(id)` (Relación 1:1)
- `public.profiles(id)` ↔ `public.vendors(id)` (Relación 1:1, `vendors.id` es la FK directa a `profiles.id`)
- `public.vendors(id)` ↔ `public.vendor_stores(vendor_id)` (Relación 1:N / 1:1 con `vendor_stores.vendor_id = vendors.id`)

### Resolución Canónica del Nombre de la Tienda:
1. Si existe `vendor_stores` para el vendor y tiene `store_name`: se utiliza `vendor_stores.store_name`.
2. Si no existe `vendor_store` pero sí `vendors.store_name`: se utiliza `vendors.store_name` como fallback.
3. Si el usuario no es Vendor: muestra `—`.

---

## 3. Migración en Base de Datos

**Archivo**: `supabase/migrations/20261222000000_vendor_catalog_permissions.sql` (Aplicada en producción)

```sql
-- 1. Columnas de permisos en public.vendors
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS can_request_categories BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_request_brands BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_request_licenses BOOLEAN NOT NULL DEFAULT false;

-- 2. Tablas de solicitudes
CREATE TABLE IF NOT EXISTS public.vendor_category_requests (...);
CREATE TABLE IF NOT EXISTS public.vendor_license_requests (...);
```

> [!NOTE]
> Todos los vendors existentes y nuevos inician con permisos `false, false, false`. Ningún permiso se concede automáticamente.

---

## 4. Gobernanza RLS y Seguridad Server-Side

Las políticas RLS garantizan que un Vendor NO pueda insertar solicitudes directamente en la base de datos si no tiene la columna de permiso correspondiente en `true`:

- `public.vendor_brand_requests` FOR INSERT:
  `vendor_id = auth.uid() AND (is_admin = true OR vendors.can_request_brands = true)`
- `public.vendor_category_requests` FOR INSERT:
  `vendor_id = auth.uid() AND (is_admin = true OR vendors.can_request_categories = true)`
- `public.vendor_license_requests` FOR INSERT:
  `vendor_id = auth.uid() AND (is_admin = true OR vendors.can_request_licenses = true)`

---

## 5. Optimizaciones en la Consulta de `/admin/users` (Prevención N+1)

La carga de usuarios en `AdminUsers.tsx` se realiza mediante batching/join sin generar consultas N+1:

```ts
// 1. Fetch profiles
const { data: profilesData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

// 2. Batch fetch vendors y vendor_stores
const { data: vendorsData } = await supabase.from('vendors').select('...').in('id', userIds);
const { data: vendorStoresData } = await supabase.from('vendor_stores').select('...').in('vendor_id', userIds);
```

---

## 6. Nueva Interfaz de `/admin/users`

### Tabla de Usuarios:
Muestra las siguientes columnas de forma clara e intuitiva:
1. **USUARIO**: Nombre, apellido, email y badge de estado (Bloqueado/Activo).
2. **TIENDA**: Nombre público de la tienda (`JorgiToys`, `Tienda de prueba`, etc.) o `—`.
3. **ROLES**: Badges de Admin, Vendor, Artist, Affiliate (soporta múltiples roles simultáneos).
4. **PERMISOS CATÁLOGO**: Resumen compacto con insignias interactivas y tooltips:
   - `Cat ✓` / `C —` (`C = Puede solicitar categorías`)
   - `Marca ✓` / `M —` (`M = Puede solicitar marcas`)
   - `Lic ✓` / `L —` (`L = Puede solicitar licencias`)
5. **REGISTRO**: Fecha de registro del usuario.
6. **ACCIONES**: Botones de rol, Bloquear/Desbloquear, Eliminar.

### Modal "GESTIONAR VENDOR":
Se abre al pulsar la acción de Vendor (icono de tienda). Permite al Administrador:
- Visualizar Email, Nombre de Tienda y Vendor ID.
- Modificar el nombre de la tienda.
- Activar/desactivar individualmente los switches:
  - `Solicitar nuevas categorías` [ OFF / ON ]
  - `Solicitar nuevas marcas` [ OFF / ON ]
  - `Solicitar nuevas licencias` [ OFF / ON ]
- Persistir los cambios y registrar la modificación en `public.audit_logs`.

---

## 7. Integración en Portal Vendor y Mercado Libre

### Portal Vendor (`VProducts.tsx`):
- **Marcas**: El botón `Solicitar nueva marca` se muestra únicamente si `can_request_brands = true`. Si es `false`, la opción se muestra deshabilitada.
- **Licencias**: El botón `Solicitar nueva licencia` abre el modal para `vendor_license_requests` únicamente si `can_request_licenses = true`.
- **Categorías**: La propuesta de nuevas categorías registra una solicitud en `vendor_category_requests` si `can_request_categories = true`.
- **Selección normal**: Si todos los permisos están en `false`, el Vendor **SÍ puede crear y publicar productos** utilizando las marcas, licencias y categorías aprobadas en el catálogo.

### Mercado Libre Import (`ml-import-worker` & `mercadolibre-sync`):
- Al importar un producto con fabricante no reconocido, el sistema verifica `can_request_brands`. Si es `false`, no se crea la solicitud automática y el producto permanece en revisión.

---

## 8. Verificación de QA y Pruebas Runtime

| Prueba QA | Descripción | Resultado |
|---|---|---|
| QA-1 | Usuario no Vendor | Tienda = `—`, Permisos = `—` |
| QA-2 | Vendor `collectibles01@outlook.com` | Muestra `JorgiToys` y estado `active` |
| QA-3 | Permisos iniciales | Todos inician en `C — / M — / L —` |
| QA-4 | Modificación por Admin | Cambio de permiso a `true` persiste correctamente en DB y refresca tabla |
| QA-5 | Auditoría de Cambios | Se genera entrada inmutable en `audit_logs` con `old_data` y `new_data` |
| QA-6 | Portal VProducts | Deshabilita/habilita opciones de solicitud en caliente según permisos del vendor |
| QA-7 | RLS Backend | Solicitudes sin permiso son rechazadas por PostgreSQL |
| QA-8 | Build de Frontend | `npm run build` compila con 0 errores TypeScript/Vite |

---

## Criterio Final de Éxito: DECLARADO GO
El Administrador puede gestionar Vendors, visualizar sus tiendas correspondientes, asignar/revocar permisos de catálogo en tiempo real con persistencia verificada y auditoría completa.
