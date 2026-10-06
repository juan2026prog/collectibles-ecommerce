import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiSourceDiscoveryService, normalizeDiscoveryQuery, SOURCING_V1_MODE, AMAZON_ENABLED, WEB_SEARCH_ENABLED, EBAY_ENABLED, BESTBUY_ENABLED } from '../services/sourcing/multiSourceDiscoveryService';
import { amazonZincSearchService } from '../services/sourcing/amazonZincSearchService';
import { supabase } from '../lib/supabase';
import { SOURCING_PURCHASE_CAPABILITY, AUTO_PUBLISH, deduplicateCanonicalCandidates, validateCandidate } from '../../../shared/sourcingCandidateValidation.js';
import { resolveZincProductsForCandidates } from '../services/sourcing/zincProductResolver';

describe('Sourcing V1 (Amazon-First) Multi-Source Discovery Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    multiSourceDiscoveryService.setBestBuyEnabled(false);
    multiSourceDiscoveryService.setEbayEnabled(false);
  });

  // Test 1: V1 Mode governance flags
  it('1. Sourcing V1 governance flags: Amazon and WebSearch ACTIVE, eBay and BestBuy DISABLED', () => {
    expect(SOURCING_V1_MODE).toBe('AMAZON_FIRST');
    expect(AMAZON_ENABLED).toBe(true);
    expect(WEB_SEARCH_ENABLED).toBe(true);
    expect(EBAY_ENABLED).toBe(false);
    expect(BESTBUY_ENABLED).toBe(false);
  });

  // Test 2: Amazon Discovery Search can create raw candidates independently of Web
  it('2. Amazon Discovery Search creates candidates independently of Web Search', async () => {
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

  // Test 3: eBay is DISABLED with zero calls and zero errors
  it('3. eBay is DISABLED: makes zero network calls, zero errors, returns status DISABLED', async () => {
    const fromSpy = vi.spyOn(supabase, 'from');
    const ebayResult = await multiSourceDiscoveryService.discoverEbay('Batman', 5);

    expect(ebayResult.status).toBe('DISABLED');
    expect(ebayResult.items.length).toBe(0);
    expect(ebayResult.queriesCount).toBe(0);
    expect(ebayResult.error).toBeUndefined();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(ebayResult.message).toContain('deshabilitado en Sourcing V1');
  });

  // Test 4: BestBuy is DISABLED with zero calls and zero errors
  it('4. BestBuy is DISABLED: makes zero network calls, zero CORS, zero errors, returns status DISABLED', async () => {
    const invokeSpy = vi.spyOn(supabase.functions, 'invoke');
    const bbResult = await multiSourceDiscoveryService.discoverBestBuy('Batman');

    expect(bbResult.status).toBe('DISABLED');
    expect(bbResult.items.length).toBe(0);
    expect(bbResult.queriesCount).toBe(0);
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(bbResult.message).toContain('deshabilitado en Sourcing V1');
  });

  // Test 5: Manual Research: Web + Amazon work together, eBay and BestBuy remain DISABLED
  it('5. Manual Research Multi-Source: Amazon executes and creates candidates while eBay/BestBuy remain DISABLED', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [
        { asin: 'B011111111', title: 'Iron Man Mark 85', price_usd: 89.99 },
        { asin: 'B022222222', title: 'Thor Endgame', price_usd: 75.00 }
      ]
    } as any);

    const fromSpy = vi.spyOn(supabase, 'from');
    const invokeSpy = vi.spyOn(supabase.functions, 'invoke');

    const res = await multiSourceDiscoveryService.discoverAllSources('Marvel');
    expect(res.candidates.length).toBe(2);
    expect(res.telemetry.amazon.candidates_created).toBe(2);
    expect(res.telemetry.amazon.status).toBe('WORKING');
    expect(res.telemetry.ebay.status).toBe('DISABLED');
    expect(res.telemetry.ebay.candidates_created).toBe(0);
    expect(res.telemetry.bestbuy.status).toBe('DISABLED');
    expect(res.telemetry.bestbuy.candidates_created).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  // Test 6: Amazon failure: Web candidates survive (Fail-soft isolation)
  it('6. Amazon provider failure: isolates cleanly without throwing or aborting run', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockRejectedValueOnce(new Error('Amazon Zinc API timeout'));

    const res = await multiSourceDiscoveryService.discoverAllSources('Wolverine');
    expect(res.telemetry.amazon.status).toBe('ERROR');
    expect(res.telemetry.amazon.errors).toBe(1);
    expect(res.telemetry.ebay.status).toBe('DISABLED');
    expect(res.telemetry.bestbuy.status).toBe('DISABLED');
    expect(res.candidates.length).toBe(0);
  });

  // Test 7: Web failure / zero web items: Amazon candidates survive
  it('7. Web search returns 0 or fails: Amazon discovery candidates survive and proceed', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B033333333', title: 'Vegeta S.H.Figuarts', price_usd: 65 }]
    } as any);

    const res = await multiSourceDiscoveryService.discoverAllSources('Vegeta');
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0].title).toBe('Vegeta S.H.Figuarts');
    expect(res.telemetry.amazon.candidates_created).toBe(1);
  });

  // Test 8: Deduplication: Web + Amazon with same product do not duplicate
  it('8. Deduplication Web + Amazon: same product identity is merged and deduplicated', () => {
    const webCandidate = validateCandidate({
      title: 'Marvel Legends Wolverine 97',
      url: 'https://hasbropulse.com/products/wolverine',
      origin_price_usd: 24.99
    }, { country: 'UY', origin: 'MANUAL_RESEARCH' });

    const amazonCandidate = validateCandidate({
      title: 'Marvel Legends Wolverine 97',
      url: 'https://amazon.com/dp/B0CX123456',
      asin: 'B0CX123456',
      origin_price_usd: 24.99
    }, { country: 'UY', origin: 'RETAILER_DISCOVERY' });

    const deduplicated = deduplicateCanonicalCandidates([webCandidate, amazonCandidate]);
    expect(deduplicated.length).toBe(1);
  });

  // Test 9: Zinc resolution downstream continues working post-discovery
  it('9. Downstream Zinc Resolution resolves product identities for discovered candidates', async () => {
    const candidate = validateCandidate({
      title: 'S.H.Figuarts Son Goku A Hero on Earth',
      url: 'https://tamashiiweb.com/item/14000',
      origin_price_usd: 35
    }, { country: 'UY', origin: 'MANUAL_RESEARCH' });

    const { resolvedCandidates } = await resolveZincProductsForCandidates([candidate]);
    expect(resolvedCandidates.length).toBe(1);
  });

  // Test 10: Zero synthetic data: no synthetic prices, weights, or ASINs
  it('10. Zero synthetic data: unverified prices yield null, never fabricated defaults', async () => {
    vi.spyOn(amazonZincSearchService, 'search').mockResolvedValueOnce({
      success: true,
      products: [{ asin: 'B099999999', title: 'Item Without Price', price_usd: undefined }]
    } as any);

    const res = await multiSourceDiscoveryService.discoverAmazon('Item Without Price');
    expect(res.items.length).toBe(1);
    expect(res.items[0].origin_price_usd).toBeNull();
  });

  // Test 11: Safety governance invariants
  it('11. Safety invariants strictly enforced: PURCHASE_CAPABILITY = NONE, AUTO_PUBLISH = OFF', () => {
    expect(SOURCING_PURCHASE_CAPABILITY).toBe('NONE');
    expect(AUTO_PUBLISH).toBe(false);
  });
});
