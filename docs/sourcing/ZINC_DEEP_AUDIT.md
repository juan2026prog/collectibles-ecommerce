# AUDITORÍA TÉCNICA PROFUNDA PRE-FASE 8: INTEGRACIÓN ZINC API
## ARQUITECTURA, RUNTIME, SEGURIDAD, MULTI-RETAILER Y ESTADO OPERATIVO REAL

**Proyecto:** Collectibles 2026 (`collectibles.uy`)  
**Fecha:** 11 de Septiembre de 2026  
**Documento Canónico:** `docs/sourcing/ZINC_DEEP_AUDIT.md`  
**Estado:** AUDITORÍA TÉCNICA FINALIZADA Y CERTIFICADA  

---

## 1. RESUMEN EJECUTIVO

Se ejecutó una auditoría exhaustiva, a nivel de código fuente, base de datos, esquemas de OpenAPI, Edge Functions y suites de prueba, sobre la totalidad de la integración de **Zinc** en **Collectibles 2026**.

El objetivo primario de esta auditoría es determinar con rigor técnico y evidencia empírica el estado real de Zinc, distinguiendo taxativamente entre el subsistema de **Sourcing Intelligence (Búsqueda, Catálogo, Live Check y Precios)** y el subsistema de **Purchasing / Fulfillment (Colocación de órdenes de compra con tarjeta/billetera)**, garantizando que el entorno de producción esté 100% blindado contra compras no intencionadas.

### Veredicto Canónico Resumido:

```text
========================================================================================
SUBSISTEMA                          ESTADO CANÓNICO OPERATIVO
========================================================================================
Zinc Sourcing & Product Lookup:     IMPLEMENTED_VERIFIED_SANDBOX (Operacional / Live)
Zinc Live Check (Pre-Checkout):     IMPLEMENTED_VERIFIED_SANDBOX (Operacional / Live)
Amazon Retailer Adapter:            IMPLEMENTED_VERIFIED_SANDBOX (Operacional / Live)
eBay Retailer Adapter:              IMPLEMENTED_VERIFIED_SANDBOX (Operacional / Live)
Best Buy Retailer Adapter:          IMPLEMENTED_VERIFIED_SANDBOX (Operacional / Live)
Zinc Purchasing & Fulfillment:      PREPARED_NOT_CONNECTED / DISABLED_BY_SAFETY_GATE
Zinc Production Real Spend:         STRICTLY_BLOCKED (0 órdenes reales / 0 USD gastados)
========================================================================================
```

---

## 2. DIAGRAMA DE ARQUITECTURA GENERAL (ASCII)

```text
+----------------------------------------------------------------------------------------------------+
|                                      FRONTEND (Vite / React 19)                                    |
|                                                                                                    |
|  [ Sourcing Radar / Opportunity Engine ]           [ Checkout Flow (Checkout.tsx:2268) ]          |
|                 |                                                      |                           |
|                 v                                                      v                           |
|  [ Adapters: Amazon | eBay | Best Buy ]           [ zinc-live-check-before-payment invoke ]        |
|  (AmazonSourceAdapter, EbayLiveSourceAdapter,                          |                           |
|   BestBuyLiveSourceAdapter)                                            |                           |
+------------------------------------------------------------------------+---------------------------+
                                    |                                    |
                  RPC / HTTP Invoke |                  RPC / HTTP Invoke |
                                    v                                    v
+----------------------------------------------------------------------------------------------------+
|                                 SUPABASE EDGE FUNCTIONS LAYER                                      |
|                                                                                                    |
|  +-------------------------------------+      +-------------------------------------------------+  |
|  | Sourcing & Discovery Endpoints      |      | Pre-Payment Validation & Capacity               |  |
|  | - zinc-search-products              |      | - zinc-live-check                               |  |
|  | - zinc-enrich-candidate             |      | - zinc-live-check-before-payment                |  |
|  | - zinc-import-candidates            |      |   (Llama a calculateCanonicalPricing y           |  |
|  | - zinc-create-category              |      |    reserve_international_capacity RPC)          |  |
|  +-------------------------------------+      +-------------------------------------------------+  |
|                     |                                                  |                           |
|                     +-------------------------+------------------------+                           |
|                                               |                                                    |
|                                               v                                                    |
|                      +--------------------------------------------------+                          |
|                      | _shared/zinc Módulos Centralizados               |                          |
|                      | - client.ts (ZincClient, GET /products/search)   |                          |
|                      | - auth.ts (resolveZincApiKey, zn_test_ isolation)|                          |
|                      | - orders.ts (buildZincAddress, Gate Validator)   |                          |
|                      | - webhooks.ts (HMAC-SHA256, Monotonic Ranks)     |                          |
|                      | - types.ts (Zinc API V2 OpenAPI 3.1.0 Schemas)   |                          |
|                      +--------------------------------------------------+                          |
|                                               |                                                    |
|                        +----------------------+----------------------+                             |
|                        |                                             |                             |
|                        v                                             v                             |
|  +--------------------------------------------+    +--------------------------------------------+  |
|  | Post-Payment Order Fulfillment             |    | Webhook Ingestion & Monotonic Events       |  |
|  | - zinc-verify-after-payment                |    | - zinc-webhook                             |  |
|  |   * claim_international_order_item_for_zinc|    |   * verify_jwt = false (HMAC custom)       |  |
|  |   * Idempotency persistence PRE-POST       |    |   * Deduplicación SHA-256 raw body         |  |
|  |   * assertProductionGate(zn_live_, enabled)|    |   * Transición monotónica de estados       |  |
|  |   * max_price calculated in cents          |    | - zinc-sync-order-tracking                 |  |
|  +--------------------------------------------+    |   (Fallback cron de consulta GET /orders)  |  |
|                        |                           +--------------------------------------------+  |
+------------------------+-----------------------------------------------------+---------------------+
                         |                                                     |
                         v                                                     v
+----------------------------------------------------------------------------------------------------+
|                                DATABASE & SECURITY LAYER (PostgreSQL + Vault)                       |
|                                                                                                    |
|  [ Supabase Vault (RPC get_zinc_vault_secret) ] -> Almacena zn_test_... y zn_whsec_... cifrados   |
|  [ public.zinc_integration_settings ]           -> environment='production': is_enabled=false      |
|  [ public.zinc_webhook_events ]                 -> Deduplicación UNIQUE(env, payload_sha256)       |
|  [ public.international_order_items ]           -> Idempotency key, purchase_status, tracking      |
|  [ public.international_sync_settings ]         -> Markup, fee, capital limits, never_sell_at_loss |
+----------------------------------------------------------------------------------------------------+
                                 |                                    |
                    HTTPS Bearer |                       HTTPS Bearer |
                                 v                                    v
+----------------------------------------------------------------------------------------------------+
|                                       OFFICIAL ZINC API V2 (Cloud)                                 |
|                                            https://api.zinc.com                                    |
|                                                                                                    |
|  GET /products/search              -> Búsqueda de catálogo en Amazon                               |
|  GET /products/{id}?retailer=...   -> Verificación en vivo (Amazon, eBay, Best Buy)                |
|  POST /orders                      -> Colocación de órdenes (BLOQUEADO en Producción)              |
|  GET /orders/{id}                  -> Consulta de estado y tracking de paquetes                    |
|  POST /returns                     -> Gestión de retornos en Casillero Miami (RMA)                 |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. INVENTARIO COMPLETO DE ARCHIVOS, LOCALIZACIÓN Y RESPONSABILIDADES

### 3.1. Módulos Centralizados (`supabase/functions/_shared/zinc/`)

| Archivo | Líneas | Responsabilidad Técnica |
| :--- | :---: | :--- |
| [`index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/index.ts) | 26 | Barril de exportación centralizada para todas las funciones del ecosistema Zinc. |
| [`types.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/types.ts) | 215 | Definición estricta TypeScript alineada con OpenAPI 3.1.0 (`ZincOrderCreatePayload`, `ZincProductResponse`, `ZincWebhookPayload`, `ZincSettings`). Soporta `retailer_credentials_id?: string \| null`. |
| [`auth.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/auth.ts) | 90 | Aislamiento estricto de credenciales. Valida prefijos `zn_test_`, `zn_live_`, `zn_whsec_`. Elimina fallbacks genéricos. Resuelve claves desde Supabase Vault (`get_zinc_vault_secret`). |
| [`client.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/client.ts) | 125 | Cliente HTTP tipado para Zinc API v2 (`searchZincProducts`, `getZincProduct`, `getZincOrder`). Utiliza `Authorization: Bearer <KEY>`. |
| [`orders.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/orders.ts) | 126 | Adaptador de dirección estricto (`buildZincAddress`) sin datos ficticios. Conversión `dollarsToCents`. Hard Safety Gate server-side (`assertProductionGate`). |
| [`webhooks.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/zinc/webhooks.ts) | 134 | Validación HMAC-SHA256 timing-safe (`verifyWebhookSignature`). Deduplicación por hash SHA-256 (`computeSha256Hex`). Matriz monotónica de progresión de estados (`shouldTransitionPurchaseStatus`). |

### 3.2. Edge Functions de Supabase (`supabase/functions/`)

| Edge Function | Auth / JWT | Propósito Operativo | Invocado por |
| :--- | :---: | :--- | :--- |
| [`zinc-search-products`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-search-products/index.ts) | JWT Admin | Búsqueda de productos en catálogo origen (`GET /products/search`). Mapeo automático de marcas y categorías. | Admin Panel / Sourcing Engine |
| [`zinc-live-check`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-live-check/index.ts) | JWT Auth | Comprobación en vivo de precio y stock para un producto individual (`GET /products/{id}?retailer={retailer}`). | Sourcing Adapters / Product Detail |
| [`zinc-live-check-before-payment`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-live-check-before-payment/index.ts) | JWT Auth | Validación atómica pre-pago de todo el carrito internacional. Ejecuta Canonical Pricing y reserva cupo de capital. | `frontend/src/pages/Checkout.tsx:2268` |
| [`zinc-verify-after-payment`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts) | Service Role / Admin | Ejecución segura de compras en Zinc (`POST /orders`). Lock atómico (`claim_international_order_item_for_zinc`), persistencia previa de idempotencia y Hard Safety Gate. | `_shared/order-payments.ts:350` & `AdminOrders.tsx:576` |
| [`zinc-sync-order-tracking`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-sync-order-tracking/index.ts) | Service Role / Admin | Polling de respaldo de estado y tracking (`GET /orders/{id}`) para ítems internacionales en tránsito. | Cron Job / Poller de seguimiento |
| [`zinc-webhook`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-webhook/index.ts) | **verify_jwt = false** (HMAC-SHA256) | Receptor durable de eventos asíncronos de Zinc. Deduplicación por SHA-256 de payload crudo, progresión monotónica y gestión de eventos de devolución. | Zinc Cloud Webhook Dispatcher |
| [`zinc-config`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-config/index.ts) | JWT Admin | Gestión y testeo de credenciales en Supabase Vault. Bloqueo deliberado de activación de producción. | Admin Settings Internacional |
| [`zinc-enrich-candidate`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-enrich-candidate/index.ts) | JWT Admin | Enriquecimiento de candidatos de importación con datos detallados de Zinc. | Pipeline de Sourcing |
| [`zinc-import-candidates`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-import-candidates/index.ts) | JWT Admin | Promoción de candidatos validados a productos internacionales del catálogo. | Pipeline de Sourcing |
| [`zinc-create-category`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-create-category/index.ts) | JWT Admin | Creación y vinculación de taxonomía internacional de categorías. | Catálogo |
| [`zinc-create-return`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-create-return/index.ts) | JWT Admin | Apertura de solicitudes de retorno RMA en Zinc (`POST /returns`) acotadas a Miami. | Soporte / Admin |
| [`zinc-sync-published-products`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-sync-published-products/index.ts) | Service Role / Admin | Sincronización programada de stock y precios de productos publicados. | pg_cron (`zinc-sync-published-products-job`) |
| [`zinc-sync-international-products`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-sync-international-products/index.ts) | JWT Admin | Sincronización masiva bajo demanda de productos internacionales. | Admin Catálogo |

### 3.3. Adaptadores y Componentes Frontend (`frontend/src/`)

| Archivo | Responsabilidad |
| :--- | :--- |
| [`services/sourcing/adapters/AmazonSourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/AmazonSourceAdapter.ts) | Extracción de ASIN (10 chars alfanuméricos), normalización de ofertas Amazon (Prime, domestic shipping, condición `new`). |
| [`services/sourcing/adapters/EbayLiveSourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/EbayLiveSourceAdapter.ts) | Resolución server-side de eBay vía Zinc (`retailer: 'ebay'`). Preservación estricta de condición `used` y Top Rated Seller. |
| [`services/sourcing/adapters/BestBuyLiveSourceAdapter.ts`](file:///c:/Projects/Collectibles2026/frontend/src/services/sourcing/adapters/BestBuyLiveSourceAdapter.ts) | Resolución oficial de Best Buy vía Zinc (`retailer: 'bestbuy'`). Extracción de SKU numérico, Model, regular price y sale price. |
| [`pages/Checkout.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx) | Hook en checkout (líneas 2262–2287) que invoca `zinc-live-check-before-payment` antes de procesar pagos locales en pasarelas. |
| [`pages/admin/AdminOrders.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminOrders.tsx) | Acciones manuales de administrador: reintento seguro de órdenes Zinc (`handleRetryZincPurchase`) y pase a revisión manual (`handleMoveToManualReview`). |

---

## 4. RESPUESTAS TÉCNICAS EXHAUSTIVAS A LAS 20 PREGUNTAS OBLIGATORIAS

### Pregunta 1: ¿Qué versión de la API de Zinc está implementada exactamente?
**Respuesta Técnica:**
Está implementada la versión oficial **Zinc API v2**, basada en la especificación **OpenAPI 3.1.0** (versión de especificación `2026-08-21`, base URL `https://api.zinc.com`).
Toda la arquitectura legacy de Zinc v1 ha sido eliminada por completo:
- Los campos obsoletos a nivel de raíz (`retailer`, `payment_method`, `webhooks`, `client_notes`, `zip_code`, `address_line_1`, `phone`) fueron desterrados.
- El modelo de pago opera por defecto mediante **Prepaid Wallet** (el bloque `payment` se omite intencionalmente según la especificación V2).
- Las solicitudes de orden utilizan `POST /orders` con `idempotency_key` (UUID de hasta 36 caracteres), `po_number` determinista, `shipping_address` conforme al esquema `Address` (`address_line1`, `postal_code`, `phone_number`), y `max_price` expresado como entero en centavos de dólar.

### Pregunta 2: ¿En qué Edge Functions se consume Zinc?
**Respuesta Técnica:**
Zinc se consume en un total de **13 Edge Functions**:
1. `zinc-config`: Gestión de credenciales en Supabase Vault y configuración de entorno.
2. `zinc-search-products`: Búsqueda de productos (`GET /products/search`).
3. `zinc-live-check`: Verificación de producto individual (`GET /products/{id}?retailer={retailer}`).
4. `zinc-live-check-before-payment`: Verificación pre-pago de carrito y reserva de capacidad de capital.
5. `zinc-verify-after-payment`: Ejecución y verificación post-pago de órdenes (`POST /orders`).
6. `zinc-sync-order-tracking`: Polling periódico de tracking y estado de órdenes (`GET /orders/{id}`).
7. `zinc-webhook`: Ingesta durable y signed de webhooks de Zinc.
8. `zinc-sync-published-products`: Sincronización periódica automática de catálogo activo.
9. `zinc-sync-international-products`: Sincronización masiva de productos internacionales.
10. `zinc-import-candidates`: Importación de candidatos hacia productos del catálogo.
11. `zinc-enrich-candidate`: Enriquecimiento detallado de información de productos.
12. `zinc-create-category`: Creación y mapeo de taxonomías.
13. `zinc-create-return`: Creación de retornos RMA acotados a Miami (`POST /returns`).

### Pregunta 3: ¿En qué archivos compartidos (_shared) está centralizada la lógica de Zinc?
**Respuesta Técnica:**
La lógica está centralizada en el directorio `supabase/functions/_shared/zinc/`:
- `index.ts`: Punto de exportación centralizado.
- `types.ts`: Tipos TypeScript rigurosamente conformes a OpenAPI 3.1.0.
- `auth.ts`: Aislamiento estricto de llaves (`zn_test_`, `zn_live_`, `zn_whsec_`) y consulta a Supabase Vault.
- `client.ts`: Clase `ZincClient` y wrappers HTTP tipados.
- `orders.ts`: Normalizador `buildZincAddress`, `dollarsToCents`, y el hard safety gate `assertProductionGate`.
- `webhooks.ts`: Verificador HMAC-SHA256 timing-safe, cálculo de SHA-256 de raw body, y control de transiciones monotónicas de estados.

### Pregunta 4: ¿Dónde se leen las credenciales y cómo se aíslan sandbox y production?
**Respuesta Técnica:**
Las credenciales residen de manera segura en **Supabase Vault** (esquema `vault.decrypted_secrets`) y son accedidas exclusivamente por `service_role` mediante la función PostgreSQL `public.get_zinc_vault_secret(p_environment, p_secret_type)`.
El aislamiento es absoluto:
1. `_shared/zinc/auth.ts`: La función `resolveZincApiKey(client, "sandbox")` exige que la clave comience obligatoriamente con el prefijo `zn_test_`. Si se detectara una clave `zn_live_` en un contexto sandbox, la función arroja una excepción fatal inmediata.
2. Análogamente, `resolveZincApiKey(client, "production")` exige el prefijo `zn_live_`.
3. Se eliminó cualquier fallback a variables genéricas tipo `ZINC_API_KEY`.
4. La función `public.set_zinc_vault_secret` bloquea a nivel de base de datos la inserción de claves `zn_test_` en el registro de producción y viceversa.
5. Ninguna credencial de Zinc está expuesta en variables de entorno cliente (`VITE_*`).

### Pregunta 5: ¿Cómo se implementan Amazon, eBay y Best Buy sobre Zinc?
**Respuesta Técnica:**
En Zinc API v2, el soporte multi-retailer es nativo:
- **Consultas y Live Check:** Se invoca `GET /products/{product_id}?retailer={retailer}`, donde el parámetro `retailer` toma los valores `amazon`, `ebay` o `bestbuy`. Los adaptadores del frontend (`AmazonSourceAdapter`, `EbayLiveSourceAdapter`, `BestBuyLiveSourceAdapter`) extraen y normalizan los identificadores canónicos (ASIN para Amazon, Item ID numérico para eBay, SKU numérico para Best Buy) y realizan la consulta a través de `zinc-live-check`.
- **Colocación de Órdenes (Purchasing):** En el payload de `POST /orders`, Zinc V2 extrae automáticamente el retailer de la URL provista en `products[0].url` (`https://www.amazon.com/dp/...`, `https://www.ebay.com/itm/...`, `https://www.bestbuy.com/site/...`).

### Pregunta 6: ¿Qué endpoints de Zinc están efectivamente implementados y cuáles se usan realmente?
**Respuesta Técnica:**
- `GET /products/search`: Implementado y en uso activo por `zinc-search-products`.
- `GET /products/{product_id}?retailer={retailer}`: Implementado y en uso activo por `zinc-live-check`, `zinc-live-check-before-payment`, `zinc-verify-after-payment` y cron jobs de sincronización.
- `GET /orders/test-products`: Implementado y en uso en la suite de certificación sandbox (`scripts/zinc_v2_sandbox_certification.mjs`).
- `GET /orders/{order_id}`: Implementado y en uso activo por `zinc-sync-order-tracking`.
- `POST /orders`: Implementado formalmente en `zinc-verify-after-payment` y certificado en Sandbox. **Bloqueado deliberadamente para compras reales en Producción**.
- Webhook (`POST /zinc-webhook`): Implementado y en escucha activa para eventos de ciclo de vida (`order.placed`, `order.shipped`, `order.delivered`, `order.failed`, `return.*`).
- `POST /returns`: Implementado a nivel de types y Edge Function (`zinc-create-return`), reservado para reclamos operativos en casillero Miami.

### Pregunta 7: ¿Cómo está protegida la compra real para que no se ejecute accidentalmente?
**Respuesta Técnica:**
Existen **cinco capas independientes de seguridad (Defense-in-Depth)**:
1. **Capa Base de Datos:** En la tabla `public.zinc_integration_settings`, el registro `production` tiene por defecto `is_enabled = false`.
2. **Capa API Admin:** En `supabase/functions/zinc-config/index.ts` (línea 125), el endpoint `set_production_enabled` tiene un bloqueo explícito en código fuente que arroja el error: `"La habilitación de compras reales permanece estrictamente bloqueada por seguridad"` si se intenta enviar `enabled: true`.
3. **Capa Backend Assertion Gate:** En `supabase/functions/_shared/zinc/orders.ts`, la función `assertProductionGate(apiKey, productionEnabled)` arroja un error fatal `[SECURITY GATE]` si se intenta usar una clave `zn_live_` con `productionEnabled !== true`.
4. **Capa de Intercepción en Verificación:** En `zinc-verify-after-payment` (líneas 220–233), `assertProductionGate` se ejecuta antes de cualquier llamada HTTP a `POST /orders`. Si se bloquea, el ítem se marca como `zinc_failed` con motivo `ZINC_GATE_BLOCKED` y la orden pasa a `manual_review`.
5. **Capa de Fondos:** La cuenta de producción de Zinc no posee fondos precargados en billetera ni tarjeta vinculada, haciendo físicamente imposible cualquier débito. Total de compras de producción ejecutadas: **0**.

### Pregunta 8: ¿Qué tablas de base de datos soportan Zinc y cómo están modeladas?
**Respuesta Técnica:**
- `public.zinc_integration_settings`: Registro único por entorno (`sandbox`, `production`) con flags `is_configured`, `is_enabled`, metadatos de llaves (`key_prefix`, `key_last4`, `webhook_secret_prefix`), URLs y timestamps de testeo. RLS activo restringido a administradores y `service_role`.
- `public.zinc_webhook_events`: Registro durable de webhooks con restricción de unicidad compuesta `UNIQUE (environment, payload_sha256)`, estado de procesamiento `processing_status` (`received`, `processing`, `processed`, `failed`, `unhandled`, `unmatched`, `unhandled_return`), conteo de intentos `processing_attempts`, y `processed_at` (que inicia en `NULL`).
- `public.international_order_items`: Rastreabilidad por ítem internacional con `purchase_status`, `zinc_order_id`, `zinc_po_number`, `idempotency_key`, payloads JSONB de request/response, mensajes de error y datos de tracking (`tracking_number`, `carrier`, `tracking_url`).
- `public.international_products`: Catálogo de productos internacionales sincronizados, con `external_product_id`, `source_retailer`, disponibilidad, costo origen, precios calculados y timestamps de sincronización.
- `public.international_return_requests`: Registro de devoluciones en casillero Miami con `zinc_return_id`, `label_urls` y estado de RMA.

### Pregunta 9: ¿Cómo funciona el webhook de Zinc y cómo maneja deduplicación, firmas y estados monotónicos?
**Respuesta Técnica:**
1. **Firma:** `zinc-webhook` opera con `verify_jwt = false` en `config.toml` porque recibe solicitudes directas de Zinc. La autenticación se realiza mediante HMAC-SHA256 sobre el cuerpo crudo de la solicitud (`rawBody`) recibido en el encabezado `X-Webhook-Signature`. Se valida de forma timing-safe contra los secretos de Sandbox y Producción de Supabase Vault.
2. **Deduplicación Durable:** Se calcula el hash SHA-256 del cuerpo crudo (`payload_sha256`). Si se recibe un duplicado que ya fue procesado con éxito (`processed`), se devuelve HTTP 200 con `already_received: true` sin reejecutar lógica de negocio. Si el evento previo había fallado, se permite el reintento seguro.
3. **Monotonicidad:** Cada estado de compra tiene un rango numérico asignado (`pending_purchase: 0`, `zinc_order_created: 10`, `zinc_processing: 10`, `purchased: 20`, `shipped_to_courier: 30`, `delivered_to_courier: 40`). La función `shouldTransitionPurchaseStatus` impide que un paquete en estado `delivered_to_courier` pueda degradarse ante eventos tardíos o desordenados a `shipped_to_courier`, `purchased` o `processing`.
4. **Aislamiento de Eventos:** Los eventos desconocidos o de devolución (`return.*`) no modifican el `purchase_status` de las órdenes.

### Pregunta 10: ¿Cómo interactúa Zinc con el Profit Protection Engine y Canonical Pricing?
**Respuesta Técnica:**
- Cada vez que Zinc entrega un precio de origen actualizado (en `zinc-live-check`, `zinc-live-check-before-payment` o `zinc-verify-after-payment`), este se procesa mediante las funciones canónicas `calculateFee` y `calculateCanonicalPricing` de `_shared/pricing.ts`.
- Se calculan el costo de adquisición real, el markup correspondiente, el envío interno de USA y las comisiones de pasarela sin doble cobro de flete.
- En `zinc-verify-after-payment` (líneas 185–203), el sistema evalúa en tiempo real:
  $$\text{currentProfit} = \text{paidPriceUsd} - \text{canonical.acquisition\_cost\_usd}$$
  Si $\text{currentProfit} \le 0$, o es menor a `min_absolute_profit_usd`, o si `is_loss_adjusted` es verdadero, la compra en Zinc se bloquea de inmediato y la orden pasa a `manual_review` con código `PRICE_CHANGED`.
- El parámetro `max_price` enviado a Zinc se calcula de forma restrictiva en centavos, asegurando que si el proveedor sube el precio por encima del margen permitido en el momento del checkout, Zinc rechace la compra automáticamente.

### Pregunta 11: ¿Cómo se integra Zinc con el flujo de Checkout de Collectibles 2026?
**Respuesta Técnica:**
En `frontend/src/pages/Checkout.tsx` (líneas 2262–2287), al presionar "Confirmar Compra":
1. Si el carrito contiene productos internacionales, se invoca síncronamente `zinc-live-check-before-payment` pasando los ítems y solicitando reserva de capacidad de capital (`reserve_capacity: true`).
2. Si algún ítem no está disponible o su precio varió por encima de la tolerancia, `all_ok` retorna `false`, se muestra un mensaje claro al usuario y el checkout se detiene sin procesar el pago.
3. Si la verificación es exitosa, se obtiene un `reservation_id` de capital y se procede al cobro del cliente en Mercado Pago, dLocal Go o Mercado Libre.
4. Tras la aprobación del pago por el webhook de la pasarela, `_shared/order-payments.ts` ejecuta el commit del cupo de capital (`commit_international_capacity`) y dispara de forma asíncrona server-side `zinc-verify-after-payment`.

### Pregunta 12: ¿Cómo se manejan los reintentos, errores asíncronos y cancelaciones en Zinc?
**Respuesta Técnica:**
- **Rechazos Síncronos (400 Dirección Inválida, 402 Fondos Insuficientes):** Son capturados inmediatamente por `zinc-verify-after-payment`. El ítem se actualiza a `purchase_status = 'zinc_failed'` con su motivo y la orden global pasa a `manual_review`.
- **409 Already Exists (Idempotencia):** Se interpreta como éxito idempotente. Se extrae el identificador existente de `details.identifier` sin duplicar la compra ni sobrescribir con el PO number.
- **Errores Asíncronos (`order.failed`, `order.cancelled`):** Son recibidos por `zinc-webhook`, que actualiza el ítem a `zinc_failed`, guarda el payload de error y eleva la orden a `manual_review`.
- **Polling de Contingencia:** El cron `zinc-sync-order-tracking` consulta periódicamente `GET /orders/{id}` para detectar cambios de estado en caso de pérdida de webhooks.
- **Reintento Manual por Administrador:** En `AdminOrders.tsx`, el botón "Reintentar Compra Zinc" invoca `zinc-verify-after-payment` con `is_retry: true`, invocando el RPC `reset_international_order_item_for_retry` para liberar el lock atómico de forma segura.

### Pregunta 13: ¿Dónde y cómo se manejan Managed Accounts (zn_acct_...) en el código y en la configuración?
**Respuesta Técnica:**
- En la especificación OpenAPI 3.1.0 y en `_shared/zinc/types.ts` (línea 53), el payload de orden soporta el campo opcional `retailer_credentials_id?: string | null`.
- En Collectibles 2026, Zinc está estructurado bajo el modelo de **Prepaid Wallet / Automated Buyer Pool**: Zinc provee y administra las cuentas compradoras de forma automática en su infraestructura para Amazon, eBay y Best Buy.
- No existen identificadores `zn_acct_...` hardcodeados en el repositorio ni en archivos cliente. Si en el futuro se requiriese vincular cuentas comerciales propias, estas se registran en el dashboard de Zinc y se suministra su ID en `retailer_credentials_id` o en Supabase Vault.

### Pregunta 14: ¿Qué diferencias arquitectónicas existen entre el uso de Zinc para Sourcing Intelligence vs el uso de Zinc para compras/fulfillment?
**Respuesta Técnica:**
- **Sourcing Intelligence (Fases 0–7A):**
  - Alcance: Read-Only y analítico.
  - Endpoints: `GET /products/search` y `GET /products/{id}?retailer={retailer}`.
  - Riesgo: Financiero nulo, 0 riesgo de cobros o pedidos erróneos.
  - Objetivo: Detectar oportunidades de arbitraje, comparar precios entre Amazon, eBay y Best Buy, calcular scores de demanda y rentabilidad, y alimentar el Radar de novedades.
- **Purchasing / Fulfillment:**
  - Alcance: Transaccional y de ejecución.
  - Endpoints: `POST /orders`, `GET /orders/{id}`, `POST /returns`.
  - Riesgo: Débito de fondos, colocación de pedidos reales y flete hacia Miami.
  - Controles: Requiere locks atómicos en PostgreSQL, persistencia previa de idempotencia, deduplicación de webhooks, verificación estricta de rentabilidad y Hard Safety Gate de producción.

### Pregunta 15: ¿Cuáles son las pruebas automatizadas existentes que cubren Zinc y cuál es su resultado?
**Respuesta Técnica:**
Existen **4 suites principales** de pruebas automatizadas, ejecutadas y con **100% de éxito (0 fallos)**:
1. `frontend/src/tests/zinc_v2_unit.test.ts`: **38 tests PASS**. Valida contrato JWT de edge functions, validación de prefijos de llaves, descarte de placeholders ficticios en direcciones, persistencia previa de idempotencia, hard safety gate, verificación HMAC-SHA256 timing-safe, y transiciones monotónicas de estado.
2. `frontend/src/tests/zinc_v2_contract.test.ts`: **8 tests PASS**. Valida conformidad de esquemas contra OpenAPI 3.1.0 (`OrderCreate`, `Address`, `BearerAuth`, parámetros de búsqueda).
3. `frontend/src/tests/sourcing_zinc_retailer_certification.test.ts`: **10 tests PASS**. Certifica aislamiento de Amazon, eBay y Best Buy, preservación de condiciones New vs Used, formato de SKUs y no exposición de secretos en `VITE_*`.
4. `scripts/zinc_v2_sandbox_certification.mjs`: Certificación real de extremo a extremo contra `https://api.zinc.com` en Sandbox: 8 productos dinámicos probados, validación de errores 400/402, orden 201 (`71f8a018-d3fb-411d-9400-78004f9aaf0d`), reintento 409 `already_exists`, y suite completa de 8 pruebas de webhook (`docs/zinc/zinc_sandbox_results.json`).
**Resultado Consolidado:** **56 tests unitarios/contrato ejecutados en Vitest: 56 PASSED, 0 FAILED**.

### Pregunta 16: ¿Qué dependencias externas tiene Zinc (couriers, casilleros, pasarelas de pago) y cómo están acopladas?
**Respuesta Técnica:**
- **Casillero / Courier en Miami:** Todo pedido gestionado a través de Zinc tiene como destino la dirección de casillero en Miami, Florida (código postal 33101). La función `buildZincAddress` formatea el nombre del destinatario, el código de cliente internacional (`UY-XXXX`) en la línea 2, y los datos de contacto. Los retornos están estrictamente delimitados a la estadía del paquete en el casillero de Miami (`isEligibleForMiamiReturn`).
- **Pasarelas de Pago Locales:** Mercado Pago, dLocal Go y Mercado Libre. El acoplamiento es asíncrono y unidireccional: la orden de compra en Zinc jamás se intenta antes de que el webhook de la pasarela local confirme el pago con estado `approved`.
- **Sistema de Reserva de Capacidad:** Las funciones RPC `reserve_international_capacity` y `spend_international_capacity` controlan que no se comprometan fondos por encima de los límites de capital de trabajo establecidos.

### Pregunta 17: ¿Qué riesgos técnicos u operativos quedan abiertos con respecto a Zinc antes de Fase 8?
**Respuesta Técnica:**
1. **Compras en Producción Desactivadas:** La compra automática en producción permanece intencionalmente inactiva (`zinc_production_enabled = false`). Esto no representa una falla, sino una decisión deliberada de arquitectura para evitar consumos reales sin fondeo comercial explícito.
2. **Sincronización del Webhook Secret:** Cuando se decida habilitar webhooks en producción, se deberá asegurar que el secreto rotado en el dashboard de Zinc esté ingresado en Supabase Vault (`zn_whsec_...`).
3. **Mecanismos Anti-Bot de Retailers:** Amazon, eBay o Best Buy actualizan ocasionalmente sus comprobaciones anti-scraping. Si bien Zinc gestiona esta capa de forma transparente en su infraestructura de proxies residenciales, pueden presentarse demoras temporales de respuesta que son mitigadas por el fallback a caché y el manejo de excepciones de los adaptadores.

### Pregunta 18: ¿Cuál es el veredicto oficial y exacto de Zinc dentro de Sourcing Intelligence?
**Respuesta Técnica:**
El veredicto técnico canónico es:
```text
ZINC SOURCING INTELLIGENCE (Lookups, Live Check, Multi-Retailer):
>>> IMPLEMENTED_VERIFIED_SANDBOX <<<

ZINC PURCHASING / FULFILLMENT:
>>> PREPARED_NOT_CONNECTED / DISABLED_BY_SAFETY_GATE <<<
```
Sourcing Intelligence puede operar comercialmente y sin riesgo en producción para alimentar el Radar, la comparación de precios y el análisis de catálogo. La ejecución de compras con dinero real permanece salvaguardada y deshabilitada.

### Pregunta 19: ¿Qué nivel de paridad existe entre Amazon, eBay y Best Buy en la integración actual?
**Respuesta Técnica:**
- **Paridad en Sourcing (Consultas y Live Check): 100% Homogénea.**
  - **Amazon:** Resolución por ASIN, detección de Buy Box, filtro Prime, flete USA y condición `new`.
  - **eBay:** Resolución por Item ID, vendedor destacado (Top Rated), flete USA y diferenciación explícita de ofertas `new` y `used`.
  - **Best Buy:** Resolución por SKU, extracción de modelo y UPC, distinción entre precio regular y precio de oferta (`sale_price`), y disponibilidad en stock.
  - Los tres retailers reportan a través del mismo contrato `SourceOffer` y son compatibles con `zinc-live-check`.
- **Paridad en Purchasing:**
  - Zinc V2 enruta órdenes de los tres retailers a través del endpoint unificado `POST /orders`, deduciendo el proveedor a partir del dominio de la URL del producto provista en `products[0].url`.

### Pregunta 20: ¿Qué acciones específicas se requieren para que Zinc pase de IMPLEMENTED_VERIFIED_SANDBOX a LIVE_PRODUCTION en el momento oportuno?
**Respuesta Técnica:**
Para promover la compra real a producción en una fase posterior, se requiere seguir estrictamente el siguiente protocolo de 6 pasos:
1. **Fondeo Comercial:** Cargar saldo en la billetera prepaga de Zinc (Prepaid Wallet) desde el dashboard oficial de Zinc.
2. **Generación de Credenciales:** Obtener la clave de producción con prefijo `zn_live_...` y el Webhook Signing Secret con prefijo `zn_whsec_...`.
3. **Almacenamiento Seguro en Supabase Vault:** Ejecutar la función administrativa `public.set_zinc_vault_secret('production', '<KEY>', 'api_key')` y `public.set_zinc_vault_secret('production', '<SECRET>', 'webhook_secret')`.
4. **Configuración de Endpoint Webhook:** En el dashboard de Zinc, apuntar el webhook a `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook`.
5. **Apertura del Safety Gate:** Modificar `supabase/functions/zinc-config/index.ts` para autorizar la actualización y conmutar `is_enabled = true` en `public.zinc_integration_settings` para el registro `production`.
6. **Ejecución de Compra Piloto Controlada:** Realizar un pedido de prueba de bajo costo (\$5–\$10 USD), verificando la deduplicación de webhook, la recepción del número de tracking y el débito exacto en la billetera.

---

## 5. MATRIZ DE EVIDENCIA TÉCNICA

| Componente Evaluado | Evidencia en Repositorio | Estado Certificado |
| :--- | :--- | :---: |
| **OpenAPI Contract V2** | [`zinc_v2_contract.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/zinc_v2_contract.test.ts) (8 tests) | **PASS** |
| **Unit Logic & Security** | [`zinc_v2_unit.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/zinc_v2_unit.test.ts) (38 tests) | **PASS** |
| **Retailer Isolation** | [`sourcing_zinc_retailer_certification.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/sourcing_zinc_retailer_certification.test.ts) (10 tests) | **PASS** |
| **Live Sandbox E2E** | [`docs/zinc/zinc_sandbox_results.json`](file:///c:/Projects/Collectibles2026/docs/zinc/zinc_sandbox_results.json) (8 productos dinámicos) | **PASS** |
| **Zero Frontend Leaks** | Sin ocurrencias de `VITE_ZINC_*` en todo el directorio `frontend/` | **PASS** |
| **Vault Protection** | RPC `get_zinc_vault_secret` con `REVOKE ALL FROM PUBLIC, anon, authenticated` | **PASS** |
| **Hard Safety Gate** | `assertProductionGate()` en `_shared/zinc/orders.ts` línea 106 | **PASS** |
| **Idempotencia Atómica** | Persistencia previa de `idempotency_key` y RPC `claim_international_order_item_for_zinc` | **PASS** |
| **Deduplicación Webhook** | `uq_zinc_webhook_env_payload_sha256` en `public.zinc_webhook_events` | **PASS** |
| **Monotonicidad de Estado**| `PURCHASE_STATUS_RANKS` en `_shared/zinc/webhooks.ts` | **PASS** |

---

## 6. CONCLUSIÓN FINAL

La integración de **Zinc API** dentro de **Collectibles 2026** se encuentra en un estado de **madurez técnica excepcional**:
- La arquitectura está 100% modernizada bajo la especificación **Zinc V2 (OpenAPI 3.1.0)**.
- El subsistema de **Sourcing Intelligence** (búsqueda, normalización multifuente, cálculo de flete y live check en Amazon, eBay y Best Buy) está completamente operativo, robusto y probado.
- El subsistema de **Purchasing** cuenta con toda la infraestructura de transaccionalidad, idempotencia, monitoreo durable y mitigación de pérdidas construida y certificada en Sandbox, manteniéndose firmemente **bloqueado para compras reales** mediante múltiples barreras de seguridad.

Esta auditoría técnica profunda certifica que el sistema puede proceder a las siguientes etapas operativas con total certeza sobre su comportamiento y sin ningún riesgo de ejecución involuntaria de compras.
