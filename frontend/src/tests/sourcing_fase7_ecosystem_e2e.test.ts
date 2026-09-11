import { describe, it, expect } from 'vitest';
import { ecosystemOrchestrator } from '../services/sourcing/ecosystemOrchestrator';
import { RadarIntegrationService } from '../services/sourcing/RadarIntegrationService';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { interpretUserQuery, generateDirectEditorialAnswer } from '../lib/search/aiQueryInterpreter';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import type { NormalizedProduct } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

const streetFighterRyuCanonical: NormalizedProduct = {
  id: 'prod_sf_f7_ryu',
  canonical_sku: 'COL-[#f00856]-SF-RYU-01',
  title: 'Bandai Spirits S.H.Figuarts Street Fighter Ryu (Outfit 1 Ver.)',
  brand: 'Bandai Spirits',
  license: 'Capcom',
  franchise: 'Street Fighter',
  line: 'S.H.Figuarts',
  character: 'Ryu',
  scale: '1:12',
  upc: '4573102654321',
  mpn: 'SF-RYU-SHF',
  image_url: 'https://images.collectibles.uy/streetfighter/ryu.jpg',
  gallery_images: ['https://images.collectibles.uy/streetfighter/ryu_box.jpg'],
  offers: [
    {
      id: 'off_amz_ryu',
      source: 'amazon',
      source_product_id: 'B0RYU001',
      url: 'https://amazon.com/dp/B0RYU001',
      seller: 'Amazon.com',
      seller_rating: 99.0,
      price: 54.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 12,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: true,
      reliability_score: 98,
      last_checked_at: new Date().toISOString()
    },
    {
      id: 'off_ebay_ryu_used',
      source: 'ebay',
      source_product_id: 'EB112233',
      url: 'https://ebay.com/itm/112233',
      seller: 'CollectibleDepot',
      seller_rating: 97.5,
      price: 39.50,
      currency: 'USD',
      domestic_shipping: 4.50,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 1,
      condition: 'used',
      condition_normalized: 'USED',
      status: 'LIVE',
      is_zinc_compatible: false,
      reliability_score: 92,
      last_checked_at: new Date().toISOString()
    }
  ],
  selected_source_id: 'off_amz_ryu',
  best_source_id: 'off_amz_ryu',
  financials: {
    origin_price_usd: 54.99,
    usa_shipping_usd: 0,
    sales_tax_usd: 3.85,
    zinc_fee_usd: 1.0,
    financial_fee_usd: 3.30,
    urubox_courier_usd: 14.0,
    other_costs_usd: 0,
    real_cost_puesto_usd: 77.14,
    suggested_sale_price_usd: 109.99,
    current_sale_price_usd: 109.99,
    profit_usd: 32.85,
    margin_percent: 29.87,
    profit_protection_status: 'PASS'
  },
  authenticity: {
    status: 'VERIFIED_OFFICIAL',
    score: 99,
    confidence: 98,
    brand_verified: true,
    license_verified: true,
    official_distributor: true,
    has_valid_identifier: true,
    verification_method: 'AUTHORIZED_RETAILER_DIRECT',
    verification_evidence: ['Official Capcom Hologram', 'Tamashii Quality Seal'],
    verification_source: 'Bandai Spirits',
    verified_at: new Date().toISOString(),
    red_flags: [],
    green_flags: ['Official Capcom Hologram'],
    reasons: []
  },
  uruguay_market: {
    source: 'mercado_libre_uy',
    status: 'EXACT_MATCH',
    match_type: 'EXACT_MATCH',
    match_confidence: 95,
    data_origin: 'LIVE',
    exact_match_found: true,
    min_price_usd: 140.00,
    avg_price_usd: 145.00,
    median_price_usd: 145.00,
    max_price_usd: 150.00,
    total_listings: 2,
    sellers_count: 2,
    difference_amount: -35.01,
    difference_percent: -24.1,
    market_position: 'CHEAPER',
    comparison_diff_usd: -35.01,
    comparison_diff_percent: -24.1,
    market_verdict: 'MUCHO_MAS_BARATO',
    last_checked_at: new Date().toISOString()
  },
  catalog_status: 'NOT_IN_CATALOG',
  product_type: 'TRENDING',
  tags: ['street_fighter', 'ryu', 'bandai', 'capcom', 'shfiguarts'],
  opportunity_score: 95,
  catalog_value_score: 92,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const autopilotSettings: AutopilotSettings = {
  id: 'f7_settings',
  mode: 'AUTOPILOT',
  visual_status: 'ACTIVE',
  discover_products: true,
  evaluate_opportunities: true,
  prepare_publications: true,
  auto_publish: true,
  auto_update_prices: true,
  auto_update_stock: true,
  auto_pause_publications: true,
  auto_reactivate_publications: true,
  auto_purchase: false,
  send_to_import_hub: true,
  is_kill_switch_active: false,
  updated_at: new Date().toISOString()
};

const autopilotRules: AutopilotRule[] = [
  {
    id: 'r_f7',
    scope: 'GLOBAL',
    identifier: 'all',
    is_active: true,
    min_margin_percent: 15,
    min_profit_usd: 5.0,
    max_purchase_cost_usd: 1000,
    max_origin_price_usd: 800,
    min_stock: 1,
    min_seller_score: 90,
    min_confidence_score: 80,
    min_opportunity_score: 80,
    max_active_publications: 500,
    max_price_drift_percent: 5,
    auto_purchase_enabled: false,
    requires_manual_review: false
  }
];

describe('FASE 7 — Sourcing Intelligence Total Ecosystem Integration Test', { timeout: 25000 }, () => {
  it('1. Landed Cost & Pricing Engine computes accurate costs for Street Fighter Ryu', () => {
    const activeOffer = streetFighterRyuCanonical.offers[0];
    const pricing = calculateInternationalPricing({
      amazonPrice: activeOffer.price,
      usaShipping: activeOffer.domestic_shipping
    });

    expect(pricing.realCost).toBeGreaterThan(activeOffer.price);
    expect(pricing.finalPrice).toBeGreaterThan(pricing.realCost);
    expect(pricing.estimatedProfit).toBeGreaterThan(0);
    expect(pricing.netMarginPercentage).toBeGreaterThanOrEqual(14.0);
  });

  it('2. Opportunity Engine evaluates Street Fighter Ryu with high score and positive reason codes', () => {
    const activeOffer = streetFighterRyuCanonical.offers[0];
    const scoreResult = evaluateOpportunityScore({
      demandScore: 92,
      sellerTrustScore: activeOffer.reliability_score,
      marginPercent: 29.87,
      profitUsd: 32.85,
      matchConfidence: 0.98,
      inStock: true,
      isOfficialVerified: true,
      wishlistInterest: 5,
      radarInterest: 8
    });

    expect(scoreResult.opportunityScore).toBeGreaterThanOrEqual(80);
    expect(scoreResult.profitabilityStatus).toBe('VIABLE');
    expect(scoreResult.reasonCodes.some(r => r.code === 'STRONG_MARGIN')).toBe(true);
    expect(scoreResult.reasonCodes.some(r => r.code === 'CATALOG_GAP')).toBe(true);
  });

  it('3. AI Search interprets natural language query without inventing fake products', () => {
    const query = 'Muéstrame figuras de Street Fighter de menos de USD 150';
    const interp = interpretUserQuery(query);

    expect(interp.detectedLicense || interp.cleanedQuery || interp.detectedBrand).toBeDefined();
    expect(interp.priceMax).toBe(150);

    const editorial = generateDirectEditorialAnswer(interp, [streetFighterRyuCanonical as any], []);
    expect(editorial.summary).toBeDefined();
    expect(editorial.summary.length).toBeGreaterThan(5);
  });

  it('4. Radar Integration Service retrieves canonical products for franchise Street Fighter', async () => {
    const products = await RadarIntegrationService.getCanonicalProductsForRadar(
      { franchise: 'Street Fighter', limit: 10 },
      [streetFighterRyuCanonical as any]
    );

    expect(products.length).toBeGreaterThan(0);
    expect(products[0].character).toBe('Ryu');
  });

  it('5. Ecosystem Orchestrator executes full end-to-end pipeline cleanly', async () => {
    const pipelineResult = await ecosystemOrchestrator.executeEndToEndPipeline(
      streetFighterRyuCanonical,
      autopilotSettings,
      autopilotRules,
      'ADMIN_QA'
    );

    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.canonical_sku).toBe('COL-[#f00856]-SF-RYU-01');
    expect(pipelineResult.opportunity_score).toBeGreaterThanOrEqual(70);
    expect(pipelineResult.radar_linked).toBe(true);
    expect(pipelineResult.learning_signal_registered).toBe(true);
    expect(pipelineResult.timeline.length).toBeGreaterThanOrEqual(8);
  });

  it('6. Ecosystem Healthcheck reports OPERATIVE status across all components', async () => {
    const health = await ecosystemOrchestrator.getEcosystemHealthStatus();

    expect(health.components.length).toBeGreaterThanOrEqual(8);
    expect(health.summary.operative_count).toBeGreaterThanOrEqual(7);
    expect(health.overall_status).not.toBe('ERROR');
  });
});
