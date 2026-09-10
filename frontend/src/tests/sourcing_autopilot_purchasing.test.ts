import { describe, it, expect } from 'vitest';
import { autopilotPurchasingEngine } from '../services/sourcing/autopilot/purchasingEngine';
import type { NormalizedProduct, SourceOffer } from '../types/sourcing';
import type { AutopilotSettings, FinancialLimits } from '../types/sourcingAutopilot';

const mockProd: NormalizedProduct = {
  id: 'prod_sf_3',
  canonical_sku: 'COL-JADA-SF-KEN-03',
  title: 'Jada Toys Street Fighter II Ken 6-Inch Figure',
  brand: 'Jada Toys',
  license: 'Capcom',
  image_url: 'https://example.com/ken.jpg',
  gallery_images: [],
  offers: [
    {
      id: 'off_amz_ken',
      source: 'amazon',
      source_product_id: 'B0KEN01',
      url: 'https://amazon.com/dp/B0KEN01',
      seller: 'Amazon.com',
      seller_rating: 99,
      price: 24.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 10,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: true,
      reliability_score: 95,
      last_checked_at: new Date().toISOString()
    }
  ],
  selected_source_id: 'off_amz_ken',
  best_source_id: 'off_amz_ken',
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
    verification_evidence: [],
    verification_source: 'Jada Toys',
    verified_at: new Date().toISOString(),
    red_flags: [],
    green_flags: [],
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
    total_listings: 2,
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
  tags: ['street_fighter'],
  opportunity_score: 90,
  catalog_value_score: 85,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const settingsAutoPurchaseOn: AutopilotSettings = {
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
  auto_purchase: true, // Auto-purchase ON for test
  send_to_import_hub: true,
  is_kill_switch_active: false,
  updated_at: new Date().toISOString()
};

const limits: FinancialLimits = {
  id: 'lim',
  max_single_purchase_usd: 150.0,
  max_daily_expenditure_usd: 500.0,
  max_weekly_expenditure_usd: 2000.0,
  max_monthly_expenditure_usd: 5000.0,
  current_daily_expenditure_usd: 100.0,
  current_weekly_expenditure_usd: 300.0,
  current_monthly_expenditure_usd: 800.0,
  max_concurrent_orders: 5,
  max_units_per_product: 3
};

describe('Sourcing Autopilot — Purchasing Engine & Price Drift Tests', () => {
  it('authorizes purchase when price is stable and within financial limits', async () => {
    const res = await autopilotPurchasingEngine.validatePurchaseRequest(
      mockProd,
      24.99,
      settingsAutoPurchaseOn,
      limits
    );

    expect(res.authorized).toBe(true);
    expect(res.code).toBe('APPROVED');
    expect(res.driftPercent).toBe(0);
  });

  it('blocks purchase due to PRICE DRIFT when live price increases > 5%', async () => {
    const liveFetcherDrift = async (): Promise<SourceOffer> => ({
      ...mockProd.offers[0],
      price: 34.99 // Price jumped from $24.99 to $34.99 (+40% drift)
    });

    const res = await autopilotPurchasingEngine.validatePurchaseRequest(
      mockProd,
      24.99,
      settingsAutoPurchaseOn,
      limits,
      liveFetcherDrift
    );

    expect(res.authorized).toBe(false);
    expect(res.code).toBe('PRICE_DRIFT');
    expect(res.blockReason).toContain('PRICE DRIFT DETECTADO');
  });

  it('blocks purchase when single purchase limit is exceeded', async () => {
    const expensiveProd: NormalizedProduct = {
      ...mockProd,
      offers: [{ ...mockProd.offers[0], price: 200.0 }] // $200 > $150 max_single_purchase_usd
    };

    const res = await autopilotPurchasingEngine.validatePurchaseRequest(
      expensiveProd,
      200.0,
      settingsAutoPurchaseOn,
      limits
    );

    expect(res.authorized).toBe(false);
    expect(res.code).toBe('FINANCIAL_LIMIT_EXCEEDED');
    expect(res.blockReason).toContain('supera tope unitario');
  });

  it('returns NO CONFIGURADO status when Purchasing Adapter lacks API credentials', async () => {
    const res = await autopilotPurchasingEngine.executePurchaseOrder(mockProd, 24.99);
    expect(res.success).toBe(false);
    expect(res.status).toBe('NO CONFIGURADO');
  });
});
