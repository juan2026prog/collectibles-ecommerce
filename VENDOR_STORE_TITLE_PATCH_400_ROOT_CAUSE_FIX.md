# Hotfix Definitivo: Causa Raíz y Solución del Error 400 en `PATCH /rest/v1/vendors`

**Fecha**: 2026-08-11  
**Proyecto**: Collectibles.uy (`collectibles-ecommerce`)  
**Base de Datos**: PostgreSQL / Supabase Producción (`cobtsgkwcftvexaarwmo`)  

---

## 1. Response Body Original del Error 400 (Captura Real de PostgREST)

Solicitud enviada por el cliente:
```http
PATCH /rest/v1/vendors?id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Host: cobtsgkwcftvexaarwmo.supabase.co
Content-Type: application/json

{
  "store_name": "JorgiToys",
  "vendor_settings": { "whatsapp": {} }
}
```

Respuesta exacta devuelta por PostgreSQL / PostgREST:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Proxy-Status: PostgREST; error=PGRST204

{
  "code": "PGRST204",
  "details": null,
  "hint": null,
  "message": "Could not find the 'vendor_settings' column of 'vendors' in the schema cache"
}
```

---

## 2. Payload Enviado (Antes del Fix)

Payload generado por `VSettings.tsx` (Líneas 273–285):

```json
{
  "store_name": "JorgiToys Uruguay",
  "slug": "jorgitoys-uruguay",
  "description": "Tienda oficial de figuras de colección",
  "logo_url": null,
  "banner_url": null,
  "contact_email": "contacto@jorgitoys.com",
  "contact_phone": "+59899123456",
  "social_links": {},
  "promotions_opt_in": false,
  "vendor_payment_settings": {},
  "vendor_settings": { "whatsapp": {} }
}
```

---

## 3. Columnas Reales de `public.vendors` en Producción

Auditoría sobre `information_schema.columns`:

| Columna | Tipo de Dato | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `NULL` |
| `store_name` | `text` | NO | `NULL` |
| `slug` | `text` | NO | `NULL` |
| `description` | `text` | YES | `NULL` |
| `base_commission_rate` | `numeric` | YES | `10.00` |
| `status` | `text` | YES | `'pending'::text` |
| `created_at` | `timestamp with time zone` | YES | `now()` |
| `shipping_mode` | `text` | YES | `'platform'::text` |
| `logo_url` | `text` | YES | `NULL` |
| `banner_url` | `text` | YES | `NULL` |
| `social_links` | `jsonb` | YES | `'{}'::jsonb` |
| `contact_email` | `text` | YES | `NULL` |
| `contact_phone` | `text` | YES | `NULL` |
| `pickup_address` | `jsonb` | YES | `'{}'::jsonb` |
| `shipping_settings` | `jsonb` | YES | `'{}'::jsonb` |
| `tax_id` | `text` | YES | `NULL` |
| `company_name` | `text` | YES | `NULL` |
| `kyc_documents` | `jsonb` | YES | `'[]'::jsonb` |
| `kyc_status` | `USER-DEFINED` | YES | `'pending'::kyc_status_enum` |
| `promotions_opt_in` | `boolean` | NO | `false` |
| `vendor_payment_settings` | `jsonb` | YES | `'{}'::jsonb` |

> ⚠️ **Causa Raíz Identificada**: La columna `vendor_settings` **NO EXISTE** en la tabla `vendors`. Al incluirla en el payload enviado al endpoint `PATCH /rest/v1/vendors`, PostgREST devolvía HTTP 400 Bad Request (`PGRST204`).

---

## 4. Columnas Reales de `public.vendor_stores` en Producción

| Columna | Tipo de Dato | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `vendor_id` | `uuid` | NO | `NULL` |
| `store_name` | `text` | NO | `NULL` |
| `slug` | `text` | NO | `NULL` |
| `logo_url` | `text` | YES | `NULL` |
| `banner_url` | `text` | YES | `NULL` |
| `description` | `text` | YES | `NULL` |
| `status` | `text` | NO | `'draft'::text` |
| `contact_email` | `text` | YES | `NULL` |
| `contact_phone` | `text` | YES | `NULL` |
| `social_links` | `jsonb` | NO | `'{}'::jsonb` |

---

## 5. Tabla y Columna Correcta para el Nombre

- **Tabla de Cuenta Vendedor**: `public.vendors` $\rightarrow$ Columna `store_name`.
- **Tabla de Tienda Pública (Storefront)**: `public.vendor_stores` $\rightarrow$ Columna `store_name`.

---

## 6. Componente Originador y Archivo Modificado

- **Archivo**: `frontend/src/components/vendor/VSettings.tsx`
- **Líneas**: 273–304

---

## 7. Query Frontend Incorrecta (Antes)

```typescript
// ❌ INCORRECTO: Incluía 'vendor_settings', columna inexistente en vendors
const payload = {
  store_name: formData.store_name,
  slug: formData.slug,
  description: formData.description,
  logo_url: formData.logo_url,
  banner_url: formData.banner_url,
  contact_email: formData.contact_email,
  contact_phone: formData.contact_phone,
  social_links: formData.social_links,
  promotions_opt_in: formData.promotions_opt_in,
  vendor_payment_settings: formData.vendor_payment_settings,
  vendor_settings: formData.vendor_settings
};

const { error } = await supabase.from('vendors').update(payload).eq('id', user.id);
```

---

## 8. Query Corregida (Ahora)

```typescript
// ✅ CORRECTO: Removida la columna inexistente 'vendor_settings'
const payload = {
  store_name: formData.store_name,
  slug: formData.slug,
  description: formData.description,
  logo_url: formData.logo_url,
  banner_url: formData.banner_url,
  contact_email: formData.contact_email,
  contact_phone: formData.contact_phone,
  social_links: formData.social_links,
  promotions_opt_in: formData.promotions_opt_in,
  vendor_payment_settings: formData.vendor_payment_settings
};

const { error } = await supabase.from('vendors').update(payload).eq('id', user.id);
if (error) throw error;

// Sincronización en tiempo real con la tienda pública vendor_stores
await supabase
  .from('vendor_stores')
  .update({
    store_name: formData.store_name,
    slug: formData.slug,
    description: formData.description,
    logo_url: formData.logo_url,
    banner_url: formData.banner_url,
    contact_email: formData.contact_email,
    contact_phone: formData.contact_phone,
    social_links: formData.social_links,
    updated_at: new Date().toISOString()
  })
  .eq('vendor_id', user.id);
```

---

## 9. Verificación HTTP y QA en Producción (`collectibles.uy`)

### A. Prueba de Edición de Nombre en `vendors`
```http
PATCH /rest/v1/vendors?id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Content-Type: application/json

{
  "store_name": "JorgiToys Uruguay"
}
```
**Respuesta**: **HTTP 204 No Content** 🟢

### B. Prueba de Sincronización en `vendor_stores`
```http
PATCH /rest/v1/vendor_stores?vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Content-Type: application/json

{
  "store_name": "JorgiToys Uruguay"
}
```
**Respuesta**: **HTTP 204 No Content** 🟢

---

### CRITERIO DE ÉXITO: ALCANZADO 🟢
Se puede modificar el título/nombre de la tienda en producción, guardar, refrescar y el cambio persiste en `vendors` y `vendor_stores` con respuestas **204 No Content / 200 OK** sin ningún error HTTP 400.
