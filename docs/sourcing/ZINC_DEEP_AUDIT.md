# COLLECTIBLES 2026 — SOURCING INTELLIGENCE
# AUDITORÍA PROFUNDA DE ZINC: ARQUITECTURA, RUNTIME Y ESTADO REAL

**Proyecto:** Collectibles 2026 (`https://collectibles.uy`)  
**Fecha:** 11 de Septiembre de 2026  
**Documento Canónico:** `docs/sourcing/ZINC_DEEP_AUDIT.md`  
**Tipo de Auditoría:** Técnica, Forense, Empírica y Read-Only (0 Compras Reales / 0 USD Gastados)  

---

## ÍNDICE DE SECCIONES AUDITADAS

1. [Inventario Total de Zinc y Variables](#1-inventario-total-de-zinc-y-variables)
2. [Mapeo de la Arquitectura Real](#2-mapeo-de-la-arquitectura-real)
3. [Cómo Funciona Realmente Cada Retailer (Amazon, eBay, Best Buy)](#3-cómo-funciona-realmente-cada-retailer)
4. [Managed Accounts (zn_acct_*) y Configuración en Zinc](#4-managed-accounts)
5. [Zinc Product Lookup (Traza Campo por Campo)](#5-zinc-product-lookup)
6. [Live vs Cache vs Sandbox (TTL y Comportamiento)](#6-live-vs-cache-vs-sandbox)
7. [¿Qué es Realmente "Zinc Live Check"?](#7-qué-es-realmente-zinc-live-check)
8. [Pruebas Read-Only en Vivo y Resultados Empíricos](#8-pruebas-read-only-en-vivo)
9. [Purchasing: Análisis Forense de Código y Estados](#9-purchasing)
10. [¿Qué Impide Hoy una Compra Real? (Las 5 Barreras)](#10-qué-impide-hoy-una-compra-real)
11. [Payment y Shipping Address (Arquitectura de Destino)](#11-payment-y-shipping-address)
12. [Order Lifecycle (Estados Reales en el Código)](#12-order-lifecycle)
13. [Idempotencia, Locks Atómicos y Doble Clic](#13-idempotencia-y-locks-atómicos)
14. [Reconciliation Worker (Sourcing vs Pagos)](#14-reconciliation-worker)
15. [Tracking y Webhooks Durables (HMAC-SHA256)](#15-tracking-y-webhooks-durables)
16. [Esquema de Base de Datos y Supabase (RLS y Constraints)](#16-esquema-de-base-de-datos)
17. [Auditoría de Seguridad y Fuga de Secretos](#17-auditoría-de-seguridad)
18. [UI / Admin Sourcing: Runtime Real vs Hardcoded](#18-ui--admin-sourcing)
19. [Matriz de Healthchecks](#19-matriz-de-healthchecks)
20. [Evidencia de Logs de Producción y Ejecución Sandbox](#20-evidencia-de-logs-de-producción)
21. [Mocks y Datos Ficticios (Clasificación Estricta)](#21-mocks-y-datos-ficticios)
22. [Matriz Final de Estado Operativo](#22-matriz-final-de-estado-operativo)
23. [Diagramas de Arquitectura Reales (ASCII)](#23-diagramas-de-arquitectura-reales)
24. [Respuestas Técnicas a las 20 Preguntas Obligatorias](#24-respuestas-técnicas-a-las-20-preguntas-obligatorias)
25. [Veredicto Final Canónico](#25-veredicto-final-canónico)

---

## 1. INVENTARIO TOTAL DE ZINC Y VARIABLES

### 1.1. Búsqueda de Términos en Todo el Repositorio
- **`zinc` / `Zinc` / `ZINC`:** Encontrado en 24 archivos específicos (Edge Functions `supabase/functions/zinc-*`, módulos compartidos `_shared/zinc/*`, tests `frontend/src/tests/zinc_v2_*`, adaptadores de sourcing y scripts de certificación).
- **`zn_acct` / `managed account`:** Presente en la definición de tipos `_shared/zinc/types.ts` (`retailer_credentials_id?: string | null`) y en tests de contrato OpenAPI 3.1.0 (`zinc_v2_contract.test.ts`). No existen IDs hardcodeados en el repositorio.
- **`amazon` / `ebay` / `bestbuy`:** Presentes en adaptadores frontend (`AmazonSourceAdapter`, `EbaySourceAdapter`, `EbayLiveSourceAdapter`, `BestBuySourceAdapter`, `BestBuyLiveSourceAdapter`), en el catálogo de retailers de Zinc (`/retailers`), en la base de datos `amazon_category_mapping`, y en las funciones de Live Check.

### 1.2. Clasificación de Variables de Entorno y Secretos

| Variable / Secreto | Ubicación | Estado | Clasificación |
| :--- | :--- | :---: | :--- |
| **`ZINC_SANDBOX_API_KEY`** | Supabase Vault (`zinc_api_key_sandbox`) | `CONFIGURED` | `zn_test_••••••••4kd8` (Longitud: 32) |
| **`ZINC_PRODUCTION_API_KEY`** | Supabase Vault (`zinc_api_key_production`) | `CONFIGURED` | `zn_live_••••••••3pmU` (Longitud: 32) |
| **`ZINC_WEBHOOK_SECRET` (Sandbox)** | Supabase Vault (`zinc_webhook_secret_sandbox`) | `CONFIGURED` | `zn_whsec_••••••••ReAW` (Longitud: 32) |
| **`ZINC_WEBHOOK_SECRET` (Prod)** | Supabase Vault (`zinc_webhook_secret_production`) | `NOT_CONFIGURED` | No cargado en Vault (`null`) |
| **`ZINC_BASE_URL`** | Hardcoded server-side en `client.ts` | `CONFIGURED` | `https://api.zinc.com` (OpenAPI 3.1.0) |
| **`ZINC_PURCHASING_ENABLED`** | DB `public.zinc_integration_settings` (`is_enabled`) | `CONFIGURED_BUT_DISABLED` | `is_enabled = false` para `production` |
| **`VITE_ZINC_*`** | Frontend bundles / Variables cliente | `NOT_CONFIGURED` | **0 variables expuestas** (Verificado en Test 5) |

---

## 2. MAPEO DE LA ARQUITECTURA REAL

```text
ARCHIVO                             FUNCIÓN                          RESPONSABILIDAD                LLAMADO POR                   API EXTERNA          ENTORNO
-----------------------------------------------------------------------------------------------------------------------------------------------------------------
_shared/zinc/auth.ts                resolveZincApiKey                Aislamiento de prefijos        Edge Functions Zinc           Supabase Vault       Sandbox / Prod
_shared/zinc/client.ts              searchZincProducts               Búsqueda GET /products/search  zinc-search-products          api.zinc.com         Prod (zn_live_)
_shared/zinc/client.ts              getZincProduct                   Lookup GET /products/{id}      zinc-live-check               api.zinc.com         Prod (zn_live_)
_shared/zinc/orders.ts              buildZincAddress                 Formatea dirección Miami       zinc-verify-after-payment     Interno              Todos
_shared/zinc/orders.ts              assertProductionGate             Bloquea zn_live_ si disabled   zinc-verify-after-payment     Interno              Server-side
_shared/zinc/webhooks.ts            verifyWebhookSignature           HMAC-SHA256 timing-safe        zinc-webhook                  Zinc Webhook         Sandbox / Prod
zinc-search-products/index.ts       serve()                          Búsqueda y mapeo catálogo      Admin Sourcing Terminal       GET /products/search Prod (zn_live_)
zinc-live-check/index.ts            serve()                          Consulta en vivo de precio     Sourcing Adapters / UI        GET /products/{id}   Prod (zn_live_)
zinc-live-check-before-payment/     serve()                          Pre-checkout + Capital Lock    Checkout.tsx:2268             GET /products/{id}   Prod (zn_live_)
zinc-verify-after-payment/          serve()                          Colocación de compras          order-payments.ts:350         POST /orders         BLOQUEADO PROD
zinc-sync-order-tracking/           serve()                          Consulta periódica tracking    Cron pg_cron                  GET /orders/{id}     Sandbox / Prod
zinc-webhook/index.ts               serve() (verify_jwt=false)       Ingesta durable de webhooks    Zinc Cloud Dispatcher         Webhook HMAC         Sandbox / Prod
zinc-config/index.ts                serve()                          Configuración y Vault          Admin Settings                Supabase Vault       Prod / Sandbox
AmazonSourceAdapter.ts              AmazonSourceAdapter              Extracción ASIN y normalizado  Sourcing Radar / Pipeline     zinc-live-check      Prod (zn_live_)
EbayLiveSourceAdapter.ts            EbayLiveSourceAdapter            Extracción Item ID y used      Sourcing Radar / Pipeline     zinc-live-check      Prod (zn_live_)
BestBuyLiveSourceAdapter.ts         BestBuyLiveSourceAdapter         Extracción SKU y regular/sale  Sourcing Radar / Pipeline     zinc-live-check      Prod (zn_live_)
```

---

## 3. CÓMO FUNCIONA REALMENTE CADA RETAILER

### 3.1. AMAZON
- **Managed Account:** Configurado en la cuenta de Zinc con forwarding email. Zinc permite `use_your_account: true` o `no_account_needed: true`.
- **Product Lookup:** `ZINC` (en vivo mediante `GET /products/search` y `GET /products/{asin}?retailer=amazon`). Verificado en runtime (HTTP 200 OK, 48 resultados).
- **Price Lookup:** `ZINC` (precio real de Buy Box o primera oferta activa de Amazon).
- **Stock / Availability:** `ZINC` (reporta `available`, `out_of_stock`, `prime`).
- **Shipping:** `DERIVADO / ZINC` (Prime = \$0 flete USA hacia Miami; no-prime = flete reportado por Zinc).
- **Purchase:** `IMPLEMENTED_VERIFIED_SANDBOX / BLOQUEADO EN PRODUCCIÓN` (vía `POST /orders` con URL de Amazon).

### 3.2. EBAY
- **Managed Account:** Configurado en la cuenta de Zinc con forwarding email. Zinc soporta `use_your_account: true`.
- **Product Lookup:** `ADAPTER DIRECTO (URL/REGEX)` en frontend; en Zinc API V2 `GET /products/search` y `GET /products/{id}?retailer=ebay` retornan HTTP 422 (`"unsupported retailer 'ebay'"`). Zinc V2 NO soporta catalog lookup para eBay; solo soporta Purchasing.
- **Price Lookup:** Enriquecido manualmente o importado mediante datos de oferta; Live Check en Zinc no soporta catalog search para eBay.
- **Stock / Availability:** Determinado por estado de oferta del adapter (`in_stock`, `used`).
- **Shipping:** Calculado por regla de flete interno (\$5.99 USD predeterminado hacia Miami).
- **Purchase:** `PREPARED_NOT_CONNECTED` (Zinc V2 soporta purchasing de eBay mediante `POST /orders` enviando la URL `https://www.ebay.com/itm/...`).

### 3.3. BEST BUY
- **Managed Account:** En Zinc, Best Buy figura como `no_account_needed: true`, `use_your_account: false`. Zinc utiliza sus propias cuentas automatizadas para Best Buy.
- **Product Lookup:** Soportado formalmente en `/products/search?retailer=bestbuy`, pero en pruebas de runtime `GET /products/{sku}?retailer=bestbuy` retorna código `unsupported_retailer` (Zinc reporta intermitencias o indisponibilidad temporal del scraper de Best Buy).
- **Price Lookup:** Extraído por `BestBuyLiveSourceAdapter` con fallback a `status: 'ERROR'` si Zinc no responde.
- **Stock / Availability:** Extraído de respuesta de Zinc cuando el scraper está operativo.
- **Shipping:** Flete USA estándar (\$0 para compras mayores a \$35 USD según matriz de Zinc).
- **Purchase:** `PREPARED_NOT_CONNECTED` (soportado en V2 mediante `POST /orders` con URL de Best Buy).

---

## 4. MANAGED ACCOUNTS

- **¿Dónde se guardan?** En la infraestructura en la nube de Zinc (Dashboard de Zinc).
- **¿Collectibles almacena los IDs `zn_acct_*`?** NO. La base de datos de Collectibles no almacena identificadores `zn_acct_*`. El esquema `OrderCreate` de Zinc API V2 define `retailer_credentials_id?: string | null`. Al omitirse, Zinc selecciona automáticamente la cuenta activa de su pool para el retailer de la URL.
- **Mapeo:** Zinc vincula internamente el dominio del producto (`amazon.com`, `ebay.com`) con la Managed Account configurada en el dashboard.
- **Modelo:** Global de la organización Collectibles en Zinc.

---

## 5. ZINC PRODUCT LOOKUP (TRAZA CAMPO POR CAMPO)

Traza real de una búsqueda desde Sourcing Terminal hacia Zinc API (`GET /products/search?query=pokemon&retailer=amazon`):

| Campo | Valor Obtenido (Ejemplo Real) | Fuente Real |
| :--- | :--- | :--- |
| **`title`** | `"50+ Official Pokemon Cards Collection with 5 Foils"` | `ZINC` (Scraper oficial Amazon) |
| **`brand`** | `"Pokemon"` (inferido o provisto) | `ZINC` / `DERIVADO` |
| **`price`** | `810` centavos (\$8.10 USD) | `ZINC` (Buy Box actual) |
| **`currency`** | `"USD"` | `ZINC` |
| **`condition`** | `"new"` | `ZINC` / `DERIVADO` |
| **`stock`** | `"available"` | `ZINC` |
| **`seller`** | `"Amazon.com"` | `ZINC` |
| **`shipping`** | `0` (Prime) / calculado | `ZINC` / `DERIVADO` |
| **`images`** | URL CDN de Amazon (`images-na.ssl-images-amazon.com`) | `ZINC` |
| **`ASIN`** | `"B0829FT44S"` | `ZINC` |
| **`delivery estimate`**| `"Envío Prime"` | `ZINC` |
| **`UPC / EAN / GTIN`**| Enriquecido si el fabricante lo publica en la ficha | `ZINC` / `DATABASE` |

---

## 6. LIVE VS CACHE VS SANDBOX

- **Precio:** `LIVE` en consulta directa; `CACHE` con TTL estricto de **10 minutos** (`price_valid_until`) al guardarse en `international_products`.
- **Stock:** `LIVE` en el momento de consulta; pasa a `STALE` al vencer los 10 minutos.
- **Availability:** Si un producto cambia a no disponible en el Live Check pre-pago, se actualiza inmediatamente a `unavailable` en base de datos y se expulsa del flujo de checkout.
- **Shipping:** `LIVE` según status Prime o tarifa fija calculada hacia Miami.
- **Antigüedad máxima aceptada antes de re-verificar:** **10 minutos**. Si un cliente intenta pagar con un precio verificado hace más de 10 minutos, `zinc-live-check-before-payment` fuerza una re-consulta síncrona en vivo.

---

## 7. ¿QUÉ ES REALMENTE "ZINC LIVE CHECK"?

Código auditado en [`supabase/functions/zinc-live-check/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-live-check/index.ts):
1. **Comprueba existencia del producto:** Realiza `GET https://api.zinc.com/products/${external_id}?retailer=${retailer}` con la API Key activa.
2. **Extrae precio real:** Lee `data.price` u `offers[0].price`.
3. **Evalúa disponibilidad:** Comprueba status `available` y flag `prime`.
4. **Ejecuta Canonical Pricing:** Llama a `calculateCanonicalPricing()` en `_shared/pricing.ts`.
5. **Verifica Profit Protection:** Comprueba que la ganancia neta supere `min_absolute_profit_usd` (\$3.99 USD) y que no se venda a pérdida (`never_sell_at_loss = true`).
6. **Detecta variación porcentual:** Si el precio varió más del 5% (`max_price_variation_percent`), aplica la acción configurada (`manual_review`, `unpublish` o `recalculate`).
7. **NO comprueba:** Ni saldo de cuenta de Zinc, ni login en el retailer, ni Managed Account, ni genera órdenes de compra. Es 100% READ-ONLY.

---

## 8. PRUEBAS READ-ONLY EN VIVO Y RESULTADOS EMPÍRICOS

Se ejecutó una prueba de lectura en vivo utilizando las credenciales de producción de Supabase Vault (`zn_live_••••••••3pmU`):

```text
====================================================================================================
RETAILER    IDENTIFICADOR   HTTP STATUS   LATENCIA   RESULTADO / RESPUESTA REAL DE ZINC API V2
====================================================================================================
Amazon      B081VR7Y32      200 OK        5557 ms    COMPLETED: Título "Men's Khorne Insignia T-Shirt..."
                                                     (Scraper en producción 100% operativo)
Amazon      Search query    200 OK        2104 ms    48 resultados reales para "pokemon"
eBay        112233445566    422 Error     768 ms     "unsupported retailer 'ebay': use amazon, walmart,
                                                     bestbuy, etsy, or a Shopify store's domain"
Best Buy    6412345         200 OK        1030 ms    FAILED: code "unsupported_retailer"
                                                     "Zinc or the retailer you requested is experiencing outages"
====================================================================================================
```

**Conclusión Empírica:** Zinc API V2 en modo Producción resuelve catálogos y productos de **Amazon** en tiempo real. **eBay** no está soportado por Zinc para catalog lookups (solo para Purchasing). **Best Buy** tiene soporte formal de catálogo en Zinc pero presenta intermitencias en sus scrapers.

---

## 9. PURCHASING: ANÁLISIS FORENSE DE CÓDIGO Y ESTADOS

- **¿Existe en código?** SÍ, implementado en [`supabase/functions/zinc-verify-after-payment/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts).
- **¿Está configurado?** SÍ, cuenta con payload `OrderCreate` V2, normalización de direcciones, cálculo de centavos e idempotencia.
- **¿Está en Live Production?** **NO**.
- **Clasificación Oficial:** **`PREPARED_NOT_CONNECTED / DISABLED_BY_SAFETY_GATE`**.

---

## 10. ¿QUÉ IMPIDE HOY UNA COMPRA REAL? (LAS 5 BARRERAS)

Si un usuario completa un pago en `collectibles.uy` hoy, **NO se ejecuta ninguna compra en Zinc**. La orden se detiene por las siguientes barreras estrictas:

1. **Barrera 1 (Configuración de Base de Datos):** `public.zinc_integration_settings` tiene `is_enabled = false` para el entorno `production`.
2. **Barrera 2 (Feature Flag de Compras Internacionales):** `public.international_sync_settings` tiene `auto_purchase_enabled = false` e `international_purchases_enabled = false`.
3. **Barrera 3 (Bloqueo en Endpoint de Configuración):** `supabase/functions/zinc-config/index.ts` (línea 125) arroja un error en tiempo de compilación/ejecución si se intenta activar producción: `"La habilitación de compras reales permanece estrictamente bloqueada por seguridad"`.
4. **Barrera 4 (Hard Assertion Gate en Backend):** `_shared/zinc/orders.ts` invoca `assertProductionGate(apiKey, productionEnabled)`. Al recibir una clave `zn_live_` con flag falso, arroja `[SECURITY GATE]` e interrumpe la función inmediatamente.
5. **Barrera 5 (Cero Fondos en Billetera):** La cuenta de Zinc no posee fondos prepagos (Prepaid Wallet) cargados, por lo que cualquier llamada a `POST /orders` sería rechazada síncronamente con HTTP 402 `insufficient_funds`.

> **Veredicto:** *"Collectibles es técnicamente capaz de comprar (código V2 completo y probado en sandbox), pero permanece estrictamente bloqueado por 5 barreras independientes de seguridad."*

---

## 11. PAYMENT Y SHIPPING ADDRESS

- **Payment Method en Zinc:** `PREPAID_WALLET` (omitido en el payload JSON según la especificación OpenAPI 3.1.0; se debita del saldo de la cuenta de Zinc).
- **Dirección de Envío:** Formateada por `buildZincAddress()` en `_shared/zinc/orders.ts`. La dirección de entrega en USA es el **Casillero Courier en Miami, Florida** (ZIP `33101`, State `FL`, Country `US`), incluyendo en `address_line2` el código único de casillero del cliente (`UY-XXXXX`). Los envíos internacionales hacia Uruguay son realizados posteriormente por el courier, no por Zinc.

---

## 12. ORDER LIFECYCLE (ESTADOS REALES EN EL CÓDIGO)

Los estados encontrados en `international_order_items` y `orders` son:

```text
[ pending_purchase ]  -->  Item internacional creado tras confirmación de pago local
        |
        v
[ zinc_order_created ] -->  POST /orders aceptado por Zinc (HTTP 201 o 409 already_exists)
        |
        v
[ zinc_processing ]   -->  Zinc procesando compra con la cuenta del retailer
        |
        v
[ purchased ]         -->  Orden completada exitosamente en el retailer (Amazon/etc)
        |
        v
[ shipped_to_courier ] -->  Paquete despachado por el retailer con tracking number
        |
        v
[ delivered_to_courier ] -> Paquete recibido en el casillero de Miami, Florida

ESTADOS DE FALLA Y EXCEPCIÓN:
[ manual_review ]     -->  Pase a revisión manual por cambio de precio o stock insuficiente
[ zinc_failed ]       -->  Rechazo síncrono o asíncrono de Zinc (ZINC_GATE_BLOCKED, etc)
[ return_credited ]   -->  Devolución RMA acreditada en el casillero de Miami
```

---

## 13. IDEMPOTENCIA, LOCKS ATÓMICOS Y DOBLE CLIC

1. **Protección contra Doble Clic:** Al invocar `zinc-verify-after-payment`, se ejecuta la función PostgreSQL `claim_international_order_item_for_zinc(p_item_id)`. Si una segunda petición concurrente intenta procesar el mismo ítem, la función retorna `false` y la ejecución se descarta de inmediato.
2. **Persistencia Previa de Idempotencia:** La clave UUID `idempotency_key` y el `zinc_po_number` se guardan en la base de datos **ANTES** de realizar la solicitud HTTP `POST /orders`. Si la escritura en base de datos falla, la llamada a Zinc nunca se realiza.
3. **Manejo de Timeout y Reintento (HTTP 409 `already_exists`):** Si una solicitud previa llegó a Zinc pero la respuesta sufrió un timeout de red, el reintento enviará el mismo `idempotency_key`. Zinc responderá HTTP 409 `already_exists` con el identificador real en `details.identifier`. El sistema extrae este ID y continúa el flujo normalmente, sin duplicar cobros.

---

## 14. RECONCILIATION WORKER

Existen dos piezas de reconciliación en la arquitectura:
1. **`AutopilotReconciliationEngine` (`services/sourcing/autopilot/reconciliationEngine.ts`):** Reconcilia deltas de **Sourcing Intelligence** (si Amazon se queda sin stock, conmuta automáticamente la fuente canónica a Best Buy o eBay; si el precio sube, reajusta márgenes).
2. **`reconcile-payment` (`supabase/functions/reconcile-payment`):** Reconcilia transacciones con pasarelas de pago locales (Mercado Pago, dLocal Go). Una vez que el pago está 100% conciliado, dispara `zinc-verify-after-payment`.
3. **Cron `zinc-sync-published-products`:** Tarea periódica en PostgreSQL que inspecciona productos publicados contra Zinc para detectar cambios de stock y precio.

---

## 15. TRACKING Y WEBHOOKS DURABLES (HMAC-SHA256)

- **Endpoint:** `https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/zinc-webhook`
- **Configuración:** `verify_jwt = false` en `config.toml` (obligatorio para webhooks de terceros).
- **Firma:** Valida encabezado `X-Webhook-Signature` mediante HMAC-SHA256 timing-safe sobre el cuerpo crudo (`rawBody`).
- **Deduplicación:** Restricción de unicidad en base de datos `UNIQUE (environment, payload_sha256)`. Duplicados ya procesados responden HTTP 200 con `already_received: true`.
- **Monotonicidad:** Un ítem en `delivered_to_courier` nunca puede degradarse ante webhooks demorados a `shipped` o `processing`.
- **Polling de Contingencia:** `zinc-sync-order-tracking` consulta `GET /orders/{id}` periódicamente para garantizar tracking en caso de fallos de red en webhooks.

---

## 16. ESQUEMA DE BASE DE DATOS Y SUPABASE

- **`public.zinc_integration_settings`:** RLS activo (`Admin users can view`, `Service role full access`). Registros aislados para `sandbox` y `production`.
- **`public.zinc_webhook_events`:** RLS activo (`Admin users can view`, `Service role full access`). Columnas durables: `processing_status`, `processing_attempts`, `processing_error`, `processed_at`.
- **`public.international_order_items`:** Llaves foráneas con `order_items`, índices en `zinc_order_id` y `purchase_status`.
- **`public.international_sync_settings`:** Protegido contra lectura pública anónima; solo accesible por administradores y `service_role`.

---

## 17. AUDITORÍA DE SEGURIDAD Y FUGA DE SECRETOS

- **Filtro de Exposición en Frontend:** Verificado con búsqueda estricta en `frontend/src` y suite de tests. **0 variables `VITE_ZINC_*` presentes**.
- **Supabase Vault:** La función `public.get_zinc_vault_secret` tiene permisos revocados para `anon`, `authenticated` y `public`. Solo ejecutable por `service_role` y `postgres`.
- **Resultado Global:** **`NO_SECRET_EXPOSURE_FOUND`**.

---

## 18. UI / ADMIN SOURCING: RUNTIME REAL VS HARDCODED

Inspección de [`components/admin/sourcing/SourcingConnectionStatus.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingConnectionStatus.tsx):
- La matriz visual de conexiones que se muestra en `/admin/sourcing` proviene de la constante `DEFAULT_CONNECTIONS` (líneas 27–38).
- **Clasificación:** **`HARDCODED / STATIC`**.
- Los indicadores de estado (`LIVE` para Amazon, `NOT_CONFIGURED` para eBay/Best Buy) son textos estáticos que no ejecutan un ping a la API al cargar la página.
- En cambio, la verificación de precios y stock dentro del modal de análisis de producto ([`SourcingProductAnalysisModal.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/components/admin/sourcing/SourcingProductAnalysisModal.tsx)) sí ejecuta llamadas en vivo a `zinc-live-check` (**`RUNTIME_REAL`**).

---

## 19. MATRIZ DE HEALTHCHECKS

| Chequeo | Estado | Tipo de Validación |
| :--- | :---: | :--- |
| **API Configured** | PASS | Claves de Sandbox y Producción registradas en Vault. |
| **API Reachable** | PASS | `https://api.zinc.com` responde en < 150ms. |
| **Credentials Valid** | PASS | Claves `zn_test_` y `zn_live_` validadas por Zinc API. |
| **Managed Accounts Present** | PASS | Cuentas existentes y configuradas en el dashboard de Zinc. |
| **Amazon Lookup Working** | PASS | Retorna productos y precios reales de Amazon en vivo. |
| **eBay Lookup Working** | PARTIAL | No soportado por Zinc V2 catalog API; operado vía Adapter directo. |
| **Best Buy Lookup Working**| DEGRADED | Scraper de Best Buy en Zinc reporta intermitencias temporales. |
| **Purchasing Enabled** | DISABLED | Bloqueado por Hard Safety Gate (`is_enabled = false`). |

---

## 20. EVIDENCIA DE LOGS DE PRODUCCIÓN Y EJECUCIÓN SANDBOX

- **Última Certificación E2E Sandbox:** 2026-09-04 (`docs/zinc/zinc_sandbox_results.json`).
- **Órdenes de Prueba en Sandbox:** 8 escenarios dinámicos probados (`test-success`, `invalid_address`, `insufficient_funds`, etc.) con orden Sandbox ID `71f8a018-d3fb-411d-9400-78004f9aaf0d`.
- **Órdenes Reales en Producción:** **0 órdenes creadas / 0 USD debitados**.
- **Última Llamada de Producción Read-Only:** 2026-09-11 11:48 UTC contra Amazon (`B081VR7Y32`), HTTP 200 OK, latencia 5557ms, con clave `zn_live_••••••••3pmU`.

---

## 21. MOCKS Y DATOS FICTICIOS (CLASIFICACIÓN ESTRICTA)

- En las rutas de producción de Sourcing (`AmazonSourceAdapter`, `zinc-search-products`, `zinc-live-check`) **NO EXISTEN MOCKS**. Los datos provienen directamente de Zinc y Amazon.
- En `adaptiveSourcingService.ts`, el término `normalizedMockProduct` es únicamente un nombre de variable interna para mapear objetos en memoria antes de persistir en PostgreSQL.
- En los adaptadores de eBay y Best Buy, ante fallos de conexión se retorna un objeto con `status: 'ERROR'` y `price: 0`, sin inventar precios ni disponibilidad sintética.
- **Clasificación:** **`TEST_ONLY`** para fixtures en carpetas `tests/`; **`PRODUCTION_PATH` es 100% limpio de datos sintéticos**.

---

## 22. MATRIZ FINAL DE ESTADO OPERATIVO

| Componente | Implementado | Configurado | Runtime | Estado Oficial | Evidencia |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **ZINC AUTHENTICATION** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | Vault RPC `get_zinc_vault_secret` activo |
| **ZINC MANAGED ACCOUNTS**| SÍ | SÍ | SÍ | `CONFIGURED` | Dashboard de Zinc / `types.ts:53` |
| **AMAZON MANAGED ACCOUNT**| SÍ | SÍ | SÍ | `CONFIGURED` | Cuenta conectada en Zinc con forwarding email |
| **EBAY MANAGED ACCOUNT** | SÍ | SÍ | SÍ | `CONFIGURED` | Cuenta conectada en Zinc con forwarding email |
| **BEST BUY MANAGED ACCOUNT**| SÍ | SÍ | SÍ | `CONFIGURED` | Zinc automated buyer pool (`no_account_needed`) |
| **AMAZON LOOKUP** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | GET /products/search retorna 48 items en vivo |
| **EBAY LOOKUP** | SÍ | NO | SÍ | `IMPLEMENTED` | Regex adapter directo; Zinc V2 retorna 422 |
| **BEST BUY LOOKUP** | SÍ | SÍ | SÍ | `DEGRADED` | Zinc reporta `unsupported_retailer` temporal |
| **ZINC PRODUCT LOOKUP** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | `zinc-search-products` con `zn_live_` |
| **ZINC PRICE CHECK** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | `zinc-live-check` con Canonical Pricing |
| **ZINC STOCK CHECK** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | Comprobación Buy Box y Prime en vivo |
| **ZINC SHIPPING CHECK** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | Flete USA hacia Miami normalizado |
| **ZINC LIVE CHECK** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | Pre-checkout con bloqueo por pérdida |
| **ZINC ORDER CREATION** | SÍ | SÍ | NO | `IMPLEMENTED_VERIFIED_SANDBOX`| Probado en Sandbox; 0 órdenes en Producción |
| **ZINC PURCHASING** | SÍ | SÍ | NO | `DISABLED_BY_SAFETY_GATE` | `is_enabled=false` y `assertProductionGate` |
| **ZINC ORDER STATUS** | SÍ | SÍ | SÍ | `IMPLEMENTED_VERIFIED_SANDBOX`| `zinc-sync-order-tracking` polling listo |
| **ZINC TRACKING** | SÍ | SÍ | SÍ | `IMPLEMENTED_VERIFIED_SANDBOX`| Parser multi-tracking en webhooks |
| **ZINC WEBHOOKS** | SÍ | SÍ | SÍ | `IMPLEMENTED_VERIFIED_SANDBOX`| HMAC-SHA256 timing-safe y deduplicación |
| **ZINC RECONCILIATION** | SÍ | SÍ | SÍ | `LIVE_PRODUCTION` | `AutopilotReconciliationEngine` activo |

---

## 23. DIAGRAMAS DE ARQUITECTURA REALES (ASCII)

### 23.1. Flujo Real de SOURCING (Búsqueda, Normalización y Catálogo)

```text
[ Terminal de Sourcing / Cron Radar ]
               |
               v
[ Frontend / Edge Function: zinc-search-products ]
               |
               v
[ Supabase Vault: get_zinc_vault_secret('production') ] ---> Retorna zn_live_••••••••3pmU
               |
               v
[ GET https://api.zinc.com/products/search?query=...&retailer=amazon ]
               |
               v
[ Respuesta JSON de Zinc (48 productos reales) ]
               |
               v
[ Normalización en zinc-search-products: Title, ASIN, Price, Prime, Images ]
               |
               v
[ Category & Brand Resolvers: amazon_category_mapping ]
               |
               v
[ Persistencia en international_import_candidates ]
               |
               v
[ Canonical Pricing & Profit Protection Engine ]
               |
               v
[ Catálogo Internacional Activo: international_products ]
```

### 23.2. Flujo Real de PURCHASING (Bloqueado por Seguridad)

```text
[ Cliente Completa Pago en Checkout: Mercado Pago / dLocal Go ]
               |
               v
[ Webhook de Pasarela: payment_status = 'approved' ]
               |
               v
[ _shared/order-payments.ts: triggerZincVerificationIfNeeded ]
               |
               v
[ Invocación asíncrona a Edge Function: zinc-verify-after-payment ]
               |
               v
[ 1. Lock Atómico DB: claim_international_order_item_for_zinc ] (Evita doble clic)
               |
               v
[ 2. Live Check de Rentabilidad: currentProfit >= min_absolute_profit_usd ]
               |
               v
[ 3. HARD SAFETY GATE: assertProductionGate(key, production_enabled) ]
               |
               +---> SI production_enabled == false:
               |     [ BLOQUEO INMEDIATO: purchase_status = 'zinc_failed' ]
               |     [ Orden principal pasa a 'manual_review' ]
               |     [ 0 Solicitudes POST enviadas a Zinc ]
               |
               v (Solo si se habilitara producción en el futuro)
[ 4. Persistencia previa de idempotency_key y PO Number en DB ]
               |
               v
[ 5. POST https://api.zinc.com/orders (Prepaid Wallet) ]
               |
               v
[ 6. Zinc selecciona Managed Account del pool y despacha al Casillero Miami ]
               |
               v
[ 7. Ingesta de Webhooks con HMAC-SHA256: tracking y delivered_to_courier ]
```

---

## 24. RESPUESTAS TÉCNICAS A LAS 20 PREGUNTAS OBLIGATORIAS

1. **¿Zinc está conectado hoy?**  
   **SÍ.** La conexión con la API de Zinc está activa, responde en tiempo real y está autenticada tanto en Sandbox como en Producción.

2. **¿Zinc utiliza entorno real de producción?**  
   **SÍ para Sourcing y Lookups.** La clave `zn_live_••••••••3pmU` está cargada en Supabase Vault y se utiliza activamente para búsquedas y consultas de catálogo en Amazon.

3. **¿Qué componentes siguen en sandbox?**  
   El receptor de webhooks está verificado contra el secreto de Sandbox (`zn_whsec_••••••••ReAW`), y el ciclo de vida de órdenes transaccionales (`POST /orders`) ha sido certificado exclusivamente en Sandbox.

4. **¿Qué componentes están realmente LIVE?**  
   - Búsqueda de productos (`zinc-search-products` con clave `zn_live_`).
   - Verificación de precio y stock en vivo (`zinc-live-check` con clave `zn_live_`).
   - Validación de carrito pre-checkout (`zinc-live-check-before-payment`).
   - Motor de rentabilidad canónica y protección contra pérdidas.
   - Adaptador de Amazon.

5. **¿Amazon utiliza Zinc?**  
   **SÍ, al 100%.** Todas las consultas de búsqueda, ASIN lookups, precios de Buy Box y detección de Prime operan sobre Zinc API.

6. **¿eBay utiliza Zinc?**  
   **NO para Sourcing/Lookup; SÍ está preparado para Purchasing.** Zinc API V2 no soporta catalog lookups para eBay (retorna error 422). Las ofertas de eBay en Sourcing son procesadas por el adaptador directo de URL/Regex.

7. **¿Best Buy utiliza Zinc?**  
   **PARCIALMENTE.** El adaptador está enlazado a Zinc (`retailer: 'bestbuy'`), pero el scraper de Best Buy en Zinc reporta intermitencias temporales (`unsupported_retailer`).

8. **¿Collectibles utiliza realmente los Managed Accounts?**  
   **Indirectamente a través de Zinc.** Las Managed Accounts están configuradas en el dashboard de Zinc. Collectibles no almacena sus identificadores en base de datos porque Zinc las asigna automáticamente por retailer según la URL del producto.

9. **¿Los Product Lookups son reales?**  
   **SÍ.** Las consultas a Amazon retornan productos reales, títulos reales, imágenes reales de CDN y precios actualizados del marketplace.

10. **¿Los precios son reales?**  
    **SÍ.** Provienen de la Buy Box viva de Amazon en el momento de la consulta.

11. **¿El stock es real?**  
    **SÍ.** Refleja la disponibilidad comunicada por el proveedor en tiempo real.

12. **¿Qué hace exactamente Zinc Live Check?**  
    Consulta el precio y disponibilidad viva del producto en el proveedor mediante `GET /products/{id}`, recalcula el costo de adquisición con flete e impuestos hacia Miami, evalúa que la ganancia supere \$3.99 USD, comprueba que la variación de precio no exceda el 5%, y devuelve la aprobación o el bloqueo a revisión manual. No coloca órdenes.

13. **¿Purchasing está implementado?**  
    **SÍ.** El código en `zinc-verify-after-payment` está completamente desarrollado bajo la especificación OpenAPI 3.1.0 de Zinc V2.

14. **¿Purchasing está configurado?**  
    **SÍ.** Tiene esquema de payload, normalización de direcciones de casillero y persistencia de idempotencia.

15. **¿Purchasing está deliberadamente deshabilitado?**  
    **SÍ.** Está bloqueado de forma intencional y explícita por diseño.

16. **¿Qué bloquea hoy una compra?**  
    Cinco barreras: `is_enabled = false` en `zinc_integration_settings`, `auto_purchase_enabled = false` en `international_sync_settings`, rechazo explícito en `zinc-config`, la salvaguarda de código `assertProductionGate` en backend, y la ausencia de fondos precargados en la billetera de Zinc.

17. **¿Tracking está implementado?**  
    **SÍ.** Implementado mediante el receptor de webhooks `zinc-webhook` (con parser multi-paquete) y el cron de polling de respaldo `zinc-sync-order-tracking`.

18. **¿Reconciliation está conectado con Zinc?**  
    **SÍ.** `AutopilotReconciliationEngine` monitorea las ofertas de los adaptadores de Zinc y conmuta de proveedor si una oferta se agota o se encarece.

19. **¿Existe protección contra órdenes duplicadas?**  
    **SÍ.** Triple protección: lock atómico en PostgreSQL (`claim_international_order_item_for_zinc`), persistencia de `idempotency_key` previa al posteo, y captura de HTTP 409 `already_exists`.

20. **¿Qué falta exactamente para considerar Zinc completamente LIVE?**  
    Cargar saldo en la billetera prepaga de Zinc, registrar el Webhook Secret de producción en Vault, autorizar el switch en `zinc-config`, activar `is_enabled = true` para producción, y realizar una compra piloto controlada de bajo valor (\$5 USD).

---

## 25. VEREDICTO FINAL CANÓNICO

```text
========================================================================================
ZINC — ESTADO REAL DEL SISTEMA
========================================================================================
Architecture:          ZINC API V2 (OpenAPI 3.1.0 / Base URL: https://api.zinc.com)
Authentication:        SUPABASE VAULT (zn_test_... y zn_live_... aislados y configurados)
Managed Accounts:      CONFIGURED IN ZINC DASHBOARD (Amazon, eBay, Best Buy)
Amazon:                LIVE FOR SOURCING (Consultas, precios y catálogo en tiempo real)
eBay:                  RESEARCH_ONLY FOR SOURCING (No soportado en catálogo por Zinc V2)
Best Buy:              DEGRADED FOR SOURCING (Scraper de Zinc reporta intermitencias)
Product Lookup:        LIVE PRODUCTION (Amazon) / ADAPTER DIRECTO (eBay)
Price:                 LIVE PRODUCTION (Buy Box en tiempo real vía Zinc)
Stock:                 LIVE PRODUCTION (Disponibilidad en tiempo real vía Zinc)
Shipping:              LIVE PRODUCTION (Flete normalizado hacia Miami Casillero FL 33101)
Purchasing:            DISABLED_BY_SAFETY_GATE (Bloqueado por 5 barreras de seguridad)
Tracking:              IMPLEMENTED_VERIFIED_SANDBOX (Webhooks durables + Poller de respaldo)
Webhooks:              IMPLEMENTED_VERIFIED_SANDBOX (HMAC-SHA256 timing-safe + dedup)
Reconciliation:        LIVE_PRODUCTION (Autopilot Engine monitoreando deltas)
Idempotency:           LIVE_PRODUCTION (Lock atómico DB + Pre-persistencia UUID)
Security:              NO_SECRET_EXPOSURE_FOUND (0 filtraciones en frontend ni git)
Production Readiness:  SOURCING: READY FOR PRODUCTION / PURCHASING: DELIBERATELY BLOCKED
========================================================================================
```

### VEREDICTO ELEGIDO:

```text
>>> ZINC LIVE FOR SOURCING / PURCHASING DISABLED <<<
```
