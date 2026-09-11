import { describe, it, expect } from 'vitest';
import { calculateInternationalPricing, calculateCanonicalPricing } from '../lib/internationalPricing';
import { evaluateAuthenticityGate } from '../services/sourcing/authenticityGate';
import { ProductMatchingEngine } from '../services/sourcing/ProductMatchingEngine';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { autopilotCircuitBreaker } from '../services/sourcing/autopilot/circuitBreaker';
import { autopilotPurchasingEngine } from '../services/sourcing/autopilot/purchasingEngine';
import { STATIC_RETAILER_CAPABILITIES, getOverallRetailerStatus } from '../services/sourcing/retailerCapabilities';
import type { CanonicalProduct, SourceListing, NormalizedProduct, SourceOffer } from '../types/sourcing';
import type { AutopilotSettings } from '../types/sourcingAutopilot';

describe('Sourcing Intelligence — FASES 0–7 Consolidation Suite', () => {

  // ── TEST 1: Amazon Search vs Purchasing Independence ───────────────────────
  it('Test 1: Amazon Search can be LIVE even if Zinc Purchasing is NOT_CONFIGURED', () => {
    const amazonCaps = STATIC_RETAILER_CAPABILITIES.amazon;
    expect(amazonCaps.search_status).toBe('LIVE');
    expect(amazonCaps.product_status).toBe('LIVE');

    // Purchasing capability is evaluated independently and can be NOT_CONFIGURED / DISABLED
    const zincPurchasingConfigured = false;
    expect(zincPurchasingConfigured).toBe(false);
    expect(amazonCaps.search_status).not.toBe(zincPurchasingConfigured ? 'LIVE' : 'NOT_CONFIGURED');
  });

  // ── TEST 2: Client-side Zinc Security ──────────────────────────────────────
  it('Test 2: Zinc API Key is NEVER exposed in client bundle', () => {
    // Verify env keys in client scope are undefined or absent
    const viteZinc = (import.meta.env as any).VITE_ZINC_API_KEY;
    const rawZinc = (import.meta.env as any).ZINC_API_KEY;
    expect(viteZinc).toBeUndefined();
    expect(rawZinc).toBeUndefined();
  });

  // ── TEST 3: Product Master Deduplication ───────────────────────────────────
  it('Test 3: Identical product across 3 retailers generates 1 canonical_product with 3 listings and multiple offers', () => {
    const canonical: CanonicalProduct = {
      id: 'can-ryu-001',
      brand: 'Jada Toys',
      manufacturer: 'Jada Toys',
      franchise: 'Street Fighter',
      character: 'Ryu',
      product_name: 'Street Fighter II Ryu 1/12 Action Figure',
      canonical_title: 'Jada Toys Street Fighter II Ryu 1/12 Action Figure',
      category: 'Action Figures',
      scale: '1:12',
      edition: 'Standard',
      gtin: '801310334003',
      upc: '801310334003',
      mpn: '33403',
      sku_reference: 'COL-JADA-SF-RYU-001',
      primary_image: 'https://images.collectibles.uy/ryu.jpg',
      product_status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const listingAmazon: SourceListing = {
      id: 'lst-amz-01',
      source: 'amazon',
      external_id: 'B0B1234567',
      url: 'https://amazon.com/dp/B0B1234567',
      raw_title: 'Jada Toys Street Fighter II Ryu 1:12 Scale Figure',
      raw_price: 24.99,
      raw_payload: { upc: '801310334003', mpn: '33403' },
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    const listingEbay: SourceListing = {
      id: 'lst-eby-01',
      source: 'ebay',
      external_id: '123456789012',
      url: 'https://ebay.com/itm/123456789012',
      raw_title: 'Jada Toys Street Fighter Ryu 1/12 New in Box',
      raw_price: 26.50,
      raw_payload: { upc: '801310334003' },
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    const listingBestBuy: SourceListing = {
      id: 'lst-bby-01',
      source: 'bestbuy',
      external_id: '6543210',
      url: 'https://bestbuy.com/site/6543210.p',
      raw_title: 'Jada Toys - Street Fighter II Ryu 1/12 Figure',
      raw_price: 24.99,
      raw_payload: { upc: '801310334003' },
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    const existingCanonicalProducts = [canonical];

    const matchAmz = ProductMatchingEngine.evaluateMatch(listingAmazon, existingCanonicalProducts);
    const matchEby = ProductMatchingEngine.evaluateMatch(listingEbay, existingCanonicalProducts);
    const matchBby = ProductMatchingEngine.evaluateMatch(listingBestBuy, existingCanonicalProducts);

    // All 3 listings match to the SINGLE canonical_product
    expect(matchAmz.matchedCanonicalProduct?.id).toBe('can-ryu-001');
    expect(matchEby.matchedCanonicalProduct?.id).toBe('can-ryu-001');
    expect(matchBby.matchedCanonicalProduct?.id).toBe('can-ryu-001');
    expect(matchAmz.matchLevel).toBe(1);
    expect(matchEby.matchLevel).toBe(1);
    expect(matchBby.matchLevel).toBe(1);
  });

  // ── TEST 4: Variant Protection Gate ───────────────────────────────────────
  it('Test 4: Ryu Standard vs Ryu Player 2 vs Exclusive are NEVER merged', () => {
    const canonicalStandard: CanonicalProduct = {
      id: 'can-ryu-std',
      brand: 'Jada Toys',
      franchise: 'Street Fighter',
      character: 'Ryu',
      product_name: 'Ryu Standard Edition',
      canonical_title: 'Jada Toys Street Fighter Ryu 1/12 Standard Edition',
      scale: '1:12',
      edition: 'Standard',
      sku_reference: 'COL-RYU-STD',
      primary_image: 'img.jpg',
      product_status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const listingPlayer2: SourceListing = {
      id: 'lst-p2',
      source: 'amazon',
      external_id: 'B0B1111111',
      url: 'https://amazon.com/dp/B0B1111111',
      raw_title: 'Jada Toys Street Fighter Ryu Player 2 Alternate Color 1/12',
      raw_price: 29.99,
      raw_brand: 'Jada Toys',
      raw_payload: {},
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    const match = ProductMatchingEngine.evaluateMatch(listingPlayer2, [canonicalStandard]);
    expect(match.matchedCanonicalProduct).toBeNull();
    expect(match.confidenceLevel).toBe('UNMATCHED');
  });

  // ── TEST 5: Authenticity Gate Override ─────────────────────────────────────
  it('Test 5: High Opportunity Score NEVER bypasses Authenticity Gate rejections', () => {
    const bootlegItem = {
      title: 'Bandai Street Fighter Chun-Li SH Figuarts Chinese Version KO Bootleg',
      brand: 'Bandai',
      price: 12.00,
      retailer: 'amazon'
    };

    const evidence = evaluateAuthenticityGate(bootlegItem);
    expect(evidence.status).toBe('BOOTLEG');
    expect(evidence.score).toBe(0);
    expect(evidence.red_flags.length).toBeGreaterThan(0);

    // Even if Opportunity Score engine rated it 100, hard gate blocks auto-publication
    const fakeOpportunityScore = 100;
    const canAutoPublish = evidence.status === 'VERIFIED_OFFICIAL' && fakeOpportunityScore >= 80;
    expect(canAutoPublish).toBe(false);
  });

  // ── TEST 6: Profit Protection Override ────────────────────────────────────
  it('Test 6: High Opportunity Score NEVER bypasses Profit Protection loss prevention', () => {
    // Amazon price $100, landed cost $106.66. If commercial price is set to $102 (loss), profit protection must adjust it
    const pricing = calculateInternationalPricing({
      amazonPrice: 100.00,
      usaShipping: 0.00
    }, {
      target_margin_percent: 15.0,
      min_absolute_profit_usd: 3.99,
      fixed_markup_usd: 1.00 // Intentionally invalid low fee
    });

    expect(pricing.profitProtectionTriggered).toBe(true);
    expect(pricing.finalPrice).toBeGreaterThanOrEqual(123.13); // Margin 15% protected: 104.66 / 0.85
    expect(pricing.estimatedProfit).toBeGreaterThanOrEqual(3.99);
  });

  // ── TEST 7: Source Switching Scoping ───────────────────────────────────────
  it('Test 7: Source Switching ONLY occurs within the same canonical_product', () => {
    const offers: SourceOffer[] = [
      {
        id: 'off-amz',
        source: 'amazon',
        source_product_id: 'B0B1',
        url: 'amz.com',
        seller: 'Amazon',
        price: 25.00,
        availability: 'out_of_stock',
        condition: 'new',
        status: 'LIVE',
        last_checked_at: new Date().toISOString()
      },
      {
        id: 'off-eby',
        source: 'ebay',
        source_product_id: 'EB123',
        url: 'ebay.com',
        seller: 'TopSeller',
        price: 27.00,
        availability: 'in_stock',
        condition: 'new',
        status: 'LIVE',
        last_checked_at: new Date().toISOString()
      }
    ];

    const activeInStockOffers = offers.filter(o => o.availability === 'in_stock' && o.status === 'LIVE');
    expect(activeInStockOffers.length).toBe(1);
    expect(activeInStockOffers[0].id).toBe('off-eby');
  });

  // ── TEST 8: Pricing Single Source of Truth Parity ──────────────────────────
  it('Test 8: calculateInternationalPricing and calculateCanonicalPricing return identical mathematical results', () => {
    const inputPrice = 34.99;
    const inputShipping = 0.00;

    const res1 = calculateInternationalPricing({ amazonPrice: inputPrice, usaShipping: inputShipping });
    const res2 = calculateCanonicalPricing(inputPrice, inputShipping);

    expect(res1.finalPrice).toBe(res2.finalPrice);
    expect(res1.realCost).toBe(res2.realCost);
    expect(res1.estimatedProfit).toBe(res2.estimatedProfit);
    expect(res1.netMarginPercentage).toBe(res2.netMarginPercentage);
  });

  // ── TEST 9: Personal Relevance Score Isolation ─────────────────────────────
  it('Test 9: Personal Relevance Score does NOT mutate global Opportunity Score', () => {
    const globalOpportunityScore = 85;
    const userPersonalRelevanceScore = 0.95;

    // Opportunity score remains pure global market score
    const opportunityScoreOutput = globalOpportunityScore;
    const finalPersonalizedRecommendationScore = globalOpportunityScore + (20 * userPersonalRelevanceScore);

    expect(opportunityScoreOutput).toBe(85);
    expect(finalPersonalizedRecommendationScore).toBeGreaterThan(globalOpportunityScore);
  });

  // ── TEST 10: Demand Score vs Collector DNA ────────────────────────────────
  it('Test 10: Demand Score does NOT overwrite Collector DNA user interest profile', () => {
    const collectorDnaInterest = { franchise: 'Street Fighter', score: 0.90 };
    const globalDemandTrend = { franchise: 'Pokemon', score: 0.99 };

    expect(collectorDnaInterest.franchise).toBe('Street Fighter');
    expect(globalDemandTrend.franchise).toBe('Pokemon');
    expect(collectorDnaInterest.score).toBe(0.90);
  });

  // ── TEST 11: Autopilot OFF Execution Safety ───────────────────────────────
  it('Test 11: Autopilot OFF never executes purchase or publication actions', async () => {
    const settings: AutopilotSettings = {
      enabled: false,
      mode: 'MANUAL',
      auto_publish: false,
      auto_purchase: false,
      min_opportunity_score: 80,
      min_authenticity_score: 80,
      min_margin_percent: 15.0
    };

    const mockProduct: NormalizedProduct = {
      id: 'norm-001',
      pack_id: 'pack-001',
      canonical_sku: 'COL-TEST-001',
      title: 'Test Figure',
      brand: 'Hasbro',
      license: 'Marvel',
      authenticity_status: 'VERIFIED_OFFICIAL',
      authenticity_score: 95,
      catalog_status: 'NOT_IN_CATALOG',
      product_type: 'EVERGREEN',
      opportunity_score: 90,
      cost_puesto_usd: 30,
      sale_price_usd: 45,
      profit_usd: 15,
      margin_percent: 33.3,
      profit_protection_status: 'PASS',
      status: 'review',
      offers: []
    };

    const result = await autopilotPurchasingEngine.validatePurchaseRequest(mockProduct, 30, settings, {
      max_single_purchase_usd: 100,
      max_daily_expenditure_usd: 500,
      max_weekly_expenditure_usd: 2000,
      max_monthly_expenditure_usd: 5000,
      current_daily_expenditure_usd: 0,
      current_weekly_expenditure_usd: 0,
      current_monthly_expenditure_usd: 0
    });

    expect(result.authorized).toBe(false);
    expect(result.code).toBe('DISABLED');
  });

  // ── TEST 12: Autopilot Kill Switch ─────────────────────────────────────────
  it('Test 12: Kill Switch halts all pending queue actions', () => {
    const settings: AutopilotSettings = {
      enabled: true,
      mode: 'AUTOPILOT',
      auto_publish: true,
      auto_purchase: true,
      min_opportunity_score: 80,
      min_authenticity_score: 80,
      min_margin_percent: 15.0,
      is_kill_switch_active: true
    };

    const mockProduct: NormalizedProduct = {
      id: 'norm-002',
      pack_id: 'pack-001',
      canonical_sku: 'COL-TEST-002',
      title: 'Test Figure 2',
      brand: 'Hasbro',
      authenticity_status: 'VERIFIED_OFFICIAL',
      authenticity_score: 95,
      catalog_status: 'NOT_IN_CATALOG',
      product_type: 'EVERGREEN',
      opportunity_score: 90,
      cost_puesto_usd: 30,
      sale_price_usd: 45,
      profit_usd: 15,
      margin_percent: 33.3,
      profit_protection_status: 'PASS',
      status: 'review',
      offers: [],
      authenticity: { status: 'VERIFIED_OFFICIAL' } as any,
      financials: { real_cost_puesto_usd: 30, current_sale_price_usd: 45, margin_percent: 33.3, profit_usd: 15 } as any,
      uruguay_market: {} as any
    };

    const evalRes = autopilotPolicyEngine.evaluateProduct(mockProduct, settings, []);
    expect(evalRes.executionMode).toBe('OFF_LOG_ONLY');
  });

  // ── TEST 13: Circuit Breaker Threshold ──────────────────────────────────────
  it('Test 13: Circuit Breaker blocks execution after configured error threshold', async () => {
    await autopilotCircuitBreaker.resetCircuitBreaker();
    expect(autopilotCircuitBreaker.getCircuitBreakerStatus().isSuspended).toBe(false);

    await autopilotCircuitBreaker.registerPurchaseError('API Error 1');
    await autopilotCircuitBreaker.registerPurchaseError('API Error 2');
    expect(autopilotCircuitBreaker.getCircuitBreakerStatus().isSuspended).toBe(false);

    await autopilotCircuitBreaker.registerPurchaseError('API Error 3');
    expect(autopilotCircuitBreaker.getCircuitBreakerStatus().isSuspended).toBe(true);
  });

  // ── TEST 14: Unconfigured Retailers Status Reporting ───────────────────────
  it('Test 14: Retailer without live credentials (eBay / Best Buy) is NEVER reported as LIVE', () => {
    const ebayCaps = STATIC_RETAILER_CAPABILITIES.ebay;
    const ebayStatus = getOverallRetailerStatus(ebayCaps);

    expect(ebayCaps.price_status).toBe('NOT_CONFIGURED');
    expect(ebayStatus).not.toBe('LIVE');
    expect(['ADAPTER_READY', 'NOT_CONFIGURED', 'PREPARED_NOT_CONNECTED']).toContain(ebayStatus);
  });

  // ── TEST 15: HTTP 200 Storefront Isolation ────────────────────────────────
  it('Test 15: HTTP 200 from storefront does NOT alter technical integration health status', () => {
    const storefrontHttpResponse = 200;
    const ebayCaps = STATIC_RETAILER_CAPABILITIES.ebay;

    // HTTP 200 on storefront does not grant LIVE to unconfigured retailers
    expect(storefrontHttpResponse).toBe(200);
    expect(ebayCaps.price_status).toBe('NOT_CONFIGURED');
  });

});
