# Zinc API V2 — Brechas de Migración y Acciones Pendientes

**Proyecto:** Collectibles 2026 (collectibles.uy)  
**Fecha:** 2026-09-04  

Este documento lista exclusivamente aquellos puntos que requieren acción manual operativa externa o que no cuentan con un mapeo 1:1 automático.

---

## 1. Rotación del Webhook Signing Secret en Dashboard de Zinc

- **Diagnóstico:** Durante la inspección previa del panel de administración, se constató que una clave de webhook de pruebas quedó visible en una captura de pantalla anterior.
- **Impacto:** Aunque se trate de un entorno Sandbox, el principio de seguridad Zero-Trust exige la rotación inmediata del secreto.
- **Acción Requerida:**
  1. Ingresar al dashboard oficial de Zinc (https://zinc.com).
  2. Ir a Webhooks y presionar "Rotate Secret" o generar un nuevo Signing Secret.
  3. Copiar el nuevo secreto con prefijo `zn_whsec_`.
  4. En el panel de Collectibles (https://collectibles.uy/admin/settings?tab=internacional o sección Zinc), ingresar el nuevo secreto en el campo "Webhook Signing Secret" y guardar.
- **Estado:** BLOCKED_WAITING_SECRET_ROTATION.

---

## 2. Activación Manual de Producción (Hard Safety Gate)

- **Diagnóstico:** El sistema cuenta con dos barreras de seguridad independientes:
  - Columna `is_enabled = false` en la tabla `zinc_integration_settings` para el registro `production`.
  - Función `assertProductionGate` en el backend que lanza una excepción determinista antes de invocar Zinc si el flag no es `true`.
- **Acción Requerida:** La activación requerirá que el administrador configure una clave `zn_live_...` válida y fondee la cuenta de Zinc antes de habilitar el switch en el panel.
- **Estado:** PASS (Salvaguarda activa, 0 compras reales ejecutadas).

---

## 3. Manejo de Devoluciones (Returns API)

- **Diagnóstico:** Zinc V2 provee endpoints para automatizar retornos (`POST /returns`).
- **Mapeo Actual:** La estructura de tipos (`ZincReturnRequest`, `ZincReturnResponse`) y la persistencia de webhooks (`return_id` en `zinc_webhook_events`) ya están preparadas.
- **Comportamiento en Negocio:** Las devoluciones en Collectibles se gestionan de forma manual y centralizada por el equipo de soporte. No existe necesidad de automatización de retornos en esta fase.
- **Estado:** NOT USED (Compatible a nivel esquema, no invocado por lógica comercial).
