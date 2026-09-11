import { describe, it, expect } from 'vitest';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { autopilotExecutionEngine } from '../services/sourcing/autopilot/executionEngine';
import { autopilotReconciliationEngine } from '../services/sourcing/autopilot/reconciliationEngine';
import type { NormalizedProduct } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

const streetFighterCanonicalProduct: NormalizedProduct = {
  id: 'prod_sf_e2e_01',
  canonical_sku: 'COL-JADA-SF-AKUMA-99',
  title: 'Jada Toys Street Fighter II Akuma 6-Inch Action Figure (Deluxe Edition)',
  brand: 'Jada Toys',
  license: 'Capcom',
  line: 'Street Fighter II',
  character: 'Akuma',
  scale: '6"',
  upc: '801310345678',
  mpn: 'SF-AKUMA-DLX',
  image_url: 'https://images.collectibles.uy/streetfighter/akuma.jpg',
  gallery_images: ['https://images.collectibles.uy/streetfighter/akuma_box.jpg'],
  offers: [
    {
      id: 'off_amz_akuma',
      source: 'amazon',
      source_product_id: 'B0AKUMA001',
      url: 'https://amazon.com/dp/B0AKUMA001',
      seller: 'Amazon.com',
      seller_rating: 99.5,
      price: 29.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 15,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: true,
      reliability_score: 98,
      last_checked_at: new Date().toISOString()
    },
    {
      id: 'off_bb_akuma',
      source: 'bestbuy',
      source_product_id: 'BB998877',
      url: 'https://bestbuy.com/site/998877.p',
      seller: 'Best Buy Direct',
      seller_rating: 98.0,
      price: 31.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 8,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: false,
      reliability_score: 95,
      last_checked_at: new Date().toISOString()
    }
  ],
  selected_source_id: 'off_amz_akuma',
  best_source_id: 'off_amz_akuma',
  financials: {
    origin_price_usd: 29.99,
    usa_shipping_usd: 0,
    sales_tax_usd: 2.10,
    zinc_fee_usd: 1.0,
    financial_fee_usd: 1.8,
    urubox_courier_usd: 14.0,
    other_costs_usd: 0,
    real_cost_puesto_usd: 48.89,
    suggested_sale_price_usd: 69.99,
    current_sale_price_usd: 69.99,
    profit_usd: 21.10,
    margin_percent: 30.15,
    profit_protection_status: 'PASS'
  },
  authenticity: {
    status: 'VERIFIED_OFFICIAL',
    score: 98,
    confidence: 95,
    brand_verified: true,
    license_verified: true,
    official_distributor: true,
    has_valid_identifier: true,
    verification_method: 'AUTHORIZED_RETAILER_DIRECT',
    verification_evidence: ['Official Capcom Hologram', 'UPC Match'],
    verification_source: 'Jada Toys',
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
    min_price_usd: 85.00,
    avg_price_usd: 89.99,
    median_price_usd: 89.99,
    max_price_usd: 95.00,
    total_listings: 4,
    sellers_count: 3,
    difference_amount: -15.01,
    difference_percent: -17.6,
    market_position: 'CHEAPER',
    comparison_diff_usd: -15.01,
    comparison_diff_percent: -17.6,
    market_verdict: 'MUCHO_MAS_BARATO',
    last_checked_at: new Date().toISOString()
  },
  catalog_status: 'NOT_IN_CATALOG',
  product_type: 'TRENDING',
  tags: ['street_fighter', 'akuma', 'jada_toys', 'capcom'],
  opportunity_score: 94,
  catalog_value_score: 90,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const autopilotSettings: AutopilotSettings = {
  id: 'sf_settings',
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
    id: 'r_sf',
    scope: 'GLOBAL',
    identifier: 'all',
    is_active: true,
    min_margin_percent: 15,
    min_profit_usd: 2.0,
    max_purchase_cost_usd: 1000,
    max_origin_price_usd: 800,
    min_stock: 2,
    min_seller_score: 90,
    min_confidence_score: 80,
    min_opportunity_score: 80,
    max_active_publications: 500,
    max_price_drift_percent: 5,
    auto_purchase_enabled: false,
    requires_manual_review: false
  }
];

describe('Sourcing Autopilot — Street Fighter E2E Scenario Test', { timeout: 20000 }, () => {
  it('executes full pipeline: discovery -> canonical product -> policy evaluation -> autopilot execution -> reconciliation', async () => {
    // 1. Policy Evaluation
    const evaluation = autopilotPolicyEngine.evaluateProduct(
      streetFighterCanonicalProduct,
      autopilotSettings,
      autopilotRules
    );

    expect(evaluation.isViable).toBe(true);
    expect(evaluation.decision).toBe('PUBLICAR');
    expect(evaluation.explainability.opportunityScore).toBe(94);
    expect(evaluation.explainability.expectedMargin).toBe(30.15);

    // 2. Execution Engine Processing
    const execRes = await autopilotExecutionEngine.processProductExecution(
      streetFighterCanonicalProduct,
      autopilotSettings,
      autopilotRules,
      'ADMIN'
    );

    expect(execRes.executedAction).toBe('AUTO_PUBLISHED');
    expect(execRes.message).toContain('publicado automáticamente');

    // 3. Dry Run Check
    const dryRunReport = await autopilotExecutionEngine.runDryRun(
      [streetFighterCanonicalProduct],
      autopilotSettings,
      autopilotRules
    );

    expect(dryRunReport.publishedCount).toBe(1);
    expect(dryRunReport.candidates[0].decision).toBe('PUBLICAR');

    // 4. Reconciliation with Stock Change in Amazon (Amazon out of stock -> Best Buy switch)
    const outOfStockAmazon = {
      ...streetFighterCanonicalProduct.offers[0],
      availability: 'out_of_stock',
      availability_normalized: 'OUT_OF_STOCK' as const,
      stock: 0
    };

    const reconRes = await autopilotReconciliationEngine.reconcileProduct(
      streetFighterCanonicalProduct,
      outOfStockAmazon,
      autopilotSettings,
      autopilotRules
    );

    expect(reconRes.actionTaken).toBe('SOURCE_SWITCHED');
    expect(reconRes.updatedProduct.selected_source_id).toBe('off_bb_akuma');
  });
});
