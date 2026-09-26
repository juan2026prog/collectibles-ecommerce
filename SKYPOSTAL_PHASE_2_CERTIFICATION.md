# SKYPOSTAL PHASE 2 — CERTIFICACIÓN TÉCNICA Y OPERATIVA
## Collectibles 2026 — Compliance, Rate Cards, Fuel Surcharge, Markup & Quote Snapshot

**Fecha de Certificación:** 2026-09-26  
**Estado:** ✅ CERTIFICADO Y VALIDADO  
**Ambiente:** PREVIEW MODE / SANDBOX READY  

---

## 1. RESUMEN EJECUTIVO

La **Fase 2 de SkyPostal para Collectibles 2026** ha sido implementada y validada en su totalidad, cumpliendo rigurosamente todas las directivas contractuales, arquitectónicas y de seguridad.

Esta fase permite responder con precisión matemática y regulatoria a la cadena completa de cotización:

```text
¿Este producto puede enviarse a este país?  ---> SkyPostal Compliance Engine
                ↓
¿Qué reglas aduaneras se aplican?          ---> Country Rules & Restrictions Matrix
                ↓
¿Qué servicio SkyPostal corresponde?       ---> Service Mapping (CL-340, PE-340, EC-340, etc.)
                ↓
¿Cuál es el peso facturable?               ---> Package Engine: MAX(Actual, (L*W*H)/5000)
                ↓
¿Cuánto cobra SkyPostal?                   ---> Rate Engine (28 tramos contractuales + extrapolación 500g)
                ↓
¿Qué Fuel Surcharge corresponde?           ---> Fuel Engine (10 Bandas EIA Kerosene Spot)
                ↓
¿Cuál es nuestro margen comercial?         ---> Commercial Pricing Engine (Default +35% on cost)
                ↓
¿Cuánto cobramos al cliente?               ---> Customer Shipping Price + Immutable Quote Snapshot
```

---

## 2. COMPONENTES Y MÓDULOS CERTIFICADOS

### 2.1. Base de Datos & Migraciones Versionadas
- **Archivo:** `supabase/migrations/20261231030000_skypostal_phase2_pricing_compliance.sql`
- **Tablas Creadas:**
  1. `skypostal_country_rules`: Parámetros aduaneros, límites FOB, de minimis, documentos requeridos y divisor volumétrico.
  2. `skypostal_rate_cards`: Tarifarios contractuales con 28 tramos de peso (0.1kg - 10.0kg) y costo por 500g adicional (>10kg).
  3. `skypostal_fuel_rules`: Matriz de 10 bandas de queroseno spot EIA Gulf Coast.
  4. `skypostal_pricing_settings`: Margen comercial configurable y TTL de snapshots (24h).
  5. `skypostal_compliance_rules`: Catálogo de mercancías permitidas, restringidas y prohibidas por país.
  6. `skypostal_quote_snapshots`: Registro inmutable con auditoría financiera y técnica para checkout.
- **Seguridad:** Row Level Security (RLS) habilitado en todas las tablas con políticas de lectura pública y escritura restringida a administradores.

### 2.2. Package & Dimensional Weight Engine
- **Módulos:** `supabase/functions/_shared/skypostal/skypostal-package-engine.ts` y `frontend/src/lib/skypostal/skypostalPricing.ts`
- **Fórmula Contractual:** `(Largo cm * Ancho cm * Alto cm) / 5000 = Peso Volumétrico (kg)`
- **Resolución:** `MAX(Peso Real, Peso Volumétrico)`, mínimo 0.100 kg.
- **Trazabilidad de Origen:** `CATALOG`, `ESTIMATED`, `MEASURED`, `PROVIDER`.

### 2.3. Authoritative Country Rules & Compliance Engine
- **Módulos:** `skypostal-compliance-engine.ts` y `skypostalPricing.ts`
- **Estados:** `ALLOWED`, `RESTRICTED`, `REGULATED`, `PROHIBITED`, `MANUAL_REVIEW`.
- **Reglas Implementadas:**
  - **Universal:** Bloqueo absoluto de mercancía falsificada/réplicas no oficiales y armas/réplicas bélicas.
  - **Chile (CL):** Límite FOB Courier US$ 3,000; bloqueo de cosméticos y suplementos; requerimiento de RUT.
  - **Perú (PE):** De minimis FOB <= US$ 200; límite 10 unidades de juguetes/figuras; FOB > US$ 2,000 pasa a formal; requerimiento de DNI/RUC.
  - **Ecuador (EC):** Categoría B (4x4: peso <= 4kg y FOB <= $400) vs Categoría C (FOB > $400 o > 4kg); prohibición de joyería fina; requerimiento de Cédula.
  - **México (MX):** Servicio Estándar MX-340 (Service Code 1) vs Regulado MX-340-R (Service Code 502, cosméticos/suplementos con 20% tax).
  - **Fail Closed:** Todo país no configurado retorna `MANUAL_REVIEW`.

### 2.4. Contractual Rate Cards Engine
- **Módulos:** `skypostal-rate-engine.ts` y `skypostalPricing.ts`
- **Tarifarios Verificados:**
  - `CL-340` (Chile Courier Standard SCL, 10kg = $66.07, +500g = $2.42)
  - `PE-340` (Perú Courier Standard LIM, 10kg = $47.13, +500g = $2.13)
  - `BR-340` (Brasil Courier Standard GRU, 10kg = $71.92, +500g = $3.43)
  - `CO-340` (Colombia Courier Standard BOG, 10kg = $46.89, +500g = $2.93)
  - `EC-340` (Ecuador Postal Standard UIO, 10kg = $53.88, +500g = $2.66)
  - `MX-340` (México Courier Standard GDL, 10kg = $47.06, +500g = $2.25)
  - `MX-340-R` (México Regulated Courier LRD, 10kg = $63.83, +500g = $1.83)

### 2.5. Fuel Surcharge Engine (10 Bandas EIA)
- **Módulos:** `skypostal-fuel-engine.ts` y `skypostalPricing.ts`
- **Bandas EIA:**
  - `>= $3.55 < $3.90`: `+4.0%`
  - `>= $3.20 < $3.55`: `+3.0%`
  - `>= $2.85 < $3.20`: `+2.0%`
  - `>= $2.50 < $2.85`: `+1.0%`
  - `>= $1.80 < $2.50`: `0.0%` (Neutral baseline: $2.45)
  - `>= $1.45 < $1.80`: `-1.0%`
  - `>= $1.10 < $1.45`: `-2.0%`
  - `>= $0.75 < $1.10`: `-3.0%`
  - `>= $0.40 < $0.75`: `-4.0%`
  - `>= $3.90`: `+4.0%` (Cap superior)
  - `< $0.40`: `-4.0%` (Piso inferior)

### 2.6. Commercial Pricing & Margin Engine
- **Fórmula:**
  `Costo Proveedor = Tarifa Base + Fuel Surcharge`  
  `Margen Comercial = Costo Proveedor * (Markup% / 100)`  
  `Precio Cliente = Costo Proveedor + Margen Comercial` (Markup por defecto: 35% on cost).

### 2.7. Quote Snapshot & Financial Audit
- Generación de snapshot inmutable con `quote_id`, desglose detallado de transporte, recargo de combustible, costo proveedor, markup comercial, precio cliente, estatus aduanero y vencimiento TTL de 24 horas.

### 2.8. Frontend & Super Admin Experience
- **Super Admin (`AdminInternationalMarkets.tsx`):**
  - Tab de Mercados & Routing con Kill Switches operativos.
  - Tab de Tarifarios Contractuales 2026 interactivo con los 28 tramos y costo 500g adicional.
  - Tab de Fuel Surcharge EIA con visualización de las 10 bandas y spot price de referencia.
  - Tab de Configuración de Markup Comercial (35% default con persistencia).
  - Tab de Simulador de Cotizaciones en vivo para todos los mercados.
- **Storefront Preview (`InternationalMarketTemplate.tsx` y `SkyPostalQuoteSimulator.tsx`):**
  - Simulador de cotización interactivo en modo Preview para compradores y administradores, con Customer View limpio y Super Admin Breakdown expandible.

### 2.9. Aislamiento Estricto de Import Hub
- Cero modificaciones a `frontend/src/plugins/collector-import-hub/`.
- Uruguay y Argentina operan al 100% sobre Import Hub en modo LIVE sin interferencias.

---

## 3. SUITE DE TESTS AUTOMATIZADOS (53/53 PASADOS)

| Suite de Tests | Archivo | Casos | Estado |
| :--- | :--- | :---: | :---: |
| Compliance Aduanero | `skypostal_compliance.test.ts` | 14 | ✅ PASS |
| Motor de Paquetes & Peso | `skypostal_package_weight.test.ts` | 6 | ✅ PASS |
| Tarifarios Contractuales | `skypostal_rates.test.ts` | 7 | ✅ PASS |
| Fuel Surcharge EIA | `skypostal_fuel.test.ts` | 5 | ✅ PASS |
| Markup Comercial & Costos | `skypostal_markup_pricing.test.ts` | 3 | ✅ PASS |
| Quote Snapshots & TTL | `skypostal_quote_snapshot.test.ts` | 1 | ✅ PASS |
| SkyPostal Foundation | `skypostal_foundation.test.ts` | 6 | ✅ PASS |
| Market Engine Core | `market_engine.test.ts` | 9 | ✅ PASS |
| Import Hub Aislamiento | `importhub_regression.test.ts` | 2 | ✅ PASS |
| **TOTAL** | **9 Suites** | **53 Tests** | **✅ 100% PASS** |

---

## 4. VERIFICACIÓN DE BUILD & DEPLOY PROTOCOL

1. **Build Gate:** `npm run build` ejecutado en `frontend` con éxito (0 errores).
2. **Git Commit:** Cambios stageados atómicamente y commiteados bajo convención de commits de Collectibles 2026.
3. **Git Push:** Pusheado a `origin main`.
4. **Dominio Oficial:** Comprobado `https://collectibles.uy`.
