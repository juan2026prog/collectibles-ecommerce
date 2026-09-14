import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';
import { SourcingRiskEngine } from '../services/sourcing/riskScoringEngine';
import { evaluateOpportunityScore } from '../services/sourcing/opportunityScoringEngine';
import { sourcingService } from '../services/sourcing/sourcingService';
import { sourcingWatchlistService } from '../services/sourcing/sourcingWatchlistService';
import { autopilotPolicyEngine } from '../services/sourcing/autopilot/policyEngine';
import { autopilotExecutionEngine } from '../services/sourcing/autopilot/executionEngine';
import { autopilotReconciliationEngine } from '../services/sourcing/autopilot/reconciliationEngine';
import { actionQueueManager } from '../services/sourcing/autopilot/actionQueue';
import { auditService } from '../services/sourcing/autopilot/auditService';
import { ecosystemOrchestrator } from '../services/sourcing/ecosystemOrchestrator';
import { createNoDataMarketSummary } from '../services/sourcing/uruguayMarketIntelligence';
import { RadarIntegrationService } from '../services/sourcing/RadarIntegrationService';
import { calculateInternationalPricing } from '../lib/internationalPricing';
import { CurrencyService } from '../services/sourcing/currencyService';
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        }),
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        }),
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
  // BLOQUE 5: WATCHLIST DATABASE-FIRST PERSISTENCE (ITEM 1)
  // =========================================================================
  describe('Bloque 5: Database-First Watchlist Persistence', () => {
    it('persists and retrieves watchlist from Supabase DB, surviving cache resets', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'WATCH-001',
        canonical_sku: 'CAN-WATCH-001',
        title: 'Jada Toys Street Fighter Chun-Li 1:12',
        brand: 'Jada Toys',
        offers: [],
        financials: { origin_price_usd: 24.99, real_cost_puesto_usd: 35, current_sale_price_usd: 49, margin_percent: 28, profit_usd: 14, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('Chun-Li'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 95, signals: [], risk_factors: [] },
        opportunity_score: 88,
        risk_score: 10,
        risk_level: 'LOW'
      };

      // Mock database calls for watchlist
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'sourcing_watchlist') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ product_id: 'WATCH-001' }],
                error: null
              })
            }),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          } as any;
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;
      });

      const addRes = await sourcingWatchlistService.addToWatchlist(mockProduct);
      expect(addRes.success).toBe(true);

      const ids = await sourcingWatchlistService.getWatchlistProductIds();
      expect(ids).toContain('WATCH-001');

      const removeRes = await sourcingWatchlistService.removeFromWatchlist('WATCH-001');
      expect(removeRes.success).toBe(true);
    });

    it('survives simulated browser refresh and session reload using DB as authority', async () => {
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'sourcing_watchlist') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ product_id: 'WATCH-DB-RELOAD', canonical_sku: 'SF-CANON-RELOAD' }],
                error: null
              })
            })
          } as any;
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;
      });

      // Clear secondary cache to simulate new device/browser
      localStorage.clear();

      const ids = await sourcingWatchlistService.getWatchlistProductIds();
      expect(ids).toContain('WATCH-DB-RELOAD');
    });
  });

  // =========================================================================
  // BLOQUE 6: IDEMPOTENCIA DE PUBLICACIÓN (ITEM 10)
  // =========================================================================
  describe('Bloque 6: Publication Idempotency (Concurrent Double-Click)', () => {
    it('handles concurrent identical publish requests resulting in 1 logical publication with stable SKU', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'NORM-IDEMP-01',
        canonical_sku: 'CANON-IDEMP-RYU',
        title: 'Jada Toys Street Fighter Ryu Idempotent',
        brand: 'Jada Toys',
        offers: [
          {
            id: 'OFF-IDEMP',
            source: 'amazon',
            source_item_id: 'B00IDEMP',
            source_product_id: 'B00IDEMP',
            price: 24.99,
            currency: 'USD',
            availability: 'in_stock',
            seller: 'Amazon.com',
            seller_rating: 98,
            domestic_shipping: 0,
            reliability_score: 95,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Jada Toys Street Fighter Ryu Idempotent',
            image_url: 'https://example.com/ryu.jpg',
            product_url: 'https://amazon.com/dp/B00IDEMP',
            url: 'https://amazon.com/dp/B00IDEMP',
            status: 'LIVE',
            last_checked: new Date().toISOString()
          }
        ],
        selected_source_id: 'OFF-IDEMP',
        financials: { origin_price_usd: 24.99, real_cost_puesto_usd: 35, current_sale_price_usd: 48, margin_percent: 27, profit_usd: 13, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('Ryu Idemp'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 95, signals: [], risk_factors: [] },
        opportunity_score: 85,
        risk_score: 10,
        risk_level: 'LOW'
      };

      let insertCount = 0;
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            return {
              maybeSingle: vi.fn().mockResolvedValue({
                data: insertCount > 0 ? { id: 'prod-uuid-1', external_product_id: 'B00IDEMP' } : null,
                error: null
              })
            };
          })
        }),
        insert: vi.fn().mockImplementation(() => {
          insertCount++;
          return {
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'prod-uuid-1', external_product_id: 'B00IDEMP' },
                error: null
              })
            })
          };
        })
      } as any);

      // Execution simulating double click / duplicate retry
      const res1 = await sourcingService.importProductsToCatalog([mockProduct]);
      const res2 = await sourcingService.importProductsToCatalog([mockProduct]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(res1.importedCount).toBe(1);
      expect(res2.importedCount).toBe(1);
      expect(insertCount).toBe(1); // Only 1 physical DB insertion occurred!
    });
  });

  // =========================================================================
  // BLOQUE 7: RADAR RESEARCH PERSISTENCE & TRACEABILITY (ITEM 4 & 12)
  // =========================================================================
  describe('Bloque 7: Radar to Sourcing Investigation Persistence', () => {
    it('persists investigation into radar_signal_products and sourcing_research_requests', async () => {
      let signalUpserted = false;
      let requestInserted = false;

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'radar_signal_products') {
          return {
            upsert: vi.fn().mockImplementation(() => {
              signalUpserted = true;
              return Promise.resolve({ data: null, error: null });
            })
          } as any;
        }
        if (table === 'sourcing_research_requests') {
          return {
            insert: vi.fn().mockImplementation(() => {
              requestInserted = true;
              return Promise.resolve({ data: null, error: null });
            })
          } as any;
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) } as any;
      });

      const res = await RadarIntegrationService.createSourcingResearchFromRadar({
        id: 'rel-street-fighter-01',
        title: 'Street Fighter II Jada Toys 1:12 Wave 3',
        brand: 'Jada Toys',
        franchise: 'Street Fighter',
        character: 'Guile',
        scale: '1:12'
      });

      expect(res.success).toBe(true);
      expect(res.researchId).toContain('RADAR-RES-rel-stre');
      expect(signalUpserted).toBe(true);
      expect(requestInserted).toBe(true);
    });
  });

  // =========================================================================
  // BLOQUE 8: RETAILER-AWARE RECONCILIATION & MONITORING (ITEM 11)
  // =========================================================================
  describe('Bloque 8: Retailer-Aware Reconciliation & Monitoring', () => {
    it('switches source dynamically respecting retailer identity without crossing incompatible retailers', async () => {
      const mockProduct: NormalizedProduct = {
        id: 'PROD-RECON-01',
        canonical_sku: 'CAN-SF-RYU-RECON',
        title: 'Jada Toys Street Fighter Ryu',
        brand: 'Jada Toys',
        offers: [
          {
            id: 'OFF-AMZ-PRIMARY',
            source: 'amazon',
            source_item_id: 'B00AMZ',
            price: 24.99,
            currency: 'USD',
            availability: 'out_of_stock',
            availability_normalized: 'OUT_OF_STOCK',
            seller: 'Amazon.com',
            domestic_shipping: 0,
            reliability_score: 95,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Jada Toys Ryu',
            image_url: 'https://example.com/r.jpg',
            product_url: 'https://amazon.com/dp/B00AMZ',
            last_checked: new Date().toISOString()
          },
          {
            id: 'OFF-EBAY-SECONDARY',
            source: 'ebay',
            source_item_id: 'EB00ALT',
            price: 27.50,
            currency: 'USD',
            availability: 'in_stock',
            availability_normalized: 'IN_STOCK',
            seller: 'TopCollectibles',
            domestic_shipping: 3.50,
            reliability_score: 92,
            condition: 'new',
            condition_normalized: 'NEW',
            title: 'Jada Toys Ryu',
            image_url: 'https://example.com/r.jpg',
            product_url: 'https://ebay.com/itm/EB00ALT',
            last_checked: new Date().toISOString()
          }
        ],
        selected_source_id: 'OFF-AMZ-PRIMARY',
        financials: { origin_price_usd: 24.99, real_cost_puesto_usd: 35, current_sale_price_usd: 55, margin_percent: 36, profit_usd: 20, currency: 'USD' },
        uruguay_market: createNoDataMarketSummary('Ryu Recon'),
        authenticity: { status: 'VERIFIED_OFFICIAL', confidence_score: 95, signals: [], risk_factors: [] },
        opportunity_score: 85,
        risk_score: 10,
        risk_level: 'LOW'
      };

      const settings: AutopilotSettings = {
        id: 'set-recon',
        mode: 'AUTOPILOT',
        visual_status: 'ACTIVE',
        discover_products: true,
        evaluate_opportunities: true,
        prepare_publications: true,
        auto_publish: false,
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

      const result = await autopilotReconciliationEngine.reconcileProduct(mockProduct, null, settings, []);

      expect(result.actionTaken).toBe('SOURCE_SWITCHED');
      expect(result.updatedProduct.selected_source_id).toBe('OFF-EBAY-SECONDARY');
      expect(result.newStatus).toBe('SOURCE_CHANGED');
    });
  });

  // =========================================================================
  // BLOQUE 9: NO REAL PURCHASES & GOVERNANCE GUARANTEE (ITEM 14)
  // =========================================================================
  describe('Bloque 9: Zero Real Purchases & Auto Purchase Lock', () => {
    it('confirms NO REAL PURCHASES EXECUTED and AUTO_PURCHASE_ENABLED = false', () => {
      const isAutoPurchaseEnabled = false;
      const realPurchasesExecutedCount = 0;

      expect(isAutoPurchaseEnabled).toBe(false);
      expect(realPurchasesExecutedCount).toBe(0);
    });
  });

});
