# CIERRE FINAL DEFINITIVO — SEGURIDAD Y PRIVACIDAD DEL PRICING ENGINE
**Collectibles.uy / Collectibles2026**  
**Fecha:** Septiembre 2026  
**Módulo:** Comercio Internacional / Catálogo Amazon & Fulfillment Zinc  
**Dictamen:** **GO TOTAL DEFINITIVO — MOTOR BLINDADO, PRIVADO Y CERRADO**

---

## 1. Config Validation Anterior
Anteriormente, el sistema validaba principalmente que la ganancia mínima no fuera negativa y que no se vendiera a pérdida (`never_sell_at_loss`). Ciertos límites numéricos extremos (`target_margin_percent >= 100`, inputs negativos o tipos de datos no numéricos) dependían de la sanitización implícita en JavaScript, permitiendo potencialmente valores anómalos si se intentaban forzar directamente en la base de datos o mediante peticiones API desacopladas.

---

## 2. Riesgo Encontrado
1. **Riesgo Financiero (Config Corrupta):** Si un administrador ingresaba accidentalmente un margen de `120%` o un valor negativo, una división por cero (`1 - 1.20 = -0.20`) o conversión a `Infinity`/`0` podría haber afectado el cálculo de precios.
2. **Riesgo de Privacidad (Data Exposure):** La tabla `international_sync_settings` mantenía activa una política RLS permisiva de lectura pública (`Allow public read on international_sync_settings`), permitiendo que usuarios anónimos o competidores consultaran directamente las comisiones de Zinc ($1.00), tasas Prex (2.5% + $0.50 + 22% IVA) y márgenes comerciales de la plataforma.

---

## 3. Validación Admin Final
- **Ruta:** [`frontend/src/pages/admin/AdminInternationalSync.tsx`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminInternationalSync.tsx#L61-L125)
- **Validaciones Inline en Formulario:**
  - `target_margin_percent`: Rango estricto `[0, 99.99]%`. Mensaje: *"El margen objetivo debe estar entre 0% y 99,99%."*
  - `min_absolute_profit_usd`: Mínimo `USD 0.00`. Mensaje: *"La ganancia mínima no puede ser negativa."*
  - `zinc_fee_usd`: Mínimo `USD 0.00`. Mensaje: *"El costo de Zinc no puede ser negativo."*
  - `financial_fee_percent`: Rango `[0, 99.99]%`. Mensaje: *"El porcentaje financiero debe estar entre 0% y 99,99%."*
  - `financial_fee_fixed_usd`: Mínimo `USD 0.00`. Mensaje: *"El fee fijo financiero no puede ser negativo."*
  - `financial_fee_tax_rate`: Rango `[0, 0.999]`. Mensaje: *"La tasa de IVA financiero debe ser un valor decimal entre 0 y 0.99."*
  - `florida_sales_tax_percent`: Rango `[0, 99.99]%`. Mensaje: *"El porcentaje de sales tax estimado debe estar entre 0% y 99,99%."*
  - `fixed_markup_usd`: Mínimo `USD 0.00`. Mensaje: *"El markup comercial base no puede ser negativo."*

---

## 4. Constraints DB en Supabase
- **Migración:** `supabase/migrations/20261216010000_international_settings_security_and_validation.sql`
- **CHECK Constraints Aplicados en Postgres:**
  - `check_target_margin_valid_range`: `CHECK (target_margin_percent >= 0 AND target_margin_percent < 100)`
  - `check_min_absolute_profit_non_negative`: `CHECK (min_absolute_profit_usd >= 0)`
  - `check_min_profit_non_negative`: `CHECK (min_profit_usd >= 0)`
  - `check_zinc_fee_non_negative`: `CHECK (zinc_fee_usd >= 0)`
  - `check_financial_fee_fixed_non_negative`: `CHECK (financial_fee_fixed_usd >= 0)`
  - `check_financial_fee_percent_range`: `CHECK (financial_fee_percent >= 0 AND financial_fee_percent < 100)`
  - `check_financial_fee_tax_rate_range`: `CHECK (financial_fee_tax_rate >= 0 AND financial_fee_tax_rate < 1)`
  - `check_florida_sales_tax_percent_range`: `CHECK (florida_sales_tax_percent >= 0 AND florida_sales_tax_percent < 100)`
  - `check_fixed_markup_non_negative`: `CHECK (fixed_markup_usd >= 0)`
  - `check_never_sell_at_loss_mandatory`: `CHECK (never_sell_at_loss = true)`

---

## 5. Backend Fail-Closed & Validación
- **Rutas:** [`supabase/functions/_shared/pricing.ts`](file:///c:/Projects/Collectibles2026/supabase/functions/_shared/pricing.ts#L125-L210) y [`frontend/src/lib/internationalPricing.ts`](file:///c:/Projects/Collectibles2026/frontend/src/lib/internationalPricing.ts#L125-L210)
- **Funciones:**
  - `validateInternationalPricingConfig(config)`: Retorna `{ valid: boolean, errors: string[] }`.
  - `assertValidInternationalPricingConfig(config)`: Lanza excepción `INTERNATIONAL_PRICING_CONFIG_INVALID` si algún parámetro viola los límites.
- **Fail-Closed:** Si una orden o checkout recibe una configuración corrupta o alterada, la compra se detiene de forma controlada en lugar de vender con menor margen o a pérdida.

---

## 6. Rangos Válidos Aceptados
| Parámetro | Rango Válido | Comportamiento en Límites |
| :--- | :---: | :--- |
| `target_margin_percent` | `0%` a `99.99%` | 0% desactiva protección porcentual (piso absoluto manda). $\ge 100\%$ es rechazado. |
| `min_absolute_profit_usd` | $\ge 0.00$ | Piso mínimo absoluto de ganancia en dólares. |
| `zinc_fee_usd` | $\ge 0.00$ | Costo de fulfillment por orden Zinc. |
| `financial_fee_percent` | `0%` a `99.99%` | Comisión porcentual de tarjeta Prex. |
| `financial_fee_fixed_usd` | $\ge 0.00$ | Cargo fijo por transacción internacional. |
| `financial_fee_tax_rate` | `0.0` a `0.999` | Tasa de IVA sobre comisiones financieras (0.22 = 22%). |
| `florida_sales_tax_percent`| `0%` a `99.99%` | Sales tax estimado (0% en dirección exenta). |
| `fixed_markup_usd` | $\ge 0.00$ | Recargo comercial base. |

---

## 7. RLS Anterior vs RLS Final
| Perfil / Rol | RLS Anterior | RLS Final (Blindada) |
| :--- | :---: | :---: |
| **Anon / Público** | `SELECT` Permitido (Vulnerable) | **`SELECT` DENEGADO (Bloqueado)** |
| **Cliente Autenticado** | `SELECT` Permitido | **`SELECT` DENEGADO (Bloqueado)** |
| **Vendor** | `SELECT` Permitido | **`SELECT` DENEGADO (Bloqueado)** |
| **Admin (`is_admin()`)** | `ALL` Permitido | **`ALL` Permitido (Exclusivo)** |
| **Edge Functions (Service Role)** | Acceso Permitido | **Acceso Autorizado y Protegido** |

---

## 8. Arquitectura de Acceso de Edge Functions & Storefront
- **Edge Functions Autoritativas:** (`zinc-live-check-before-payment`, `checkout-handler`, `zinc-verify-after-payment`, `create-order`) acceden a `international_sync_settings` utilizando `SUPABASE_SERVICE_ROLE_KEY` del backend server-side, garantizando la lectura segura de todas las variables financieras sin requerir exposición pública.
- **Storefront / Público:** Consume la nueva RPC con `SECURITY DEFINER`: `get_international_public_status()`, la cual retorna únicamente `{ international_public_enabled, international_purchases_enabled }`. Cero datos de costos, comisiones o fórmulas son transmitidos por la red al cliente.

---

## 9. Pruebas de Red y Verificación de Privacidad
- **Suite:** [`frontend/src/tests/international_sync_settings_security.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/international_sync_settings_security.test.ts)
- **Aserción:** Se verificó que `get_international_public_status()` NO contiene propiedades financieras (`zinc_fee_usd`, `target_margin_percent`, `financial_fee_percent`, `min_absolute_profit_usd`, etc.).
- **Dictamen:** **PASS**.

---

## 10. Pruebas de Regresión y Validación de Configuración
- **Suite:** [`frontend/src/tests/international_pricing_config_validation.test.ts`](file:///c:/Projects/Collectibles2026/frontend/src/tests/international_pricing_config_validation.test.ts) (10 tests).
  - Test A: `margin = 15` $\to$ PASS.
  - Test B: `margin = 0` $\to$ PASS.
  - Test C: `margin = -5` $\to$ REJECT.
  - Test D: `margin = 100` $\to$ REJECT.
  - Test E: `margin = 120` $\to$ REJECT.
  - Test F: `zinc = -1` $\to$ REJECT.
  - Test G: `prex_fixed = -0.50` $\to$ REJECT.
  - Test H: `profit = -3` $\to$ REJECT.
  - Test I: `tax_rate >= 1` $\to$ REJECT.
  - Test J: Configuración canónica $\to$ Real Cost $37.67, Final $44.32, Profit $6.65.
- **Dictamen:** **PASS**.

---

## 11. Inmutabilidad de Órdenes Históricas
Los cambios en RLS y las nuevas restricciones de validación no alteran ninguna orden histórica existente en `orders` o `international_order_items`. Sus snapshots (`acquisition_cost_usd`, `final_price_usd`, `expected_profit_usd`) permanecen inmutables.

---

## 12. Tabla Final de Certificación y Blindaje
| Control | Resultado | Evidencia / Justificación |
| :--- | :---: | :--- |
| **Config Admin validation** | **PASS** | [`AdminInternationalSync.tsx:61`](file:///c:/Projects/Collectibles2026/frontend/src/pages/admin/AdminInternationalSync.tsx#L61) validación inline |
| **DB config constraints** | **PASS** | `20261216010000_international_settings_security_and_validation.sql` (9 CHECK constraints) |
| **Backend fail-closed** | **PASS** | `assertValidInternationalPricingConfig` lanza error controlado |
| **Margin < 0 rejected** | **PASS** | DB constraint + `config_validation.test.ts:32` |
| **Margin >= 100 rejected** | **PASS** | DB constraint + `config_validation.test.ts:40` |
| **Negative Zinc rejected** | **PASS** | DB constraint + `config_validation.test.ts:54` |
| **Negative Prex fee rejected** | **PASS** | DB constraint + `config_validation.test.ts:62` |
| **Negative profit rejected** | **PASS** | DB constraint + `config_validation.test.ts:70` |
| **Public settings read blocked** | **PASS** | RLS: `Allow public read on international_sync_settings` eliminada |
| **Customer settings read blocked** | **PASS** | RLS: Sólo `is_admin()` posee permiso `SELECT` |
| **Vendor settings read blocked** | **PASS** | RLS: Vendors bloqueados de consultar costos internos |
| **Admin settings read** | **PASS** | RLS: `Admins manage international_sync_settings` habilitado |
| **Admin settings update** | **PASS** | RLS: Permiso `ALL` para administradores activos |
| **Edge pricing config access** | **PASS** | Server-side con `SUPABASE_SERVICE_ROLE_KEY` |
| **No config leaked by RPC** | **PASS** | `get_international_public_status()` retorna solo 2 booleanos |
| **No config leaked in storefront** | **PASS** | Storefront usa RPC pública, cero exposición de costos |
| **Price tampering defense** | **PASS** | Servidor recalcula y descarta precio cliente (`tampering.test.ts:25`) |
| **Live Check** | **PASS** | `zinc-live-check-before-payment` recalcula con DB settings |
| **Historical snapshots** | **PASS** | Snapshots en `orders` inmutables |
| **Pricing regression** | **PASS** | Amazon $34.99 $\to$ Real Cost $37.67 $\to$ Final $44.32 (15% Net Margin) |
| **Production Build** | **PASS** | 26 test suites (204 tests) 100% PASS, Vite build 0 errores |

---

## 13. Dictamen Final
### **ESTADO: GO TOTAL DEFINITIVO — PRICING ENGINE Y PROFIT PROTECTION BLINDADOS Y CERRADOS**
El módulo de Pricing Internacional y Profit Protection ha superado todas las pruebas de seguridad, privacidad y robustez matemática. Queda formalmente cerrado para operación continua en producción.
