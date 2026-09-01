# CERTIFICACIÓN OPERACIONAL FINAL — PRICING ENGINE & PROFIT PROTECTION
**Collectibles.uy / Collectibles2026**  
**Fecha:** Septiembre 2026  
**Módulo:** Comercio Internacional / Amazon USA Catalog & Zinc Auto-Fulfillment  
**Dictamen:** **GO TOTAL — MOTOR DE PRICING CERTIFICADO Y CERRADO**

---

## 1. Executive Summary
El presente documento constituye la auditoría técnica y certificación operacional del **Pricing Engine Internacional y Profit Protection** de `Collectibles2026`. Se evaluó la arquitectura real de adquisición, la prioridad de sales tax, la inmutabilidad de órdenes históricas, la invulnerabilidad ante manipulación de precios desde el cliente, la gobernanza del backend autoritativo, el manejo de errores en límites numéricos y la paridad frontend/backend.

---

## 2. Zinc Fee Scope Real (Evidencia Código)
- **Ruta del código:** [`supabase/functions/zinc-verify-after-payment/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts#L106-L265)
- **Comportamiento Actual:**
  - En la línea 106: `for (const item of order.order_items)` itera sobre cada producto internacional comprado.
  - En la línea 144: Ejecuta RPC atómica `claim_international_order_item_for_zinc` para bloqueo exclusivo.
  - En la línea 244: Genera un PO único: `${order.order_number}-${intlOrderItem.id.slice(0, 8)}`.
  - En la línea 246-275: Despacha una orden POST individual a `https://api.zinc.com/orders` con `payment_method: { use_zinc_card: true }`.
- **Dictamen:** **PASS**. Zinc cobra su tarifa por orden creada en API. Al despacharse cada ítem como una orden Zinc independiente con PO único, cobrar **$1.00 USD por producto** representa con exactitud la economía real del proveedor.

---

## 3. Prex Fixed Fee Scope Real ($0.50 + IVA)
- **Ruta del código:** [`supabase/functions/_shared/pricing.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts#L187-L210)
- **Comportamiento Actual:** Cada orden en Zinc ejecuta un débito con tarjeta prepaga corporativa, incurriendo en el costo financiero por operación en el exterior ($0.50 + 2.5% + 22% IVA).
- **Dictamen:** **PASS**. El cargo fijo financiero se aplica por cada compra en origen ejecutada.

---

## 4. Clasificación de Costos por Scope
| Concepto | Clasificación | Fuente | Momento de Cálculo | Configurable | Backend Authoritative |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Precio Amazon** | `Product-Level` | Zinc / Amazon BuyBox | Sync / Live Check | No | Sí (Edge Function) |
| **Envío USA** | `Product-Level` | Amazon / Catalog DB | Sync / Live Check | No | Sí (Edge Function) |
| **Sales Tax** | `Product-Level` | Provider / Config | Live Check / Sync | Sí | Sí (Edge Function) |
| **Zinc Fee ($1.00)** | `Product-Level` (1:1 PO) | `international_sync_settings` | Real-time | Sí | Sí (Edge Function) |
| **Prex Fijo ($0.50)** | `Product-Level` (1:1 Tx) | `international_sync_settings` | Real-time | Sí | Sí (Edge Function) |
| **Prex % (2.5%)** | `Percentage` | `international_sync_settings` | Real-time | Sí | Sí (Edge Function) |
| **IVA Financiero (22%)**| `Percentage` | `international_sync_settings` | Real-time | Sí | Sí (Edge Function) |

---

## 5. Comportamiento Multiproducto
En una compra con 3 productos internacionales distintos (ej. A: $20, B: $50, C: $100):
- **Costo Real A:** $22.22 (Zinc $1.00 + Prex $1.22)
- **Costo Real B:** $53.13 (Zinc $1.00 + Prex $2.13)
- **Costo Real C:** $104.66 (Zinc $1.00 + Prex $3.66)
- **Costo Real Total:** $180.01 (Zinc total = $3.00, Prex fijo total = $1.50).
- **Dictamen:** **PASS** (Verificado en `international_operational_certification.test.ts`).

---

## 6. Sales Tax & Prioridad de Datos
- **Ruta del código:** [`supabase/functions/_shared/pricing.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts#L195-L200)
- **Regla:**
  ```ts
  const salesTax = input.salesTax != null
    ? Number(input.salesTax)
    : Number(((amazonPrice + usaShipping) * flSalesTaxPct).toFixed(6));
  ```
- **Evidencia Test:**
  - Amazon $34.99 sin tax $\to$ Costo Real $37.67, Final $44.32.
  - Amazon $34.99 + Tax real $2.45 $\to$ Costo Real sube a $40.12 (+$2.45), Final sube a $47.20.
- **Dictamen:** **PASS**. El tax real del proveedor tiene prioridad absoluta y es absorbido automáticamente.

---

## 7. Live Check & Repricing
- **Ruta del código:** [`supabase/functions/zinc-live-check-before-payment/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-live-check-before-payment/index.ts#L76-L125)
- **Comportamiento:** Si el precio de Amazon sube entre la visita al catálogo ($34.99) y el checkout ($39.99), Live Check re-evalúa `calculateCanonicalPricing`, elevando el precio a $50.38 para garantizar $7.56 de ganancia (15.00% de margen) e impidiendo comprar a pérdida.
- **Dictamen:** **PASS**.

---

## 8. Backend Authoritative
- **Ruta del código:** [`supabase/functions/checkout-handler/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/checkout-handler/index.ts#L88-L130) y [`create-order/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts#L267-L295)
- **Comportamiento:** La pasarela y creación de orden extraen el precio y las reglas directamente desde la base de datos `international_products` y `international_sync_settings`. El backend es la **única autoridad**.

---

## 9. Test de Manipulación de Precios (Price Tampering Defense)
- **Evidencia Test:** En `international_operational_certification.test.ts` (Control 5), se simuló un cliente alterando el payload para enviar `clientClaimedPrice = 30.00` sobre un producto de $44.32.
- **Resultado:** El backend descartó completamente las cifras del cliente y calculó el precio canónico server-side ($44.32), garantizando la integridad financiera.
- **Dictamen:** **PASS**.

---

## 10. Fail-Safe de Configuración y Defensa de Límites
- **Rutas del código:** [`supabase/functions/_shared/pricing.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts#L235-L275)
- **Casos probados:**
  - `config = undefined` $\to$ Utiliza fallbacks seguros calibrados (Costo > $34.99, Final > Costo).
  - `target_margin_percent = -5` $\to$ Prevalece el piso de ganancia absoluta ($41.66).
  - `target_margin_percent = 100` ó `120` $\to$ La guarda `targetMarginDecimal < 1` previene divisiones por cero o valores `Infinity`/`NaN`.
- **Dictamen:** **PASS**.

---

## 11. Inmutabilidad de Órdenes Históricas
- Las órdenes pagadas registran un snapshot inmutable en `orders` e `international_order_items` (`final_price_usd`, `acquisition_cost_usd`, `expected_profit_usd`).
- **Evidencia Test:** Modificar la tarifa de Zinc de $1.00 a $4.00 actualiza los precios futuros del catálogo ($44.32 $\to$ $47.85), mientras que las órdenes históricas permanecen intactas en $44.32.
- **Dictamen:** **PASS**.

---

## 12. Checkout Repricing ante Cambio de Configuración
Si el administrador modifica tarifas en `/admin/internacional/sincronizacion` (ej. Zinc $1 $\to$ $4$), la siguiente ejecución de Live Check o checkout consume inmediatamente `international_sync_settings` actualizado, aplicando el nuevo precio ($47.85) sin necesidad de deploys ni reinicios.

---

## 13. Frontend / Backend Parity
- **Suite:** [`frontend/src/tests/international_pricing_parity.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/international_pricing_parity.test.ts)
- **Escenarios cubiertos (28 tests):**
  - Precios bajos ($12.99), medios ($34.99), con flete USA ($5.50), con Sales Tax ($2.45), ticket alto ($89.00, $150.00, $350.00).
  - Variaciones de configuración: Default (15% margin), Zinc $4.00, Margen 0% (Absolute floor), High Commercial Markup ($25.00).
- **Resultado:** 100% de coincidencia exacta en `realCost`, `finalPrice`, `appliedFee`, `estimatedProfit`, `netMarginPercentage`, `pricingProtectionReason`.
- **Dictamen:** **PASS**.

---

## 14. Política de Rounding
- Se redondea a 2 decimales (`Number.toFixed(2)`).
- Dos guardas deterministas garantizan que $\text{Profit} \ge \text{min\_absolute\_profit}$ y $\text{Net Margin} \ge \text{target\_margin\_percent}$.
- **Dictamen:** **PASS**.

---

## 15. Razón de Protección (`pricingProtectionReason`)
- Asignación determinista:
  - `'target_margin'`: Cuando el margen del 15% sobre precio final es la condición dominante ($44.32).
  - `'absolute_profit'`: Cuando el piso de ganancia absoluta ($3.99) es la condición dominante ($10.75 en ítem de $5).
  - `'commercial_fee'`: Cuando el fee comercial base es suficiente ($125.00 en ítem de $100 con fee $25).
- **Dictamen:** **PASS**.

---

## 16. Historial de Migraciones Supabase
- Versión registrada: `20261216000000_international_dynamic_profit_protection.sql`.
- Coherencia en `supabase_migrations.schema_migrations`: Registrada en Supabase (0 drift local/remoto).
- **Dictamen:** **PASS**.

---

## 17. RLS & Seguridad de Datos
- `international_sync_settings`: `is_admin()` requerido para modificaciones. Lectura pública permitida.
- `international_products`: Solo administradores pueden insertar, actualizar o eliminar.
- **Dictamen:** **PASS**.

---

## 18. Idempotencia y Reintentos
- La función RPC `claim_international_order_item_for_zinc` asegura que un reintento de webhook o network retry no genere órdenes duplicadas en Zinc ni débitos dobles.
- **Dictamen:** **PASS**.

---

## 19. Verificación de Producción e Interfaces Admin
- **`/admin/internacional/productos`:** Despliega badges dinámicos (`🛡 Margen mínimo (15%)`, `🛡 Ganancia mínima ($3.99)`, `✓ Fee base suficiente`), tooltips de cálculo y márgenes netos.
- **`/admin/internacional/sincronizacion`:** Controles dinámicos y simulador en vivo interactivo.
- **Storefront:** Cero exposición de costos internos o comisiones al usuario final.

---

## 20. Hallazgos de Auditoría y Correcciones Mínimas Realizadas
1. **Descubrimiento:** En `pricing.ts` y `internationalPricing.ts`, la guarda de rounding no validaba `targetMarginDecimal < 1`, lo que en configuraciones extremas de prueba (`target_margin_percent = 100`) generaba `Infinity`.
2. **Corrección Mínima:** Se incorporó la condición `targetMarginDecimal < 1` en la guarda de redondeo de ambos motores, blindando el cálculo contra límites numéricos.

---

## 21. Tabla Final de Controles Operacionales
| Control | Resultado | Evidencia |
| :--- | :---: | :--- |
| **Zinc fee scope (1:1)** | **PASS** | [`zinc-verify-after-payment/index.ts:106`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts#L106), PO determinista por ítem |
| **Prex fixed scope (1:1)** | **PASS** | [`pricing.ts:187`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts#L187), débito por orden en origen |
| **Multi-item order aggregation** | **PASS** | `international_operational_certification.test.ts:25` (3 ítems $\to$ $180.01) |
| **Sales Tax real priority** | **PASS** | `pricing.ts:195`, `international_operational_certification.test.ts:48` (+$2.45 tax $\to$ +$2.45 costo) |
| **Backend authoritative** | **PASS** | `checkout-handler/index.ts:88`, `create-order/index.ts:267` |
| **Price tampering defense** | **PASS** | `international_operational_certification.test.ts:85` ($30 payload $\to$ $44.32 forzado) |
| **Missing config fail-safe** | **PASS** | `international_operational_certification.test.ts:108` (undefined/negative/100% margin) |
| **Historical snapshots inmutable** | **PASS** | `international_operational_certification.test.ts:150` (Zinc 1 $\to$ 4 no altera órdenes pasadas) |
| **Live Check repricing** | **PASS** | `zinc-live-check-before-payment/index.ts:81`, `operational_certification.test.ts:175` |
| **Config change repricing** | **PASS** | `AdminInternationalSync.tsx:510`, lectura directa de DB |
| **Parity Backend/Frontend** | **PASS** | `international_pricing_parity.test.ts` (28 tests al 100% de coincidencia) |
| **Rounding Integrity** | **PASS** | `international_dynamic_profit_protection.test.ts:212` (ganancia y margen garantizados) |
| **Migration history** | **PASS** | `supabase_migrations.schema_migrations` contiene versión `20261216000000` |
| **RLS / Security** | **PASS** | `is_admin()` requerido en `international_sync_settings` |
| **Idempotency** | **PASS** | `claim_international_order_item_for_zinc` RPC en `zinc-verify-after-payment` |
| **Production UI** | **PASS** | `/admin/internacional/productos` y `/admin/internacional/sincronizacion` verificados |

---

## 22. Dictamen Final
### **ESTADO: GO TOTAL (MOTOR CERRADO Y CERTIFICADO PARA PRODUCCIÓN)**
Todos los controles operacionales y de seguridad han obtenido dictamen **PASS**. El Pricing Engine Internacional de `Collectibles2026` está formalmente cerrado, blindado y certificado para operar en producción.
