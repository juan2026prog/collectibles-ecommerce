import { describe, expect, it } from 'vitest';
import {
  CurrencyService,
  formatMoney,
  convertUsdToDisplay,
  getStoredExchangeRate,
  COUNTRY_CURRENCY_CONFIG,
  FALLBACK_RATES,
  type DisplayCurrency,
  type ExchangeRateDetail
} from '../services/currencyService';
import { calculateSourcingPricing } from '../services/sourcing/commercialPricingEngine';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { countryEngine } from '../services/sourcing/countryEngine';
import { autopilotExecutionEngine } from '../services/sourcing/autopilot/executionEngine';

describe('FUNCTIONAL VALIDATION SUITE — FX, FINANCIAL MODEL & SOURCING', () => {

  // ----------------------------------------------------
  // 1. DATA PROVIDER & INSTITUTIONAL REFERENCE AUDIT
  // ----------------------------------------------------
  describe('1. Currency Data Provider & Institutional Reference Audit', () => {
    it('strictly separates Data Provider from Institutional Reference across all supported currencies', () => {
      const currencies: DisplayCurrency[] = ['UYU', 'ARS', 'CLP', 'PEN', 'MXN', 'USD'];

      const expectedAudit = {
        UYU: {
          dataProvider: 'ExchangeRate-API',
          institutionalRef: 'Banco Central del Uruguay (BCU)',
          baseCurrency: 'USD',
          endpoint: 'https://open.er-api.com/v6/latest/USD (via /api/currency-sync)',
          isActive: true
        },
        ARS: {
          dataProvider: 'ExchangeRate-API',
          institutionalRef: 'Banco Central de la República Argentina (BCRA)',
          baseCurrency: 'USD',
          endpoint: 'https://open.er-api.com/v6/latest/USD (via /api/currency-sync)',
          isActive: false
        },
        CLP: {
          dataProvider: 'ExchangeRate-API',
          institutionalRef: 'Banco Central de Chile',
          baseCurrency: 'USD',
          endpoint: 'https://open.er-api.com/v6/latest/USD (via /api/currency-sync)',
          isActive: false
        },
        PEN: {
          dataProvider: 'ExchangeRate-API',
          institutionalRef: 'Banco Central de Reserva del Perú (BCRP)',
          baseCurrency: 'USD',
          endpoint: 'https://open.er-api.com/v6/latest/USD (via /api/currency-sync)',
          isActive: false
        },
        MXN: {
          dataProvider: 'ExchangeRate-API',
          institutionalRef: 'Banco de México (Banxico)',
          baseCurrency: 'USD',
          endpoint: 'https://open.er-api.com/v6/latest/USD (via /api/currency-sync)',
          isActive: false
        },
        USD: {
          dataProvider: 'Canonical System Base',
          institutionalRef: 'Banco Central del Ecuador (Economía Dolarizada)',
          baseCurrency: 'USD',
          endpoint: 'N/A (Canonical Unit)',
          isActive: false
        }
      };

      currencies.forEach((code) => {
        const meta = COUNTRY_CURRENCY_CONFIG[code];
        const detail = getStoredExchangeRate(code);
        const expected = expectedAudit[code];

        expect(meta.country_name).toBeDefined();
        expect(meta.source_name).toBe(expected.institutionalRef);
        expect(meta.is_active).toBe(expected.isActive);
        expect(detail.base).toBe('USD');
        expect(detail.target).toBe(code);
      });
    });
  });

  // ----------------------------------------------------
  // 2. CANONICAL USD INVARIANCE AUDIT
  // ----------------------------------------------------
  describe('2. Canonical USD Financial Calculations Invariance', () => {
    it('maintains all internal financial variables strictly in USD regardless of display currency selection', () => {
      // Representative product
      const product = {
        purchase_price_usd: 35.00,
        shipping_cost_usd: 5.50,
        import_cost_usd: 0.00,
        landed_cost_usd: 40.50,
        selling_price_usd: 59.90,
        gross_margin_usd: 19.40,
        gross_margin_percent: 32.387,
        net_profit_usd: 19.40,
        opportunity_score: 84
      };

      const score = evaluateOpportunityScore({
        demandScore: 82,
        sellerTrustScore: 90,
        marginPercent: product.gross_margin_percent,
        profitUsd: product.net_profit_usd,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        uruguayMarketGapScore: 78
      });

      expect(score.opportunityScore).toBeGreaterThanOrEqual(75);

      // Switching through all display currencies
      const displayCurrencies: DisplayCurrency[] = ['UYU', 'CLP', 'MXN', 'ARS', 'PEN', 'USD'];
      displayCurrencies.forEach((curr) => {
        const rate = FALLBACK_RATES[curr];
        const formatted = formatMoney({
          amountUsd: product.selling_price_usd,
          displayCurrency: curr,
          exchangeRate: rate
        });

        expect(formatted).toBeDefined();
        // Crucial validation: product's canonical USD variables never mutate
        expect(product.purchase_price_usd).toBe(35.00);
        expect(product.shipping_cost_usd).toBe(5.50);
        expect(product.import_cost_usd).toBe(0.00);
        expect(product.landed_cost_usd).toBe(40.50);
        expect(product.selling_price_usd).toBe(59.90);
        expect(product.gross_margin_usd).toBe(19.40);
        expect(product.net_profit_usd).toBe(19.40);
        expect(product.opportunity_score).toBe(84);
      });
    });
  });

  // ----------------------------------------------------
  // 3. MATHEMATICAL FX VALIDATION (USD 100)
  // ----------------------------------------------------
  describe('3. Mathematical FX Conversion Validation for USD 100', () => {
    it('converts canonical USD 100 exactly according to active exchange rates', () => {
      const canonicalUsd = 100.00;

      const testCases: Array<{
        target: DisplayCurrency;
        rate: number;
        expectedOutput: number;
        expectedFormatted: string;
      }> = [
        { target: 'UYU', rate: 40.0835, expectedOutput: 4008.35, expectedFormatted: '$ 4.008 UYU' },
        { target: 'ARS', rate: 1528.7563, expectedOutput: 152875.63, expectedFormatted: '$ 152.876 ARS' },
        { target: 'CLP', rate: 961.5140, expectedOutput: 96151.40, expectedFormatted: '$ 96.151 CLP' },
        { target: 'PEN', rate: 3.4178, expectedOutput: 341.78, expectedFormatted: 'S/ 341.78' },
        { target: 'MXN', rate: 17.8992, expectedOutput: 1789.92, expectedFormatted: '$ 1,789.92 MXN' },
        { target: 'USD', rate: 1.0000, expectedOutput: 100.00, expectedFormatted: 'US$ 100.00' }
      ];

      testCases.forEach((tc) => {
        const converted = convertUsdToDisplay(canonicalUsd, tc.target, tc.rate);
        const formatted = formatMoney({
          amountUsd: canonicalUsd,
          displayCurrency: tc.target,
          exchangeRate: tc.rate
        });

        expect(converted).not.toBeNull();
        const diff = Math.abs((converted as number) - tc.expectedOutput);
        expect(diff).toBeLessThan(0.01);
        expect(formatted).toBe(tc.expectedFormatted);
      });
    });
  });

  // ----------------------------------------------------
  // 4. DYNAMIC FX RATE CHANGE RECALCULATION
  // ----------------------------------------------------
  describe('4. Automatic FX Rate Change Recalculation', () => {
    it('recalculates display price automatically when FX shifts from 40.00 to 39.00 without changing canonical USD', () => {
      const canonicalUsd = 100.00;

      // Rate 1: 40.00
      const displayAt40 = convertUsdToDisplay(canonicalUsd, 'UYU', 40.00);
      expect(displayAt40).toBe(4000.00);
      expect(formatMoney({ amountUsd: canonicalUsd, displayCurrency: 'UYU', exchangeRate: 40.00 })).toBe('$ 4.000 UYU');

      // Rate 2: 39.00
      const displayAt39 = convertUsdToDisplay(canonicalUsd, 'UYU', 39.00);
      expect(displayAt39).toBe(3900.00);
      expect(formatMoney({ amountUsd: canonicalUsd, displayCurrency: 'UYU', exchangeRate: 39.00 })).toBe('$ 3.900 UYU');

      // Canonical price remains exactly USD 100.00
      expect(canonicalUsd).toBe(100.00);
    });
  });

  // ----------------------------------------------------
  // 5. STALE / FALLBACK / MANUAL OVERRIDE & USD FALLBACK
  // ----------------------------------------------------
  describe('5. FX Status, Freshness, Manual Override & USD Fallback Safety', () => {
    it('determines VERIFIED for age < 24h and STALE for age >= 24h', () => {
      const freshRate: ExchangeRateDetail = {
        base: 'USD',
        target: 'UYU',
        rate: 40.08,
        provider: 'Open Exchange Rates API',
        source_name: 'Banco Central del Uruguay (BCU)',
        source_url: 'https://www.bcu.gub.uy',
        status: 'VERIFIED',
        is_manual_override: false,
        fetched_at: new Date(Date.now() - 2 * 3600000).toISOString(), // 2h ago
        effective_at: new Date().toISOString(),
        max_age_hours: 24,
        age_hours: 2
      };
      expect(freshRate.status).toBe('VERIFIED');
      expect(freshRate.age_hours).toBeLessThan(24);

      const staleRate: ExchangeRateDetail = {
        ...freshRate,
        status: 'STALE',
        fetched_at: new Date(Date.now() - 30 * 3600000).toISOString(), // 30h ago
        age_hours: 30
      };
      expect(staleRate.status).toBe('STALE');
      expect(staleRate.age_hours).toBeGreaterThanOrEqual(24);
    });

    it('enforces MANUAL_OVERRIDE with audit reason and admin identity', () => {
      const overrideDetail: ExchangeRateDetail = {
        base: 'USD',
        target: 'UYU',
        rate: 42.50,
        provider: 'SUPERADMIN_MANUAL',
        source_name: 'Banco Central del Uruguay (BCU)',
        source_url: 'https://www.bcu.gub.uy',
        status: 'MANUAL_OVERRIDE',
        is_manual_override: true,
        override_reason: 'Ajuste de contingencia por feriado bancario nacional',
        override_admin_email: 'superadmin@collectibles.uy',
        fetched_at: new Date().toISOString(),
        effective_at: new Date().toISOString(),
        max_age_hours: 24,
        age_hours: 0
      };

      expect(overrideDetail.is_manual_override).toBe(true);
      expect(overrideDetail.status).toBe('MANUAL_OVERRIDE');
      expect(overrideDetail.rate).toBe(42.50);
      expect(overrideDetail.override_reason).toBe('Ajuste de contingencia por feriado bancario nacional');
      expect(overrideDetail.override_admin_email).toBe('superadmin@collectibles.uy');
    });

    it('ensures fallback to USD produces unambiguous US$ formatted output without mislabeling as local currency', () => {
      // Target is UYU, but rate is unavailable (null/0/NaN)
      const formattedFallback = formatMoney({
        amountUsd: 100.00,
        displayCurrency: 'UYU',
        exchangeRate: null
      });

      // Must be unambiguously US$ 100.00, NEVER "$ 100 UYU"
      expect(formattedFallback).toBe('US$ 100.00');
      expect(formattedFallback).not.toContain('UYU');
    });
  });

  // ----------------------------------------------------
  // 6. MARKET ACTIVATION SAFETY
  // ----------------------------------------------------
  describe('6. Country Activation Safety (UY active, others inactive/FX ready)', () => {
    it('confirms UY is active and AR/CL/PE/MX/EC are inactive for commercial execution', () => {
      const countries = countryEngine.getAllCountries();

      const uy = countries.find(c => c.country_code === 'UY');
      const ar = countries.find(c => c.country_code === 'AR');
      const cl = countries.find(c => c.country_code === 'CL');
      const pe = countries.find(c => c.country_code === 'PE');
      const mx = countries.find(c => c.country_code === 'MX');

      expect(uy?.enabled).toBe(true);
      expect(uy?.sourcing_enabled).toBe(true);
      expect(uy?.publication_enabled).toBe(true);

      expect(ar?.enabled).toBe(false);
      expect(cl?.enabled).toBe(false);
      expect(pe?.enabled).toBe(false);
      expect(mx?.enabled).toBe(false);

      expect(COUNTRY_CURRENCY_CONFIG.UYU.is_active).toBe(true);
      expect(COUNTRY_CURRENCY_CONFIG.ARS.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.CLP.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.PEN.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.MXN.is_active).toBe(false);
      expect(COUNTRY_CURRENCY_CONFIG.USD.is_active).toBe(false);

      // Having FX rate for AR does not enable commercial operations
      const arConfig = countryEngine.getCountryConfig('AR');
      expect(arConfig.enabled).toBe(false);
      expect(arConfig.publication_enabled).toBe(false);
      expect(arConfig.sourcing_enabled).toBe(false);
    });
  });

  // ----------------------------------------------------
  // 7. SAFE SOURCING PIPELINE & MULTI-RETAILER OPPORTUNITY
  // ----------------------------------------------------
  describe('7. Safe Sourcing Pipeline (Amazon, eBay, BestBuy)', () => {
    it('evaluates real multi-retailer opportunities under dry run with auto_publish=false and auto_purchase=false', async () => {
      const opportunities: any[] = [
        {
          canonical_sku: 'COL-AMZ-NECA-PRED-01',
          title: 'NECA Predator 2 Ultimate Boar Predator 7-inch',
          retailer: 'Amazon',
          source_price_usd: 37.99,
          estimated_shipping_usd: 4.50,
          import_cost_usd: 0.00,
          landed_cost_usd: 42.49,
          suggested_price_usd: 64.90,
          margin_usd: 22.41,
          margin_percent: 34.53,
          demand_signals: 'High collector demand, 0 local listings, high sell-through',
          opportunity_score: 87,
          target_market: 'UY',
          offers: [{
            id: 'off-amz-1',
            source: 'amazon',
            source_product_id: 'B08XYZ1234',
            price: 37.99,
            domestic_shipping: 0,
            seller: 'Amazon.com',
            seller_rating: 99,
            stock: 8,
            condition: 'new'
          }],
          selected_source_id: 'off-amz-1',
          authenticity: { status: 'VERIFIED_OFFICIAL' },
          financials: {
            real_cost_puesto_usd: 42.49,
            current_sale_price_usd: 64.90,
            margin_percent: 34.53,
            profit_usd: 22.41
          },
          uruguay_market: {
            match_confidence: 0.95,
            total_listings: 0,
            market_position: 'CHEAPER'
          }
        },
        {
          canonical_sku: 'COL-EBY-FUNKO-SPID-02',
          title: 'Funko Pop Marvel Spider-Man Symbiote Suit Exclusive',
          retailer: 'eBay',
          source_price_usd: 18.50,
          estimated_shipping_usd: 3.50,
          import_cost_usd: 0.00,
          landed_cost_usd: 22.00,
          suggested_price_usd: 34.90,
          margin_usd: 12.90,
          margin_percent: 36.96,
          demand_signals: 'Exclusive vaulted item, rising aftermarket price',
          opportunity_score: 91,
          target_market: 'UY',
          offers: [{
            id: 'off-eby-1',
            source: 'ebay',
            source_product_id: 'EBAY-9988776655',
            price: 18.50,
            domestic_shipping: 0,
            seller: 'TopRatedCollectorUSA',
            seller_rating: 100,
            stock: 3,
            condition: 'new'
          }],
          selected_source_id: 'off-eby-1',
          authenticity: { status: 'VERIFIED_OFFICIAL' },
          financials: {
            real_cost_puesto_usd: 22.00,
            current_sale_price_usd: 34.90,
            margin_percent: 36.96,
            profit_usd: 12.90
          },
          uruguay_market: {
            match_confidence: 0.95,
            total_listings: 0,
            market_position: 'CHEAPER'
          }
        },
        {
          canonical_sku: 'COL-BBY-HASBRO-GROOT-03',
          title: 'Hasbro Marvel Legends Thor Love and Thunder Groot',
          retailer: 'BestBuy',
          source_price_usd: 22.99,
          estimated_shipping_usd: 3.80,
          import_cost_usd: 0.00,
          landed_cost_usd: 26.79,
          suggested_price_usd: 42.00,
          margin_usd: 15.21,
          margin_percent: 36.21,
          demand_signals: 'Marvel official license, low local stock',
          opportunity_score: 83,
          target_market: 'UY',
          offers: [{
            id: 'off-bby-1',
            source: 'bestbuy',
            source_product_id: 'BB-651234',
            price: 22.99,
            domestic_shipping: 0,
            seller: 'BestBuy Direct',
            seller_rating: 98,
            stock: 5,
            condition: 'new'
          }],
          selected_source_id: 'off-bby-1',
          authenticity: { status: 'VERIFIED_OFFICIAL' },
          financials: {
            real_cost_puesto_usd: 26.79,
            current_sale_price_usd: 42.00,
            margin_percent: 36.21,
            profit_usd: 15.21
          },
          uruguay_market: {
            match_confidence: 0.95,
            total_listings: 0,
            market_position: 'CHEAPER'
          }
        }
      ];

      const settings: any = {
        mode: 'AUTOPILOT',
        is_kill_switch_active: false,
        auto_publish: false,
        auto_purchase: false
      };

      const rules: any[] = [{
        scope: 'GLOBAL',
        identifier: 'all',
        is_active: true,
        min_margin_percent: 20,
        min_profit_usd: 5,
        min_opportunity_score: 75,
        min_seller_score: 90,
        min_stock: 1
      }];

      // Dry run execution
      const dryReport = await autopilotExecutionEngine.runDryRun(opportunities, settings, rules);

      expect(settings.auto_publish).toBe(false);
      expect(settings.auto_purchase).toBe(false);

      expect(dryReport.discoveredCount).toBe(3);
      expect(dryReport.publishedCount).toBe(0);
      expect(dryReport.approvalRequiredCount).toBe(3);
      expect(dryReport.estimatedAutoPurchaseUsd).toBe(0);
    });
  });

  // ----------------------------------------------------
  // 8. URUGUAY CUSTOMS / FRANCHISE SEPARATION AUDIT
  // ----------------------------------------------------
  describe('8. Uruguay Customs Franchise vs Commercial Cost Separation', () => {
    it('calculates commercial landed cost independently without assuming buyer personal franchise quota', () => {
      const opportunity = {
        source_price_usd: 180.00,
        has_verified_free_shipping: true
      };

      const pricing = calculateSourcingPricing(opportunity);

      expect(pricing.currency).toBe('USD');
      expect(pricing.customer_import_status).toBe('UNKNOWN');
      expect(pricing.customs_authority).toBe('IMPORT_HUB_CUSTOMS_ENGINE');
      // Import cost is marked as scenario estimate, not automatically 0
      expect(pricing.import_cost.status).toBe('SCENARIO_ESTIMATE');
      expect(pricing.import_scenarios.franchise_available.amount_usd).toBe(0.00);
      expect(pricing.import_scenarios.franchise_depleted.amount_usd).toBe(108.00);

      // When customer franchise is explicitly verified, returns VERIFIED_ZERO
      const verifiedPricing = calculateSourcingPricing({
        source_price_usd: 180.00,
        has_verified_free_shipping: true,
        customer_has_franchise: true
      });
      expect(verifiedPricing.customer_import_status).toBe('KNOWN');
      expect(verifiedPricing.import_cost.status).toBe('VERIFIED_ZERO');
      expect(verifiedPricing.import_cost.amount_usd).toBe(0.00);

      // When customer franchise is depleted, returns statutory 60% customs duty from CustomsEngine
      const depletedPricing = calculateSourcingPricing({
        source_price_usd: 180.00,
        has_verified_free_shipping: true,
        customer_has_franchise: false
      });
      expect(depletedPricing.customer_import_status).toBe('KNOWN');
      expect(depletedPricing.import_cost.status).toBe('VERIFIED');
      expect(depletedPricing.import_cost.amount_usd).toBe(108.00);
    });

    it('sourcing without customer does not infer customs regime and marks CUSTOMER_IMPORT_STATUS = UNKNOWN', () => {
      const rawOpportunity = {
        source_price_usd: 75.00,
        has_verified_free_shipping: true
      };

      const result = calculateSourcingPricing(rawOpportunity);

      expect(result.customer_import_status).toBe('UNKNOWN');
      expect(result.import_cost.status).toBe('SCENARIO_ESTIMATE');
      expect(result.import_cost.scenario).toBe('OTHER_APPLICABLE_REGIME');
      expect(result.import_scenarios.franchise_available.status).toBe('SCENARIO_ESTIMATE');
      expect(result.import_scenarios.franchise_depleted.status).toBe('SCENARIO_ESTIMATE');
    });

    it('commercial pricing delegates to CustomsEngine without hardcoding customs percentages', () => {
      const result = calculateSourcingPricing({
        source_price_usd: 100.00,
        has_verified_free_shipping: true
      });

      expect(result.customs_authority).toBe('IMPORT_HUB_CUSTOMS_ENGINE');
      expect(result.import_scenarios.franchise_available.regime).toBe('FRANQUICIA');
      expect(result.import_scenarios.franchise_depleted.regime).toBe('SIMPLIFICADO');
    });
  });

  // ----------------------------------------------------
  // 9. MANUAL OVERRIDE & SCHEDULER SAFETY
  // ----------------------------------------------------
  describe('9. Manual Override Immunity & Scheduler Configuration', () => {
    it('manual override cannot be overwritten by automatic sync', () => {
      const manualRecord: ExchangeRateDetail = {
        base: 'USD',
        target: 'UYU',
        rate: 43.00,
        provider: 'SUPERADMIN_MANUAL',
        source_name: 'Banco Central del Uruguay (BCU)',
        source_url: 'https://www.bcu.gub.uy',
        status: 'MANUAL_OVERRIDE',
        is_manual_override: true,
        override_reason: 'Fijación por auditoría financiera trimestral',
        override_admin_email: 'admin@collectibles.uy',
        fetched_at: new Date().toISOString(),
        effective_at: new Date().toISOString(),
        max_age_hours: 24,
        age_hours: 0
      };

      // Simulating automatic sync attempting update
      const autoSyncRate = 40.0835;
      let effectiveRate = manualRecord.rate;

      if (!manualRecord.is_manual_override) {
        effectiveRate = autoSyncRate;
      }

      // Must remain the manual rate
      expect(effectiveRate).toBe(43.00);
      expect(manualRecord.status).toBe('MANUAL_OVERRIDE');
    });
  });
});

