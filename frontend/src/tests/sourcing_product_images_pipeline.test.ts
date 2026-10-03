import { describe, it, expect, vi } from 'vitest';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { aiGateway } from '../services/ai/aiGateway';
import { validateCandidate } from '../../../shared/sourcingCandidateValidation.js';
import { deduplicateResearchCandidates } from '../../../server/lib/researchCostOptimizer.js';

describe('Sourcing Product Candidates Image Pipeline & Strict Verification Suite', () => {

  // Test A: Exact image_url traverses the whole pipeline
  it('A: exact image_url traverses the whole pipeline correctly', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears 14" Plush - Cheer Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        origin_price_usd: 14.99,
        asin: 'B08552JGRF',
        url: 'https://www.amazon.com/dp/B08552JGRF',
        image_url: 'https://m.media-amazon.com/images/I/71xyz123.jpg',
        retailer: 'Amazon US'
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems,
        // Gateway fixture after server verification; raw model URLs alone are not observed.
        canonical_candidates: mockBackendItems.map((item, index) => validateCandidate(item, { index, observations: item.url && item.image_url && !/unsplash|placeholder|data:/.test(item.image_url) ? [{ field: 'image', value: item.image_url, status: 'OBSERVED', source: item.retailer || 'Amazon', source_url: item.url, observed_at: '2026-10-03T00:00:00Z', verification: 'SOURCE_VERIFIED', exact_product_relationship: true, http_status: 200, content_type: 'image/jpeg' }] : [] })),
        summary: 'Found 1 item'
      },
      latency_ms: 500
    });

    const res = await researchIntelligenceService.research({
      query: 'peluches de los ositos cariñosos',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].image_url).toBe('https://m.media-amazon.com/images/I/71xyz123.jpg');
    expect(res.candidates[0].gallery_images).toEqual(['https://m.media-amazon.com/images/I/71xyz123.jpg']);
  });

  // Test B: image_url null preserves candidate and results in empty string for UI placeholder
  it('B: image_url null preserves candidate and does not crash', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears 14" Plush - Tenderheart Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        origin_price_usd: 16.99,
        asin: 'B08553JXYZ',
        url: 'https://www.amazon.com/dp/B08553JXYZ',
        image_url: null,
        retailer: 'Amazon US'
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems,
        // Gateway fixture after server verification; raw model URLs alone are not observed.
        canonical_candidates: mockBackendItems.map((item, index) => validateCandidate(item, { index, observations: item.url && item.image_url && !/unsplash|placeholder|data:/.test(item.image_url) ? [{ field: 'image', value: item.image_url, status: 'OBSERVED', source: item.retailer || 'Amazon', source_url: item.url, observed_at: '2026-10-03T00:00:00Z', verification: 'SOURCE_VERIFIED', exact_product_relationship: true, http_status: 200, content_type: 'image/jpeg' }] : [] })),
        summary: 'Found 1 item without image'
      },
      latency_ms: 450
    });

    const res = await researchIntelligenceService.research({
      query: 'care bears tenderheart',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].title).toBe('Care Bears 14" Plush - Tenderheart Bear');
    expect(res.candidates[0].image_url).toBeNull();
    expect(res.candidates[0].gallery_images).toEqual([]);
  });

  // Test C: candidate without image DOES NOT disappear
  it('C: candidates without images are never dropped or filtered out', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears Grumpy Bear 9" Bean Plush',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        origin_price_usd: 9.99,
        image_url: undefined,
        retailer: 'Target'
      },
      {
        title: 'Care Bears Good Luck Bear Plush',
        url: 'https://www.target.com/p/care-bears-good-luck-bear/-/A-12345',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        origin_price_usd: 14.99,
        image_url: 'https://target.scene7.com/is/image/Target/GUEST_12345',
        retailer: 'Target'
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems,
        // Gateway fixture after server verification; raw model URLs alone are not observed.
        canonical_candidates: mockBackendItems.map((item, index) => validateCandidate(item, { index, observations: item.url && item.image_url && !/unsplash|placeholder|data:/.test(item.image_url) ? [{ field: 'image', value: item.image_url, status: 'OBSERVED', source: item.retailer || 'Amazon', source_url: item.url, observed_at: '2026-10-03T00:00:00Z', verification: 'SOURCE_VERIFIED', exact_product_relationship: true, http_status: 200, content_type: 'image/jpeg' }] : [] })),
        summary: 'Found 2 items'
      },
      latency_ms: 600
    });

    const res = await researchIntelligenceService.research({
      query: 'care bears plush collection',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(2);
    expect(res.candidates[0].image_url).toBeNull();
    expect(res.candidates[1].image_url).toBe('https://target.scene7.com/is/image/Target/GUEST_12345');
  });

  // Test D: No synthetic/hallucinated URL is created (e.g. data URI, unsplash, placeholder strings)
  it('D: rejects synthetic, unsplash, data URI, and invalid image URLs', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears Wish Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        image_url: 'https://images.unsplash.com/photo-fake-bear',
      },
      {
        title: 'Care Bears Funshine Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      {
        title: 'Care Bears Harmony Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        image_url: 'https://example.com/placeholder-toy.png',
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems,
        // Gateway fixture after server verification; raw model URLs alone are not observed.
        canonical_candidates: mockBackendItems.map((item, index) => validateCandidate(item, { index, observations: item.url && item.image_url && !/unsplash|placeholder|data:/.test(item.image_url) ? [{ field: 'image', value: item.image_url, status: 'OBSERVED', source: item.retailer || 'Amazon', source_url: item.url, observed_at: '2026-10-03T00:00:00Z', verification: 'SOURCE_VERIFIED', exact_product_relationship: true, http_status: 200, content_type: 'image/jpeg' }] : [] })),
        summary: 'Found 3 items'
      },
      latency_ms: 500
    });

    const res = await researchIntelligenceService.research({
      query: 'care bears test',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(3);
    // Unsplash rejected
    expect(res.candidates[0].image_url).toBeNull();
    // Data URI rejected
    expect(res.candidates[1].image_url).toBeNull();
    // Placeholder rejected
    expect(res.candidates[2].image_url).toBeNull();
  });

  // Test E: image of another SKU/ASIN is not mistakenly reused across distinct products
  it('E: deduplication preserves distinct image URLs per unique candidate and merges when same product', () => {
    const listA = [
      {
        title: 'Care Bears Cheer Bear 14" Plush',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        asin: 'B08552JGRF',
        image_url: 'https://m.media-amazon.com/images/I/71Cheer.jpg'
      }
    ];

    const listB = [
      // Same exact product title from another source; an AI-declared ASIN does not prove identity
      {
        title: 'Care Bears Cheer Bear 14" Plush',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        asin: 'B08552JGRF',
        origin_price_usd: 14.99
      },
      // Distinct product with different character/title
      {
        title: 'Care Bears Grumpy Bear 14" Plush',
        brand: 'Basic Fun',
        franchise: 'Care Bears',
        asin: 'B08553GRMP',
        image_url: 'https://m.media-amazon.com/images/I/71Grumpy.jpg'
      }
    ];

    const merged = deduplicateResearchCandidates(listA, listB);

    expect(merged).toHaveLength(2);
    // Product 1: Merged evidence and preserved original verified image
    expect(merged[0].asin).toBe('B08552JGRF');
    expect(merged[0].image_url).toBe('https://m.media-amazon.com/images/I/71Cheer.jpg');
    // Product 2: Distinct candidate has its own distinct image
    expect(merged[1].asin).toBe('B08553GRMP');
    expect(merged[1].image_url).toBe('https://m.media-amazon.com/images/I/71Grumpy.jpg');
  });

});
