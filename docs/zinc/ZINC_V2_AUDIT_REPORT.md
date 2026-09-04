# Zinc API V2 — Auditoría Integral Final y Reporte de Hardening

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-09-04  
**Branch:** `zinc-final-sandbox-certification-20260904`  
**Panel Canónico:** `https://collectibles.uy/admin/internacional/zinc`  
**OpenAPI Spec Version:** `2026-08-21` (Fuente en vivo: `https://www.zinc.com/docs/versions/latest.json`)  
**Changelog Oficial Verificado:** Actualizado al `2026-08-29`  
**Estado:** FINAL HARDENING COMPLETE — WAITING ONE MANUAL ACTION FOR LIVE WEBHOOKS  

---

## 1. Inventario Real de Edge Functions y Seguridad JWT

| Función | Local Existe | Desplegada | Versión | verify_jwt | Autenticación Interna | Propósito | Seguridad Esperada |
|---|---|---|---|---|---|---|---|
| `zinc-webhook` | SÍ | SÍ | 3 | **false** | HMAC-SHA256 (`X-Webhook-Signature`) | Receptor público de eventos Zinc | **false** (Obligatorio para Zinc) |
| `zinc-config` | SÍ | SÍ | 2 | **true** | JWT Supabase + Role Admin | Configuración de credenciales y Vault | **true** |
| `zinc-search-products` | SÍ | SÍ | 13 | **true** | JWT Supabase + Role Admin | Búsqueda de productos en catálogo | **true** |
| `zinc-enrich-candidate` | SÍ | SÍ | 6 | **true** | JWT Supabase + Role Admin | Enriquecimiento de candidatos | **true** |
| `zinc-import-candidates` | SÍ | SÍ | 7 | **true** | JWT Supabase + Role Admin | Importación de candidatos | **true** |
| `zinc-create-category` | SÍ | SÍ | 4 | **true** | JWT Supabase + Role Admin | Creación de categorías | **true** |
| `zinc-live-check` | SÍ | SÍ | 6 | **true** | JWT Supabase (Admin/Vendor) | Verificación de stock/precio en vivo | **true** |
| `zinc-live-check-before-payment` | SÍ | SÍ | 10 | **true** | JWT Supabase (Authenticated) | Verificación de carrito antes de pago | **true** |
| `zinc-verify-after-payment` | SÍ | SÍ | 8 | **true** | Service Role / Admin / Owner | Ejecución de órdenes Zinc | **true** |
| `zinc-sync-published-products` | SÍ | SÍ | 8 | **true** | Service Role / Admin JWT | Sincronización periódica de productos | **true** |
| `zinc-sync-international-products`| SÍ | SÍ | 7 | **true** | JWT Supabase + Role Admin | Sincronización manual de catálogo | **true** |
| `zinc-sync-order-tracking` | SÍ | SÍ | 1 | **true** | Service Role / Admin JWT | Sincronización de tracking de órdenes | **true** |

---

## 2. Hardening de Seguridad Implementado

1. **Eliminación de Fallbacks Genéricos:**
   - La función `resolveActiveZincApiKey` fue eliminada.
   - Reemplazada por `resolveZincApiKey(client, "sandbox")` y `resolveZincApiKey(client, "production")`.
   - Se prohíbe el uso de la variable genérica `ZINC_API_KEY`. Cada llamada declara su entorno explícito.
   - Aislamiento estricto: Una clave `zn_live_` jamás es retornada en sandbox; una clave `zn_test_` jamás es retornada en producción.

2. **Validación Estricta de Direcciones (`buildZincAddress`):**
   - Eliminados todos los placeholders ficticios ("Cliente", ".", "206-555-0100").
   - Requiere obligatoriamente: `first_name`, `last_name`, `address_line1`, `city`, `postal_code`, `phone_number`, y para envíos a USA `state`.
   - Si falta cualquier campo, arroja un error descriptivo e impide la creación de la orden.

3. **Protección de Idempotencia y `already_exists`:**
   - La clave de idempotencia se persiste en `international_order_items.idempotency_key` ANTES de enviar la solicitud HTTP a Zinc.
   - Si la actualización en base de datos falla, la llamada a Zinc se aborta inmediatamente.
   - En caso de respuesta `already_exists` (HTTP 409): se extrae el identificador real de `details.identifier`. **Bajo ninguna circunstancia se almacena el PO number dentro de `zinc_order_id`**.

4. **Receptor Webhook Durable y Monotónico (`zinc-webhook`):**
   - Encabezado oficial: `X-Webhook-Signature` verificado mediante HMAC-SHA256 timing-safe sobre el raw body.
   - Doble secreto: Verifica contra el secreto de Sandbox y de Producción en Vault. Si coincide exactamente uno, se asigna el entorno; si coinciden ambos o ninguno, se rechaza la petición.
   - Nueva migración `20261230000000_zinc_webhook_events_hardening.sql`: agrega `processing_status`, `processing_attempts`, `processing_error`, `last_processing_at`, y `processed_at` inicia en `NULL`.
   - Eventos desconocidos y eventos de devolución (`return.*`): se persisten durablemente sin mutar el estado de compra de la orden.
   - Progresión monotónica: `delivered_to_courier` nunca degrada a `shipped`, `purchased` o `processing`.
   - Soporte multi-tracking: se conserva la lista completa de números de seguimiento de la orden.

5. **Hard Safety Gate de Producción:**
   - `is_enabled = false` en `public.zinc_integration_settings`.
   - Ninguna orden real puede ser ejecutada sin habilitación explícita server-side. Total de órdenes de producción ejecutadas: 0.
