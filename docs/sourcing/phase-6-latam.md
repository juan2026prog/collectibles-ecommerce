# SOURCING INTELLIGENCE — FASE 6 (LATAM / MULTI-COUNTRY ENGINE)

## 1. Arquitectura General

FASE 6 transforma **Sourcing Intelligence** en una infraestructura comercial multi-país capaz de determinar:
> Qué producto conviene vender, en qué país, desde qué retailer comprarlo, cuánto cuesta realmente llevarlo hasta ese mercado, a qué precio venderlo y qué prioridad comercial debería recibir.

```text
                    SOURCING INTELLIGENCE
                            │
              ┌─────────────┴─────────────┐
              │                           │
       PRODUCT INTELLIGENCE        MARKET INTELLIGENCE
              │                           │
 Amazon / eBay / Best Buy        Uruguay / LATAM
              │                           │
              └─────────────┬─────────────┘
                            │
                    COUNTRY ENGINE
                            │
             ┌──────────────┼───────────────┐
             │              │               │
         IMPORTACIÓN     LOGÍSTICA        MERCADO
             │              │               │
         Impuestos       Couriers       Competidores
         Franquicias     Costos          Marketplaces
         Límites         Tiempos         Precios
             │              │               │
             └──────────────┼───────────────┘
                            │
                     LANDED COST
                            │
                       PRICING ENGINE
                            │
                    OPPORTUNITY ENGINE
                            │
                       RANKING GLOBAL
                            │
                 PUBLICACIÓN / AUTOPILOT
```

---

## 2. Componentes Principales

### A. Country Engine (`CountryEngine.ts`)
- Mantiene la parametrización comercial de cada país (`country_code`, `currency`, `locale`, `timezone`, `enabled`, `sourcing_enabled`, `publication_enabled`).
- Preserva a **Uruguay (`UY`)** como mercado base activo con 100% de preparación operacional (`readiness_score = 100`).
- Declara otros mercados LATAM (`AR`, `CL`, `BR`, `PE`, `CO`, `MX`, `PY`) como `CONFIGURADO` o `NO CONFIGURADO` de forma totalmente honesta (0 mocks o datos ficticios).

### B. Multi-Currency Engine (`CurrencyService.ts`)
- Gestiona conversiones FX en tiempo real y diferidas para USD, UYU, ARS, CLP, BRL, PEN, COP, MXN y PYG.
- Reporta el estado de frescura de las tasas (`ACTUALIZADO`, `DESACTUALIZADO`, `NO_DISPONIBLE`).

### C. Multi-Country Landed Cost (`calculateMultiCountryLandedCost`)
- Sensible al país de destino.
- Para Uruguay preserva la fórmula exacta con Urubox, envío doméstico a Miami (FL), IVA aduanero y tope de franquicia de $200 USD / 4.4 lbs.
- Para mercados LATAM parametriza impuestos aduaneros generales, IVAs locales y costos express de courier.

### D. Marketplace Adapters (`MarketplaceAdapter.ts`)
- Interfaz unificada `searchProduct()`, `getListings()`, `getPrice()`, `getSeller()`, `getStock()`, `getShipping()`, `getFees()`.
- Implementación de `MercadoLibreCountryAdapter` declarando su estado honesto (`OPERATIVO` para UY, `NO_CONFIGURADO` para otros).

### E. Opportunity & Risk Engine (`latamOpportunityEngine.ts`)
- `calculateCountryOpportunityScore`: Puntuación de oportunidad por mercado (0–100) y confianza de datos (0–100).
- `calculateMarketGapScore`: Evalúa demanda/tendencia vs saturación de competidores locales.
- `calculateGlobalOpportunityScore`: Combina puntuaciones cross-market para detectar productos con potencial internacional.
- `SourcingRiskEngine`: Detecta margen insuficiente, fluctuación de precios, vendedores riesgosos y datos desactualizados (`LOW`, `MEDIUM`, `HIGH`, `BLOCKED`).

### F. Best Market Selector (`bestMarketSelector.ts`)
- Determina automáticamente la cadena:
  `PRODUCT -> BEST SOURCE -> BEST MARKET -> BEST LANDED COST -> BEST SALE PRICE -> BEST EXPECTED MARGIN`.
- Devuelve la selección óptima con decisión determinística (`PUBLISH`, `WATCH`, `REVIEW`, `REJECT`, `BLOCKED`) y `reason_codes`.

---

## 3. Modelo de Datos y Migraciones

La migración `20260916000000_sourcing_latam_fase6.sql` crea:
- `sourcing_countries`
- `sourcing_country_rules`
- `sourcing_country_marketplaces`
- `sourcing_exchange_rates`
- `sourcing_product_country_availability`
- `sourcing_risk_events`

Todas las tablas están protegidas mediante Row Level Security (RLS) para administración exclusiva de usuarios `is_admin = true` y lectura pública controlada de disponibilidad activa.

---

## 4. UI Super Admin & Dashboard

- **`GlobalSourcingBoard`**: Panel principal bajo `SOURCING -> LATAM`.
- **`MarketOpportunityMatrix`**: Matriz interactiva `PRODUCTO x PAÍS`.
- **`CountryDashboard`**: Vista detallada por país con KPIs de margen, productos analizados e indicadores de preparación.
- **`CountryConfigPanel`**: Consola Super Admin para ajustar reglas de importación, impuestos, márgenes y feature flags por mercado.

---

## 5. Pruebas y Verificación

- **Pruebas unitarias**: `frontend/src/tests/sourcing_fase6_latam.test.ts`
- **Prueba End-to-End (Street Fighter Case)**: `frontend/src/tests/sourcing_fase6_latam_e2e.test.ts`
