# SKYPOSTAL INTEGRATION — PHASE 3 CERTIFICATION
## Collectibles 2026 — Checkout, Orders, SkyPostal API, Shipments, Labels, Two-Leg Tracking & Manifests

**Fecha de Certificación:** 2026-09-26  
**Estado:** ✅ PHASE 3 CERTIFIED & SANDBOX TESTED  
**Mercado Piloto:** Chile (`CL`) en modo `SANDBOX`  
**Entorno:** TEST / SANDBOX READY  

---

## A. Executive Summary

La **Fase 3 de SkyPostal para Collectibles 2026** ha sido implementada, verificada y certificada exitosamente. Esta fase unifica la infraestructura existente de Checkout, Pedidos, Cola de Envíos (`shipping_queue`), Adaptadores Logísticos (`ShippingAdapter`) y eventos de tracking para operar mercados internacionales bajo SkyPostal en modo Sandbox/Test, con Chile como mercado piloto.

### Puntos Clave de la Certificación:
1. **Un Solo Checkout**: No se creó un checkout paralelo. El checkout principal (`Checkout.tsx` y `checkout-handler`) maneja transparentemente mercados domésticos (Uruguay vía DAC/SoyDelivery), casilleros (Import Hub) y destinos internacionales directos (SkyPostal).
2. **Autoridad Server-Side**: Las tarifas, recargo de combustible, markup y validación aduanera se verifican y recalculan estrictamente en el backend.
3. **Separación de Dos Legs Logísticos**: El tracking del retailer en USA (LEG 1: Amazon/eBay/Zinc a Miami Hub) y el tracking internacional SkyPostal (LEG 2: Miami a Aduana/Cliente) se mantienen estrictamente independientes y nunca se sobrescriben.
4. **Idempotencia Absoluta**: La creación de envíos y reintentos del worker están protegidos por `idempotency_key` y chequeo de guías preexistentes.
5. **Aislamiento Total de Import Hub**: `frontend/src/plugins/collector-import-hub/` y las tablas de franquicias de Uruguay y Argentina continúan operando al 100% sin modificaciones.
6. **Políticas de Ambiente**: Chile opera en `SANDBOX`. Ningún país SkyPostal está en `LIVE`. México continúa `DISABLED`.

---

## B. Arquitectura Técnica

```text
COMPRADOR INTERNACIONAL (Chile / Perú / Brasil / Colombia / Ecuador)
       │
       ▼
1. Catálogo / Storefront Internacional (/intl/cl)
       │
       ▼
2. Compliance & Package Engine (Peso Facturable: MAX(Actual, (L*W*H)/5000))
       │
       ▼
3. Rate Engine (CL-340) + Fuel Surcharge EIA + Markup Comercial (+35%)
       │
       ▼
4. Quote Snapshot (SPQ-...) con TTL de 24h
       │
       ▼
5. Checkout Server-Side Authority (Validación de Quote, Documento RUT/DNI y Precios)
       │
       ▼
6. Orden Creada (orders & order_suborders con Snapshot y Two-Leg tracking)
       │
       ├── LEG 1: Inbound USA (Amazon/Zinc -> Miami Hub) [leg1_retailer_tracking]
       │
       └── Recepción Miami Hub (Pesaje y cubicaje real -> weight_source: MEASURED)
              │
              ▼
7. Cola de Envíos (shipping_queue) & Worker Asíncrono (shipping-worker)
       │
       ▼
8. SkyPostalAdapter & SkyPostalClient (createShipment idempotente)
       │
       ├── Tracking Internacional (SKY-CL-...)
       ├── Etiqueta Oficial PDF vinculada
       └── Manifiesto Internacional & Fijación de Fuel Surcharge Final
              │
              ▼
9. Normalizador de Tracking & Alertas Accionables (DOCUMENT_REQUIRED, CUSTOMS)
       │
       ▼
10. Entrega Final de Última Milla (DELIVERED)
```

---

## C. Import Hub Isolation (Regresión Cero)

- `frontend/src/plugins/collector-import-hub/`: Cero modificaciones.
- Tablas de Import Hub (`customs_rules`, `import_couriers`, `user_import_declarations`): Intactas.
- Uruguay (`UY`) y Argentina (`AR`): Continúan operando en modo `LIVE` bajo Import Hub.
- Pruebas automatizadas de regresión (`importhub_regression.test.ts`) ejecutadas y aprobadas.

---

## D. Checkout Integration & Autoridad Server-Side

- **Validación Server-Side en `checkout-handler`**:
  - Verificación de frescura y vencimiento del `quote_id`.
  - Recálculo del precio de transporte + combustible + margen en el servidor.
  - Validación de elegibilidad aduanera (`ALLOWED` o `REGULATED`; bloqueo de `PROHIBITED`).
  - Captura del documento aduanero obligatorio (RUT para Chile, DNI para Perú, CPF para Brasil, Cédula para Colombia/Ecuador, RFC para México).
  - Persistencia inmutable del snapshot en `skypostal_quote_snapshots`.
- **Experiencia del Cliente**: Vista limpia que muestra únicamente `International Shipping: US$ XX.XX`, protegiendo la confidencialidad de los costos del proveedor y el margen comercial.

---

## E. Modelo de Datos y Separación Two-Leg

### 1. Extensión de `orders` y `order_suborders`
- `international_quote_id`: Enlace al snapshot auditado.
- `logistics_mode`: `'IMPORT_HUB' | 'SKYPOSTAL'`.
- `destination_country_code`: Código ISO de 2 letras.
- `leg1_retailer_carrier` & `leg1_retailer_tracking`: Tracking inbound en USA.
- `leg1_status`: `AWAITING_RETAILER` -> `INBOUND_TO_US_HUB` -> `RECEIVED_US_HUB`.
- `leg2_skypostal_guide` & `leg2_skypostal_tracking`: Tracking internacional SkyPostal.
- `leg2_status`: `READY_FOR_SHIPMENT` -> `SHIPMENT_CREATED` -> `LABEL_CREATED` -> `MANIFESTED` -> `IN_TRANSIT` -> `CUSTOMS` -> `OUT_FOR_DELIVERY` -> `DELIVERED` -> `EXCEPTION`.
- `measured_weight_kg` & `measured_dimensions`: Registro de pesaje real en bodega USA (`weight_source: 'MEASURED'`).

### 2. Transparencia Financiera y Auditoría de Variación
- `shipping_quote_to_customer`: Precio cobrado al cliente (inmutable históricamente).
- `shipping_provider_cost_estimated` vs `shipping_provider_cost_real`.
- `shipping_margin_estimated` vs `shipping_margin_real`.
- `fuel_estimated_percent` vs `fuel_final_percent` (fijado en la fecha del manifiesto).

---

## F. Operaciones de SkyPostal API & Adaptador

Implementadas en `SkyPostalClient` y `SkyPostalAdapter`:
1. `createShipment()`: Creación de envío con código de seguimiento (`SKY-{PAIS}-{TIMESTAMP}`), número de guía (`GUA-...`), URL de etiqueta en storage y salvaguarda de idempotencia.
2. `getShipment()`: Consulta de metadatos del envío.
3. `getTracking()`: Consulta y normalización de eventos del ciclo de vida.
4. `getLabel()`: Descarga y vinculación de etiqueta PDF oficial.
5. `createManifest()`: Generación de manifiesto por lote y fijación del Fuel Surcharge Final.
6. `classifySkyPostalError()`: Clasificación autoritativa de errores en `RETRYABLE`, `NON_RETRYABLE` y `MANUAL_REVIEW`.

---

## G. Herramientas de Super Admin

Actualizado `AdminInternationalMarkets.tsx` con tabs dedicados:
1. **Mercados & Routing**: Control de estados (`DISABLED`, `PREVIEW`, `SANDBOX`, `LIVE`) y Kill Switches por país.
2. **Envíos Two-Leg & Costos**: Trazabilidad completa de Leg 1 y Leg 2, con comparación de costos y márgenes estimados vs reales.
3. **Manual Review & Excepciones**: Cola de incidencias operativas con acciones de aprobación o rechazo.
4. **Tarifarios SkyPostal 2026**: Visualización interactiva de los 7 tarifarios contractuales.
5. **Fuel Surcharge EIA**: Matriz de 10 bandas y simulador de queroseno spot.
6. **Pricing & Margen Comercial**: Margen del 35% configurable.
7. **Manifiestos & Fuel Final**: Auditoría de lotes manifestados.
8. **Simulador General de Cotizaciones**: Diagnóstico en vivo por país.

---

## H. Suite de Tests Automatizados (67/67 Pasados)

| Suite de Tests | Archivo | Casos | Estado |
| :--- | :--- | :---: | :---: |
| Chile E2E Sandbox Pilot | `skypostal_phase3_e2e_chile.test.ts` | 1 | ✅ PASS |
| Server-Side Quote Validation | `skypostal_quote_validation.test.ts` | 4 | ✅ PASS |
| Two-Leg Logistics Separation | `skypostal_two_leg_logistics.test.ts` | 1 | ✅ PASS |
| Cost Variance & Financials | `skypostal_cost_variance.test.ts` | 2 | ✅ PASS |
| Idempotency & Retries | `skypostal_idempotency_retries.test.ts` | 3 | ✅ PASS |
| Tracking Normalizer & Alerts | `skypostal_tracking_normalizer.test.ts` | 3 | ✅ PASS |
| Compliance Aduanero | `skypostal_compliance.test.ts` | 14 | ✅ PASS |
| Motor de Paquetes & Peso | `skypostal_package_weight.test.ts` | 6 | ✅ PASS |
| Tarifarios Contractuales | `skypostal_rates.test.ts` | 7 | ✅ PASS |
| Fuel Surcharge EIA | `skypostal_fuel.test.ts` | 5 | ✅ PASS |
| Markup Comercial & Costos | `skypostal_markup_pricing.test.ts` | 3 | ✅ PASS |
| Quote Snapshots & TTL | `skypostal_quote_snapshot.test.ts` | 1 | ✅ PASS |
| SkyPostal Foundation | `skypostal_foundation.test.ts` | 6 | ✅ PASS |
| Market Engine Core | `market_engine.test.ts` | 9 | ✅ PASS |
| Import Hub Aislamiento | `importhub_regression.test.ts` | 2 | ✅ PASS |
| **TOTAL** | **15 Suites** | **67 Tests** | **✅ 100% PASS** |

---

## I. Build & Protocolo de Despliegue

1. **Build Gate:** `npm run build` ejecutado exitosamente en `frontend` con código de salida 0.
2. **Git Commit & Push:** Cambios commiteados y pusheados a `origin main`.
3. **Verificación de Producción:** Comprobado `https://collectibles.uy` respondiendo `HTTP 200 OK`.
