import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bestBuySourceAdapter } from '../services/sourcing/adapters/BestBuySourceAdapter';
import { bestBuyLiveSourceAdapter } from '../services/sourcing/adapters/BestBuyLiveSourceAdapter';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';
import { getRetailerCapabilities, STATIC_RETAILER_CAPABILITIES } from '../services/sourcing/retailerCapabilities';
import { mapExternalConditionToCanonical } from '../services/sourcing/conditionMapper';
import { supabase } from '../lib/supabase';

// Mock Supabase functions.invoke
vi.mock('../lib/supabase', () => {
  return {
    supabase: {
      functions: {
        invoke: vi.fn()
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [] }),
          ilike: vi.fn().mockResolvedValue({ data: [] }),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    }
  };
});

describe('Best Buy + Zinc Hybrid Integration Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. BestBuySourceAdapter Contract', () => {
    it('identifies bestbuy URLs accurately (standard and bby.me)', () => {
      expect(bestBuySourceAdapter.matchesUrl('https://www.bestbuy.com/site/star-wars-action-figure/6512345.p?skuId=6512345')).toBe(true);
      expect(bestBuySourceAdapter.matchesUrl('https://bby.me/6512345')).toBe(true);
      expect(bestBuySourceAdapter.matchesUrl('https://www.amazon.com/dp/B081VR7Y32')).toBe(false);
    });

    it('extracts SKU from query parameter or path', () => {
      const urlQuery = 'https://www.bestbuy.com/site/item/6412345.p?skuId=6412345';
      const urlPath = 'https://www.bestbuy.com/site/item/6412345.p';
      expect(bestBuySourceAdapter.extractProductId(urlQuery)).toBe('6412345');
      expect(bestBuySourceAdapter.extractProductId(urlPath)).toBe('6412345');
    });

    it('normalizes raw product into valid SourceOffer with condition new and zinc compatibility', () => {
      const raw = bestBuySourceAdapter.parseOfferFromInput({
        url: 'https://www.bestbuy.com/site/item/6412345.p?skuId=6412345',
        title: 'Star Wars The Black Series Mandalorian',
        price: 24.99,
        brand: 'Hasbro',
        upc: '5010993761234'
      });
      const offer = bestBuySourceAdapter.toSourceOffer(raw);

      expect(offer.source).toBe('bestbuy');
      expect(offer.source_product_id).toBe('6412345');
      expect(offer.price).toBe(24.99);
      expect(offer.condition).toBe('new');
      expect(offer.is_zinc_compatible).toBe(true);
      expect(offer.status).toBe('RESEARCH_ONLY');
    });
  });

  describe('2. BestBuyLiveSourceAdapter Server-Side Invocation', () => {
    it('invokes sourcing-retailer-live-check edge function directly', async () => {
      const mockEdgeResponse = {
        data: {
          data_source: 'LIVE',
          source_product_id: '6412345',
          title: 'Star Wars Black Series Boba Fett',
          price_usd: 33.99,
          currency: 'USD',
          availability_normalized: 'IN_STOCK',
          usa_shipping_usd: 0,
          brand: 'Hasbro',
          upc: '5010993889900',
          product_url: 'https://www.bestbuy.com/site/6412345.p'
        },
        error: null
      };

      (supabase.functions.invoke as any).mockResolvedValueOnce(mockEdgeResponse);

      const liveResult = await bestBuyLiveSourceAdapter.resolveLiveItem({ sku: '6412345' });

      expect(supabase.functions.invoke).toHaveBeenCalledWith('sourcing-retailer-live-check', {
        body: { product_id: '6412345', retailer: 'bestbuy', force_refresh: true }
      });
      expect(liveResult.status).toBe('LIVE');
      expect(liveResult.sale_price).toBe(33.99);
      expect(liveResult.availability).toBe('in_stock');
    });

    it('handles live check fallback gracefully without breaking', async () => {
      (supabase.functions.invoke as any).mockRejectedValueOnce(new Error('Network error'));

      const fallback = await bestBuyLiveSourceAdapter.resolveLiveItem({ sku: '9999999' });

      expect(fallback.sku).toBe('9999999');
      expect(fallback.status).toBe('ERROR');
      expect(fallback.availability).toBe('out_of_stock');
    });
  });

  describe('3. MultiSourceSearchService Best Buy & TODOS Isolation', () => {
    it('executes Best Buy search via Edge Function with real candidates', async () => {
      const mockBestBuyResults = {
        data: {
          success: true,
          status: 'AVAILABLE',
          retailer: 'bestbuy',
          results: [
            {
              url: 'https://www.bestbuy.com/site/6412345.p?skuId=6412345',
              retailer: 'bestbuy',
              source_product_id: '6412345',
              title: 'Star Wars The Black Series Ahsoka Tano',
              price: 24.99,
              brand: 'Hasbro',
              upc: '5010993881234',
              availability: 'in_stock',
              condition: 'new'
            }
          ]
        },
        error: null
      };

      (supabase.functions.invoke as any).mockImplementation((fnName: string) => {
        if (fnName === 'sourcing-bestbuy-search') {
          return Promise.resolve(mockBestBuyResults);
        }
        return Promise.resolve({ data: { results: [] }, error: null });
      });

      const res = await multiSourceSearchService.searchProducts('Star Wars', 'bestbuy');

      expect(res.selectedSource).toBe('bestbuy');
      expect(res.sourceStatus.bestbuy.status).toBe('AVAILABLE');
      expect(res.sourceStatus.bestbuy.resultCount).toBe(1);
      expect(res.canonicalProducts.length).toBe(1);
      expect(res.canonicalProducts[0].offers[0].source).toBe('bestbuy');
    });

    it('isolates failures: Best Buy failure in TODOS does not break Amazon or eBay', async () => {
      (supabase.functions.invoke as any).mockImplementation((fnName: string) => {
        if (fnName === 'sourcing-bestbuy-search') {
          return Promise.reject(new Error('Best Buy service timeout'));
        }
        if (fnName === 'zinc-search-products') {
          return Promise.resolve({
            data: {
              results: [
                {
                  product_id: 'B081VR7Y32',
                  title: 'Star Wars The Black Series Darth Vader',
                  price: 2999,
                  brand: 'Hasbro',
                  prime: true
                }
              ]
            },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const res = await multiSourceSearchService.searchProducts('Star Wars', 'all');

      expect(res.selectedSource).toBe('all');
      expect(res.sourceStatus.amazon.status).toBe('AVAILABLE');
      expect(res.sourceStatus.amazon.resultCount).toBe(1);
      expect(res.sourceStatus.bestbuy.status).toBe('ERROR');
      expect(res.canonicalProducts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Condition Mapping & Canonical Rules', () => {
    it('maps Best Buy new condition to canonical new_sealed', () => {
      const mapped = mapExternalConditionToCanonical('new', 'bestbuy', 'Best Buy Sealed Collector Item');
      expect(mapped.condition).toBe('new_sealed');
    });
  });

  describe('5. Health Check & Capability Resolution', () => {
    it('resolves dynamic retailer capabilities from health check', async () => {
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: {
          success: true,
          retailers: {
            bestbuy: {
              retailer: 'bestbuy',
              status: 'LIVE',
              search_status: 'LIVE',
              live_check_status: 'LIVE',
              purchasing_status: 'SANDBOX',
              managed_account: 'CONNECTED',
              notes: 'Best Buy connected via Edge Functions & Zinc Managed Accounts.'
            }
          }
        },
        error: null
      });

      const caps = await getRetailerCapabilities('bestbuy');

      expect(caps.retailer).toBe('bestbuy');
      expect(caps.search_status).toBe('LIVE');
      expect(caps.live_check_available).toBe(true);
    });
  });
});
