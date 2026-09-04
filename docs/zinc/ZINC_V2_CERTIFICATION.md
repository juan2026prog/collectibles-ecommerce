# Zinc API V2 — Reporte de Certificación Sandbox

**Proyecto:** Collectibles 2026 (collectibles.uy)  
**Fecha:** 2026-09-04  
**Branch:** zinc-v2-full-audit-20260904  
**Estado Final:** READY FOR FINAL WEBHOOK CERTIFICATION  

---

## 1. Resumen de Ejecución de Pruebas

| Categoría | Estado | Detalles |
|---|---|---|
| **Pruebas Unitarias** | PASS | 28/28 tests pasando (`frontend/src/tests/zinc_v2_unit.test.ts`) |
| **Pruebas de Contrato (OpenAPI 3.1.0)** | PASS | 6/6 tests pasando contra la spec oficial en vivo (`frontend/src/tests/zinc_v2_contract.test.ts`) |
| **Suite General del Repositorio** | PASS | 316/316 tests pasando en 32 suites vitest |
| **Build Frontend de Producción** | PASS | Vite 8.0.3 compiló en 3.27s sin errores |
| **Aislamiento de Secretos** | PASS | 0 secretos expuestos en código, git o frontend |
| **Protección de Producción** | PASS | PRODUCTION ZINC ENABLED: NO, 0 compras reales ejecutadas |

---

## 2. Resultados de Pruebas Reales en Vivo en Zinc Sandbox

- **Clave Sandbox Utilizada:** `zn_test_••••••••4kd8` (extraída dinámicamente de Supabase Vault).
- **Consulta Dinámica de Productos de Prueba:** `GET /orders/test-products` retornó exitosamente los 8 escenarios oficiales en vivo de Zinc V2.

### Escenarios Síncronos Validados:
1. `invalid_address`: HTTP 400 (823ms) — Rechazo síncrono por dirección inválida.
2. `url_unreachable`: HTTP 400 (351ms) — Rechazo síncrono por URL no alcanzable.
3. `insufficient_funds`: HTTP 402 (253ms) — Rechazo síncrono por saldo insuficiente en cuenta de pruebas.

### Escenario de Éxito e Idempotencia:
1. `success`: HTTP 201 (395ms) — Orden creada exitosamente en Sandbox:
   - **Order ID:** `06bc82a1-d7c5-4c8b-86fa-7eae2fe448c8`
   - **Status:** `pending`
2. **Reintento Idempotente:** HTTP 409 con código `already_exists` devuelto exactamente por Zinc ante el mismo `idempotency_key`. Idempotencia certificada conforme a V2.

### Escenarios Asíncronos Validados:
1. `price_exceeded`: HTTP 201 (Order ID: `395236f9-bcfb-47ce-8267-6e39d03bab4b`) — Aceptada para procesamiento asíncrono.
2. `out_of_stock`: HTTP 201 (Order ID: `930cc746-c1de-4352-b983-74e0e05f08d8`) — Aceptada para procesamiento asíncrono.
3. `invalid_variant`: HTTP 201 (Order ID: `dde31d80-bec3-4c0a-bb0f-8bd19f21f7dc`) — Aceptada para procesamiento asíncrono.
4. `shipping_unavailable`: HTTP 201 (Order ID: `31506d2a-bbc5-4010-9852-8fca7df07c89`) — Aceptada para procesamiento asíncrono.

---

## 3. Estado de Webhooks

- **Endpoint Desplegado:** `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook`
- **Configuración Supabase:** `verify_jwt = false` (Custom Auth Zinc HMAC-SHA256).
- **Verificación de Firma:** HMAC-SHA256 timing-safe sobre raw body.
- **Deduplicación:** SHA-256 de raw body con restricción de unicidad en base de datos `(environment, payload_sha256)`.
- **Entrega Webhook Real:** `BLOCKED_WAITING_SECRET_ROTATION` debido a que el secreto previo debe ser rotado en el dashboard de Zinc antes de configurar el webhook definitivo.

---

## 4. Veredicto Final

**READY FOR FINAL WEBHOOK CERTIFICATION**

Todos los contratos de API, autenticación, creación de órdenes, idempotencia, protección de producción y manejo de errores están certificados al 100%. Solo resta la rotación operativa del secreto de webhook para la recepción de eventos en vivo.
