# INTERNATIONAL MARKETS PREVIEW & TEST CENTER CERTIFICATION
**Collectibles 2026 — Official Infrastructure & Operational Verification**
**Date:** September 26, 2026
**Environment:** Production Build Verified (Zero Mock Leaks / Honest Diagnostic Matrix)

---

## A. Routes

The following admin and parameterized preview routes are established and protected under `ProtectedRoute (requireAdmin)` with `profiles.is_admin` authorization:

| Route Path | Description | Access Level |
|---|---|---|
| `/admin/international-markets` | International Markets Control Center, Multi-Country Diagnostic Matrix, Master Controls & Tarifarios | Admin Only (`is_admin = true`) |
| `/admin/international-markets/:countryCode/preview` | Parametric Market Preview Experience (Customer View vs Admin Debug View, Device frames, Test presets) | Admin Only (`is_admin = true`) |
| `/admin/markets` | Automatic 301/permanent redirect to `/admin/international-markets` | Admin Only |
| `/admin/markets/:countryCode/preview` | Automatic redirect to `/admin/international-markets/:countryCode/preview` | Admin Only |

---

## B. Countries Overview (All 8 Markets)

| Flag | Country | Code | Currency | Logistics System | Default Status | Public / Checkout |
|:---:|:---|:---:|:---:|:---|:---:|:---:|
| 🇺🇾 | Uruguay | `UY` | UYU | **IMPORT HUB** | `LIVE` | `ON / ON` |
| 🇦🇷 | Argentina | `AR` | ARS | **IMPORT HUB** | `LIVE` | `ON / ON` |
| 🇨🇱 | Chile | `CL` | CLP | **SKYPOSTAL** | `PREVIEW` | `OFF / OFF` (Preview `ON`) |
| 🇵🇪 | Perú | `PE` | PEN | **SKYPOSTAL** | `PREVIEW` | `OFF / OFF` (Preview `ON`) |
| 🇧🇷 | Brasil | `BR` | BRL | **SKYPOSTAL** | `PREVIEW` | `OFF / OFF` (Preview `ON`) |
| 🇨🇴 | Colombia | `CO` | COP | **SKYPOSTAL** | `PREVIEW` | `OFF / OFF` (Preview `ON`) |
| 🇪🇨 | Ecuador | `EC` | USD | **SKYPOSTAL** | `PREVIEW` | `OFF / OFF` (Preview `ON`) |
| 🇲🇽 | México | `MX` | MXN | **SKYPOSTAL** | `DISABLED` | `OFF / OFF` (Preview enableable) |

---

## C. SkyPostal Markets Architecture

For **Chile (CL), Perú (PE), Brasil (BR), Colombia (CO), Ecuador (EC) and México (MX)**:
- **Rate Cards:** Contractual 2026 tariff brackets loaded (0.10kg to 10.00kg + additional 500g increments).
- **Fuel Surcharge:** Official 10-band EIA Gulf Coast Kerosene spot index with neutral, positive (+1% to +4%) and negative (-1% to -4%) adjustments.
- **Pricing:** Authoritative commercial formula: `Provider Cost = Base Rate + Fuel Amount`, `Customer Price = Provider Cost * (1 + Markup% / 100)` with global default of 35%.
- **Quote Snapshots:** 24-hour TTL server-verified inmutability.

---

## D. Import Hub Strict Isolation (UY & AR)

- **Absolute Isolation:** Uruguay and Argentina operate solely under `collector-import-hub`. No SkyPostal logic, rate cards or edge adapters are injected into Import Hub.
- **Admin Demarcation:** The Admin cards for UY and AR explicitly show `Logistics: IMPORT HUB` and `SkyPostal: NOT APPLICABLE`.
- **Zero Regressions:** Import Hub regression test suite passes with 100% success.

---

## E. Components Built & Reused

1. **`marketDiagnosticEngine.ts`** (`frontend/src/lib/skypostal/marketDiagnosticEngine.ts`):
   - Multi-point diagnostic engine evaluating 20 checkpoints.
   - Outputs honest statuses: `PASS`, `WARNING`, `FAIL`, `NOT_CONFIGURED`, `NOT_TESTED`, `NOT_APPLICABLE`.
   - Generates multi-country comparison matrix for `[ TEST ALL SKYPOSTAL MARKETS ]`.

2. **`AdminInternationalMarketPreview.tsx`** (`frontend/src/pages/admin/AdminInternationalMarketPreview.tsx`):
   - Parameterized preview page for `/admin/international-markets/:countryCode/preview`.
   - Fixed Mandatory Preview Header: `ADMIN MARKET PREVIEW — [FLAG] [COUNTRY] — SkyPostal TEST — NO REAL PURCHASES / NO REAL SHIPMENTS — [Exit Preview]`.
   - `[ Customer View ]` vs `[ Admin Debug View ]` toggle.
   - Responsive viewport frame switcher (`Desktop`, `Tablet 768px`, `Mobile 375px`).
   - Diagnostic Test Presets (Standard, High-Value, Regulated, 4x4 vs Cat C, Prohibited).
   - Recipient ID simulation (RUT, DNI/RUC, CPF, Cédula, RFC/CURP).
   - Lateral Customer Journey checklist drawer.

3. **`AdminInternationalMarkets.tsx`** (`frontend/src/pages/admin/AdminInternationalMarkets.tsx`):
   - Refactored Control Center with 8 country cards.
   - `[ TEST ALL SKYPOSTAL MARKETS ]` execution and matrix view.
   - Generic multi-country Go-Live Gate (`MarketGoLiveGate`).
   - Contractual Rate Cards inspector (`CL-340`, `PE-340`, `BR-340`, `CO-340`, `EC-340`, `MX-340`, `MX-340-R`).
   - EIA Fuel Bands matrix and commercial markup manager.
   - Live audit logs from `skypostal_audit_logs`.

---

## F. Preview Experience

Admin can navigate and simulate the full buyer journey for each country:
1. **Chile (`CL`):**
   - Address + RUT validation (e.g. `18.456.789-K`).
   - Rate card `CL-340` (Gateway SCL, Service 1).
   - Max FOB check: items > $1,000 USD alert for formal customs dispatch.
2. **Perú (`PE`):**
   - Address + DNI/RUC validation.
   - De Minimis exemption notice (<= $200 USD FOB).
   - Quantity limit enforcement: > 10 units flagged as commercial risk by SUNAT.
   - Rate card `PE-340` (Gateway LIM, Service 1).
3. **Brasil (`BR`):**
   - Address + CPF/CNPJ validation.
   - Receita Federal compliance notice.
   - Rate card `BR-340` (Gateway GRU, Service 1).
4. **Colombia (`CO`):**
   - Address + Cédula de Ciudadanía.
   - De Minimis exemption notice (<= $200 USD FOB).
   - Rate card `CO-340` (Gateway BOG, Service 1).
5. **Ecuador (`EC`):**
   - Cédula de Identidad validation.
   - Automatic classification:
     - **Categoría B (4x4):** Weight <= 4.0kg and FOB <= $400 USD (Postal UIO, Service 4).
     - **Categoría C:** Weight > 4.0kg or FOB > $400 USD (30% Arancel + 0.5% FODINFA + 15% IVA + $5.00 tasa).
6. **México (`MX`):**
   - RFC / CURP validation.
   - Automatic classification & routing:
     - **STANDARD:** Rate card `MX-340`, Gateway GDL (Guadalajara), Service Code 1.
     - **REGULATED:** Rate card `MX-340-R`, Gateway LRD (Laredo), Service Code 502 (Cosmetics/Supplements).

---

## G. Market Diagnostics (20 Points)

| Point | Check Name | Expected SkyPostal Status |
|:---:|:---|:---:|
| 1 | Configuración en Matriz Internacional | `PASS` |
| 2 | Asignación de Proveedor SkyPostal | `PASS` |
| 3 | Entorno de Preview Interactivo | `PASS` |
| 4 | Matriz de Aduanas & Compliance | `PASS` |
| 5 | Campos de Identificación Destinatario | `PASS` |
| 6 | Package Engine (Peso Volumétrico / Facturable) | `PASS` |
| 7 | Tarifario Contractual Primario | `PASS` |
| 8 | Tarifario Regulado (México MX-340-R) | `PASS` |
| 9 | Reglas de Combustible SkyPostal EIA | `PASS` |
| 10 | Markup Comercial & Política de Precios | `PASS` |
| 11 | Quote Snapshot Engine | `PASS` |
| 12 | Simulación de Checkout & Prevención de Cargos Reales | `PASS` |
| 13 | Entorno de Proveedor | `PASS` |
| 14 | Credenciales SkyPostal API | `NOT_CONFIGURED` |
| 15 | Estado de Conexión SkyPostal API | `NOT_CONFIGURED` |
| 16 | Creación de Envíos Reales SkyPostal | `NOT_TESTED` |
| 17 | Generación de Etiquetas SkyPostal PDF/ZPL | `NOT_TESTED` |
| 18 | Consolidación de Manifiestos Miami Hub | `NOT_TESTED` |
| 19 | Sincronización de Tracking & Webhooks | `NOT_TESTED` |
| 20 | Mecanismo de Desactivación Inmediata (Kill Switch) | `PASS` |

**Readiness Assessment:** `PREVIEW READY` (Sandbox credentials required for live Sandbox operation).

---

## H. Multi-Country Diagnostic Matrix (`[ TEST ALL SKYPOSTAL MARKETS ]`)

| Country | Logistics Mode | Config | Compliance | Rate Card | Fuel EIA | Pricing | Preview UI | SkyPostal API | Overall Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🇺🇾 Uruguay | IMPORT HUB | `PASS` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `NOT_APPLICABLE` | `IMPORT_HUB_OPERATIONAL` |
| 🇦🇷 Argentina | IMPORT HUB | `PASS` | `N/A` | `N/A` | `N/A` | `N/A` | `N/A` | `NOT_APPLICABLE` | `IMPORT_HUB_OPERATIONAL` |
| 🇨🇱 Chile | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |
| 🇵🇪 Perú | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |
| 🇧🇷 Brasil | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |
| 🇨🇴 Colombia | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |
| 🇪🇨 Ecuador | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |
| 🇲🇽 México | SKYPOSTAL | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `PASS` | `NOT_CONFIGURED` | `PREVIEW_READY` |

---

## I. API Reality Certification (Zero Mock Leaks)

- No hardcoded `mockShipments`, `auditLogs` or fake `HEALTHY` badges are used.
- Operaciones list shows real Supabase records or explicit `No SkyPostal shipments yet`.
- Audit logs query `skypostal_audit_logs`.
- API Health displays `NOT_CONFIGURED (TEST CREDENTIALS REQ)` honestly.

---

## J. México Implementation Verification

- **Visibility:** Fully visible in Admin matrix.
- **Initial State:** Initialized as `DISABLED` with `Preview Enabled = false`.
- **Preview Capability:** Admin can toggle `Preview = ON` and open `/admin/international-markets/MX/preview`.
- **Dual Rate Cards:**
  - `MX-340`: Standard action figures / collectibles -> Gateway GDL, Service Code 1.
  - `MX-340-R`: Cosmetics & supplements -> Gateway LRD, Service Code 502.

---

## K. Import Hub Regression Verification

- `frontend/src/plugins/collector-import-hub/` untouched.
- `src/tests/importhub_regression.test.ts` passed (2/2 tests).

---

## L. Automated Test Results

Ran 20 test suites (95 tests) across all international and skypostal modules:
```text
✓ src/tests/skypostal_multicountry_admin_control.test.ts (5 tests)
✓ src/tests/skypostal_fuel.test.ts (5 tests)
✓ src/tests/skypostal_cost_variance.test.ts (2 tests)
✓ src/tests/skypostal_rates.test.ts (7 tests)
✓ src/tests/skypostal_phase3_e2e_chile.test.ts (1 test)
✓ src/tests/skypostal_compliance.test.ts (14 tests)
✓ src/tests/skypostal_package_weight.test.ts (6 tests)
✓ src/tests/skypostal_quote_validation.test.ts (4 tests)
✓ src/tests/skypostal_quote_snapshot.test.ts (1 test)
✓ src/tests/skypostal_phase4_golive_readiness.test.ts (4 tests)
✓ src/tests/skypostal_markup_pricing.test.ts (3 tests)
✓ src/tests/international_markets_preview_test_center.test.ts (9 tests)
✓ src/tests/skypostal_foundation.test.ts (6 tests)
✓ src/tests/importhub_regression.test.ts (2 tests)
✓ src/tests/skypostal_contractual_excel_parity.test.ts (7 tests)
✓ src/tests/skypostal_two_leg_logistics.test.ts (1 test)
✓ src/tests/market_engine.test.ts (9 tests)
✓ src/tests/skypostal_financial_control.test.ts (3 tests)
✓ src/tests/skypostal_tracking_normalizer.test.ts (3 tests)
✓ src/tests/skypostal_idempotency_retries.test.ts (3 tests)

Test Files: 20 passed (20)
Tests: 95 passed (95)
```

---

## M. Production Build Verification

Executed `npm run build`:
```text
✓ 2156 modules transformed.
✓ built in 13.26s
dist/index.html - 8.74 kB
dist/assets/index-CkkWOYFg.css - 252.96 kB
dist/assets/admin-chunk-CYGcZDXW.js - 3,947.24 kB
```
Zero build or TypeScript compilation errors.
