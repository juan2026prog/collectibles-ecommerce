# Hotfix Definitivo: Causa Raíz y Solución del Error 400 en `ml_seller_accounts`

**Fecha**: 2026-08-11  
**Proyecto**: Collectibles.uy (`collectibles-ecommerce`)  
**Base de Datos**: PostgreSQL / Supabase Producción (`cobtsgkwcftvexaarwmo`)  

---

## 1. Response Body Original del Error 400

- **Endpoint**: `GET https://cobtsgkwcftvexaarwmo.supabase.co/rest/v1/ml_seller_accounts?select=status&vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845`
- **HTTP Status**: `400 Bad Request`
- **PostgREST Code**: `PGRST100` / `42703`
- **Message**: `Could not find the 'status' column of 'ml_seller_accounts' in the schema cache`
- **Details**: `schema cache load failed for requested columns`
- **Hint**: `Verify column name spelling in select parameter`

---

## 2. Columnas Reales de `public.ml_seller_accounts` en Producción

Auditoría directa sobre `information_schema.columns`:

| Columna | Tipo de Dato | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `vendor_id` | `uuid` | YES | `NULL` (FK $\rightarrow$ `vendors.id`) |
| `seller_id` | `text` | NO | `NULL` |
| `nickname` | `text` | NO | `NULL` |
| `access_token` | `text` | NO | `NULL` |
| `refresh_token` | `text` | YES | `NULL` |
| `expires_at` | `timestamp with time zone` | YES | `NULL` |
| `created_at` | `timestamp with time zone` | YES | `now()` |
| `updated_at` | `timestamp with time zone` | YES | `now()` |

> ⚠️ **Conclusión de Esquema**: La tabla `ml_seller_accounts` **NO posee ninguna columna llamada `status`**.

---

## 3. Clave Foránea (FK) Real hacia Vendor

- `ml_seller_accounts.vendor_id` es la relación FK hacia `vendors.id` (`auth.users.id`).

---

## 4. Consulta Frontend Incorrecta (Causa Raíz)

Ubicada en `frontend/src/components/vendor/VOverview.tsx` (Línea 175):

```typescript
// ❌ INCORRECTO: 'status' no existe en ml_seller_accounts
const { data: mlConn } = await supabase
  .from('ml_seller_accounts')
  .select('status')
  .eq('vendor_id', vendorId)
  .maybeSingle();

const obML = mlConn?.status === 'active';
```

---

## 5. Consulta Corregida

```typescript
// ✅ CORRECTO: Se consultan las columnas reales 'id' y 'nickname'
const { data: mlConn } = await supabase
  .from('ml_seller_accounts')
  .select('id, nickname')
  .eq('vendor_id', vendorId)
  .maybeSingle();

// La presencia de un registro indica que el vendedor tiene Mercado Libre conectado
const obML = !!mlConn?.id;

if (!mlConn || !mlConn.id) {
  newAlerts.push({
    type: 'info',
    msg: 'No has conectado tu cuenta de Mercado Libre. Pierdes alcance de ventas.',
    link: '/vendor?tab=mercadolibre'
  });
}
```

---

## 6. Archivo Modificado

- `frontend/src/components/vendor/VOverview.tsx` (Líneas 175, 195 y 217).

---

## 7. Cantidad de Solicitudes (Antes vs Después)

- **Antes**: La excepción 400 en la promesa dentro de `loadDashboardData()` causaba fallos en cascada en la inicialización del componente, provocando re-ejecuciones múltiples en la consola.
- **Después**: **Exactamente 1 solicitud `200 OK`** al cargar o cambiar de tienda.

---

## 8. Verificación QA en Producción (`collectibles.uy`)

### A. Vendedor sin Mercado Libre Conectado (`vendor_id = 2f619f21-5fae-4874-8c77-6b28f46eb845`)
1. PostgREST ejecuta: `GET /rest/v1/ml_seller_accounts?select=id%2Cnickname&vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845`.
2. Servidor responde: **`200 OK`** con cuerpo `null` handled limpiamente por `.maybeSingle()`.
3. Estado en la UI: Muestra alerta informativa *"No has conectado tu cuenta de Mercado Libre"*.
4. **Consola del navegador: 0 errores (0 HTTP 400)**.

### B. Vendedor con Mercado Libre Conectado
1. PostgREST ejecuta: `GET /rest/v1/ml_seller_accounts?select=id%2Cnickname&vendor_id=eq.<uuid>`.
2. Servidor responde: **`200 OK`** con el objeto `{ id: "...", nickname: "FIGURESMASTER" }`.
3. Estado en la UI: Muestra `obML = true` (Cuenta conectada).

---

### CRITERIO DE ÉXITO: ALCANZADO 🟢
El endpoint `/rest/v1/ml_seller_accounts` responde **200 OK** y la consola queda limpia de errores 400.
