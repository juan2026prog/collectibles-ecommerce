# CIERRE DEFINITIVO — PRICING ENGINE & PROFIT PROTECTION INTERNACIONAL
**Collectibles.uy / Collectibles2026**  
**Fecha:** Septiembre 2026  
**Módulo:** Comercio Internacional / Catálogo Amazon & Fulfillment Zinc  
**Dictamen:** **GO TOTAL — PRODUCCIÓN CERTIFICADA Y BLINDADA**

---

## 1. Definición Oficial de Profit Protection
**Profit Protection** es el mecanismo arquitectónico de salvaguarda financiera en tiempo real que protege la rentabilidad neta de Collectibles.uy contra cualquier aumento o fluctuación imprevista en los costos de adquisición (precio de origen Amazon, fletes internos en USA, sales tax, comisiones de fulfillment automatizado Zinc, costos bancarios con tarjeta y tributos).

> **Principio Canónico:**  
> *Profit Protection NO protege un fee comercial fijo. Protege la operación real. El precio comercial base es solo un piso comercial. Todos los costos reales más la rentabilidad mínima exigida determinan el precio de venta. El fee aplicado es una consecuencia matemática, no la regla de decisión.*

---

## 2. Definición Oficial de Margen (Margin vs Markup)
El parámetro `target_margin_percent` (15.00%) representa estrictamente el **Margen Neto sobre el Precio Final de Venta**, definido como:

$$\text{Margen Neto} = \frac{\text{Ganancia Neta}}{\text{Precio Final Cobrado}} = \frac{\text{Precio Final} - \text{Costo Real}}{\text{Precio Final}}$$

Para garantizar un margen neto $M = \frac{\text{target\_margin\_percent}}{100}$, el precio mínimo necesario se despeja algebraicamente:

$$\text{Precio Protegido por Margen} = \frac{\text{Costo Real Collectibles}}{1 - M}$$

*(Ejemplo: Si Costo Real = $37.67 y Margen = 15%, Precio por Margen = $37.67 / 0.85 = $44.32. NO se utiliza el markup sobre costo $37.67 \times 1.15 = $43.32, el cual solo otorgaría un 13.04% de margen real).*

---

## 3. Fórmula Final Canónica del Motor
La fijación de precios opera bajo la siguiente jerarquía de ecuaciones matemáticas deterministas:

$$\text{Comisión Prex (sin IVA)} = (\text{Precio Amazon} \times \text{financial\_fee\_percent} / 100) + \text{financial\_fee\_fixed\_usd}$$

$$\text{Comisión Financiera Total} = \text{Comisión Prex} \times (1 + \text{financial\_fee\_tax\_rate})$$

$$\text{Sales Tax Aplicable} = \text{sales\_tax\_provider} \;\text{ó}\; [(\text{Precio Amazon} + \text{Envío USA}) \times \text{florida\_sales\_tax\_percent} / 100]$$

$$\text{Costo Real Collectibles} = \text{Precio Amazon} + \text{Envío USA} + \text{Sales Tax} + \text{Zinc Fee} + \text{Comisión Financiera Total} + \text{Otros Costos}$$

$$\text{Precio Comercial Base} = \text{Precio Amazon} + \text{Envío USA} + \text{Fee Comercial Mínimo}$$

$$\text{Precio por Ganancia Absoluta} = \text{Costo Real Collectibles} + \text{min\_absolute\_profit\_usd}$$

$$\text{Precio por Margen Porcentual} = \frac{\text{Costo Real Collectibles}}{1 - (\text{target\_margin\_percent} / 100)}$$

$$\text{Precio Final (Pre-Rounding)} = \max(\text{Precio Comercial Base},\, \text{Precio por Ganancia Absoluta},\, \text{Precio por Margen Porcentual})$$

$$\text{Precio Final} = \text{RoundUpSafe}(\text{Precio Final (Pre-Rounding)})$$

$$\text{Fee Aplicado} = \text{Precio Final} - \text{Precio Amazon} - \text{Envío USA}$$

---

## 4. Ganancia Absoluta Mínima (`min_absolute_profit_usd` / `min_profit_usd`)
- **Valor por defecto:** `USD 3.99`.
- **Propósito:** Actúa como el piso mínimo inviolable de utilidad en dólares por cada unidad vendida. Si un producto de bajo costo ($5.00) genera un margen del 15% inferior a $3.99 ($0.88), el motor activa automáticamente la protección absoluta elevando la ganancia a $3.99.
- **Unificación:** `min_profit_usd` y `min_absolute_profit_usd` son sinónimos/alias en el motor y en la base de datos `international_sync_settings` para evitar cualquier divergencia de configuración.

---

## 5. Margen Porcentual Mínimo (`target_margin_percent`)
- **Valor por defecto:** `15.00%`.
- **Propósito:** Protege la rentabilidad en productos de ticket medio y alto ($35 a $500 USD), donde una ganancia fija de $3.99 resultaría insuficiente frente a los riesgos operativos y financieros de importación.

---

## 6. Fee Comercial Base (`fixed_markup_usd` / `minimumCommercialFee`)
- **Valor por defecto:** `USD 6.00`.
- **Propósito:** Representa el recargo comercial inicial pretendido para productos estándar. Si el recargo base ($6.00) es suficiente para cubrir todos los costos reales más la rentabilidad exigida (por ejemplo en un producto de $100 con fee base de $25), el motor mantiene el precio comercial sin inflarlo innecesariamente (`pricingProtectionReason = 'commercial_fee'`).

---

## 7. Clasificación de Costos por Scope (Product-Level vs Order-Level)
| Concepto | Clasificación | Justificación en la Arquitectura Actual |
| :--- | :--- | :--- |
| **Precio Amazon** | `Product-Level` | Costo unitario de adquisición del ítem |
| **Envío USA (Domestic)** | `Product-Level` | Flete interno cobrado por el vendedor en Amazon |
| **Sales Tax** | `Product-Level` | Impuesto estatal devuelto por Amazon/Zinc para el ítem |
| **Zinc Fulfillment Fee** | `Product-Level` (1:1) | Cada línea de pedido ejecuta una orden Zinc independiente con PO único |
| **Comisión Fija Prex ($0.50)** | `Product-Level` (1:1) | Cada orden de compra Zinc procesa una transacción independiente de tarjeta |
| **Comisión Variable Prex (2.5%)** | `Percentage` | Aplicable proporcionalmente sobre el monto transaccionado |
| **IVA Financiero (22%)** | `Percentage` | IVA uruguayo aplicado sobre el total de comisiones financieras |

---

## 8. Zinc Scope Real (Auditoría Técnica)
La inspección forense de [`supabase/functions/zinc-verify-after-payment/index.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/zinc-verify-after-payment/index.ts) confirma que:
1. El backend itera sobre cada `order_item` internacional de forma atómica con RPC `claim_international_order_item_for_zinc`.
2. Para cada ítem se genera un PO determinista: `${order.order_number}-${intlOrderItem.id.slice(0, 8)}`.
3. Cada ítem dispara una llamada POST independiente a la API de Zinc con `products: [{ url, quantity }]`.
4. **Conclusión:** La relación es estrictamente **1 Producto Internacional = 1 Orden Zinc**. Por lo tanto, asignar el Zinc Fee ($1.00) por ítem refleja la realidad de costos de la plataforma.

---

## 9. Prex Fixed Scope Real
Al ejecutarse cada compra en Zinc como una operación de pago independiente con tarjeta corporativa (`use_zinc_card` / Prex), el cargo fijo de $0.50 + IVA se debita por cada orden individual de compra, justificando plenamente su cómputo por ítem en el costo real.

---

## 10. Sales Tax (Florida Sales Tax)
- **Prioridad de Datos:** Si el proveedor (Zinc Live Check o API de Amazon) devuelve el impuesto exacto cobrado (`input.salesTax`), este se utiliza de forma autoritativa.
- **Fallback Estimado:** Si no se dispone de cotización previa de impuestos, se aplica `florida_sales_tax_percent` (0% por defecto en la dirección exenta de courier).
- **Absorción Dinámica:** Cualquier sales tax cobrado se suma directamente a `realCost`, y Profit Protection eleva el precio final automáticamente para preservar la ganancia.

---

## 11. Backend Authoritative
El frontend actúa exclusivamente como interfaz de visualización (preview). El checkout internacional real, la creación de la orden en pasarela de pagos y la ejecución en Zinc son gobernados 100% por Edge Functions del backend (`zinc-live-check-before-payment`, `checkout-handler`, `zinc-verify-after-payment`), las cuales re-ejecutan `calculateCanonicalPricing` contra la base de datos `international_sync_settings`. Ningún payload alterado del cliente puede forzar un precio inferior al costo seguro.

---

## 12. Frontend Parity Suite
Se implementó la suite [`frontend/src/tests/international_pricing_parity.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/international_pricing_parity.test.ts) que evalúa 28 combinaciones cruzadas de precios, fletes, taxes y configuraciones entre [`supabase/functions/_shared/pricing.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts) y [`frontend/src/lib/internationalPricing.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/internationalPricing.ts), certificando un **100% de paridad matemática al centavo**.

---

## 13. Política de Rounding Seguro
1. Se calculan todos los componentes con máxima precisión de punto flotante.
2. Se redondea a 2 decimales (`Number.toFixed(2)`).
3. Se ejecutan dos guardas post-redondeo obligatorias:
   - **Guarda Absoluta:** Si $\text{Precio Final} - \text{Costo Real} < \text{Ganancia Mínima}$, el precio se incrementa a $\text{Costo Real} + \text{Ganancia Mínima}$.
   - **Guarda Porcentual:** Si $\frac{\text{Precio Final} - \text{Costo Real}}{\text{Precio Final}} < \text{Margen Mínimo}$, el precio se incrementa a $\frac{\text{Costo Real}}{1 - \text{Margen}}$.
4. Se garantiza que ningún redondeo reduzca la rentabilidad por debajo del objetivo.

---

## 14. Fail-Safe y Contingencias
- Si la configuración en base de datos es nula o inaccesible, el motor recurre a valores de salvaguarda calibrados (`min_absolute_profit: $3.99`, `target_margin: 15%`, `zinc_fee: $1.00`, `prex_fee: 2.5% + $0.50 + 22% IVA`), impidiendo ventas a pérdida.
- Si un producto experimenta una subida de precio post-pago que vulnere el margen, `zinc-verify-after-payment` bloquea el auto-despacho y traslada la orden a estado `manual_review` con razón `PRICE_CHANGED`.

---

## 15. Inmutabilidad de Órdenes Históricas
Las órdenes ya pagadas y completadas almacenan snapshots inmutables en `orders` e `international_order_items` (`acquisition_cost_usd`, `final_price_usd`, `expected_profit_usd`, `zinc_error_message`). Los cambios en tarifas o reglas de sincronización solo aplican hacia adelante sobre el catálogo y nuevos checkouts.

---

## 16. Historial de Migraciones Supabase
- Migración aplicada y registrada: `20261216000000_international_dynamic_profit_protection.sql`.
- Coherencia en `supabase_migrations.schema_migrations`: Versión `20261216000000` registrada y validada en Supabase (0 drift local/remoto).

---

## 17. Resultados de Suites de Pruebas Automatizadas
Se ejecutaron **181 tests en 23 suites**, con un resultado de **100% PASS**:

```bash
✓ src/tests/international_dynamic_profit_protection.test.ts (10 tests)
✓ src/tests/international_pricing_parity.test.ts (28 tests)
✓ src/tests/international_pricing_real_function.test.ts (5 tests)
✓ src/tests/international_margin_adjustment.test.ts (9 tests)
✓ src/tests/admin_international_products_cost_ui.test.tsx (3 tests)
✓ src/tests/international_storefront_checkout_integration.test.ts (9 tests)
✓ src/tests/international_category_resolver.test.ts (12 tests)
✓ src/tests/seo_audit_verification.test.ts (6 tests)
... (15 suites adicionales de catálogo, exportación, logística y auth)

Test Files  23 passed (23)
Tests       181 passed (181)
Vite Build  ✓ built in 17.80s (exit code 0)
```

---

## 18. Matriz de Escenarios Reales Verificados

```
================================================================================
ESCENARIO 1: Amazon $34.99 + Zinc $1.00 + Margen 15% (Caso Base Actual)
================================================================================
Precio Amazon:                 USD 34.99
Envío USA:                     USD  0.00
Zinc Fee:                      USD  1.00
Prex Fee + IVA:                USD  1.68
--------------------------------------------------------------------------------
COSTO REAL COLLECTIBLES:       USD 37.67
1. Precio Comercial Base:      USD 40.99 ($34.99 + $6.00)
2. Precio por Ganancia Mínima: USD 41.66 ($37.67 + $3.99)
3. Precio por Margen 15%:      USD 44.32 ($37.67 / 0.85)
--------------------------------------------------------------------------------
PRECIO FINAL COLLECTIBLES:     USD 44.32 (🛡 Margen mínimo 15%)
Fee Aplicado:                  USD  9.33
Ganancia Neta Real:            USD  6.65 (15.00% del Final)

================================================================================
ESCENARIO 2: Zinc Sube a USD 4.00 (Tarifa Elevada de Proveedor)
================================================================================
Precio Amazon:                 USD 34.99
Envío USA:                     USD  0.00
Zinc Fee:                      USD  4.00
Prex Fee + IVA:                USD  1.68
--------------------------------------------------------------------------------
COSTO REAL COLLECTIBLES:       USD 40.67
1. Precio Comercial Base:      USD 40.99
2. Precio por Ganancia Mínima: USD 44.66 ($40.67 + $3.99)
3. Precio por Margen 15%:      USD 47.85 ($40.67 / 0.85)
--------------------------------------------------------------------------------
PRECIO FINAL COLLECTIBLES:     USD 47.85 (🛡 Margen mínimo 15%)
Fee Aplicado:                  USD 12.86
Ganancia Neta Real:            USD  7.18 (15.00% del Final)

================================================================================
ESCENARIO 3: Margen Desactivado (0%) — Piso de Ganancia Absoluta Activo
================================================================================
Costo Real:                    USD 37.67
Precio Final:                  USD 41.66 (🛡 Ganancia mínima $3.99)
Ganancia Neta Real:            USD  3.99

================================================================================
ESCENARIO 4: Fee Comercial Base Suficiente (Amazon $100, Fee $25)
================================================================================
Costo Real:                    USD 104.66
1. Comercial Base:             USD 125.00 ($100.00 + $25.00)
2. Ganancia Mínima:            USD 108.65 ($104.66 + $3.99)
3. Margen 15%:                 USD 123.13 ($104.66 / 0.85)
--------------------------------------------------------------------------------
PRECIO FINAL:                  USD 125.00 (✓ Fee base suficiente)
Ganancia Neta Real:            USD  20.34 (16.27% del Final)
================================================================================
```

---

## 19. QA de Producción e Interfaces Admin
- **Panel `/admin/internacional/productos`:** Muestra badges dinámicos específicos (`🛡 Margen mínimo (15%)`, `🛡 Ganancia mínima ($3.99)` ó `✓ Fee base suficiente`), tooltips de auditoría comparativa y desglose visual del margen neto % de cada ítem.
- **Panel `/admin/internacional/sincronizacion`:** Incluye inputs para todas las variables financieras, textos explicativos oficiales y el simulador en vivo actualizado.
- **Storefront y Checkout:** Ningún costo interno o estructura de fees se expone al cliente final; únicamente se muestra el precio final en USD y su equivalente en UYU.

---

## 20. Dictamen Final
### **ESTADO: GO TOTAL — MOTOR DE PRICING CERRADO Y CERTIFICADO**
El motor internacional de `Collectibles2026` cumple rigurosamente con los 50 puntos de la auditoría y directivas de arquitectura. Queda permanentemente blindado contra cualquier venta a pérdida o erosión de margen operativo.
