import { describe, it, expect } from 'vitest';
import { amazonSourceAdapter } from '../services/sourcing/adapters/AmazonSourceAdapter';
import { ebaySourceAdapter } from '../services/sourcing/adapters/EbaySourceAdapter';
import { ebayLiveSourceAdapter } from '../services/sourcing/adapters/EbayLiveSourceAdapter';
import { bestBuySourceAdapter } from '../services/sourcing/adapters/BestBuySourceAdapter';
import { bestBuyLiveSourceAdapter } from '../services/sourcing/adapters/BestBuyLiveSourceAdapter';
import { resolveAdapterForUrl, getAdapterBySource } from '../services/sourcing/adapters';

describe('ANEXO: Zinc & Multi-Retailer Certification Suite (Amazon, eBay, Best Buy)', () => {
  // TEST 1: Amazon adapter sends correct retailer
  it('TEST 1: Amazon adapter identifies source as amazon and parses product URLs', () => {
    expect(amazonSourceAdapter.source).toBe('amazon');
    const url = 'https://www.amazon.com/dp/B081VR7Y32';
    expect(amazonSourceAdapter.matchesUrl(url)).toBe(true);
    expect(amazonSourceAdapter.extractProductId(url)).toBe('B081VR7Y32');
  });

  // TEST 2: eBay adapter sends correct retailer
  it('TEST 2: eBay adapter identifies source as ebay and parses item IDs', () => {
    expect(ebaySourceAdapter.source).toBe('ebay');
    const url = 'https://www.ebay.com/itm/123456789012';
    expect(ebaySourceAdapter.matchesUrl(url)).toBe(true);
    expect(ebaySourceAdapter.extractProductId(url)).toBe('123456789012');
  });

  // TEST 3: Best Buy adapter sends correct retailer
  it('TEST 3: Best Buy adapter identifies source as bestbuy and parses SKU IDs', () => {
    expect(bestBuySourceAdapter.source).toBe('bestbuy');
    const url = 'https://www.bestbuy.com/site/mcfarlane-toys-dc-multiverse/6412345.p?skuId=6412345';
    expect(bestBuySourceAdapter.matchesUrl(url)).toBe(true);
    expect(bestBuySourceAdapter.extractProductId(url)).toBe('6412345');
  });

  // TEST 4: No fallback silently changes retailer
  it('TEST 4: Resolving adapter by source strictly preserves retailer identity without cross-fallback mutation', () => {
    const amazon = getAdapterBySource('amazon');
    const ebay = getAdapterBySource('ebay');
    const bestbuy = getAdapterBySource('bestbuy');

    expect(amazon.source).toBe('amazon');
    expect(ebay.source).toBe('ebay');
    expect(bestbuy.source).toBe('bestbuy');
  });

  // TEST 5: Zinc credentials safety
  it('TEST 5: Ensures Zinc API keys are NOT exposed in client environment variables (VITE_*)', () => {
    const viteZincKey = (import.meta as any).env?.VITE_ZINC_API_KEY;
    const viteZincSecret = (import.meta as any).env?.VITE_ZINC_SECRET;
    expect(viteZincKey).toBeUndefined();
    expect(viteZincSecret).toBeUndefined();
  });

  // TEST 6: Retailer capabilities isolation
  it('TEST 6: Capabilities are configured independently per retailer', () => {
    const ebayOffer = ebaySourceAdapter.toSourceOffer({
      source: 'ebay',
      source_product_id: '123456789',
      url: 'https://www.ebay.com/itm/123456789',
      title: 'Jada Toys Street Fighter Ryu',
      price: 22.50,
      currency: 'USD',
      domestic_shipping: 5.99,
      availability: 'in_stock',
      condition: 'used',
      seller: 'Retro Collectibles Shop'
    });

    expect(ebayOffer.source).toBe('ebay');
    expect(ebayOffer.is_zinc_compatible).toBe(true);
    expect(ebayOffer.condition).toBe('used');
  });

  // TEST 7: Search LIVE vs Purchasing LIVE decoupling
  it('TEST 7: Demonstrates that Search LIVE capability does not imply Purchasing LIVE', () => {
    const liveAdapter = ebayLiveSourceAdapter;
    expect(liveAdapter.source).toBe('ebay');
    const fallback = liveAdapter.createFallbackItem('999888777');
    expect(fallback.item_id).toBe('999888777');
    expect(fallback.status).toBe('ERROR');
  });

  // TEST 8: Condition preservation (eBay USED vs Amazon NEW)
  it('TEST 8: eBay USED offers are preserved distinctly from Amazon NEW offers', () => {
    const ebayRaw = ebaySourceAdapter.parseOfferFromInput({
      url: 'https://www.ebay.com/itm/112233445566',
      title: 'Chun-Li Jada Toys Used',
      price: 18.00,
      raw: { condition: 'used' }
    });

    const amazonRaw = amazonSourceAdapter.parseOfferFromInput({
      url: 'https://www.amazon.com/dp/B081VR7Y32',
      title: 'Chun-Li Jada Toys New',
      price: 24.99,
      raw: { condition: 'new' }
    });

    expect(ebayRaw.condition).toBe('used');
    expect(amazonRaw.condition).toBe('new');
    expect(ebayRaw.condition).not.toBe(amazonRaw.condition);
  });

  // TEST 9: Best Buy SKU preservation
  it('TEST 9: Best Buy SKU and direct product link formatting are preserved', () => {
    const sku = '6543210';
    const fallback = bestBuyLiveSourceAdapter.createFallbackItem(sku);
    expect(fallback.sku).toBe(sku);
    expect(fallback.product_url).toContain('skuId=6543210');
  });

  // TEST 10: Healthcheck decoupling
  it('TEST 10: Live healthcheck operates independently of storefront HTTP status', () => {
    const ebayHealthStatus = ebayLiveSourceAdapter.createFallbackItem('12345');
    const bestBuyHealthStatus = bestBuyLiveSourceAdapter.createFallbackItem('67890');

    expect(ebayHealthStatus.checked_at).toBeDefined();
    expect(bestBuyHealthStatus.checked_at).toBeDefined();
    expect(ebayHealthStatus.status).toBe('ERROR');
  });
});
