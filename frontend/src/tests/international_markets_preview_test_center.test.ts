// frontend/src/tests/international_markets_preview_test_center.test.ts

import { describe, it, expect } from 'vitest';
import { INITIAL_DEFAULT_MARKETS, resolveMarket, resolveMarketRouting, isSkyPostalMarket } from '../lib/marketEngine/marketEngine';
import {
  evaluateProductCompliance,
  calculateBillableWeight,
  calculateTransportationCharge,
  calculateFuelSurcharge,
  calculateCommercialPricing,
  generateQuoteSnapshot,
  CONTRACTUAL_RATE_CARDS,
  CONTRACTUAL_FUEL_BANDS
} from '../lib/skypostal/skypostalPricing';
import {
  runMarketDiagnostics,
  runAllMarketsDiagnostics
} from '../lib/skypostal/marketDiagnosticEngine';

describe('INTERNATIONAL MARKETS — PREVIEW & TEST CENTER SUITE', () => {
  // 1. ALL 8 COUNTRIES VISIBILITY & ROUTING ISOLATION
  it('1. Matriz de 8 países: UY y AR operan con Import Hub; CL, PE, BR, CO, EC y MX operan con SkyPostal', () => {
    expect(INITIAL_DEFAULT_MARKETS.length).toBe(8);

    const uy = resolveMarket('UY');
    const ar = resolveMarket('AR');
    expect(uy.logisticsMode).toBe('IMPORT_HUB');
    expect(ar.logisticsMode).toBe('IMPORT_HUB');
    expect(isSkyPostalMarket(uy)).toBe(false);
    expect(isSkyPostalMarket(ar)).toBe(false);

    const skypostalCodes = ['CL', 'PE', 'BR', 'CO', 'EC', 'MX'];
    skypostalCodes.forEach((code) => {
      const market = resolveMarket(code);
      expect(market.logisticsMode).toBe('SKYPOSTAL');
      expect(isSkyPostalMarket(market)).toBe(true);
    });
  });

  // 2. MEXICO VISIBILITY & CONFIGURATION
  it('2. México está completamente modelado en Admin, inicialmente DISABLED pero con capacidad de Preview', () => {
    const mx = resolveMarket('MX');
    expect(mx.countryCode).toBe('MX');
    expect(mx.countryName).toBe('México');
    expect(mx.marketStatus).toBe('DISABLED');
    expect(mx.logisticsMode).toBe('SKYPOSTAL');
    expect(mx.provider).toBe('skypostal');

    // Mexico Rate cards verification: both standard (MX-340) and regulated (MX-340-R) exist
    expect(CONTRACTUAL_RATE_CARDS['MX-340']).toBeDefined();
    expect(CONTRACTUAL_RATE_CARDS['MX-340'].gateway).toBe('GDL');
    expect(CONTRACTUAL_RATE_CARDS['MX-340'].serviceCode).toBe(1);

    expect(CONTRACTUAL_RATE_CARDS['MX-340-R']).toBeDefined();
    expect(CONTRACTUAL_RATE_CARDS['MX-340-R'].gateway).toBe('LRD');
    expect(CONTRACTUAL_RATE_CARDS['MX-340-R'].serviceCode).toBe(502);
  });

  // 3. MEXICO STANDARD VS REGULATED COMPLIANCE
  it('3. México diferencia correctamente producto STANDARD (MX-340) vs REGULATED (MX-340-R)', () => {
    const standardCollectible = evaluateProductCompliance(
      { title: 'Figura Dragon Ball Z Super Saiyan', fobValueUsd: 45, quantity: 1, weightKg: 0.5 },
      'MX'
    );
    expect(standardCollectible.status).toBe('ALLOWED');
    expect(standardCollectible.serviceCode).toBe(1);
    expect(standardCollectible.specialTariffCategory).toBe('STANDARD');

    const regulatedProduct = evaluateProductCompliance(
      { title: 'Bálsamo Labial Temático & Suplemento Gamer', fobValueUsd: 30, quantity: 1, weightKg: 0.4, isCosmetic: true },
      'MX'
    );
    expect(regulatedProduct.status).toBe('REGULATED');
    expect(regulatedProduct.serviceCode).toBe(502);
    expect(regulatedProduct.specialTariffCategory).toBe('REGULATED');
  });

  // 4. ECUADOR CATEGORY B (4X4) VS CATEGORY C
  it('4. Ecuador clasifica correctamente Categoría B (4x4, <=4kg, <=$400) vs Categoría C (>4kg o >$400)', () => {
    const catB = evaluateProductCompliance(
      { title: 'Comic Book Collection Pack', fobValueUsd: 150, quantity: 1, weightKg: 2.0 },
      'EC'
    );
    expect(catB.status).toBe('ALLOWED');
    expect(catB.specialTariffCategory).toBe('CATEGORY_B');
    expect(catB.customsClassification).toBe('CATEGORY_B_4X4');

    const catC = evaluateProductCompliance(
      { title: 'Estatua Resina Master Edition', fobValueUsd: 550, quantity: 1, weightKg: 5.5 },
      'EC'
    );
    expect(catC.status).toBe('ALLOWED');
    expect(catC.specialTariffCategory).toBe('CATEGORY_C');
    expect(catC.customsClassification).toBe('CATEGORY_C_GENERAL');
  });

  // 5. PERU QUANTITY RESTRICTION & DE MINIMIS
  it('5. Perú valida límite de 10 unidades para personas naturales y De Minimis <= $200 FOB', () => {
    const normalToys = evaluateProductCompliance(
      { title: 'Figura Spider-Man', fobValueUsd: 50, quantity: 3, weightKg: 0.8 },
      'PE'
    );
    expect(normalToys.status).toBe('ALLOWED');
    expect(normalToys.requiredDocuments).toContain('DNI_OR_RUC');

    const excessToys = evaluateProductCompliance(
      { title: 'Mystery Box Mini Figuras', fobValueUsd: 120, quantity: 12, weightKg: 1.5 },
      'PE'
    );
    expect(excessToys.status).toBe('RESTRICTED');
    expect(excessToys.matchedRule).toBe('PE_MAX_TOYS_PER_SHIPMENT');
  });

  // 6. CHILE MAXIMUM COURIER FOB & DOCUMENTS
  it('6. Chile valida límite máximo courier de US$ 1,000 FOB y RUT requerido', () => {
    const standardFigure = evaluateProductCompliance(
      { title: 'Figura Nendoroid', fobValueUsd: 65, quantity: 1, weightKg: 0.3 },
      'CL'
    );
    expect(standardFigure.status).toBe('ALLOWED');
    expect(standardFigure.requiredDocuments).toContain('RUT_BENEFICIARIO');

    const expensiveStatue = evaluateProductCompliance(
      { title: 'Estatua Prime 1 Studio 1/3', fobValueUsd: 1500, quantity: 1, weightKg: 8.0 },
      'CL'
    );
    expect(expensiveStatue.status).toBe('RESTRICTED');
    expect(expensiveStatue.matchedRule).toBe('CL_MAX_VALUE_EXCEEDED');
  });

  // 7. DIAGNOSTIC ENGINE MULTI-POINT VALIDATION WITH HONEST API STATES
  it('7. Diagnostic Engine ejecuta los 20 puntos con estados honestos (PASS, NOT_CONFIGURED, NOT_TESTED)', () => {
    const diagnosticCL = runMarketDiagnostics('CL');
    expect(diagnosticCL.isSkyPostal).toBe(true);
    expect(diagnosticCL.passedCount).toBeGreaterThanOrEqual(10);
    expect(diagnosticCL.overallStatus).toBe('PREVIEW_READY');

    // Verify external API checks are honest: NOT_CONFIGURED / NOT_TESTED
    const apiCreds = diagnosticCL.checks.find(c => c.id === 'api_credentials');
    expect(apiCreds?.status).toBe('NOT_CONFIGURED');

    const shipmentCap = diagnosticCL.checks.find(c => c.id === 'shipment_capability');
    expect(shipmentCap?.status).toBe('NOT_TESTED');

    const labelCap = diagnosticCL.checks.find(c => c.id === 'label_capability');
    expect(labelCap?.status).toBe('NOT_TESTED');
  });

  // 8. TEST ALL MARKETS CAPABILITY
  it('8. Test All Markets ejecuta diagnóstico seguro para todos los destinos sin llamadas a APIs externas', () => {
    const allResults = runAllMarketsDiagnostics(INITIAL_DEFAULT_MARKETS);
    expect(allResults.length).toBe(8);

    const uyRes = allResults.find(r => r.countryCode === 'UY');
    expect(uyRes?.logisticsMode).toBe('IMPORT_HUB');
    expect(uyRes?.overallStatus).toBe('IMPORT_HUB_OPERATIONAL');

    const mxRes = allResults.find(r => r.countryCode === 'MX');
    expect(mxRes?.isSkyPostal).toBe(true);
    expect(mxRes?.overallStatus).toBe('PREVIEW_READY');

    const clRes = allResults.find(r => r.countryCode === 'CL');
    expect(clRes?.isSkyPostal).toBe(true);
    expect(clRes?.overallStatus).toBe('PREVIEW_READY');
  });

  // 9. QUOTE SNAPSHOT & PRICING FORMULA INTEGRITY
  it('9. Pipeline de Pricing genera cotización inmutable respetando fórmula: Tarifa + Fuel + Markup = Precio Cliente', () => {
    const quote = generateQuoteSnapshot({
      countryCode: 'CL',
      product: {
        title: 'Figura Marvel Legends',
        fobValueUsd: 40,
        quantity: 1,
        actualWeightKg: 0.5
      }
    });

    expect(quote.isEligible).toBe(true);
    expect(quote.rateCardCode).toBe('CL-340');
    expect(quote.pricingBreakdown.transportationChargeUsd).toBe(10.53); // CL-340 0.50kg bracket
    
    // Provider cost = Base + Fuel
    const expectedProviderCost = Number((quote.pricingBreakdown.transportationChargeUsd + quote.pricingBreakdown.fuelAmountUsd).toFixed(2));
    expect(quote.pricingBreakdown.providerCostUsd).toBe(expectedProviderCost);

    // Customer price = Provider cost * 1.35
    const expectedCustomerPrice = Number((expectedProviderCost * 1.35).toFixed(2));
    expect(quote.pricingBreakdown.customerShippingPriceUsd).toBe(expectedCustomerPrice);
  });
});
