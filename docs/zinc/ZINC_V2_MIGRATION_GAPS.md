# Zinc API V2 — Brechas de Migración y Acciones Pendientes

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-09-04  
**Panel Canónico de Administración:** `https://collectibles.uy/admin/internacional/zinc`  

Este documento lista exclusivamente aquellos puntos que requieren acción manual operativa externa o que presentan consideraciones técnicas pendientes.

---

## 1. Rotación del Webhook Signing Secret en Dashboard de Zinc (Acción Operativa Pendiente)

- **Diagnóstico:** Durante la inspección previa del panel de administración, se constató que una clave de webhook de pruebas quedó visible en una captura de pantalla anterior.
- **Impacto:** Aunque se trate de un entorno Sandbox, el principio de seguridad Zero-Trust exige la rotación inmediata del secreto.
- **Acción Requerida:**
  1. Ingresar al dashboard oficial de Zinc (`https://zinc.com`).
  2. Ir a Webhooks y presionar "Rotate Secret" o generar un nuevo Signing Secret.
  3. Copiar el nuevo secreto con prefijo `zn_whsec_`.
  4. En el panel de Collectibles (`https://collectibles.uy/admin/internacional/zinc` o `/admin/settings?tab=internacional`), ingresar el nuevo secreto en el campo "Webhook Signing Secret" y guardar.
- **Estado:** `BLOCKED_WAITING_SECRET_ROTATION`.

---

## 2. Consolidación de Identidad de Migración `20261217000000`

- **Diagnóstico:** El archivo local `supabase/migrations/20261217000000_zinc_2_0_settings_and_webhook.sql` tiene fecha de diciembre 2026 debido a que siguió la secuencia existente en el repositorio (donde migraciones anteriores ya utilizaban `202610...`, `202611...`, `20261216...`).
- **Estado en Base de Datos:** Las tablas `zinc_integration_settings` y `zinc_webhook_events` existen y están activas en el esquema `public`, pero la versión no fue registrada en `supabase_migrations.schema_migrations`.
- **Riesgo:** Inconsistencias potenciales con futuras migraciones que utilicen fechas de septiembre 2026.
- **Recomendación:** No modificar destructivamente la migración. Se recomienda insertar el registro de la migración en la tabla `supabase_migrations.schema_migrations` para sincronizar `supabase migration list`.

---

## 3. Activación Manual de Producción (Hard Safety Gate)

- **Diagnóstico:** El sistema cuenta con dos barreras de seguridad independientes:
  - Columna `is_enabled = false` en la tabla `zinc_integration_settings` para el registro `production`.
  - Función `assertProductionGate` en el backend que lanza una excepción determinista antes de invocar Zinc si el flag no es `true`.
- **Acción Requerida:** La activación requerirá que el administrador configure una clave `zn_live_...` válida y fondee la cuenta de Zinc antes de habilitar el switch en el panel.
- **Estado:** `PASS` (Salvaguarda activa, 0 compras reales ejecutadas).

---

## 4. Manejo de Devoluciones (Returns API)

- **Diagnóstico:** Zinc V2 provee endpoints para automatizar retornos (`POST /returns`).
- **Mapeo Actual:** La estructura de tipos (`ZincReturnRequest`, `ZincReturnResponse`) y la persistencia de webhooks (`return_id` en `zinc_webhook_events`) ya están preparadas.
- **Comportamiento en Negocio:** Las devoluciones en Collectibles se gestionan de forma manual y centralizada por el equipo de soporte. No existe necesidad de automatización de retornos en esta fase.
- **Estado:** `NOT USED` (Compatible a nivel esquema, no invocado por lógica comercial).
