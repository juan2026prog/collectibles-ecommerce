# Zinc API V2 — Auditoría Integral y Normalización

**Proyecto:** Collectibles 2026 (collectibles.uy)
**Fecha de Auditoría:** 2026-09-04
**Branch de Trabajo:** zinc-v2-full-audit-20260904
**Objetivo:** Normalización integral de la integración con Zinc API contra la documentación oficial en vivo V2 (OpenAPI 3.1.0), eliminación de código legacy V1, migración segura a Supabase Vault, y preparación para certificación Sandbox E2E.

---

## 1. Documentación Oficial y Especificación

- **Especificación OpenAPI:** OpenAPI 3.1.0 (versión oficial de Zinc V2, fechada 2026-08-21).
- **Changelog Oficial Verificado:** Actualizado hasta 2026-08-28.
- **Endpoints Oficiales de Referencia:**
  - https://www.zinc.com/docs/v2/api-reference/introduction/sandbox
  - https://www.zinc.com/docs/v2/api-reference/introduction/webhooks
  - https://www.zinc.com/docs/v2/api-reference/introduction/idempotency
  - https://www.zinc.com/docs/v2/api-reference/orders/create-order
  - https://www.zinc.com/docs/v2/api-reference/orders/get-test-products
  - https://www.zinc.com/docs/v2/api-reference/orders/get-order
  - https://www.zinc.com/docs/v2/api-reference/products/get-product
  - https://www.zinc.com/docs/v2/api-reference/products/search-products

---

## 2. Arquitectura de la Integración Zinc V2

### 2.1 Módulo Compartido Centralizado
Se creó un único módulo de verdad para todas las operaciones de Zinc en:
supabase/functions/_shared/zinc/
- **types.ts:** Tipos TypeScript alineados 100% con los esquemas de OpenAPI 3.1.0 (OrderCreateRequest, OrderResponse, Address, WebhookEvent, Product, TestProductsResponse).
- **errors.ts:** Mapeo formal de errores síncronos y asíncronos de Zinc V2 (invalid_address, out_of_stock, price_exceeded, insufficient_funds, already_exists, etc.).
- **auth.ts:** Resolución segura de credenciales (Sandbox vs Production), aislamiento estricto de prefijos (zn_test_, zn_live_, zn_whsec_), y soporte de fallback seguro.
- **client.ts:** Cliente HTTP unificado con cabecera Authorization: Bearer <token>, manejo de rate limits (429 con retry-after y exponential backoff) y timeout determinista.
- **orders.ts:** Normalizadores de payload V2:
  - buildZincAddress: Mapeo estricto de direcciones (address_line1, postal_code, first_name, last_name, phone_number, etc.).
  - dollarsToCents: Conversión estricta de importes a centavos enteros para max_price.
  - assertProductionGate: Barrera infranqueable server-side que rechaza cualquier creación de orden real si is_enabled no está explícitamente activado.
- **webhooks.ts:** Verificación timing-safe de firmas HMAC-SHA256 sobre el raw request body (X-Webhook-Signature), cómputo de SHA-256 para deduplicación, y mapeo de eventos V2 a estados internos.
- **index.ts:** Barrel export unificado.

### 2.2 Almacenamiento Seguro (Supabase Vault & Base de Datos)
- **Supabase Vault:**
  - Procedimientos almacenados de seguridad:
    - set_zinc_vault_secret(p_environment, p_secret_type, p_secret_value): Valida prefijos obligatorios (zn_live_ para producción, zn_whsec_ para webhooks) y persiste en vault.decrypted_secrets.
    - get_zinc_vault_secret(p_environment, p_secret_type): Con SECURITY DEFINER y acceso restringido exclusivamente a roles service_role y postgres.
- **Tabla zinc_integration_settings:**
  - Almacena metadata no sensible (entorno, prefijo y últimos 4 caracteres de la clave, timestamp de último test, estado de conexión).
  - Producción configurada con is_enabled = false de forma inviolable.
- **Tabla zinc_webhook_events:**
  - Registro auditable y duradero de todos los eventos webhook recibidos.
  - Restricción única idempotente: UNIQUE (environment, payload_sha256).

---

## 3. Puntos de Contacto y Correcciones Aplicadas

| Archivo / Endpoint | Estado Previo (V1 / Deficiente) | Estado Corregido (V2 Conforme) |
|---|---|---|
| supabase/functions/zinc-config | No existía / usaba GET /retailers público | Creado. Valida prefijos zn_live_, ejecuta GET /orders?limit=1 para test de auth real, consulta dinámica de test-products, guarda webhook secret en Vault. |
| frontend/src/components/admin/AdminZincConfig.tsx | Badges inconsistentes, permitía prefijos libres | Exige zn_live_ para producción, UI para guardar Webhook Signing Secret, badges de test pass/fail normalizados. |
| supabase/functions/zinc-search-products | Auth no unificada | Conectado a resolveActiveZincApiKey y V2 GET /products?query=... con Bearer auth. |
| supabase/functions/zinc-sync-published-products | Cache desactualizado | V2 GET /products/:id con max_age=300. |
| supabase/functions/zinc-live-check | Cache no controlado | V2 GET /products/:id con max_age=0 para validación en tiempo real. |
| supabase/functions/zinc-live-check-before-payment | Sin control estricto de frescura | V2 GET /products/:id con max_age=0 previo a pasarela de pagos. |
| supabase/functions/zinc-enrich-candidate | Auth legacy | Conectado a módulo V2 unificado. |
| supabase/functions/zinc-verify-after-payment | Payload V1 con payment_method: { use_zinc_card: true }, address_line2, retailer en raíz, max_price en dólares flotantes | Payload V2 estricto: products: [{ url, quantity }], shipping_address conforme, max_price en centavos enteros, idempotency_key determinista, manejo de already_exists (409), wallet debit model, barrera server-side de producción. |
| supabase/functions/zinc-sync-order-tracking | Mapeaba campos V1 package_tracking_associated_items y delivery_dates | Mapeo conforme V2 usando el array tracking_numbers (tracking_number, carrier, url, delivered_at). |
| supabase/functions/zinc-webhook | Inexistente | Creado con verificación HMAC-SHA256 timing-safe sobre raw body, deduplicación por SHA-256, persistencia en DB y ACK rápido 200. |

---

## 4. Hallazgos de Seguridad

1. **Aislamiento de Secretos:** Ningún secreto de API ni de firma webhook vive en el repositorio, frontend ni logs. Toda credencial sensible reside en Supabase Vault server-side.
2. **Exposición Previa de Webhook Secret:** Se detectó que en capturas de pantalla de configuraciones previas se visualizó un signing secret de pruebas. Por principio de mínimo privilegio y Zero-Trust, el webhook en vivo fue categorizado como BLOCKED_WAITING_SECRET_ROTATION hasta su rotación en el dashboard de Zinc.
3. **Hard Safety Gate de Producción:** Verificado tanto en base de datos (is_enabled: false) como en código de Edge Functions (assertProductionGate). Se certificó que se ejecutaron 0 llamadas a órdenes reales en producción.

---

## 5. Edge Functions Desplegadas

Desplegadas con éxito en el proyecto Supabase cobtsgkwcftvexaarwmo:
1. zinc-webhook (verify_jwt = false, autenticación custom Zinc HMAC-SHA256)
2. zinc-config (verify_jwt = true)
3. zinc-search-products
4. zinc-live-check
5. zinc-live-check-before-payment
6. zinc-sync-published-products
7. zinc-sync-international-products
8. zinc-enrich-candidate
9. zinc-verify-after-payment

---

## 6. Migraciones de Base de Datos Aplicadas

- supabase/migrations/20261217000000_zinc_2_0_settings_and_webhook.sql:
  - Creación de tabla zinc_integration_settings.
  - Creación de tabla zinc_webhook_events con índice único idempotente.
  - Funciones de Vault set_zinc_vault_secret y get_zinc_vault_secret.

---

## 7. Pruebas y Certificación

- **Unit Tests:** 28 tests pasando (frontend/src/tests/zinc_v2_unit.test.ts).
- **Contract Tests:** 6 tests pasando contra OpenAPI 3.1.0 (frontend/src/tests/zinc_v2_contract.test.ts).
- **Suite Completa Frontend:** 316 tests pasando en 32 suites (npm test -- --run).
- **Frontend Production Build:** Build exitoso en 3.27s sin errores (npm run build).
- **Ejecución Sandbox en Vivo:**
  - 8 escenarios de productos dinámicos ejecutados desde GET /orders/test-products.
  - Escenarios síncronos validados: invalid_address (400), url_unreachable (400), insufficient_funds (402).
  - Escenario de éxito validado: test-success (201, Order ID generado: 06bc82a1-d7c5-4c8b-86fa-7eae2fe448c8).
  - Idempotencia validada: reintento exacto retornó HTTP 409 (already_exists).
  - Escenarios asíncronos validados: price_exceeded, out_of_stock, invalid_variant, shipping_unavailable aceptados con 201 para procesamiento async.
