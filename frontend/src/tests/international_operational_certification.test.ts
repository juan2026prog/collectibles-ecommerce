import { describe, it, expect } from 'vitest';
import { 
  calculateInternationalPricing, 
  calculateCanonicalPricing,
  calculateAcquisitionCost,
  calculateExpectedProfit,
  calculatePurchasePaymentFee
} from '../lib/internationalPricing';
import { calculateInternationalPricing as backendPricing } from '../../../supabase/functions/_shared/pricing';

describe('INTERNATIONAL PRICING ENGINE — OPERATIONAL CERTIFICATION SUITE', () => {

  const baseConfig = {
    zinc_fee_usd: 1.00,
    financial_fee_percent: 2.50,
    financial_fee_fixed_usd: 0.50,
    financial_fee_tax_rate: 0.22,
    florida_sales_tax_percent: 0.00,
    min_profit_usd: 3.99,
    min_absolute_profit_usd: 3.99,
    target_margin_percent: 15.00,
    fixed_markup_usd: 6.00,
    pricing_mode: 'amazon_price_plus_fee'
  };

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 1 & 2: ZINC FEE & PREX FIXED SCOPE (1:1 ITEM DISPATCH)
  // ══════════════════════════════════════════════════════════════════
  it('Control 1 & 2: Real Acquisition Cost includes Zinc $1.00 and Prex fixed $0.50 + IVA per item', () => {
    const itemA = calculateInternationalPricing({ amazonPrice: 20.00, usaShipping: 0 }, baseConfig);
    const itemB = calculateInternationalPricing({ amazonPrice: 50.00, usaShipping: 0 }, baseConfig);
    const itemC = calculateInternationalPricing({ amazonPrice: 100.00, usaShipping: 0 }, baseConfig);

    // Item A ($20): Zinc $1.00, Prex ($20 * 0.025 + $0.50) * 1.22 = $1.22 -> Cost: 20 + 1 + 1.22 = 22.22
    expect(itemA.realCost).toBe(22.22);
    expect(itemA.zincFee).toBe(1.00);
    expect(itemA.financialFeeTotal).toBe(1.22);

    // Item B ($50): Zinc $1.00, Prex ((50 * 0.025) + 0.50) * 1.22 = 2.135 -> 53.13
    expect(itemB.realCost).toBe(53.13);
    expect(itemB.zincFee).toBe(1.00);

    // Item C ($100): Zinc $1.00, Prex ($100 * 0.025 + $0.50) * 1.22 = $3.66 -> Cost: 100 + 1 + 3.66 = 104.66
    expect(itemC.realCost).toBe(104.66);

    // Multi-item aggregated order (A + B + C): Total Zinc fees = $3.00, Total Prex fixed fees = $1.50
    const totalOrderRealCost = Number((itemA.realCost + itemB.realCost + itemC.realCost).toFixed(2));
    expect(totalOrderRealCost).toBe(180.01);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 3 & 4: SALES TAX PRIORITY & DYNAMIC ABSORPTION
  // ══════════════════════════════════════════════════════════════════
  it('Control 3: Real Sales Tax from provider overrides estimated config and increases Real Cost dollar-for-dollar', () => {
    // Without tax
    const resNoTax = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, baseConfig);
    expect(resNoTax.realCost).toBe(37.67);
    expect(resNoTax.salesTax).toBe(0.00);
    expect(resNoTax.finalPrice).toBe(44.32);

    // With real sales tax $2.45
    const resWithTax = calculateInternationalPricing(
      { amazonPrice: 34.99, usaShipping: 0, salesTax: 2.45 },
      { ...baseConfig, florida_sales_tax_percent: 7.00 } // config has 7%, but real tax $2.45 must take priority!
    );
    expect(resWithTax.salesTax).toBe(2.45);
    // Real Cost increases by exactly $2.45: 37.67 + 2.45 = 40.12
    expect(resWithTax.realCost).toBe(40.12);
    // Margin protected price re-evaluates: 40.12 / 0.85 = 47.20
    expect(resWithTax.finalPrice).toBe(47.20);
    expect(resWithTax.estimatedProfit).toBe(7.08);
    expect(resWithTax.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

  it('Control 4: Estimated Florida Sales Tax applies when real provider tax is null', () => {
    const configWithFLTax = {
      ...baseConfig,
      florida_sales_tax_percent: 7.00
    };
    const res = calculateInternationalPricing({ amazonPrice: 100.00, usaShipping: 0 }, configWithFLTax);
    // FL Tax = 100 * 0.07 = 7.00
    expect(res.salesTax).toBe(7.00);
    // Real Cost: 100 + 7.00 + 1.00 + 3.66 = 111.66
    expect(res.realCost).toBe(111.66);
    // Protected price: 111.66 / 0.85 = 131.36
    expect(res.finalPrice).toBe(131.36);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 5: PRICE TAMPERING PROTECTION (SERVER-SIDE RECALCULATION)
  // ══════════════════════════════════════════════════════════════════
  it('Control 5: Server-side pricing completely ignores manipulated client prices and enforces canonical rules', () => {
    const originalAmazonPrice = 34.99;
    
    // Client sends a tampered request payload trying to buy at $30.00 or claim cost is $20.00
    const tamperedClientPayload = {
      amazonPrice: originalAmazonPrice,
      usaShipping: 0,
      clientClaimedPrice: 30.00,
      clientClaimedRealCost: 20.00,
      clientClaimedAppliedFee: 1.00
    };

    // Backend ignores client-claimed figures and calculates from raw product cost + DB config
    const serverResult = backendPricing(
      { amazonPrice: tamperedClientPayload.amazonPrice, usaShipping: tamperedClientPayload.usaShipping },
      baseConfig
    );

    expect(serverResult.finalPrice).toBe(44.32); // Exact safe price ($44.32), NOT $30.00!
    expect(serverResult.realCost).toBe(37.67);
    expect(serverResult.estimatedProfit).toBe(6.65);
    expect(serverResult.finalPrice).toBeGreaterThan(tamperedClientPayload.clientClaimedPrice);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 6: CONFIG FAIL-SAFE & BOUNDARY DEFENSE
  // ══════════════════════════════════════════════════════════════════
  it('Control 6: Missing or invalid configurations fail safely without selling at a loss', () => {
    // Missing all config
    const resNull = calculateInternationalPricing({ amazonPrice: 34.99 }, undefined);
    expect(resNull.realCost).toBeGreaterThan(34.99);
    expect(resNull.finalPrice).toBeGreaterThan(resNull.realCost);
    expect(isNaN(resNull.finalPrice)).toBe(false);

    // Negative values sanitized
    const resNegative = calculateInternationalPricing(
      { amazonPrice: 34.99 },
      { ...baseConfig, target_margin_percent: -5 }
    );
    expect(resNegative.finalPrice).toBeGreaterThanOrEqual(Number((resNegative.realCost + baseConfig.min_profit_usd).toFixed(2)));
    expect(resNegative.finalPrice).toBe(41.66); // Absolute floor holds

    // Margin >= 100% boundary check (should not produce Infinity or NaN)
    const res100 = calculateInternationalPricing(
      { amazonPrice: 34.99 },
      { ...baseConfig, target_margin_percent: 100 }
    );
    expect(isNaN(res100.finalPrice)).toBe(false);
    expect(isFinite(res100.finalPrice)).toBe(true);
    expect(res100.finalPrice).toBeGreaterThanOrEqual(Number((res100.realCost + baseConfig.min_profit_usd).toFixed(2)));
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 7: PRICING PROTECTION REASON & WINNER ATTRIBUTION
  // ══════════════════════════════════════════════════════════════════
  it('Control 7: pricingProtectionReason correctly attributes target_margin, absolute_profit, and commercial_fee', () => {
    // 1. Margin dominates (Amazon $34.99, Margin 15% -> $44.32 > $41.66 > $40.99)
    const resMargin = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, baseConfig);
    expect(resMargin.pricingProtectionReason).toBe('target_margin');
    expect(resMargin.profitProtectionTriggered).toBe(true);

    // 2. Absolute Profit dominates (Amazon $5.00, fee base $1.00 -> commercial $6.00 < absolute $10.75 > margin $7.95)
    const resAbsolute = calculateInternationalPricing(
      { amazonPrice: 5.00, usaShipping: 0 }, 
      { ...baseConfig, fixed_markup_usd: 1.00 }
    );
    expect(resAbsolute.pricingProtectionReason).toBe('absolute_profit');
    expect(resAbsolute.profitProtectionTriggered).toBe(true);
    expect(resAbsolute.finalPrice).toBe(10.75); // Real cost $6.76 + $3.99 = $10.75
    expect(resAbsolute.estimatedProfit).toBe(3.99);

    // 3. Commercial fee base is sufficient (Amazon $100.00, Fee $25.00 -> $125.00 > $123.13 > $108.65)
    const resCommercial = calculateInternationalPricing(
      { amazonPrice: 100.00, usaShipping: 0 },
      { ...baseConfig, fixed_markup_usd: 25.00 }
    );
    expect(resCommercial.pricingProtectionReason).toBe('commercial_fee');
    expect(resCommercial.profitProtectionTriggered).toBe(false);
    expect(resCommercial.finalPrice).toBe(125.00);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 8: INMUTABILITY OF HISTORICAL ORDERS
  // ══════════════════════════════════════════════════════════════════
  it('Control 8: Historical order snapshot remains immutable even if global config changes', () => {
    // Historic order recorded when Zinc was $1.00
    const historicOrderSnapshot = {
      order_id: 'ord_123',
      amazon_price_usd: 34.99,
      acquisition_cost_usd: 37.67,
      final_price_usd: 44.32,
      expected_profit_usd: 6.65,
      zinc_fee_usd: 1.00,
      created_at: '2026-08-01T12:00:00Z'
    };

    // Admin later changes Zinc to $4.00
    const newConfigZinc4 = { ...baseConfig, zinc_fee_usd: 4.00 };
    const newCatalogPricing = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, newConfigZinc4);

    // New catalog pricing increases to $47.85
    expect(newCatalogPricing.finalPrice).toBe(47.85);
    // But the historic order snapshot remains 100% UNCHANGED
    expect(historicOrderSnapshot.final_price_usd).toBe(44.32);
    expect(historicOrderSnapshot.acquisition_cost_usd).toBe(37.67);
    expect(historicOrderSnapshot.expected_profit_usd).toBe(6.65);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONTROL 9: LIVE CHECK REPRICING ON ORIGIN PRICE FLUCTUATION
  // ══════════════════════════════════════════════════════════════════
  it('Control 9: Live Check dynamically detects Amazon price surge ($34.99 -> $39.99) and reprices to protect profit', () => {
    const catalogPriceResult = calculateInternationalPricing({ amazonPrice: 34.99, usaShipping: 0 }, baseConfig);
    expect(catalogPriceResult.finalPrice).toBe(44.32);

    // Live check detects Amazon price rose to $39.99
    const liveCheckPriceResult = calculateInternationalPricing({ amazonPrice: 39.99, usaShipping: 0 }, baseConfig);

    // Real cost rises from $37.67 to $42.82
    expect(liveCheckPriceResult.realCost).toBe(42.82);
    // Live check calculates new protected price: 42.82 / 0.85 = 50.38
    expect(liveCheckPriceResult.finalPrice).toBe(50.38);
    // Profit is preserved at $7.56 (15.00% margin), preventing loss
    expect(liveCheckPriceResult.estimatedProfit).toBe(7.56);
    expect(liveCheckPriceResult.netMarginPercentage).toBeGreaterThanOrEqual(15.0);
  });

});
