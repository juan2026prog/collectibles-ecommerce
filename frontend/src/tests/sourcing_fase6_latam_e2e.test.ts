import { describe, it, expect, beforeEach } from 'vitest';
import { sourcingService } from '../services/sourcing/sourcingService';
import { selectBestSource } from '../services/sourcing/bestSourceSelector';
import { evaluateAuthenticityGate } from '../services/sourcing/authenticityGate';
import { countryEngine } from '../services/sourcing/countryEngine';
import { calculateMultiCountryLandedCost } from '../services/sourcing/multiCountryLandedCost';
import { calculateGlobalOpportunityScore, SourcingRiskEngine } from '../services/sourcing/latamOpportunityEngine';
import { selectBestMarket } from '../services/sourcing/bestMarketSelector';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { RadarIntegrationService } from '../services/sourcing/RadarIntegrationService';
import type { ResearchPack, SourceOffer, NormalizedProduct } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

describe('SOURCING INTELLIGENCE FASE 6 — END-TO-END TEST (STREET FIGHTER CASE)', () => {
  beforeEach(async () => {
    await countryEngine.initialize();
  });

  it('executes full 20-step pipeline from Radar trend to Autopilot publication candidate for Street Fighter', async () => {
    // Step 1: Radar detects Street Fighter trend
    const trendTopic = 'Street Fighter Ryu';
    const latamBreakdown = RadarIntegrationService.getLatamMarketBreakdown(trendTopic);
    expect(latamBreakdown.UY).toBe('Muy alta');

    // Step 2 & 3: Input Research Pack & Normalize canonical product
    const mockResearchPack: ResearchPack = {
      schema_version: '2.0',
      pack_id: 'PACK-SF-E2E-001',
      title: 'Street Fighter Sourcing Pack',
      generated_at: new Date().toISOString(),
      source: 'openai-research',
      status: 'READY',
      items_count: 1,
      items: [
        {
          url: 'https://www.amazon.com/dp/B0CHSF001',
          retailer: 'amazon',
          brand: 'Jada Toys',
          license: 'Capcom',
          line: 'Street Fighter II',
          character: 'Ryu',
          scale: '1/12',
          upc: '801310342206',
          mpn: '34220',
          price: 24.99,
          reason: 'TRENDING',
          tags: ['street_fighter', 'ryu', 'jada_toys']
        }
      ]
    };

    const normalizedProducts: NormalizedProduct[] = await sourcingService.processResearchPack(mockResearchPack);
    expect(normalizedProducts.length).toBe(1);

    const product = normalizedProducts[0];
    expect(product.canonical_sku).toContain('JADATOYS');
    expect(product.title).toContain('Ryu');

    // Step 4: Authenticity Gate Verification
    const authenticity = evaluateAuthenticityGate({
      brand: product.brand,
      license: product.license,
      seller: 'Amazon.com',
      upc: product.upc,
      mpn: product.mpn,
      url: product.offers[0]?.url || '',
      priceUsd: product.offers[0]?.price || 24.99,
      retailer: 'amazon'
    });

    expect(authenticity.status).toBe('VERIFIED_OFFICIAL');

    // Step 5 & 6: Available Offers & Best Source Selector
    const bestSourceView = selectBestSource(product.offers);

    expect(bestSourceView.bestOffer).not.toBeNull();

    const bestOffer = bestSourceView.bestOffer!;

    // Step 7 & 8: Consult enabled markets & Country Engine
    const enabledCountries = countryEngine.getAllCountries();
    expect(enabledCountries.length).toBe(8);
    expect(enabledCountries.find(c => c.country_code === 'UY')?.enabled).toBe(true);

    // Step 9: Calculate Landed Cost for UY
    const uyLandedCost = calculateMultiCountryLandedCost({
      originPriceUsd: bestOffer.price,
      usaShippingUsd: bestOffer.domestic_shipping,
      weightLbs: 1.2,
      destinationCountry: 'UY'
    });

    expect(uyLandedCost.is_franchise_eligible).toBe(true);
    expect(uyLandedCost.total_landed_cost_usd).toBeLessThan(55.00);

    // Step 10 & 11: Competitive info & Market Gap
    const uruguayMarket = product.uruguay_market;
    expect(uruguayMarket).toBeDefined();

    // Step 12, 13, 14: Opportunity Score, Confidence Score & Risk Engine
    const riskEval = SourcingRiskEngine.evaluateRisk(
      'UY',
      bestOffer,
      uyLandedCost.total_landed_cost_usd,
      uyLandedCost.total_landed_cost_usd / (1 - 0.15)
    );

    expect(riskEval.riskLevel).toBe('LOW');

    // Step 15 & 16: Best Market Selector & Global Opportunity
    const bestMarketResult = selectBestMarket({
      canonicalId: product.id,
      title: product.title,
      brand: product.brand,
      character: product.character,
      category: product.category_name,
      bestOffer,
      uruguayMarket,
      trendScore: 90
    });

    expect(bestMarketResult.best_country).toBe('UY');
    expect(bestMarketResult.decision).toMatch(/PUBLISH|REVIEW/);

    const globalOpp = calculateGlobalOpportunityScore(product.id, {
      canonicalId: product.id,
      title: product.title,
      brand: product.brand,
      character: product.character,
      bestOffer,
      uruguayMarket,
      trendScore: 90
    });

    expect(globalOpp.global_opportunity_score).toBeGreaterThan(60);

    // Step 17, 18, 19: Publication Candidate & Autopilot Rules
    const mockSettings: AutopilotSettings = {
      id: 'settings-1',
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

    const mockRules: AutopilotRule[] = [
      {
        id: 'rule-global',
        scope: 'GLOBAL',
        identifier: 'all',
        is_active: true,
        min_margin_percent: 15.0,
        min_profit_usd: 2.0,
        max_purchase_cost_usd: 1000.0,
        max_origin_price_usd: 800.0,
        min_stock: 1,
        min_seller_score: 90.0,
        min_confidence_score: 70.0,
        min_opportunity_score: 60,
        max_active_publications: 500,
        max_price_drift_percent: 5.0,
        auto_purchase_enabled: false,
        requires_manual_review: false
      }
    ];

    const policyEval = autopilotPolicyEngine.evaluateProduct(product, mockSettings, mockRules);
    expect(policyEval.isViable).toBe(true);
    expect(policyEval.decision).toBe('PUBLICAR');

    // Step 20: Audit Log Verification
    expect(bestMarketResult.explanation.length).toBeGreaterThan(0);
  });
});
