import { describe, it, expect } from 'vitest';
import { autopilotReconciliationEngine } from '../services/sourcing/autopilot/reconciliationEngine';
import type { NormalizedProduct, SourceOffer } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

const mockProductMultiSource: NormalizedProduct = {
  id: 'prod_sf_2',
  canonical_sku: 'COL-JADA-SF-RYU-02',
  title: 'Jada Toys Street Fighter II Ryu 6-Inch Action Figure',
  brand: 'Jada Toys',
  license: 'Capcom',
  image_url: 'https://example.com/ryu.jpg',
  gallery_images: [],
  offers: [
    {
      id: 'off_amz_ryu',
      source: 'amazon',
      source_product_id: 'B0RYU01',
      url: 'https://amazon.com/dp/B0RYU01',
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
    },
    {
      id: 'off_bb_ryu',
      source: 'bestbuy',
      source_product_id: 'BB654321',
      url: 'https://bestbuy.com/site/654321.p',
      seller: 'Best Buy',
      seller_rating: 98,
      price: 26.99,
      currency: 'USD',
      domestic_shipping: 0,
      availability: 'in_stock',
      availability_normalized: 'IN_STOCK',
      stock: 5,
      condition: 'new',
      condition_normalized: 'NEW',
      status: 'LIVE',
      is_zinc_compatible: false,
      reliability_score: 94,
      last_checked_at: new Date().toISOString()
    }
  ],
  selected_source_id: 'off_amz_ryu',
  best_source_id: 'off_amz_ryu',
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
  tags: ['street_fighter', 'jada_toys'],
  opportunity_score: 90,
  catalog_value_score: 85,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const settings: AutopilotSettings = {
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

const rules: AutopilotRule[] = [];

describe('Sourcing Autopilot — Reconciliation & Source Switching Tests', () => {
  it('switches source dynamically when primary source goes OUT_OF_STOCK', async () => {
    const outOfStockAmazonOffer: SourceOffer = {
      ...mockProductMultiSource.offers[0],
      availability: 'out_of_stock',
      availability_normalized: 'OUT_OF_STOCK',
      stock: 0
    };

    const res = await autopilotReconciliationEngine.reconcileProduct(
      mockProductMultiSource,
      outOfStockAmazonOffer,
      settings,
      rules
    );

    expect(res.actionTaken).toBe('SOURCE_SWITCHED');
    expect(res.newStatus).toBe('SOURCE_CHANGED');
    expect(res.updatedProduct.selected_source_id).toBe('off_bb_ryu');
  });

  it('pauses publication when primary source goes OUT_OF_STOCK and no alternative exists', async () => {
    const singleOfferProd: NormalizedProduct = {
      ...mockProductMultiSource,
      offers: [mockProductMultiSource.offers[0]]
    };

    const outOfStockAmazonOffer: SourceOffer = {
      ...singleOfferProd.offers[0],
      availability: 'out_of_stock',
      availability_normalized: 'OUT_OF_STOCK',
      stock: 0
    };

    const res = await autopilotReconciliationEngine.reconcileProduct(
      singleOfferProd,
      outOfStockAmazonOffer,
      settings,
      rules
    );

    expect(res.actionTaken).toBe('PUBLICATION_PAUSED');
    expect(res.newStatus).toBe('PAUSED');
  });

  it('triggers Loss Protection and pauses publication if price increase causes negative profit', async () => {
    const expensiveOffer: SourceOffer = {
      ...mockProductMultiSource.offers[0],
      price: 55.00 // Origin price jumps from $24.99 -> $55.00, causing landed cost > sale price ($59.99)
    };

    const res = await autopilotReconciliationEngine.reconcileProduct(
      mockProductMultiSource,
      expensiveOffer,
      settings,
      rules
    );

    expect(res.actionTaken).toBe('PAUSE_PREVENTED_LOSS');
    expect(res.newStatus).toBe('PAUSED');
    expect(res.updatedProduct.financials.profit_protection_status).toBe('BLOCKED');
  });
});
