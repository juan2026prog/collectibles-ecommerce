import { describe, it, expect } from 'vitest';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import type { NormalizedProduct } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

const mockProduct: NormalizedProduct = {
  id: 'prod_sf_1',
  canonical_sku: 'COL-JADA-SF-CHUNLI-01',
  title: 'Jada Toys Street Fighter II Chun-Li 6-Inch Action Figure',
  brand: 'Jada Toys',
  license: 'Capcom',
  line: 'Street Fighter II',
  character: 'Chun-Li',
  scale: '6"',
  image_url: 'https://example.com/chunli.jpg',
  gallery_images: [],
  offers: [
    {
      id: 'off_amz_1',
      source: 'amazon',
      source_product_id: 'B0CHUNLI01',
      url: 'https://amazon.com/dp/B0CHUNLI01',
      seller: 'Amazon.com',
      seller_rating: 99,
      price: 24.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 12,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: true,
      reliability_score: 95,
      last_checked_at: new Date().toISOString()
    }
  ],
  selected_source_id: 'off_amz_1',
  best_source_id: 'off_amz_1',
  financials: {
    origin_price_usd: 24.99,
    usa_shipping_usd: 0,
    sales_tax_usd: 1.75,
    zinc_fee_usd: 1.0,
    financial_fee_usd: 1.5,
    urubox_courier_usd: 12.0,
    other_costs_usd: 0,
    real_cost_puesto_usd: 41.24,
    suggested_sale_price_usd: 59.99,
    current_sale_price_usd: 59.99,
    profit_usd: 18.75,
    margin_percent: 31.25,
    profit_protection_status: 'PASS'
  },
  authenticity: {
    status: 'VERIFIED_OFFICIAL',
    score: 95,
    confidence: 90,
    brand_verified: true,
    license_verified: true,
    official_distributor: true,
    has_valid_identifier: true,
    verification_method: 'AUTHORIZED_RETAILER_DIRECT',
    verification_evidence: ['Official Capcom License'],
    verification_source: 'Jada Toys',
    verified_at: new Date().toISOString(),
    red_flags: [],
    green_flags: ['Official Capcom License'],
    reasons: []
  },
  uruguay_market: {
    source: 'mercado_libre_uy',
    status: 'EXACT_MATCH',
    match_type: 'EXACT_MATCH',
    match_confidence: 90,
    data_origin: 'LIVE',
    exact_match_found: true,
    min_price_usd: 69.99,
    avg_price_usd: 74.99,
    median_price_usd: 74.99,
    max_price_usd: 79.99,
    total_listings: 3,
    sellers_count: 2,
    difference_amount: -10.0,
    difference_percent: -14.3,
    market_position: 'CHEAPER',
    comparison_diff_usd: -10.0,
    comparison_diff_percent: -14.3,
    market_verdict: 'MUCHO_MAS_BARATO',
    last_checked_at: new Date().toISOString()
  },
  catalog_status: 'NOT_IN_CATALOG',
  product_type: 'TRENDING',
  tags: ['street_fighter', 'jada_toys', 'capcom'],
  opportunity_score: 91,
  catalog_value_score: 85,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const defaultSettings: AutopilotSettings = {
  id: 'def',
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

const defaultRules: AutopilotRule[] = [
  {
    id: 'r_global',
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

describe('Sourcing Autopilot — Policy Engine Unit Tests', () => {
  it('evaluates viable product correctly in AUTOPILOT mode', () => {
    const res = autopilotPolicyEngine.evaluateProduct(mockProduct, defaultSettings, defaultRules);
    expect(res.isViable).toBe(true);
    expect(res.decision).toBe('PUBLICAR');
    expect(res.executionMode).toBe('AUTO_EXECUTE');
    expect(res.explainability.opportunityScore).toBe(91);
    expect(res.explainability.expectedMargin).toBe(31.25);
  });

  it('respects OFF mode and flags executionMode as OFF_LOG_ONLY', () => {
    const offSettings = { ...defaultSettings, mode: 'OFF' as const };
    const res = autopilotPolicyEngine.evaluateProduct(mockProduct, offSettings, defaultRules);
    expect(res.executionMode).toBe('OFF_LOG_ONLY');
  });

  it('respects RECOMMENDATION mode and flags executionMode as RECOMMENDATION_ONLY', () => {
    const recSettings = { ...defaultSettings, mode: 'RECOMMENDATION' as const };
    const res = autopilotPolicyEngine.evaluateProduct(mockProduct, recSettings, defaultRules);
    expect(res.executionMode).toBe('RECOMMENDATION_ONLY');
  });

  it('requires manual approval if auto_publish is false in AUTOPILOT mode', () => {
    const semiSettings = { ...defaultSettings, auto_publish: false };
    const res = autopilotPolicyEngine.evaluateProduct(mockProduct, semiSettings, defaultRules);
    expect(res.executionMode).toBe('REQUIRES_APPROVAL');
  });

  it('blocks publication if margin drops below minimum rule threshold', () => {
    const lowMarginProd: NormalizedProduct = {
      ...mockProduct,
      financials: {
        ...mockProduct.financials,
        margin_percent: 8.0,
        profit_usd: 3.5
      }
    };
    const res = autopilotPolicyEngine.evaluateProduct(lowMarginProd, defaultSettings, defaultRules);
    expect(res.isViable).toBe(false);
    expect(res.blockedReasons).toContain('Margen insuficiente: 8% (Requerido: 15%).');
  });
});
