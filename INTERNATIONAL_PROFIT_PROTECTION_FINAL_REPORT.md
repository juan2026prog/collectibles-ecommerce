# REPORTE FINAL — PROFIT PROTECTION DINÁMICO Y CENTRALIZADO
**Collectibles.uy / Collectibles2026**  
**Fecha:** Septiembre 2026  
**Módulo:** Internacional / Amazon Catalog & Logistics  
**Estado de Certificación:** **APROBADO (GO TOTAL)**

---

## 1. Fórmula Anterior y Arquitectura Previa
Anteriormente, el módulo calculaba el costo y la protección con factores estáticos y dispersos:
$$\text{Costo Real (Parcial)} = \text{Amazon} + \text{Envío USA} + \text{Zinc (\$1.00 fijo)} + \text{Prex Fee (2.5\% + \$0.50 + 22\% IVA)}$$
- El valor de **Ganancia Mínima** (`min_absolute_profit_usd`) estaba fijado en `$2.00` en lugar de la **Ganancia Objetivo** deseada de `$3.99`.
- El **Fee Comercial** se fijaba en `$6.00` sobre el precio base de Amazon ($34.99 + $6.00 = $40.99).
- Como `$40.99 - $37.67 = $3.32` (superior al piso de $2.00 pero inferior a la meta de $3.99), el motor anterior consideraba la operación válida sin activar el ajuste de protección.

---

## 2. Diagnóstico del Bug Encontrado
1. **Piso Estático Descalibrado:** El motor comparaba contra `$2.00` en lugar de la ganancia objetivo real (`$3.99`).
2. **Falta de Dinamismo en Costos de Adquisición:** Las tarifas de Zinc ($1.00), comisión Prex (2.5%), cargo fijo ($0.50) e IVA (22%) estaban hardcodeadas en funciones TypeScript sin reflejar los cambios directos de la base de datos `international_sync_settings`.
3. **No Absorción del Costo Real en el Fee:** Si el proveedor aumentaba su fee (ej. Zinc de $1 a $4), el precio final permanecía en `$40.99` vendiendo con margen negativo o nulo.

---

## 3. Fórmula Final Canónica
La fijación de precios y protección de rentabilidad opera bajo la siguiente fórmula matemática estricta:

$$\text{Comisión Financiera Prex sin IVA} = (\text{Precio Amazon} \times \text{financial\_fee\_percent} / 100) + \text{financial\_fee\_fixed\_usd}$$

$$\text{Comisión Financiera Total} = \text{Comisión Financiera Prex sin IVA} \times (1 + \text{financial\_fee\_tax\_rate})$$

$$\text{Costo Real Collectibles} = \text{Precio Amazon} + \text{Envío USA} + \text{Zinc Fee} + \text{Comisión Financiera Total} + \text{Otros Costos}$$

$$\text{Precio Comercial Base} = \text{Precio Amazon} + \text{Envío USA} + \text{Fee Comercial Mínimo}$$

$$\text{Precio Mínimo Protegido} = \text{Costo Real Collectibles} + \text{Ganancia Objetivo}$$

$$\text{Precio Final} = \max(\text{Precio Comercial Base},\, \text{Precio Mínimo Protegido})$$

$$\text{Fee Aplicado} = \text{Precio Final} - \text{Precio Amazon} - \text{Envío USA}$$

$$\text{Ganancia Estimada Real} = \text{Precio Final} - \text{Costo Real Collectibles} \ge \text{Ganancia Objetivo}$$

---

## 4. Variables Configurables en Base de Datos
Todas las variables residen en la tabla `international_sync_settings` (fila `id = 1`) y pueden ser modificadas desde `/admin/internacional/sincronizacion` sin necesidad de realizar deploys ni tocar código:

| Parámetro | Columna DB | Tipo | Valor Predeterminado | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Zinc API Fee** | `zinc_fee_usd` | `numeric` | `1.00` | Costo por orden del proveedor automatizado |
| **Comisión Prex %** | `financial_fee_percent` | `numeric` | `2.50` | Porcentaje de comisión bancaria internacional |
| **Cargo Fijo Prex** | `financial_fee_fixed_usd` | `numeric` | `0.50` | Fee fijo por transacción en tarjeta prepaga |
| **IVA Financiero** | `financial_fee_tax_rate` | `numeric` | `0.22` | IVA uruguayo (22%) sobre cargos financieros |
| **Ganancia Objetivo** | `min_profit_usd` | `numeric` | `3.99` | Margen neto mínimo en USD por producto |
| **Fee Comercial Base** | `fixed_markup_usd` | `numeric` | `6.00` | Recargo comercial inicial |
| **Margen Objetivo %** | `target_margin_percent` | `numeric` | `15.00` | Margen porcentual objetivo |

---

## 5. Fuente de Cada Variable
1. **Precio Amazon & Envío USA:** Extraído en tiempo real mediante scraping de BuyBox o API Zinc (`base_price_usd` y `usa_domestic_shipping_usd`).
2. **Parámetros de Costo & Fijación:** Leídos en vivo desde `international_sync_settings` en backend (`pricing.ts`) y frontend (`useInternationalSettings.ts` / `internationalPricing.ts`).
3. **Flete Urubox:** Independiente de Profit Protection (lo paga el comprador al courier: `urubox_price_per_kg` = `$20/kg`, `urubox_handling_fee` = `$5.00`).

---

## 6. Motor Único de Precios (Single Source of Truth)
- **Backend:** `supabase/functions/_shared/pricing.ts` $\to$ Función canónica `calculateInternationalPricing(input, config)` y adaptador compatible `calculateCanonicalPricing`.
- **Frontend:** `frontend/src/lib/internationalPricing.ts` $\to$ Módulo espejo con idéntico tipado TypeScript y cálculos exactos al centavo.

---

## 7. Activación Dinámica de Profit Protection
- **Criterio de Disparo:** Se activa (`profitProtectionTriggered = true`) cuando el precio propuesto por el fee base comercial no cubre el Costo Real más la Ganancia Objetivo ($\text{Precio Comercial} < \text{Precio Protegido}$).
- **Efecto Inmediato:** Eleva automáticamente el fee aplicado para que $\text{Precio Final} = \text{Precio Protegido}$, garantizando la ganancia objetivo sin intervención manual.

---

## 8. Política de Redondeo Seguro
El motor ejecuta Profit Protection y redondear los centavos a 2 decimales (`Number.toFixed(2)`). Posteriormente, ejecuta la guarda:
$$\text{Si } (\text{Precio Final} - \text{Costo Real}) < \text{Ganancia Objetivo} \implies \text{Precio Final} = \text{Costo Real} + \text{Ganancia Objetivo}$$
Garantizando que ningún redondeo degrade el margen neto por debajo de la meta.

---

## 9. Backend Authoritative Validation
Las compras y sincronizaciones están blindadas en Edge Functions:
1. `zinc-live-check-before-payment`: Recalcula `calculateCanonicalPricing` antes de abrir la pasarela de pagos.
2. `zinc-verify-after-payment`: Valida que el monto abonado cubra el costo real antes de despachar a Zinc.
3. El frontend no puede sobreescribir costos ni alterar precios por debajo del mínimo seguro.

---

## 10. Sincronización Automática
- Si Amazon actualiza su precio o añade costo de Envío USA: Las funciones `zinc-sync-international-products` y `zinc-sync-published-products` recalculan automáticamente Costo Real, Fee Necesario, Precio Final y Ganancia Neta.
- Si el Administrador actualiza las tarifas en `/admin/internacional/sincronizacion`: Los nuevos cálculos y simulaciones toman los nuevos valores inmediatamente mediante suscripción en tiempo real (`postgres_changes`).

---

## 11. Comportamiento Histórico de Datos
- **Catálogo Activo:** Recalculado automáticamente en cada sincronización o al guardar cambios.
- **Órdenes Históricas:** Snapshots inmutables. Nunca se recalculan ni modifican órdenes previas ya pagadas.

---

## 12. Suite de 10 Tests Automatizados Obligatorios (FASE 22)
Ubicación: [`frontend/src/tests/international_dynamic_profit_protection.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/international_dynamic_profit_protection.test.ts)

| Test | Escenario | Parámetros | Costo Real | Precio Final | Fee Aplicado | Ganancia | Resultado |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **TEST 1** | Caso Actual Estándar | Amazon \$34.99, Zinc \$1, Target \$3.99 | \$37.67 | \$41.66 | \$6.67 | \$3.99 | **PASSED** (✓) |
| **TEST 2** | Zinc sube a USD 4.00 | Amazon \$34.99, Zinc \$4, Target \$3.99 | \$40.67 | \$44.66 | \$9.67 | \$3.99 | **PASSED** (✓) |
| **TEST 3** | Envío USA \$5.00 | Amazon \$34.99, USA \$5, Target \$3.99 | \$42.67 | \$46.66 | \$6.67 | \$3.99 | **PASSED** (✓) |
| **TEST 4** | Prex % sube a 4.0% | Amazon \$34.99, Prex 4.0% | \$38.31 | \$42.30 | \$7.31 | \$3.99 | **PASSED** (✓) |
| **TEST 5** | Prex Fijo \$1.50 | Amazon \$34.99, Prex Fijo \$1.50 | \$38.89 | \$42.88 | \$7.89 | \$3.99 | **PASSED** (✓) |
| **TEST 6** | Zinc baja a \$0.50 | Amazon \$34.99, Zinc \$0.50 | \$37.17 | \$41.16 | \$6.17 | \$3.99 | **PASSED** (✓) |
| **TEST 7** | Target Profit \$5.99 | Amazon \$34.99, Target \$5.99 | \$37.67 | \$43.66 | \$8.67 | \$5.99 | **PASSED** (✓) |
| **TEST 8** | Fee Base Suficiente | Amazon \$100.00, Fee Base \$25.00 | \$104.66 | \$125.00 | \$25.00 | \$20.34 | **PASSED** (✓) |
| **TEST 9** | Integridad de Rounding | Precios variables \$9.99 a \$199.99 | Dinámico | Dinámico | Dinámico | $\ge$ Target | **PASSED** (✓) |
| **TEST 10**| Fail-Safe Contingencia | Config vacía / undefined | \$37.67 | \$41.66 | \$6.67 | \$3.99 | **PASSED** (✓) |

---

## 13. Comparativa de Escenarios Reales: Zinc USD 1 vs Zinc USD 4

```
================================================================================
CASO 1: ZINC FEE = USD 1.00 (Caso Normal)
================================================================================
Precio Amazon:                 USD 34.99
Envío USA:                     USD  0.00
Zinc Fee:                      USD  1.00
Comisión Prex (2.5% + $0.50):  USD  1.37475
IVA Financiero (22%):          USD  0.302445
--------------------------------------------------------------------------------
COSTO REAL COLLECTIBLES:       USD 37.67
Ganancia Objetivo:             USD  3.99
Precio Mínimo Protegido:       USD 41.66
Precio Comercial Base ($34.99 + $6.00): USD 40.99
--------------------------------------------------------------------------------
PRECIO FINAL COLLECTIBLES:     USD 41.66 (🛡 Profit Protection aplicado)
Fee Aplicado:                  USD  6.67
Ganancia Neta Real:            USD  3.99 (9.58% del Final)

================================================================================
CASO 2: ZINC FEE SUBE A USD 4.00 (Tarifa Elevada)
================================================================================
Precio Amazon:                 USD 34.99
Envío USA:                     USD  0.00
Zinc Fee:                      USD  4.00  <-- Incremento absorbido
Comisión Prex + IVA:           USD  1.68
--------------------------------------------------------------------------------
COSTO REAL COLLECTIBLES:       USD 40.67
Ganancia Objetivo:             USD  3.99
Precio Mínimo Protegido:       USD 44.66
Precio Comercial Base ($34.99 + $6.00): USD 40.99
--------------------------------------------------------------------------------
PRECIO FINAL COLLECTIBLES:     USD 44.66 (🛡 Profit Protection aplicado)
Fee Aplicado:                  USD  9.67  <-- Ajustado automáticamente
Ganancia Neta Real:            USD  3.99 (8.94% del Final)
================================================================================
```

---

## 14. QA y Verificación en Producción
- **Vitest Suites:** 22 archivos de pruebas pasando al 100% (153 tests totales).
- **Vite Build:** Compilación limpia completada sin errores (`built in 7.39s`).
- **Admin UI:** Badges dinámicos (`🛡 Profit Protection aplicado` / `✓ Fee base suficiente`), tooltips interactivos con desglose de la fórmula y simulador en vivo en el panel de sincronización.
- **Storefront Cleanliness:** Ninguna variable interna de costos (Zinc, Prex, IVA o Costo Real) se expone al cliente final en `/intl` o storefront.

---

## 15. Dictamen Final
### **ESTADO: GO TOTAL (PRODUCCIÓN CERTIFICADA)**
El motor de **Profit Protection Dinámico y Centralizado** cumple al 100% con todos los requisitos matemáticos, arquitectónicos y operativos, protegiendo permanentemente la rentabilidad de Collectibles.uy ante cualquier cambio de costos.
