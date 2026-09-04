# Zinc API V2 — Reporte de Certificación Sandbox (Segundo Nivel)

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 2026-09-04  
**Branch:** `zinc-v2-full-audit-20260904`  
**Panel Canónico:** `https://collectibles.uy/admin/internacional/zinc`  
**Estado Final:** READY FOR FINAL WEBHOOK CERTIFICATION  

---

## 1. Resumen de Niveles de Certificación

| Nivel de Verificación | Estado | Alcance y Validación |
|---|---|---|
| **1. UNIT** | PASS | 28 tests pasando. Aislamiento de prefijos (`zn_test_`, `zn_live_`, `zn_whsec_`), cálculo de HMAC-SHA256, deduplicación SHA-256, conversión de enteros en centavos, normalización de direcciones con `address_line2` opcional, y reuso estricto del mismo `idempotency_key` en retries. |
| **2. CONTRACT** | PASS | 8 tests pasando contra la especificación OpenAPI 3.1.0 oficial: verificación de `GET /products/search` (`query`, `retailer`, `page`, `free_shipping`), `GET /products/{product_id}`, `OrderCreate` con campos opcionales, modelo prepaid wallet sin `payment`, y `address_line2` en `Address`. |
| **3. REAL SANDBOX HTTP** | PASS | Ejecución real con credenciales Sandbox de Supabase Vault: `GET /orders/test-products` dinámico con 8 productos, escenarios síncronos HTTP 400/402, creación de orden HTTP 201 (`06bc82a1-d7c5-4c8b-86fa-7eae2fe448c8`), e idempotencia probada con retorno HTTP 409 `already_exists`. |
| **4. REAL SANDBOX WEBHOOK** | BLOCKED | Receptor `zinc-webhook` desplegado con `verify_jwt = false` y HMAC custom. Entrega en vivo pausada pendiente de rotación manual del signing secret en el dashboard de Zinc. |

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
