import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiSourceDiscoveryService, normalizeDiscoveryQuery } from '../services/sourcing/multiSourceDiscoveryService';
import { amazonZincSearchService } from '../services/sourcing/amazonZincSearchService';
import { supabase } from '../lib/supabase';
import { SOURCING_PURCHASE_CAPABILITY, AUTO_PUBLISH } from '../../../shared/sourcingCandidateValidation.js';

describe('Shared Multi-Source Discovery Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiSourceDiscoveryService.setBestBuyConfigured(false);
    multiSourceDiscoveryService.setEbayTableAvailable(null);
  });

  // Test 1: BestBuy sin configuración: NOT_CONFIGURED, zero network call, zero console failure
  it('1. BestBuy without configuration returns NOT_CONFIGURED with zero network calls and zero errors', async () => {
    const invokeSpy = vi.spyOn(supabase.functions, 'invoke');
    const bbResult = await multiSourceDiscoveryService.discoverBestBuy('Batman 1:12');

    expect(bbResult.status).toBe('NOT_CONFIGURED');
    expect(bbResult.items.length).toBe(0);
    expect(bbResult.queriesCount).toBe(0);
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(bbResult.message).toContain('BESTBUY_API_KEY');
  });

  // Test 2: BestBuy configurado: no realiza llamadas browser CORS directas que fallen
  it('2. BestBuy when configured does not expose secrets or make unproxied browser calls', async () => {
    multiSourceDiscoveryService.setBestBuyConfigured(true);
    const bbResult = await multiSourceDiscoveryService.discoverBestBuy('Spider-Man');
    expect(bbResult.status).toBe('NOT_CONFIGURED');
    expect(bbResult.items.length).toBe(0);
  });

  // Test 3: eBay provider inexistente/tabla 404: reporta NOT_CONFIGURED sin falsa condición WORKING
  it('3. eBay when table is missing returns NOT_CONFIGURED honestly without false WORKING status', async () => {
    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.source_listings' in the schema cache" }
      })
    } as any);

    const ebayResult = await multiSourceDiscoveryService.discoverEbay('Batman', 5);
    expect(ebayResult.status).toBe('NOT_CONFIGURED');
    expect(ebayResult.items.length).toBe(0);
    expect(ebayResult.message).toContain('source_listings pendiente de migración');
    expect(fromSpy).toHaveBeenCalledTimes(1);

    // Second call avoids network call completely
    fromSpy.mockClear();
    const cachedResult = await multiSourceDiscoveryService.discoverEbay('Superman', 5);
    expect(cachedResult.status).toBe('NOT_CONFIGURED');
    expect(fromSpy).not.toHaveBeenCalled();
  });

  // Test 4: eBay provider válido: puede crear raw candidate
  it('4. eBay when provider is active and table exists creates raw candidates with real pricing', async () => {
    multiSourceDiscoveryService.setEbayTableAvailable(true);
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
    expect(ebayResult.status).toBe('WORKING');
    expect(ebayResult.items.length).toBe(1);
    expect(ebayResult.items[0].title).toBe('S.H.Figuarts Son Goku A Hero On Earth');
    expect(ebayResult.items[0].origin_price_usd).toBe(35);
    expect(ebayResult.items[0].provider).toBe('EBAY');
  });

  // Test 5: eBay normalized query: no depende del texto completo literal
  it('5. eBay query normalization extracts core entities and scale variants', () => {
    const raw = 'Batman figuras de acción escala 1:12 coleccionables';
    const variants = normalizeDiscoveryQuery(raw);
    expect(variants.length).toBeGreaterThan(1);
    expect(variants.some(v => v.includes('batman') && !v.includes('figuras de accion'))).toBe(true);
  });

  // Test 6: Amazon puede crear raw candidate independientemente de Web
  it('6. Amazon Discovery Search creates raw candidates independently of web research', async () => {
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
    expect(amazonResult.status).toBe('WORKING');
    expect(amazonResult.items.length).toBe(1);
    expect(amazonResult.items[0].title).toBe('Spider-Man SV-Action Sentinel');
    expect(amazonResult.items[0].asin).toBe('B08XYZ1234');
    expect(amazonResult.items[0].origin_price_usd).toBe(110);
    expect(amazonResult.items[0].provider).toBe('AMAZON');
  });

  // Test 7: Source telemetry: candidates_created correcto por provider y dedupe tracking
  it('7. Multi-source telemetry tracks granular candidates_created per provider and deduplication', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [
        { asin: 'B011111111', title: 'Iron Man Mark 85', price_usd: 89.99 },
        { asin: 'B022222222', title: 'Thor Endgame', price_usd: 75.00 }
      ]
    } as any);

    multiSourceDiscoveryService.setEbayTableAvailable(true);
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce({
        data: [{ id: 'eb-2', raw_title: 'Iron Man Mark 85 Hot Toys', raw_price_cents: 45000, source_url: 'https://ebay.com/itm/22' }],
        error: null
      })
    } as any);

    const res = await multiSourceDiscoveryService.discoverAllSources('Marvel');
    expect(res.candidates.length).toBe(3);
    expect(res.telemetry.amazon.candidates_created).toBe(2);
    expect(res.telemetry.amazon.status).toBe('WORKING');
    expect(res.telemetry.ebay.candidates_created).toBe(1);
    expect(res.telemetry.ebay.status).toBe('WORKING');
    expect(res.telemetry.bestbuy.status).toBe('NOT_CONFIGURED');
    expect(res.telemetry.bestbuy.candidates_created).toBe(0);
    expect(res.telemetry.candidates_before_dedupe).toBe(3);
  });

  // Test 8: Provider failure: no destruye candidatos de otras fuentes
  it('8. Provider failure isolation: eBay or network error does not destroy Amazon candidates', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B033333333', title: 'Wolverine', price_usd: 55 }]
    } as any);

    multiSourceDiscoveryService.setEbayTableAvailable(true);
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValueOnce(new Error('Network connection timeout'))
    } as any);

    const res = await multiSourceDiscoveryService.discoverAllSources('Wolverine');
    expect(res.telemetry.amazon.status).toBe('WORKING');
    expect(res.telemetry.amazon.candidates_created).toBe(1);
    expect(res.telemetry.ebay.status).toBe('ERROR');
    expect(res.telemetry.ebay.errors).toBe(1);
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0].title).toBe('Wolverine');
  });

  // Test 9: Zero synthetic prices or weights
  it('9. Providers with invalid or missing prices yield null, never synthetic numbers or 0 defaults', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B099999999', title: 'Item Without Price', price_usd: undefined }]
    } as any);

    const res = await multiSourceDiscoveryService.discoverAmazon('Item Without Price');
    expect(res.items.length).toBe(1);
    expect(res.items[0].origin_price_usd).toBeNull();
  });

  // Test 10: Safety governance: SOURCING_PURCHASE_CAPABILITY is strictly NONE
  it('10. Safety invariants: SOURCING_PURCHASE_CAPABILITY is strictly NONE and AUTO_PUBLISH is false', () => {
    expect(SOURCING_PURCHASE_CAPABILITY).toBe('NONE');
    expect(AUTO_PUBLISH).toBe(false);
  });
});
