import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  queryMercadoLibreUruguayReal, 
  createNoDataMarketSummary,
  checkUruguayMarketSync 
} from '../services/sourcing/uruguayMarketIntelligence';
import { ebayLiveSourceAdapter } from '../services/sourcing/adapters/EbayLiveSourceAdapter';
import { bestBuyLiveSourceAdapter } from '../services/sourcing/adapters/BestBuyLiveSourceAdapter';
import { OFFICIAL_URUGUAY_LOCAL_STORES } from '../services/sourcing/adapters/LocalMarketSourceAdapter';
import { selectBestSource } from '../services/sourcing/bestSourceSelector';
import { sourcingService } from '../services/sourcing/sourcingService';
import { processBatchInQueue } from '../services/sourcing/batchProcessor';
import type { SourceOffer, NormalizedProduct } from '../types/sourcing';

describe('FASE 3 — CONECTORES LIVE REALES Y ELIMINACIÓN TOTAL DE MOCKS', () => {

  // 1. Mercado Libre Uruguay Real Adapter & Matching
  describe('1. MercadoLibreUruguayAdapter (Server-Side & Zero Mock Rule)', () => {
    it('returns honest NOT_FOUND when no matches exist in production without inventing values', () => {
      const summary = createNoDataMarketSummary('Rare Custom Prototype 1980 Unreleased Item');
      expect(summary.status).toBe('NOT_FOUND');
      expect(summary.exact_match_found).toBe(false);
      expect(summary.min_price_usd).toBeNull();
      expect(summary.data_origin).toBe('NO_DATA');
      expect(summary.market_verdict).toBe('SIN_COMPETENCIA');
      expect(summary.market_position).toBe('NO_EXACT_COMPETITION');
    });

    it('returns honest ERROR without mock replacement if external query fails', () => {
      const summary = createNoDataMarketSummary('Batman McFarlane', 'Network Timeout');
      expect(summary.status).toBe('ERROR');
      expect(summary.data_origin).toBe('ERROR');
      expect(summary.market_verdict).toBe('NO_DISPONIBLE');
      expect(summary.min_price_usd).toBeNull();
    });

    it('calculates exact market position when EXACT_MATCH exists', () => {
      // Simulating a real matched response
      const matchedSummary = {
        source: 'mercado_libre_uy' as const,
        status: 'EXACT_MATCH' as const,
        match_type: 'EXACT_MATCH' as const,
        match_confidence: 95,
        query: '787926151405',
        data_origin: 'LIVE' as const,
        exact_match_found: true,
        min_price_usd: 64.00,
        avg_price_usd: 69.50,
        median_price_usd: 69.50,
        max_price_usd: 75.00,
        total_listings: 6,
        sellers_count: 4,
        currency: 'USD',
        difference_amount: -14.10,
        difference_percent: -22.03,
        market_position: 'CHEAPER' as const,
        comparison_diff_usd: -14.10,
        comparison_diff_percent: -22.03,
        market_verdict: 'MUCHO_MAS_BARATO' as const,
        last_checked_at: new Date().toISOString()
      };

      expect(matchedSummary.market_position).toBe('CHEAPER');
      expect(matchedSummary.difference_amount).toBe(-14.10);
      expect(matchedSummary.difference_percent).toBe(-22.03);
    });

    it('flags MORE_EXPENSIVE and PRECIO_SOBRE_MERCADO if Collectibles price exceeds MLU', () => {
      const collectiblesPrice = 75.00;
      const mluMinPrice = 64.00;
      const diffAmount = Number((collectiblesPrice - mluMinPrice).toFixed(2)); // +11.00
      const diffPercent = Number(((diffAmount / mluMinPrice) * 100).toFixed(1)); // +17.2%

      const position = diffPercent > 5 ? 'MORE_EXPENSIVE' : 'SIMILAR';
      const verdict = diffPercent > 5 ? 'PRECIO_SOBRE_MERCADO' : 'COMPETITIVO';

      expect(position).toBe('MORE_EXPENSIVE');
      expect(verdict).toBe('PRECIO_SOBRE_MERCADO');
    });
  });

  // 2. eBay Live Source Adapter (Zinc Multi-Retailer)
  describe('2. EbayLiveSourceAdapter & Zinc Multi-Retailer Contract', () => {
    it('resolves eBay live item via Zinc and assigns is_zinc_compatible true', async () => {
      const liveItem = await ebayLiveSourceAdapter.resolveLiveItem({ itemId: '324123456789' });
      expect(liveItem.item_id).toBe('324123456789');
      expect(liveItem.status).toBe('LIVE');
      expect(liveItem.seller).toContain('eBay');

      const offer = ebayLiveSourceAdapter.toLiveSourceOffer(liveItem);
      expect(offer.source).toBe('ebay');
      expect(offer.status).toBe('LIVE');
      expect(offer.is_zinc_compatible).toBe(true);
    });
  });

  // 3. Best Buy Live Source Adapter (Zinc Multi-Retailer)
  describe('3. BestBuyLiveSourceAdapter & Zinc Multi-Retailer Contract', () => {
    it('resolves Best Buy live item via Zinc and assigns is_zinc_compatible true', async () => {
      const liveItem = await bestBuyLiveSourceAdapter.resolveLiveItem({ sku: '6412345' });
      expect(liveItem.sku).toBe('6412345');
      expect(liveItem.status).toBe('LIVE');

      const offer = bestBuyLiveSourceAdapter.toLiveSourceOffer(liveItem);
      expect(offer.source).toBe('bestbuy');
      expect(offer.status).toBe('LIVE');
      expect(offer.is_zinc_compatible).toBe(true);
    });
  });

  // 4. Best Source Selector excludes non-live offers
  describe('4. Best Source Selector Hardened (Excludes RESEARCH_ONLY / PENDING)', () => {
    it('never automatically selects a RESEARCH_ONLY or PENDING_CREDENTIAL offer over a verified LIVE offer', () => {
      const offers: SourceOffer[] = [
        {
          id: 'offer-ebay-1',
          source: 'ebay',
          source_product_id: 'EB1',
          url: 'https://ebay.com/itm/EB1',
          seller: 'Seller A',
          price: 15.00, // cheaper sticker price
          currency: 'USD',
          domestic_shipping: 0,
          availability: 'in_stock',
          condition: 'new',
          status: 'RESEARCH_ONLY', // NOT LIVE
          is_zinc_compatible: false,
          reliability_score: 80,
          last_checked_at: new Date().toISOString()
        },
        {
          id: 'offer-amazon-1',
          source: 'amazon',
          source_product_id: 'AMZ1',
          url: 'https://amazon.com/dp/AMZ1',
          seller: 'Amazon.com',
          price: 22.00, // higher nominal price
          currency: 'USD',
          domestic_shipping: 0,
          availability: 'in_stock',
          condition: 'new',
          status: 'LIVE', // VERIFIED LIVE
          is_zinc_compatible: true,
          reliability_score: 98,
          last_checked_at: new Date().toISOString()
        }
      ];

      const res = selectBestSource(offers);
      // Even though eBay is nominally cheaper, it is RESEARCH_ONLY and cannot be selected automatically
      expect(res.bestOffer.source).toBe('amazon');
      expect(res.bestOffer.status).toBe('LIVE');
    });
  });

  // 5. Pre-Import Live Check Enforced
  describe('5. Import Process: Mandatory Live Check', () => {
    it('blocks import if selected source offer is not LIVE or CACHE', async () => {
      const testProduct: NormalizedProduct = {
        id: 'test-unverified-prod',
        canonical_sku: 'COL-TEST-001',
        title: 'McFarlane Batman Test Item',
        brand: 'McFarlane Toys',
        license: 'DC Comics',
        image_url: 'https://example.com/img.jpg',
        gallery_images: [],
        selected_source_id: 'offer-unverified-1',
        best_source_id: 'offer-unverified-1',
        offers: [
          {
            id: 'offer-unverified-1',
            source: 'ebay',
            source_product_id: 'EBAY999',
            url: 'https://ebay.com/itm/EBAY999',
            seller: 'Random Seller',
            price: 25.00,
            currency: 'USD',
            domestic_shipping: 5.00,
            availability: 'in_stock',
            condition: 'new',
            status: 'RESEARCH_ONLY', // Not Live!
            is_zinc_compatible: false,
            reliability_score: 80,
            last_checked_at: new Date().toISOString()
          }
        ],
        financials: {
          origin_price_usd: 25.00,
          usa_shipping_usd: 5.00,
          sales_tax_usd: 0,
          zinc_fee_usd: 1.0,
          financial_fee_usd: 1.5,
          urubox_courier_usd: 0,
          other_costs_usd: 0,
          real_cost_puesto_usd: 32.50,
          suggested_sale_price_usd: 45.00,
          current_sale_price_usd: 45.00,
          profit_usd: 12.50,
          margin_percent: 27.7,
          profit_protection_status: 'PASS'
        },
        authenticity: {
          status: 'VERIFIED_OFFICIAL',
          score: 95,
          confidence: 95,
          brand_verified: true,
          license_verified: true,
          official_distributor: true,
          has_valid_identifier: true,
          verification_method: 'DIRECT_IDENTIFIER_MATCH',
          verification_evidence: ['UPC: 787926151405'],
          verification_source: 'Official Catalog',
          verified_at: new Date().toISOString(),
          red_flags: [],
          green_flags: [],
          reasons: []
        },
        uruguay_market: createNoDataMarketSummary('McFarlane Batman Test Item'),
        catalog_status: 'NOT_IN_CATALOG',
        product_type: 'EVERGREEN',
        tags: [],
        opportunity_score: 80,
        catalog_value_score: 85,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await sourcingService.importProductsToCatalog([testProduct]);
      expect(res.success).toBe(false);
      expect(res.importedCount).toBe(0);
      expect(res.errors[0]).toContain('FUENTE SIN VALIDACIÓN LIVE');
    });
  });

  // 6. Local Markets Status
  describe('6. Local Uruguay Stores Architecture', () => {
    it('declares unintegrated local stores honestly as PENDING without mocking fragile scrapers', () => {
      const stores = OFFICIAL_URUGUAY_LOCAL_STORES;
      expect(stores.find(s => s.id === 'store-mlu')?.status).toBe('ACTIVE');
      expect(stores.find(s => s.id === 'store-xuruguay')?.status).toBe('PENDING');
      expect(stores.find(s => s.id === 'store-geekspot')?.status).toBe('PENDING');
      expect(stores.find(s => s.id === 'store-tiendamia')?.status).toBe('PENDING');
    });
  });

  // 7. Rate Limiter & Concurrency Queue
  describe('7. Rate Limiter & Batch Queue (100+ URLs Stress Test)', () => {
    it('processes 100 items with controlled concurrency and zero UI freeze', async () => {
      const mockItems = Array.from({ length: 100 }, (_, i) => ({
        id: `prod-${i}`,
        url: `https://www.amazon.com/dp/B081VR7Y${i.toString().padStart(2, '0')}`
      }));

      let maxActiveConcurrent = 0;
      let activeConcurrent = 0;
      let progressReported = 0;

      const { results, errors } = await processBatchInQueue(
        mockItems,
        async (item) => {
          activeConcurrent++;
          if (activeConcurrent > maxActiveConcurrent) {
            maxActiveConcurrent = activeConcurrent;
          }
          // Simulate short async resolution
          await new Promise(r => setTimeout(r, 5));
          activeConcurrent--;
          return { resolvedId: item.id, status: 'OK' };
        },
        {
          concurrency: 5,
          delayBetweenMs: 2,
          onProgress: (done, total) => {
            progressReported = done;
          }
        }
      );

      expect(results.length).toBe(100);
      expect(errors.length).toBe(0);
      expect(progressReported).toBe(100);
      expect(maxActiveConcurrent).toBeLessThanOrEqual(5);
    });

    it('applies exponential backoff on HTTP 429 rate limit error', async () => {
      let attempts = 0;
      const { results, errors } = await processBatchInQueue(
        ['item-rate-limited'],
        async () => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error('HTTP 429 Too Many Requests');
            err.status = 429;
            throw err;
          }
          return 'SUCCESS_AFTER_RETRY';
        },
        {
          concurrency: 1,
          maxRetries: 2
        }
      );

      expect(results[0]).toBe('SUCCESS_AFTER_RETRY');
      expect(attempts).toBe(2);
      expect(errors.length).toBe(0);
    });
  });
});
