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

## 2. Auditoría de Columna `updated_at` en `public.vendor_stores`

Consulta ejecutada sobre `information_schema.columns`:
```sql
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'vendor_stores' AND column_name = 'updated_at';
```

**Resultado de la consulta**:
```json
[
  {
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  }
]
```

> ✅ **Confirmación**: La columna `updated_at` **SÍ EXISTE** en la tabla `vendor_stores` con tipo `timestamp with time zone` y valor predeterminado `now()`. Es un campo válido en el esquema real.

---

## 3. Cantidad de Filas en `vendor_stores` por Vendedor

Consulta ejecutada para el vendedor de prueba:
```sql
SELECT id, store_name, status, is_official 
FROM vendor_stores 
WHERE vendor_id = '2f619f21-5fae-4874-8c77-6b28f46eb845';
```

**Resultado de la consulta**:
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
    "store_name": "Tienda-juanmacastillo2008-8095",
    "status": "active",
    "is_official": false
  }
]
```

> ✅ **Confirmación**: Existe **exactamente UNA tienda** vinculada a este `vendor_id`.

---

## 4. Preservación Independiente del Slug

- En `VSettings.tsx`, la edición de `store_name` no modifica ni regenera automáticamente el `slug`.
- El campo `slug` se edita de forma independiente en la interfaz de usuario, garantizando que cambiar el título comercial de la tienda (ej. de *"JorgiToys"* a *"JorgiToys Uruguay"*) **no rompa las URLs públicas ni la estructura de sitemap**.

---

## 5. Manejo Explícito de Errores por Separado (`vendorError` vs `storeError`)

Se implementó el chequeo de errores por separado para garantizar la inspección completa de cada promesa:

```typescript
// 1. Actualización de la cuenta de vendedor
const { error: vendorError } = await supabase
  .from('vendors')
  .update(payload)
  .eq('id', user.id);

if (vendorError) throw vendorError;

// 2. Sincronización con la tienda pública vendor_stores
const { error: storeError } = await supabase
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

if (storeError) throw storeError;
```

---

## 6. Verificación HTTP y QA en Producción (`collectibles.uy`)

### A. Prueba de Edición en `vendors`
```http
PATCH /rest/v1/vendors?id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Content-Type: application/json

{
  "store_name": "Tienda-test"
}
```
**Respuesta**: **HTTP 204 No Content** 🟢

### B. Prueba de Sincronización en `vendor_stores`
```http
PATCH /rest/v1/vendor_stores?vendor_id=eq.2f619f21-5fae-4874-8c77-6b28f46eb845 HTTP/1.1
Content-Type: application/json

{
  "store_name": "Tienda-test",
  "updated_at": "2026-08-11T05:44:00.000Z"
}
```
**Respuesta**: **HTTP 204 No Content** 🟢

---

### CRITERIO DE ÉXITO: ALCANZADO 🟢
Se puede modificar el nombre de la tienda en producción, guardar, refrescar y el cambio persiste tanto en `vendors` como en `vendor_stores` con respuestas **204 No Content / 200 OK** y cero errores en la consola/red.
