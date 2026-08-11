# Hotfix Definitivo: Causa Raíz y Solución del Error 400 en `ml_seller_accounts`

**Fecha**: 2026-08-11  
**Proyecto**: Collectibles.uy (`collectibles-ecommerce`)  
**Base de Datos**: PostgreSQL / Supabase Producción (`cobtsgkwcftvexaarwmo`)  

---

## 1. Response Body Original del Error 400 (Captura Real de PostgREST)

Solicitud original enviada por el cliente:
```http
GET /rest/v1/ml_seller_accounts?select=status&vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Host: cobtsgkwcftvexaarwmo.supabase.co
```

Respuesta exacta devuelta por PostgreSQL / PostgREST:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Proxy-Status: PostgREST; error=42703

{
  "code": "42703",
  "details": null,
  "hint": null,
  "message": "column ml_seller_accounts.status does not exist"
}
```

---

## 2. Columnas Reales de `public.ml_seller_accounts` en Producción

Auditoría sobre `information_schema.columns`:

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

> ⚠️ **Conclusión**: La columna `status` **NO existe** en la tabla `ml_seller_accounts`.

---

## 3. Clave Foránea (FK) Real hacia Vendor

- `ml_seller_accounts.vendor_id` es la clave foránea real que conecta con `vendors.id` (`auth.users.id`).

---

## 4. Consulta Frontend Incorrecta (Causa Raíz)

Ubicada en `frontend/src/components/vendor/VOverview.tsx` (Línea 175):

```typescript
// ❌ INCORRECTO: 'status' no existe en la tabla ml_seller_accounts
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
// ✅ CORRECTO: Se solicitan columnas existentes ('id', 'nickname')
const { data: mlConn } = await supabase
  .from('ml_seller_accounts')
  .select('id, nickname')
  .eq('vendor_id', vendorId)
  .maybeSingle();

// La presencia de la fila determina si existe vinculación activa con Mercado Libre
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

## 6. Demostración y Prueba de Verificación HTTP

Prueba ejecutada contra la API REST de Supabase Producción:

```http
GET /rest/v1/ml_seller_accounts?select=id,nickname&vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Host: cobtsgkwcftvexaarwmo.supabase.co
```

Respuesta de la API REST:
```json
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Range: */*

[]
```

---

## 7. Archivo Modificado

- `frontend/src/components/vendor/VOverview.tsx` (Líneas 175, 195 y 217).

---

### CRITERIO DE ÉXITO: ALCANZADO 🟢
El endpoint `/rest/v1/ml_seller_accounts` responde **200 OK** y la consola queda libre de errores HTTP 400.
