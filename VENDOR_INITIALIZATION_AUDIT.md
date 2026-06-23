# AUDITORÍA DE INICIALIZACIÓN DE VENDORS Y ERRORES DE BASE DE DATOS

## Resumen Ejecutivo

Esta auditoría técnica detalla la investigación, el diagnóstico y la resolución de la falla crítica que ocurría durante el onboarding e inicialización de nuevas tiendas vendedor (vendedores/vendors) en la plataforma de Collectibles, así como los errores de consulta e inserción relacionales en el Panel Administrativo.

---

## 1. Causa Exacta del Error

Se identificaron tres causas principales e independientes para los fallos del flujo:

### A. Violación de clave única `vendors_store_name_key` (Onboarding del Seller Center)
* **Archivo afectado:** `frontend/src/pages/VendorDashboard.tsx`
* **Causa:** Cuando un usuario sin nombre configurado (solo correo electrónico) o un usuario con un nombre ya existente en el sistema intentaba activar su tienda, el sistema recurría al valor por defecto `'Mi Tienda'` o a `"Tienda de [Nombre]"`. Debido a que la columna `store_name` de la tabla `vendors` tiene una restricción `UNIQUE` y el valor `'Mi Tienda'` ya estaba registrado en la base de datos, la base de datos rechazaba la inserción arrojando el error `duplicate key value violates unique constraint "vendors_store_name_key"`.
* **Impacto:** Ningún usuario nuevo podía inicializar su tienda si no tenía un primer nombre configurado o si coincidía con un nombre de tienda ya creado.

### B. Incompatibilidad de Columnas en el RPC de Aceptación de Invitaciones (`accept_vendor_invitation`)
* **Archivo afectado:** Función de base de datos `public.accept_vendor_invitation` (definida originalmente en el archivo de migración `supabase/migrations/20261008000000_vendor_invitations.sql`).
* **Causa:** La función hacía referencia a un campo inexistente `user_id` tanto para la verificación de existencia como para la inserción en la tabla `vendors` (`WHERE user_id = v_user_id` e `INSERT INTO vendors (user_id, ...)`). La tabla `vendors` utiliza el campo `id` como clave primaria vinculada directamente a `profiles.id` (y por ende a `auth.users(id)`), no tiene una columna llamada `user_id`.
* **Impacto:** Cualquier intento de un vendedor de aceptar una invitación formal enviada por correo electrónico fallaba a nivel de base de datos con un error de ejecución del RPC.

### C. Error de Relación HTTP 400 en los Paneles del Administrador
* **Archivos afectados:**
  - `frontend/src/pages/admin/AdminVendors.tsx`
  - `frontend/src/pages/admin/AdminVendorKyc.tsx`
* **Causa:** Las consultas de Supabase del lado del cliente intentaban hacer un join de la tabla `profiles` mediante la relación `.select('..., profiles:user_id(email, ...)')`. Al no existir la columna `user_id` en `vendors` y ser la clave primaria relacional `id` (con constraint `vendors_id_fkey`), Supabase/PostgREST rechazaba las peticiones con un código de error HTTP 400 Bad Request (`Could not find a relationship between 'vendors' and 'user_id' in the schema cache`).
* **Impacto:** Las listas de vendors y verificación de KYC del panel administrativo se rompían impidiendo a los administradores visualizar o validar las tiendas.

---

## 2. Correcciones Aplicadas

Para solucionar permanentemente la problemática sin afectar las políticas de seguridad de datos ni las integraciones activas, se ejecutaron las siguientes medidas correctivas:

### Corrección 1: Inicialización Dinámica y Segura (Frontend - Seller)
* **Archivo:** [VendorDashboard.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/VendorDashboard.tsx)
* **Detalle:**
  1. Se implementó una verificación previa del perfil del vendor mediante una consulta por `id`. Si ya existe un registro de vendor, el sistema simplemente lo carga en lugar de re-intentar un `INSERT`.
  2. Se sustituyó el nombre genérico `'Mi Tienda'` por un generador de nombre de tienda dinámico y único utilizando el primer nombre del usuario (o la primera parte de su correo electrónico si el nombre está vacío), sufijado por un timestamp/hash aleatorio: `Tienda-${cleanName}-${timestamp}` (ej. `Tienda-Juan-5431`).
  3. Se incluyó una consulta previa para descartar colisiones de nombres.
  4. Se añadió un control de excepciones de base de datos específico (`code === '23505'`) para interceptar duplicados de tienda de forma silenciosa, y se reemplazó la alerta emergente de error de SQL con un mensaje de alerta UI amigable: `"La tienda ya existe. Elija otro nombre."`.

### Corrección 2: Recreación del RPC de Invitación (Base de Datos)
* **Archivo:** [20261018000000_fix_vendor_invitations_rpc.sql](file:///c:/Projects/Collectibles2026/supabase/migrations/20261018000000_fix_vendor_invitations_rpc.sql)
* **Detalle:** Se redactó y aplicó una nueva migración SQL que reemplaza la función `accept_vendor_invitation(varchar)` corrigiendo las referencias a `user_id` por la columna de clave primaria `id`.

### Corrección 3: Corrección de Relación Relacional (Admin - Frontend)
* **Archivos:** [AdminVendors.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminVendors.tsx) y [AdminVendorKyc.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminVendorKyc.tsx)
* **Detalle:** Se reemplazó la llamada PostgREST errónea `profiles:user_id` por la sintaxis explícita correcta `profiles:profiles!vendors_id_fkey(...)`. Al usar el alias `profiles:`, se conserva la estructura de los datos intacta para que la UI los pinte de la misma forma sin realizar cambios colaterales adicionales.

---

## 3. Pruebas Realizadas

### A. Verificación de Consultas Base de Datos (Integración)
Se ejecutó un script de prueba de integración de consultas supabase para el administrador en Node.js, confirmando el estado de éxito:
1. **AdminVendors Query**: La consulta relacional mediante `profiles:profiles!vendors_id_fkey` fue resuelta con estado **200 OK** y retornó correctamente los registros de vendedores y sus perfiles de forma correcta.
2. **AdminVendorKyc Query**: La consulta KYC relacional fue resuelta con estado **200 OK** sin arrojar errores.

### B. Pruebas de Compilación y Tipado
Se corrió el compilador de TypeScript en la consola:
```bash
npx tsc --noEmit
```
El chequeo de tipos finalizó con **0 errores**, validando que todos los archivos modificados son completamente compatibles con las definiciones de tipos actuales del proyecto.

### C. Verificación de Funciones de Base de Datos
Se inspeccionó la firma y la definición de `accept_vendor_invitation` tras la actualización, constatando que el cuerpo de la función plpgsql compila y se almacena en el esquema de base de datos Postgres sin dependencias pendientes.
