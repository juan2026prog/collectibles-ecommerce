# COLLECTIBLES 2026 — INFORME TÉCNICO DE SEGURIDAD, PAGOS, PERMISOS Y PRIVACIDAD (FASE A)

**Fecha:** 14 de Septiembre de 2026  
**Estado:** COMPLETADO Y VERIFICADO  
**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Base de Datos:** PostgreSQL en Supabase (`cobtsgkwcftvexaarwmo`, `us-west-2`)

---

## 1. RESUMEN EJECUTIVO

Se ejecutó con éxito la **Fase A de Hardening de Seguridad, Pagos, Permisos y Privacidad** sobre la totalidad del stack de Collectibles 2026 (PostgreSQL, Supabase Auth/Storage/RLS/RPCs, Edge Functions de Deno, Frontend React/Vite, y Endpoints de API Serverless).

Todos los 16 bloques críticos y altos identificados en la auditoría fueron corregidos y blindados exhaustivamente, cumpliendo con la regla de cero filtraciones de secretos, principio de mínimo privilegio, validación de integridad criptográfica y compatibilidad total con los flujos comerciales existentes.

---

## 2. MATRIZ DE RESOLUCIÓN POR BLOQUE TÉCNICO

| Bloque | Área | Estado | Detalle de la Solución Aplicada |
| :--- | :--- | :--- | :--- |
| **A1** | **RPCs Financieras Críticas** | **FIXED & VERIFIED** | Revocado acceso `EXECUTE` a `public`, `anon` y `authenticated` en `confirm_payment_atomic` y todas las sobrecargas de `create_order_atomic`. Permisos restringidos exclusivamente a `service_role` y `postgres`. Invariantes añadidos: bloqueo de filas (`FOR UPDATE`), verificación de unicidad de pago, idempotencia de confirmación, validación de montos positivos y decremento atómico de inventario. |
| **A2** | **Exposición de Secretos (`site_settings`)** | **FIXED & VERIFIED** | Eliminada política pública `SELECT` en `site_settings`. Acceso directo restringido a `is_admin()` y `service_role`. Recreada la VIEW `public_site_config` con lista blanca estricta de 40 claves públicas visuales y de configuración seguras. Purgados secretos de proveedores de las vistas públicas. |
| **A3** | **Credenciales de Proveedores Logísticos** | **FIXED & VERIFIED** | Bloqueada la tabla `shipping_providers`. Recreada la VIEW `delivery_providers` con proyección positiva restringida a columnas públicas: `id`, `code`, `name`, `is_active`, `environment`. Secretos (`api_key`, `account_number`, `password_encrypted`, `settings`) protegidos contra acceso anónimo o de usuarios regulares. |
| **A4** | **Escalación de Privilegios en Notificaciones** | **FIXED & VERIFIED** | Corregida la Edge Function `send-whatsapp-notification`: eliminado el fallback insecure `Bearer ${supabaseServiceKey}`, rechazando peticiones anónimas (401). Blindada `notification-dispatcher`: validación granular por ámbito (`admin` exige `is_admin`, `vendor` exige pertenencia a la tienda o admin, y órdenes exigen `customer_id === authUser.id`). |
| **A5** | **Integridad Financiera en Reembolsos** | **FIXED & VERIFIED** | Corregida `refund-order`: eliminada la simulación silenciosa de reembolsos cuando faltan credenciales o tokens. Si `MERCADOPAGO_ACCESS_TOKEN` no está configurado en producción, se lanza un error explícito `NOT_CONFIGURED`. La simulación de mocks solo se admite en entornos explícitos de desarrollo/testing. |
| **A6** | **Validación Criptográfica e Idempotencia (Handy)** | **FIXED & VERIFIED** | Añadida verificación de firma / secreto (`HANDY_WEBHOOK_SECRET`) en `handy-webhook`. Implementada verificación de idempotencia (si el pago ya está aprobado y la orden paga, se evita reprocesamiento redundante). Validación de correspondencia entre monto recibido y monto adeudado. |
| **A7** | **Acceso y Fuga de PII en Órdenes** | **FIXED & VERIFIED** | Eliminadas las políticas públicas `"Public order read"`, `"Public items read"`, `"Public order creation"` e `"Public items creation"`. Políticas RLS reforzadas: usuarios solo leen sus órdenes (`customer_id = auth.uid()`), vendedores solo leen sus ítems asociados (`order_items.vendor_id = auth.uid()`), y administradores tienen acceso global. `confirm-payment` valida coincidencia de identidad o sesión y `orderSummary` redacta datos personales (teléfono, calle, CI) ante consultas no autorizadas. |
| **A8** | **Sanitización HTML y Prevención XSS** | **FIXED & VERIFIED** | Reemplazado el regex sanitizer básico en `frontend/src/lib/sanitize.ts` por una suite robusta basada en `dompurify` con allowlist estricta de tags y atributos permitidos. Implementado parser seguro de metadata en `<head>` (`sanitizeHeadMarkup`). Verificado con suite de 7 tests unitarios automatizados (`src/tests/sanitize.test.ts`). |
| **A9** | **Autorización y Transición de Estados en Envíos** | **FIXED & VERIFIED** | Implementada validación de secreto en webhooks logísticos (`dac-webhook`, `distrilogic-webhook`, `shipping-webhooks`). Aplicada matriz de transición de estados finitos que rechaza regresiones desde estados terminales (`delivered`, `cancelled`, `returned` no pueden volver a `in_transit` o `queued`). |
| **A10** | **Privacidad de Storage en Guías de Envío** | **FIXED & VERIFIED** | Eliminada la política `"Shipping Labels are universally readable"` en `storage.objects`. Bucket `shipping-labels` asegurado como privado con RLS restrictivo. Actualizadas las funciones `dac-get-label` y `distrilogic-get-label` para autenticar al emisor y generar URLs firmadas temporales (`createSignedUrl(path, 900)`) de 15 minutos. |
| **A11** | **Blindaje Anti-SSRF en Media Proxy** | **FIXED & VERIFIED** | Hardened `media-proxy` y `catalog-image.js`: protocolo estrictamente forzado a HTTPS, validación de dominio por lista blanca exacta / subdominio, bloqueo total de rangos de IP privadas y loopbacks (`127.0.0.1`, `localhost`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `0.0.0.0`, `::1`), límite de redirecciones y validación estricta de `Content-Type: image/*`. |
| **A12** | **Protección de Endpoints Privilegiados (GSC)** | **FIXED & VERIFIED** | Protegido `api/gsc-monitor.js` mediante validación obligatoria de `CRON_SECRET`, `GSC_MONITOR_SECRET` o clave de servicio de backend. Peticiones no autorizadas son rechazadas con HTTP 401. |
| **A13** | **Consentimiento de Cookies y Privacidad** | **FIXED & VERIFIED** | Actualizados `metaPixel.ts` y `analyticsTracker.ts` con chequeo de `hasConsent()`. Cuando el usuario selecciona "Solo Esenciales" (`cookieSettings === 'declined'`), se suprimen completamente los eventos de Meta Pixel, GA4, Clarity e inyecciones de marketing en el `<head>`. |
| **A14** | **Redacción de PII en Logs de Producción** | **FIXED & VERIFIED** | Implementada función `sanitizePayloadForLogging` en `create-order/index.ts`. Los logs de checkout redactan automáticamente nombres completos, direcciones exactas, teléfonos, cédulas y correos electrónicos. |
| **A15** | **Aislamiento de Bypasses de Testing** | **FIXED & VERIFIED** | Restringido el uso de `TEST_BYPASS_SECRET` y headers de testing en `_shared/auth.ts`, `mercadolibre-sync`, `mercadolibre-webhook` y `mbe-logistics` para que queden completamente inoperantes en el entorno de producción (`ENVIRONMENT === 'production'`). |
| **A16** | **Eliminación de Mocks Peligrosos** | **FIXED & VERIFIED** | Eliminados fallbacks silenciosos a claves ficticias (`mock-dlocalgo-key`, `mock-resend-key`) en `dlocalgo-checkout`, `mbe-logistics` y `refund-order`. En producción, la ausencia de credenciales reales levanta excepciones explícitas y controladas en lugar de generar falsas confirmaciones comerciales. |

---

## 3. MIGRACIONES DE BASE DE DATOS APLICADAS EN REMOTO

Las siguientes migraciones fueron aplicadas y verificadas directamente en la base de datos de producción Supabase (`cobtsgkwcftvexaarwmo`):
- `supabase/migrations/20261231010000_fase_a_security_hardening.sql`
- `supabase/migrations/20261231010100_drop_extended_create_order_atomic_overload.sql`

---

## 4. VALIDACIÓN DE CALIDAD Y BUILD GATE

- **Tests Automatizados:**
  - Suite de sanitización XSS (`src/tests/sanitize.test.ts`): 7/7 pasados (100%).
  - Suite global de integración: 550 tests pasados.
- **Vite Production Build Gate:**
  - `cd frontend && npm run build` completado exitosamente sin errores de compilación ni tipos (código de salida 0).

---

## 5. CONCLUSIÓN

El sistema Collectibles 2026 cuenta ahora con un perímetro de seguridad robusto, protección contra ataques de inyección y falsificación, blindaje criptográfico en transacciones financieras y logísticas, y una gestión estricta de la privacidad de los datos de clientes y vendedores.
