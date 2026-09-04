# Zinc API V2 — Reporte de Certificación Final (Hardening & Sandbox)

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-09-04  
**Branch:** `zinc-final-sandbox-certification-20260904`  
**Panel Canónico:** `https://collectibles.uy/admin/internacional/zinc`  
**OpenAPI Spec Version:** `2026-08-21` (Checked live via `/docs/versions/latest.json`)  
**Changelog Checked Through:** `2026-08-29`  
**Estado Final:** WAITING ONE MANUAL ACTION: ROTATE TEST MODE WEBHOOK SECRET  

---

## 1. Niveles de Certificación

| Nivel de Verificación | Estado | Alcance y Validación |
|---|---|---|
| **1. UNIT** | PASS | 32 tests específicos pasando. Aislamiento de prefijos (`zn_test_`, `zn_live_`, `zn_whsec_`), eliminación de fallbacks genéricos (`ZINC_API_KEY`), validación estricta de direcciones (sin "Cliente", sin ".", sin teléfonos falsos), persistencia previa de idempotencia, protección contra uso de PO number como order ID, hard gate de producción, timing-safe HMAC-SHA256, deduplicación durable, semántica de `processed_at`, monotonicidad de estados (delivered no degrada a shipped/purchased/processing), y parser multi-tracking. |
| **2. CONTRACT** | PASS | 8 tests pasando contra OpenAPI 3.1.0 (2026-08-21): verificación de `GET /products/search`, `OrderCreate` con campos exactos, modelo prepaid wallet (omisión de payment), y esquema `Address`. |
| **3. REAL SANDBOX HTTP** | PASS | Ejecución real con credenciales Sandbox de Supabase Vault: `GET /orders/test-products` dinámico con 8 productos, escenarios síncronos HTTP 400/402, creación de orden HTTP 201 (`164d3211-3904-4cf2-bc4b-766782a5be53`), e idempotencia probada con retorno HTTP 409 `already_exists`. |
| **4. REAL SANDBOX WEBHOOK** | BLOCKED (WAITING SECRET ROTATION) | Receptor `zinc-webhook` desplegado con `verify_jwt = false` y HMAC-SHA256 custom. Entrega real en vivo pausada pendiente de la rotación manual del signing secret comprometido en Zinc Dashboard. |
| **5. PRODUCTION SAFETY** | PASS | `is_enabled = false` en `public.zinc_integration_settings`. `assertProductionGate` activo en servidor. Total de órdenes reales de producción ejecutadas: 0. Pricing Engine y Profit Protection intactos. |

---

## 2. Resultados de Pruebas Reales en Vivo en Zinc Sandbox

- **Clave Sandbox Utilizada:** `zn_test_••••••••4kd8` (extraída de Supabase Vault).
- **Consulta Dinámica de Productos de Prueba:** `GET /orders/test-products` retornó 8 productos dinámicos:
  1. `success` (Sync: false) -> `https://zinc.com/shop/products/test-success`
  2. `price_exceeded` (Sync: false) -> `https://zinc.com/shop/products/test-price-exceeded`
  3. `out_of_stock` (Sync: false) -> `https://zinc.com/shop/products/test-out-of-stock`
  4. `invalid_address` (Sync: true) -> `https://zinc.com/shop/products/test-invalid-address`
  5. `url_unreachable` (Sync: true) -> `https://zinc.com/shop/products/test-url-unreachable`
  6. `invalid_variant` (Sync: false) -> `https://zinc.com/shop/products/test-invalid-variant`
  7. `shipping_unavailable` (Sync: false) -> `https://zinc.com/shop/products/test-shipping-unavailable`
  8. `insufficient_funds` (Sync: true) -> `https://zinc.com/shop/products/test-insufficient-funds`

### Escenarios Síncronos Validados (zn_test_):
1. `invalid_address`: HTTP 400 (632ms) — Rechazo síncrono inmediato por dirección inválida.
2. `url_unreachable`: HTTP 400 (194ms) — Rechazo síncrono inmediato por URL inalcanzable.
3. `insufficient_funds`: HTTP 402 (201ms) — Rechazo síncrono inmediato por fondos insuficientes.

### Escenario de Éxito e Idempotencia Real (zn_test_):
1. `test-success`: HTTP 201 (340ms) — Orden creada en Sandbox:
   - **Order ID:** `164d3211-3904-4cf2-bc4b-766782a5be53`
   - **Status:** `pending`
2. **Reintento Idempotente:** HTTP 409 con código `already_exists` ante el mismo `idempotency_key`.

### Escenarios Asíncronos Validados (zn_test_):
1. `price_exceeded`: HTTP 201 (Order ID: `f62ffe5a-0df5-46a8-a432-a803b1cdb695`) — Aceptada para procesamiento asíncrono.
2. `out_of_stock`: HTTP 201 (Order ID: `b932e241-3beb-418c-87ad-28e29041025c`) — Aceptada para procesamiento asíncrono.
3. `invalid_variant`: HTTP 201 (Order ID: `b7daf8fe-911b-42a2-9ee6-53f314258f8a`) — Aceptada para procesamiento asíncrono.
4. `shipping_unavailable`: HTTP 201 (Order ID: `e3a9476c-adaf-453a-a3cc-6fcaa7d8c33a`) — Aceptada para procesamiento asíncrono.

---

## 3. Estado de Webhook y Base de Datos

- **Endpoint:** `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook`
- **Configuración Supabase:** `verify_jwt = false` (exclusivo para webhook externo con HMAC).
- **Todas las demás funciones Zinc (11):** `verify_jwt = true`.
- **Nueva Migración Aplicada:** `20261230000000_zinc_webhook_events_hardening.sql` (agregados `processing_status`, `processing_attempts`, `processing_error`, `last_processing_at`, y `processed_at` con default NULL).
- **Historial de Migraciones:** Local y Remote sincronizados en `20261230000000`.

---

## 4. Acción Manual Pendiente

```
MANUAL ACTION REQUIRED:
Rotate Test Mode Signing Secret in Zinc and paste the new zn_whsec_...
into Admin → Internacional → Zinc API 2.0 → Sandbox Webhook.
```
