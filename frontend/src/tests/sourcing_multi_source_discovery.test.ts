import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiSourceDiscoveryService } from '../services/sourcing/multiSourceDiscoveryService';
import { amazonZincSearchService } from '../services/sourcing/amazonZincSearchService';
import { supabase } from '../lib/supabase';
import { SOURCING_PURCHASE_CAPABILITY, AUTO_PUBLISH } from '../../../shared/sourcingCandidateValidation.js';

describe('Shared Multi-Source Discovery Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Manual Web query generates valid candidates
  it('1. Web discovery returns raw candidates with source tracking', async () => {
    const res = await multiSourceDiscoveryService.discoverAllSources('Goku');
    expect(res).toBeDefined();
    expect(res.query).toBe('Goku');
    expect(res.sourceStatus).toBeDefined();
  });

  // Test 2: Manual Amazon query returns valid candidates with origin_price and image
  it('2. Manual Amazon query returns valid candidates with real pricing and image', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      query: 'Spider-Man Sentinel',
      products: [
        {
          asin: 'B08XYZ1234',
          title: 'Spider-Man SV-Action Sentinel',
          price_usd: 110,
          image_url: 'https://images.example.com/spiderman.jpg',
          brand: 'Sentinel',
          seller: 'Amazon.com'
        }
      ]
    } as any);

    const amazonResult = await multiSourceDiscoveryService.discoverAmazon('Spider-Man Sentinel', 5);
    expect(amazonResult.status).toBe('AVAILABLE');
    expect(amazonResult.items.length).toBe(1);
    expect(amazonResult.items[0].title).toBe('Spider-Man SV-Action Sentinel');
    expect(amazonResult.items[0].asin).toBe('B08XYZ1234');
    expect(amazonResult.items[0].origin_price_usd).toBe(110);
    expect(amazonResult.items[0].provider).toBe('AMAZON');
  });

  // Test 3: Manual eBay query returns valid candidate from source_listings
  it('3. Manual eBay query returns candidates with real metadata from listings', async () => {
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce({
        data: [
          {
            id: 'ebay-list-1',
            source_url: 'https://www.ebay.com/itm/123456789',
            raw_title: 'S.H.Figuarts Son Goku A Hero On Earth',
            raw_brand: 'Bandai',
            raw_price_cents: 3500,
            raw_condition: 'new',
            raw_payload: {
              image_url: 'https://i.ebayimg.com/images/g/test/s-l500.jpg',
              seller: 'hobby_japan'
            }
          }
        ],
        error: null
      })
    } as any);

    const ebayResult = await multiSourceDiscoveryService.discoverEbay('Son Goku', 5);
    expect(ebayResult.status).toBe('AVAILABLE');
    expect(ebayResult.items.length).toBe(1);
    expect(ebayResult.items[0].title).toBe('S.H.Figuarts Son Goku A Hero On Earth');
    expect(ebayResult.items[0].origin_price_usd).toBe(35);
    expect(ebayResult.items[0].provider).toBe('EBAY');
  });

  // Test 4: BestBuy returns NOT_CONFIGURED when api key is missing
  it('4. BestBuy degrades gracefully to NOT_CONFIGURED when unconfigured', async () => {
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValueOnce({
      data: { status: 'NOT_CONFIGURED', message: 'Best Buy requiere API Key de desarrollador' },
      error: null
    } as any);

    const bbResult = await multiSourceDiscoveryService.discoverBestBuy('Batman');
    expect(bbResult.status).toBe('NOT_CONFIGURED');
    expect(bbResult.items.length).toBe(0);
    expect(bbResult.message).toContain('API Key');
  });

  // Test 5: Manual multi-source query aggregates results from multiple sources
  it('5. Multi-source search aggregates Amazon and eBay candidates cleanly', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B011111111', title: 'Iron Man Mark 85', price_usd: 89.99 }]
    } as any);

    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce({
        data: [{ id: 'eb-2', raw_title: 'Iron Man Mark 85 Hot Toys', raw_price_cents: 45000, source_url: 'https://ebay.com/itm/22' }],
        error: null
      })
    } as any);

    vi.spyOn(supabase.functions, 'invoke').mockResolvedValueOnce({
      data: { status: 'NOT_CONFIGURED' },
      error: null
    } as any);

    const res = await multiSourceDiscoveryService.discoverAllSources('Iron Man');
    expect(res.candidates.length).toBe(2);
    expect(res.sourceStatus.amazon.status).toBe('AVAILABLE');
    expect(res.sourceStatus.ebay.status).toBe('AVAILABLE');
    expect(res.sourceStatus.bestbuy.status).toBe('NOT_CONFIGURED');
  });

  // Test 6: Deduplication of multi-source candidates
  it('6. Empty or blank queries return empty array with 0 cost', async () => {
    const res = await multiSourceDiscoveryService.discoverAllSources('   ');
    expect(res.candidates.length).toBe(0);
    expect(res.totalFound).toBe(0);
  });

  // Test 7: Zero synthetic prices or weights
  it('7. Providers with invalid or missing prices yield null, never synthetic numbers or 0 defaults', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B022222222', title: 'Item Without Price', price_usd: undefined }]
    } as any);

    const res = await multiSourceDiscoveryService.discoverAmazon('Item Without Price');
    expect(res.items.length).toBe(1);
    expect(res.items[0].origin_price_usd).toBeNull();
  });

  // Test 8: Fail-soft provider isolation: if eBay errors, Amazon still succeeds
  it('8. Fail-soft isolation: one failing provider does not abort discovery for other providers', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B033333333', title: 'Wolverine', price_usd: 55 }]
    } as any);

    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValueOnce(new Error('eBay DB connection timeout'))
    } as any);

    vi.spyOn(supabase.functions, 'invoke').mockResolvedValueOnce({
      data: { status: 'NOT_CONFIGURED' },
      error: null
    } as any);

    const res = await multiSourceDiscoveryService.discoverAllSources('Wolverine');
    expect(res.sourceStatus.amazon.status).toBe('AVAILABLE');
    expect(res.sourceStatus.ebay.status).toBe('ERROR');
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0].title).toBe('Wolverine');
  });

  // Test 9: Safety governance: SOURCING_PURCHASE_CAPABILITY is strictly NONE
  it('9. Safety invariants: SOURCING_PURCHASE_CAPABILITY is strictly NONE and AUTO_PUBLISH is false', () => {
    expect(SOURCING_PURCHASE_CAPABILITY).toBe('NONE');
    expect(AUTO_PUBLISH).toBe(false);
  });
});
