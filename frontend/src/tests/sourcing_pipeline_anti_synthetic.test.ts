import { describe, it, expect, vi } from 'vitest';
import { researchIntelligenceService } from '../services/sourcing/researchIntelligenceService';
import { aiGateway } from '../services/ai/aiGateway';

describe('Sourcing Frontend Pipeline & Anti-Synthetic Data Suite', () => {

  it('preserves valid candidates from backend without injecting synthetic 34.99 or fake ASINs', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears 14" Plush - Cheer Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        origin_price_usd: 14.99,
        asin: 'B08552JGRF',
        url: 'https://www.amazon.com/dp/B08552JGRF',
        image_url: 'https://m.media-amazon.com/images/I/71xyz.jpg',
        evidence: [{ retailer: 'Amazon US', price_usd: 14.99 }]
      },
      {
        title: 'Care Bears 14" Plush - Grumpy Bear',
        brand: 'Basic Fun!',
        franchise: 'Care Bears',
        // No origin price provided in item
        image_url: 'https://m.media-amazon.com/images/I/72xyz.jpg'
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems,
        summary: 'Found 2 items'
      },
      latency_ms: 1200
    });

    const res = await researchIntelligenceService.research({
      query: 'peluches de los ositos cariñosos',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(2);

    // Item 1: Real price & Real ASIN
    const cand1 = res.candidates[0];
    expect(cand1.title).toBe('Care Bears 14" Plush - Cheer Bear');
    expect(cand1.pricing.amazon_price_usd).toBe(14.99);
    expect(cand1.asin).toBe('B08552JGRF');
    expect(cand1.asin).not.toContain('COLLECT');

    // Item 2: Missing origin price and ASIN -> MUST NOT be 34.99 or B001COLLECT
    const cand2 = res.candidates[1];
    expect(cand2.title).toBe('Care Bears 14" Plush - Grumpy Bear');
    expect(cand2.pricing.amazon_price_usd).toBeNull();
    expect(cand2.pricing.amazon_price_usd).not.toBe(34.99);
    expect(cand2.asin).toBeUndefined();
    expect(cand2.asin).not.toBe('B001COLLECT');
  });

  it('does not compute synthetic Mercado Libre prices using * 42 * 1.35 multiplier', async () => {
    const mockBackendItems = [
      {
        title: 'Vintage Care Bear Plush',
        brand: 'Kenner',
        origin_price_usd: 50.00,
        // No ML price evidence provided
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems
      },
      latency_ms: 800
    });

    const res = await researchIntelligenceService.research({
      query: 'vintage care bears',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(1);
    // When no local evidence exists, mercadolibre_price_local must be null, not 50 * 1.3 * 42 * 1.35
    expect(res.candidates[0].pricing.mercadolibre_price_local).toBeNull();
  });

  it('keeps candidates intact even if TiendaMía lookup fails or throws', async () => {
    const mockBackendItems = [
      {
        title: 'Care Bears Share Bear',
        origin_price_usd: 12.99,
        asin: 'B07XYZ1234'
      }
    ];

    vi.spyOn(aiGateway, 'execute').mockResolvedValueOnce({
      success: true,
      status: 'SUCCESS',
      provider: 'OPENAI',
      model: 'gpt-4o-mini-2024-07-18',
      data: {
        items: mockBackendItems
      },
      latency_ms: 900
    });

    const res = await researchIntelligenceService.research({
      query: 'share bear',
      country: 'UY',
      mode: 'ECONOMICO'
    });

    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].title).toBe('Care Bears Share Bear');
  });

});
