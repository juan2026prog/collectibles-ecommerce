# Zinc API V2 — Auditoría Integral de Segundo Nivel y Normalización

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha de Auditoría:** 2026-09-04  
**Branch de Trabajo:** `zinc-v2-full-audit-20260904`  
**Panel Canónico de Administración:** `https://collectibles.uy/admin/internacional/zinc` (también disponible en tab: `/admin/settings?tab=internacional`)  
**Objetivo:** Normalización integral de la integración con Zinc API contra la documentación oficial en vivo V2 (OpenAPI 3.1.0, Changelog oficial hasta 2026-08-28 y `llms.txt`), eliminación de código legacy V1, persistencia robusta de idempotencia y preparación rigurosa para certificación Sandbox.

---

## 1. Documentación Oficial y Especificación

- **Especificación OpenAPI:** OpenAPI 3.1.0 (versión oficial de Zinc V2, fechada `2026-08-21`).
- **Changelog Oficial Verificado:** Actualizado hasta `2026-08-28`.
- **Endpoints Oficiales de Referencia (Source of Truth):**
  - `https://www.zinc.com/docs/v2/api-reference/products/search`
  - `https://www.zinc.com/docs/v2/api-reference/products/get-product`
  - `https://www.zinc.com/docs/v2/api-reference/products/get-offers`
  - `https://www.zinc.com/docs/v2/api-reference/orders/create-order`
  - `https://www.zinc.com/docs/v2/api-reference/orders/get-test-products`
  - `https://www.zinc.com/docs/v2/api-reference/orders/get-order`
  - `https://www.zinc.com/docs/v2/api-reference/introduction/idempotency`
  - `https://www.zinc.com/docs/v2/api-reference/introduction/webhooks`
  - `https://www.zinc.com/docs/v2/api-reference/introduction/authentication`
  - `https://www.zinc.com/docs/v2/api-reference/introduction/sandbox`

---

## 2. Matriz de Contratos OpenAPI 3.1.0

### 2.1 Catálogo y Búsqueda de Productos

| Endpoint | Método | Parámetros OpenAPI | Parámetros Implementados | Estado |
|---|---|---|---|---|
| **`/products/search`** | `GET` | `query` (req), `retailer` (req), `page` (opt), `free_shipping` (opt) | `query`, `retailer: 'amazon'`, `page` | **CONFORME** |
| **`/products/{product_id}`** | `GET` | `product_id` (path, req), `retailer` (req), `max_age` (opt), `newer_than` (opt), `async` (opt) | `product_id`, `retailer: 'amazon'`, `max_age` | **CONFORME** |
| **`/products/{product_id}/offers`** | `GET` | `product_id` (path, req), `retailer` (req), `max_age` (opt) | `product_id`, `retailer: 'amazon'` | **CONFORME** |

*Nota sobre Búsqueda:* En el informe preliminar se mencionó por error de redacción `GET /products?query=...`, pero el endpoint real utilizado en el código siempre fue `GET /products/search`. Se centralizó la llamada mediante la función `searchZincProducts` en `_shared/zinc/client.ts`.

### 2.2 Esquema de Dirección (`Address`)

La especificación OpenAPI 3.1.0 de Zinc V2 define:
- `first_name` (string, requerido)
- `last_name` (string, requerido)
- `address_line1` (string, requerido)
- `address_line2` (string o null, **opcional**) — **Soporte confirmado y preservado**
- `city` (string, requerido)
- `state` (string o null, opcional para países sin división estatal)
- `postal_code` (string, requerido)
- `phone_number` (string, requerido)
- `country` (string, opcional, default: "US")

*Aclaración:* `address_line2` **NO** es un campo obsoleto. Zinc V2 lo admite oficialmente como campo opcional. Nuestra función `buildZincAddress` preserva `address_line2` (incluyendo la combinación con el código de casillero UY), asignando `null` únicamente cuando no existe. Los campos legacy que sí fueron eliminados de la petición son `zip_code` (normalizado a `postal_code`) y `address_line_1` (normalizado a `address_line1`).

### 2.3 Creación de Órdenes (`OrderCreate`) y Modelo Wallet

El modelo `OrderCreate` en OpenAPI 3.1.0 define:
- **Campos Requeridos:** `products`, `shipping_address`, `max_price` (entero en centavos).
- **Campos Opcionales:**
  - `idempotency_key`: string (máximo 36 caracteres).
  - `retailer_credentials_id`: string (identificador de credenciales específicas).
  - `metadata`: object (clave-valor arbitrario).
  - `po_number`: string (PO identificador).
  - `handling_days_max`: integer (mínimo 1).
  - `is_gift`: boolean (default: false).
  - `gift_message`: string (máximo 240 caracteres).
  - `payment`: object ("Optional payment block. Omit for prepaid-wallet billing (default).")
  - `customer_notifications`: object (actualizaciones por email al cliente).

*Modelo de Pago Prepaid Wallet:* La documentación oficial establece textualmente: *"Omit for prepaid-wallet billing (default)"*. Por tanto, la omisión del bloque `payment` para debitar directamente del saldo prepago de la cuenta Zinc es la arquitectura canónica oficial recomendada por Zinc.

---

## 3. Arquitectura de Idempotencia

### 3.1 Corrección Conceptual y Operativa
En el informe inicial se empleó la expresión "Deterministic UUID v4", lo cual es una contradicción técnica ya que UUID v4 es pseudoaleatorio.

La regla de idempotencia oficial de Zinc y su implementación en el sistema es:
1. **Generación única:** Se utiliza un UUID único de hasta 36 caracteres para cada ítem lógico de orden internacional (`intlOrderItem.id` o `crypto.randomUUID()`).
2. **Persistencia previa obligatoria:** El `idempotency_key` se persiste en la columna `idempotency_key` de la tabla `international_order_items` **ANTES** de ejecutar el primer `POST /orders` hacia Zinc.
3. **Reutilización idéntica en reintentos:** En cualquier reintento posterior (caída de red, error 5xx, o retry manual desde el panel), la Edge Function recupera el `idempotency_key` existente de la base de datos y envía **EXACTAMENTE LA MISMA CLAVE**. Nunca se regenera la clave ante un reintento.
4. **Manejo de `already_exists` (HTTP 409):** Cuando Zinc responde 409 `already_exists`, la función reconoce que la orden original fue recibida por Zinc, extrae el identificador de la orden existente y actualiza el estado interno a `zinc_order_created` sin duplicar compras ni arrojar errores no controlados.

---

## 4. Estado de la Migración `20261217000000`

- **Archivo Local:** `supabase/migrations/20261217000000_zinc_2_0_settings_and_webhook.sql`
- **Estado en `supabase migration list`:**
  - `local`: `20261217000000`
  - `remote`: Vacío (las tablas y funciones fueron creadas vía ejecución DDL en la fase de setup).
- **Diagnóstico del Timestamp Futuro:**  
  La base de datos y el histórico del repositorio ya contenían migraciones previas con prefijos del futuro: `202610...`, `202611...`, `20261215...`, `20261216000000`, `20261216010000_international_system_rebuild.sql`. La migración `20261217000000` continuó dicha correlatividad existente.
- **Riesgo:** Si en el futuro se aplican migraciones con la fecha actual real (2026-09-XX), el orden alfabético de la CLI de Supabase podría listar `20261217` al final.
- **Propuesta de Acción Segura:**
  No se borra la migración ni se modifica el historial de forma destructiva. Se propone registrar la versión `20261217000000` formalmente en `supabase_migrations.schema_migrations` o realizar un rename consensuado previa validación de deployment.

---

## 5. Eventos Webhook (API Reference vs Changelog)

Se analizaron de forma exhaustiva tanto la página oficial de Webhooks como el Changelog de Zinc:

| Evento | Fuente Oficial | Estado Interno Mapeado | Comportamiento |
|---|---|---|---|
| `order.started` | API Reference / Changelog | `zinc_processing` | Orden en proceso de compra en retailer |
| `order.placed` | API Reference / Changelog | `purchased` | Orden confirmada en retailer, monto debitado |
| `order.tracking_received` | API Reference / Changelog | `shipped_to_courier` | Tracking disponible |
| `order.tracking` | Changelog | `shipped_to_courier` | Variante de tracking |
| `order.shipped` | Changelog | `shipped_to_courier` | Paquete despachado |
| `order.estimated_delivery_updated` | Changelog | `shipped_to_courier` | Actualización de fecha de entrega |
| `order.delivered` | API Reference / Changelog | `delivered_to_courier` | Entregado en casillero Miami |
| `order.cancelled` | API Reference / Changelog | `zinc_failed` | Cancelada por retailer, pase a revisión manual |
| `order.failed` | API Reference / Changelog | `zinc_failed` | Fallo de compra, pase a revisión manual |
| `return.created` | API Reference / Changelog | `delivered_to_courier` | Retorno iniciado, evento registrado en DB |
| `return.approved` | API Reference / Changelog | `delivered_to_courier` | Retorno aprobado con label |
| `return.denied` | API Reference / Changelog | `delivered_to_courier` | Retorno rechazado |
| `return.credited` | API Reference / Changelog | `delivered_to_courier` | Reembolso en billetera |
| `return.label_uploaded` | Changelog | `delivered_to_courier` | Etiqueta de devolución cargada |
| *Eventos Desconocidos* | Extensibilidad OpenAPI | No degradante (`zinc_processing`) | Persistido en `zinc_webhook_events` con ACK 200 |

---

## 6. Seguridad y Aislamiento de Secretos

1. **Rotación de Secreto de Webhook:** El signing secret Sandbox visualizado previamente en captura se considera no confiable. Se mantiene el requerimiento operativo de rotar el secreto en el dashboard de Zinc antes de habilitar la entrega de webhooks en vivo.
2. **Salvaguarda de Producción:**  
   - `zinc_integration_settings.is_enabled = false` para el entorno `production`.
   - Función `assertProductionGate` en backend que bloquea cualquier llamada de compra real si no está habilitada deliberadamente.
   - **0 compras reales ejecutadas en producción.**
3. **Persistencia en Supabase Vault:** Claves de API y secretos de firma viven exclusivamente en Vault con acceso restringido a `service_role` y `postgres`.

---

## 7. Diferenciación de Niveles de Certificación

Para garantizar transparencia técnica absoluta, se diferencian cuatro niveles de verificación:

1. **UNIT:** PASS (Pruebas unitarias de conversión de moneda, firma HMAC, aislamiento de claves, idempotencia y validación de direcciones).
2. **CONTRACT:** PASS (Pruebas de contrato contra la especificación OpenAPI 3.1.0 oficial de Zinc V2: `/products/search`, `/products/{product_id}`, `OrderCreate`, `Address` con `address_line2`, y modelo wallet).
3. **REAL SANDBOX HTTP:** PASS (Ejecución real contra la API de Zinc Sandbox: `GET /orders/test-products` dinámico con 8 escenarios, escenarios síncronos HTTP 400/402, `POST /orders` exitoso con HTTP 201, y reintento con HTTP 409 `already_exists`).
4. **REAL SANDBOX WEBHOOK:** BLOCKED (El receptor `zinc-webhook` con firma HMAC y deduplicación está desplegado y verificado localmente, pero la entrega de eventos en vivo por parte de Zinc está pausada hasta la rotación del secreto en el dashboard).

**Veredicto Final:** `READY FOR FINAL WEBHOOK CERTIFICATION` (NO MERGEAR A MAIN).
