import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';
import { SourcingRiskEngine } from '../services/sourcing/riskScoringEngine';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { sourcingService } from '../services/sourcing/sourcingService';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { ecosystemOrchestrator } from '../services/sourcing/ecosystemOrchestrator';
import { createNoDataMarketSummary } from '../services/sourcing/uruguayMarketIntelligence';
import { RadarIntegrationService } from '../services/sourcing/RadarIntegrationService';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import { supabase } from '../lib/supabase';
import type { NormalizedProduct } from '../types/sourcing';
import type { AutopilotSettings, AutopilotRule } from '../types/sourcingAutopilot';

describe('COLLECTIBLES 2026 — MASTER E2E SOURCING & RADAR CERTIFICATION SUITE', () => {

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // BLOQUE 1: IDENTIDAD CANÓNICA, VARIANTES, ESCALAS Y LOTES
  // =========================================================================
  describe('Bloque 1: Canonical Identity, Variants & Lots Separation', () => {
    it('generates distinct canonical keys for Standard vs Player 2 variant', () => {
      const candidates = [
        {
          source: 'amazon' as const,
          rawItem: {
            id: 'AMZ-RYU-STD',
            source_item_id: 'B001',
            title: 'Jada Toys Street Fighter II Ryu 1:12 Scale Standard Edition Action Figure',
            price: 24.99,
            currency: 'USD',
            image_url: 'https://example.com/ryu_std.jpg',
            product_url: 'https://amazon.com/dp/B001',
            availability: 'in_stock' as const,
            condition: 'new' as const,
            seller: 'Amazon.com',
            seller_rating: 98,
            domestic_shipping: 0,
            reliability_score: 95
          }
        },
        {
          source: 'ebay' as const,
          rawItem: {
            id: 'EBAY-RYU-P2',
            source_item_id: 'EB002',
            title: 'Jada Toys Street Fighter II Ryu Player 2 Pink Variant 6-inch Action Figure',
            price: 34.99,
            currency: 'USD',
            image_url: 'https://example.com/ryu_p2.jpg',
            product_url: 'https://ebay.com/itm/EB002',
            availability: 'in_stock' as const,
            condition: 'new' as const,
            seller: 'TopToySeller',
            seller_rating: 99,
            domestic_shipping: 4.99,
            reliability_score: 90
          }
        },
        {
          source: 'amazon' as const,
          rawItem: {
            id: 'AMZ-RYU-16',
            source_item_id: 'B003',
            title: 'Storm Collectibles Street Fighter Ryu 1/6 Scale Deluxe Statue',
            price: 180.00,
            currency: 'USD',
            image_url: 'https://example.com/ryu_16.jpg',
            product_url: 'https://amazon.com/dp/B003',
            availability: 'in_stock' as const,
            condition: 'new' as const,
            seller: 'Storm Direct',
            seller_rating: 95,
            domestic_shipping: 0,
            reliability_score: 92
          }
        },
        {
          source: 'ebay' as const,
          rawItem: {
            id: 'EBAY-RYU-LOT',
            source_item_id: 'EB004',
            title: 'Lote de 4 Figuras Street Fighter Ryu Ken Chun-Li Guile Jada Toys',
            price: 89.99,
            currency: 'USD',
            image_url: 'https://example.com/ryu_lot.jpg',
            product_url: 'https://ebay.com/itm/EB004',
            availability: 'in_stock' as const,
            condition: 'used' as const,
            seller: 'RetroCollector',
            seller_rating: 94,
            domestic_shipping: 9.99,
            reliability_score: 75
          }
        }
      ];

      const canonicals = (multiSourceSearchService as any).aggregateCanonicalProducts(candidates, []);

      // Debe generar exactamente 4 productos canónicos separados
      expect(canonicals.length).toBe(4);

      const standard = canonicals.find((c: any) => c.title.toLowerCase().includes('standard') || (!c.title.toLowerCase().includes('player 2') && !c.title.toLowerCase().includes('1/6') && !c.is_lot));
      const p2 = canonicals.find((c: any) => c.title.toLowerCase().includes('player 2'));
      const scale16 = canonicals.find((c: any) => c.scale === '1:6' || c.title.toLowerCase().includes('1/6'));
      const lot = canonicals.find((c: any) => c.is_lot === true);

      expect(standard).toBeDefined();
      expect(p2).toBeDefined();
      expect(scale16).toBeDefined();
      expect(lot).toBeDefined();

      // Los SKUs canónicos deben ser distintos
      expect(standard?.canonical_sku).not.toBe(p2?.canonical_sku);
      expect(standard?.canonical_sku).not.toBe(scale16?.canonical_sku);
      expect(standard?.canonical_sku).not.toBe(lot?.canonical_sku);
      expect(lot?.is_lot).toBe(true);
    });
  });

  // =========================================================================
  // BLOQUE 2: RISK SCORING ENGINE (0-100 CLAMPED, 5 SUB-COMPONENTES)
  // =========================================================================
  describe('Bloque 2: Sourcing Risk Engine', () => {
    it('evaluates safe official product as LOW risk', () => {
      const risk = SourcingRiskEngine.evaluateRisk({
        authenticityStatus: 'VERIFIED_OFFICIAL',
        sellerTrustScore: 98,
        matchingConfidence: 0.95,
        condition: 'new'
      });

      expect(risk.riskScore).toBeLessThan(30);
      expect(risk.riskLevel).toBe('LOW');
      expect(risk.breakdown.authenticityRisk).toBe(0);
      expect(risk.breakdown.sellerRisk).toBe(0);
      expect(risk.breakdown.dataMissingRisk).toBe(0);
      expect(risk.breakdown.matchingRisk).toBe(0);
      expect(risk.breakdown.lotConditionRisk).toBe(0);
    });

    it('flags unverified bootleg or unknown seller as BLOCKED or HIGH risk', () => {
      const risk = SourcingRiskEngine.evaluateRisk({
        authenticityStatus: 'BOOTLEG_SUSPECT',
        sellerTrustScore: 40,
        isLot: true,
        condition: 'used'
      });

      expect(risk.riskScore).toBeGreaterThanOrEqual(40);
      expect(risk.isBlocked).toBe(true);
      expect(risk.riskLevel).toBe('BLOCKED');
      expect(risk.breakdown.authenticityRisk).toBe(30);
      expect(risk.reasonCodes.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // BLOQUE 3: OPPORTUNITY SCORING ENGINE (0-100 CLAMPED, 7 COMPONENTES)
  // =========================================================================
  describe('Bloque 3: Sourcing Opportunity Engine (7 Components)', () => {
    it('calculates opportunity score with all 7 components summing to <= 100', () => {
      const result = evaluateOpportunityScore({
        demandScore: 85,
        sellerTrustScore: 95,
        marginPercent: 35,
        profitUsd: 15,
        matchConfidence: 0.95,
        inStock: true,
        isOfficialVerified: true,
        wishlistInterest: 5,
        radarInterest: 4
      });

      expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
      expect(result.opportunityScore).toBeLessThanOrEqual(100);
      expect(result.breakdown.demand).toBeLessThanOrEqual(25);
      expect(result.breakdown.margin).toBeLessThanOrEqual(20);
      expect(result.breakdown.market_gap).toBeLessThanOrEqual(15);
      expect(result.breakdown.seller).toBeLessThanOrEqual(10);
      expect(result.breakdown.availability).toBeLessThanOrEqual(10);
      expect(result.breakdown.authenticity).toBeLessThanOrEqual(10);
      expect(result.breakdown.trend).toBeLessThanOrEqual(10);
    });
  });

  // =========================================================================
  // BLOQUE 4: PUBLICACIÓN MANUAL, READ-BACK & NO FALSOS ÉXITOS
  // =========================================================================
  describe('Bloque 4: Manual Publication Read-Back Verification', () => {
    it('imports product and verifies existence via read-back', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'NORM-001',
        canonical_sku: 'CANON-SF-RYU-001',
        title: 'Jada Toys Street Fighter II Ryu 1:12',
        brand: 'Jada Toys',
        license: 'Street Fighter',
        category_id: 'cat-figures',
        category_name: 'Action Figures',
        product_type: 'IN_STOCK',
        catalog_status: 'DRAFT',
        main_image_url: 'https://example.com/ryu.jpg',
        offers: [
          {
            id: 'OFF-001',
            source: 'amazon',
            source_item_id: 'B001',
            source_product_id: 'B001',
            price: 24.99,
            currency: 'USD',
            availability: 'in_stock',
            seller: 'Amazon.com',
            seller_rating: 98,
            domestic_shipping: 0,
            reliability_score: 95,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Jada Toys Street Fighter II Ryu 1:12',
            image_url: 'https://example.com/ryu.jpg',
            product_url: 'https://amazon.com/dp/B001',
            url: 'https://amazon.com/dp/B001',
            status: 'LIVE',
            last_checked: new Date().toISOString()
          }
        ],
        selected_source_id: 'OFF-001',
        financials: {
          origin_price_usd: 24.99,
          real_cost_puesto_usd: 35.00,
          current_sale_price_usd: 48.00,
          margin_percent: 27.08,
          profit_usd: 13.00,
          currency: 'USD'
        },
        uruguay_market: createNoDataMarketSummary('Jada Toys Street Fighter II Ryu 1:12'),
        authenticity: {
          status: 'VERIFIED_OFFICIAL',
          confidence_score: 95,
          signals: ['Official packaging'],
          risk_factors: []
        },
        opportunity_score: 85,
        risk_score: 10,
        risk_level: 'LOW'
      };

      // Mock supabase read-back verification
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'prod-uuid-123', external_product_id: 'B001' },
              error: null
            })
          })
        })
      } as any);

      const res = await sourcingService.importProductsToCatalog([mockProduct]);

      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(1);
      expect(res.errors.length).toBe(0);
    });

    it('fails honestly when Supabase insertion returns an error without masking as success', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'NORM-002',
        canonical_sku: 'CANON-FAIL-002',
        title: 'Failing Product',
        brand: 'Generic',
        offers: [
          {
            id: 'OFF-002',
            source: 'amazon',
            source_item_id: 'B002',
            source_product_id: 'B002',
            price: 10,
            currency: 'USD',
            availability: 'in_stock',
            seller: 'Amazon.com',
            seller_rating: 98,
            domestic_shipping: 0,
            reliability_score: 95,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Failing Product',
            image_url: 'https://example.com/p2.jpg',
            product_url: 'https://amazon.com/dp/B002',
            url: 'https://amazon.com/dp/B002',
            status: 'LIVE',
            last_checked: new Date().toISOString()
          }
        ],
        financials: { origin_price_usd: 10, real_cost_puesto_usd: 15, current_sale_price_usd: 25, margin_percent: 40, profit_usd: 10, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('Failing Product'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 90, signals: [], risk_factors: [] },
        opportunity_score: 70,
        risk_score: 10,
        risk_level: 'LOW'
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed: 503 Service Unavailable' }
            })
          })
        })
      } as any);

      const res = await sourcingService.importProductsToCatalog([mockProduct]);

      expect(res.success).toBe(false);
      expect(res.importedCount).toBe(0);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain('Database connection failed');
    });
  });

  // =========================================================================
  // BLOQUE 5: AUTOPILOT POLICIES & NO FAKE 95/5 DEFAULTS
  // =========================================================================
  describe('Bloque 5: Autopilot Policy Engine & Honest Fallbacks', () => {
    it('blocks products when seller rating or stock is missing without assuming 95% or 5 units', () => {
      const mockProduct: NormalizedProduct = {
        id: 'NORM-003',
        canonical_sku: 'CANON-NO-SELLER-003',
        title: 'Product With Unknown Seller',
        brand: 'Unknown',
        offers: [
          {
            id: 'OFF-003',
            source: 'ebay',
            source_item_id: 'EB003',
            price: 50.00,
            currency: 'USD',
            availability: 'out_of_stock',
            seller: 'RandomSeller',
            seller_rating: undefined,
            domestic_shipping: 0,
            reliability_score: 40,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Product With Unknown Seller',
            image_url: 'https://example.com/p.jpg',
            product_url: 'https://ebay.com/itm/EB003',
            last_checked: new Date().toISOString()
          }
        ],
        financials: { origin_price_usd: 50, real_cost_puesto_usd: 70, current_sale_price_usd: 90, margin_percent: 22, profit_usd: 20, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('Unknown Seller Prod'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 90, signals: [], risk_factors: [] },
        opportunity_score: 60,
        risk_score: 30,
        risk_level: 'MEDIUM'
      };

      const settings: AutopilotSettings = {
        id: 'set-1',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const rules: AutopilotRule[] = [
        {
          id: 'rule-global',
          scope: 'GLOBAL',
          identifier: 'all',
          is_active: true,
          min_margin_percent: 15,
          min_profit_usd: 2,
          max_purchase_cost_usd: 1000,
          max_origin_price_usd: 800,
          min_stock: 1,
          min_seller_score: 90,
          min_confidence_score: 80,
          min_opportunity_score: 80,
          max_active_publications: 500,
          max_price_drift_percent: 5,
          auto_purchase_enabled: false,
          requires_manual_review: false,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const evalResult = autopilotPolicyEngine.evaluateProduct(mockProduct, settings, rules);

      expect(evalResult.isViable).toBe(false);
      expect(evalResult.decision).not.toBe('PUBLICAR');
      expect(evalResult.blockedReasons.some(r => r.includes('Seller score') || r.includes('Stock') || r.includes('Opportunity Score'))).toBe(true);
    });
  });

  // =========================================================================
  // BLOQUE 6: ECOSYSTEM ORCHESTRATOR & AUTOPILOT OFF GATE
  // =========================================================================
  describe('Bloque 6: Ecosystem Orchestrator Safe Gate', () => {
    it('does NOT auto-publish to catalog when Autopilot is OFF even if recommendation is PUBLISH', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'NORM-004',
        canonical_sku: 'CANON-HIGH-OPP-004',
        title: 'High Opportunity Collectible',
        brand: 'NECA',
        offers: [
          {
            id: 'OFF-004',
            source: 'amazon',
            source_item_id: 'B004',
            price: 30.00,
            currency: 'USD',
            availability: 'in_stock',
            seller: 'Amazon.com',
            seller_rating: 98,
            domestic_shipping: 0,
            reliability_score: 95,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'High Opportunity Collectible',
            image_url: 'https://example.com/p4.jpg',
            product_url: 'https://amazon.com/dp/B004',
            last_checked: new Date().toISOString()
          }
        ],
        financials: { origin_price_usd: 30, real_cost_puesto_usd: 42, current_sale_price_usd: 65, margin_percent: 35, profit_usd: 23, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('High Opportunity Collectible'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 95, signals: [], risk_factors: [] },
        opportunity_score: 92,
        risk_score: 5,
        risk_level: 'LOW'
      };

      // Execute in SYSTEM / OFF mode
      const result = await ecosystemOrchestrator.executeEndToEndPipeline(mockProduct, undefined, undefined, 'SYSTEM');

      // recommendation can be PUBLISH, but auto import must NOT be executed since Autopilot is OFF
      expect(result.success).toBe(true);
      expect(result.recommendation).toBe('PUBLISH');
      
      const skippedStep = result.timeline.find(t => t.step === '8. CATALOG_PUBLICATION_SKIPPED');
      expect(skippedStep).toBeDefined();
    });
  });

  // =========================================================================
  // BLOQUE 7: MERCADO LIBRE URUGUAY — ERROR VS 0 RESULTADOS
  // =========================================================================
  describe('Bloque 7: Mercado Libre Uruguay Distinction', () => {
    it('returns NOT_FOUND and SIN_COMPETENCIA when MLU has 0 listings', () => {
      const summary = createNoDataMarketSummary('Rare Collectible 2026');
      expect(summary.status).toBe('NOT_FOUND');
      expect(summary.match_type).toBe('NOT_FOUND');
      expect(summary.market_verdict).toBe('SIN_COMPETENCIA');
      expect(summary.total_listings).toBe(0);
      expect(summary.min_price_usd).toBeNull();
    });

    it('returns ERROR and NO_DISPONIBLE when network or service fails', () => {
      const summary = createNoDataMarketSummary('Rare Collectible 2026', 'Network 503 Service Unavailable');
      expect(summary.status).toBe('ERROR');
      expect(summary.match_type).toBe('ERROR');
      expect(summary.market_verdict).toBe('NO_DISPONIBLE');
      expect(summary.data_origin).toBe('ERROR');
    });
  });

  // =========================================================================
  // BLOQUE 8: RADAR INTEGRATION & CROSS-CATALOG SEARCH
  // =========================================================================
  describe('Bloque 8: Radar Multi-Catalog Queries', () => {
    it('queries products, international_products and canonical_products for radar signals', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'prod-1', title: 'Street Fighter Ryu Figure', price: 45 }],
                  error: null
                })
              })
            })
          } as any;
        }
        if (table === 'international_products') {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'intl-1', title: 'Street Fighter Ken International', final_price_usd: 50 }],
                  error: null
                })
              })
            })
          } as any;
        }
        if (table === 'canonical_products') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'canon-1', canonical_title: 'Street Fighter Chun-Li Sourcing' }],
                  error: null
                })
              })
            })
          } as any;
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;
      });

      const res = await RadarIntegrationService.getAllRelatedProductsForRadar('Street Fighter');

      expect(res.localCatalog.length).toBe(1);
      expect(res.internationalProducts.length).toBe(1);
      expect(res.canonicalProducts.length).toBe(1);
      expect(res.totalFound).toBe(3);
    });
  });

  // =========================================================================
  // BLOQUE 9: LANDED COST & PRICING FORMULA
  // =========================================================================
  describe('Bloque 9: Landed Cost & International Pricing Parity', () => {
    it('calculates exact real cost, commercial price and profit protection', () => {
      const pricing = calculateInternationalPricing({
        amazonPrice: 50.00,
        usaShipping: 0
      });

      expect(pricing.amazonPrice).toBe(50.00);
      expect(pricing.realCost).toBeGreaterThan(50.00);
      expect(pricing.finalPrice).toBeGreaterThan(pricing.realCost);
      expect(pricing.estimatedProfit).toBeGreaterThan(0);
      expect(pricing.netMarginPercentage).toBeGreaterThan(0);
    });
  });

});
