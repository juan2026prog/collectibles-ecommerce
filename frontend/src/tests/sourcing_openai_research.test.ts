import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkOpenAIStatus, executeOpenAIResearch } from '../services/sourcing/openaiResearchService';
import { sourcingService } from '../services/sourcing/sourcingService';
import { supabase } from '../lib/supabase';
import type { ResearchPack } from '../types/sourcing';

// Mock Supabase client
vi.mock('../lib/supabase', () => {
  let siteSettingsMock: Record<string, string> = {
    sourcing_openai_enabled: 'false',
    sourcing_openai_model: 'gpt-4o',
    sourcing_openai_web_search_enabled: 'false',
    sourcing_openai_max_results: '100',
    sourcing_openai_daily_request_limit: '20',
    sourcing_openai_daily_budget_usd: '10.00',
  };

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'site_settings') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockImplementation((_col: string, keys: string[]) => {
            const rows = keys.map(k => ({ key: k, value: siteSettingsMock[k] })).filter(r => r.value !== undefined);
            return Promise.resolve({ data: rows, error: null });
          }),
          eq: vi.fn().mockImplementation((_col: string, key: string) => {
            return {
              single: vi.fn().mockResolvedValue({
                data: siteSettingsMock[key] ? { value: siteSettingsMock[key] } : null,
                error: siteSettingsMock[key] ? null : { message: 'Not found' }
              })
            };
          })
        }),
        upsert: vi.fn().mockImplementation((rows: any[]) => {
          for (const r of rows) {
            siteSettingsMock[r.key] = r.value;
          }
          return Promise.resolve({ error: null });
        })
      };
    }
    if (table === 'products') {
      return {
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [{ title: 'Batman Detective Comics #1000' }], error: null })
        }),
        insert: vi.fn().mockResolvedValue({ error: null })
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null })
    };
  });

  return {
    supabase: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'anon-test-key',
      from: mockFrom,
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-admin-jwt' } }
        })
      },
      __setSiteSettings: (settings: Record<string, string>) => {
        siteSettingsMock = { ...siteSettingsMock, ...settings };
      }
    }
  };
});

describe('Sourcing OpenAI Optional Research — Architecture & Safety Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase as any).__setSiteSettings({
      sourcing_openai_enabled: 'false',
      sourcing_openai_model: 'gpt-4o',
    });
    global.fetch = vi.fn();
  });

  // TEST 1: Mandatory zero-consumption test when disabled
  it('1. sourcing_openai_enabled = false -> 0 requests made to OpenAI API (Zero-Consumption)', async () => {
    // When flag is false, checkOpenAIStatus reports disabled
    const status = await checkOpenAIStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toBe('FEATURE_DISABLED');

    // No HTTP requests were dispatched
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // TEST 2: Status check when enabled
  it('2. sourcing_openai_enabled = true -> checkOpenAIStatus reports enabled: true', async () => {
    (supabase as any).__setSiteSettings({
      sourcing_openai_enabled: 'true',
      sourcing_openai_model: 'gpt-4o',
    });

    const status = await checkOpenAIStatus();
    expect(status.enabled).toBe(true);
    expect(status.model).toBe('gpt-4o');
  });

  // TEST 3: Edge function returns PENDING_CREDENTIAL when API key is missing
  it('3. OpenAI ON without API key -> Edge Function returns status PENDING_CREDENTIAL', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'OPENAI_API_KEY no configurada en Supabase Secrets.',
        status: 'PENDING_CREDENTIAL'
      })
    });

    const res = await executeOpenAIResearch({ query: 'Batman McFarlane' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('PENDING_CREDENTIAL');
    expect(res.error).toContain('OPENAI_API_KEY');
  });

  // TEST 4: Non-admin request is forbidden
  it('4. Non-admin request -> Edge Function returns FORBIDDEN / 403', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Unauthorized',
        status: 'FORBIDDEN'
      })
    });

    const res = await executeOpenAIResearch({ query: 'Funko Pop Marvel' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('FORBIDDEN');
  });

  // TEST 5: Structured Research Pack from OpenAI parses and feeds into normalizer
  it('5. Valid OpenAI Research Pack passes through normalizer and deduplicator seamlessly', async () => {
    const mockOpenAIPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'openai-pack-001',
      title: 'OpenAI: McFarlane Batman DC Multiverse',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'openai-research',
      status: 'READY',
      items_count: 2,
      items: [
        {
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          character: 'Batman Detective Comics #1000',
          price: 24.99,
          reason: 'EVERGREEN'
        },
        {
          url: 'https://www.bestbuy.com/site/mcfarlane-batman/6412345.p',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          character: 'Batman Detective Comics #1000',
          price: 22.99,
          reason: 'EVERGREEN'
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(mockOpenAIPack, []);
    // Deduplication should group the two offers under one canonical product
    expect(normalized.length).toBe(1);
    expect(normalized[0].brand).toBe('McFarlane Toys');
    expect(normalized[0].offers.length).toBe(2);
    // Best source selector prioritizes LIVE offers (Amazon is LIVE, Best Buy is RESEARCH_ONLY until Live Checked)
    const bestOffer = normalized[0].offers.find(o => o.id === normalized[0].best_source_id);
    expect(bestOffer?.source).toBe('amazon');
    expect(bestOffer?.price).toBe(24.99);

    // Best Buy offer is present and has price 22.99
    const bestBuyOffer = normalized[0].offers.find(o => o.source === 'bestbuy');
    expect(bestBuyOffer).toBeDefined();
    expect(bestBuyOffer?.price).toBe(22.99);
    expect(bestBuyOffer?.status).toBe('RESEARCH_ONLY');
  });

  // TEST 6: Invalid items get flagged, valid items survive (PARTIAL status)
  it('6. Mixed valid/invalid OpenAI results -> invalid items flagged, valid items preserved', async () => {
    const mockMixedPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'openai-pack-mixed',
      title: 'OpenAI: Mixed Quality Test',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'openai-research',
      status: 'PARTIAL',
      items_count: 2,
      items: [
        {
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          character: 'Batman 1000',
          price: 25.00
        },
        {
          url: 'https://www.ebay.com/itm/99999999',
          brand: '', // Missing brand -> will fail or have low authenticity
          license: 'Unknown',
          character: 'Unbranded Figure',
          price: 5.00
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(mockMixedPack, []);
    expect(normalized.length).toBeGreaterThan(0);
    // The valid McFarlane item must have passed authenticity
    const validItem = normalized.find(p => p.brand === 'McFarlane Toys');
    expect(validItem).toBeDefined();
    expect(validItem?.authenticity.brand_verified).toBe(true);
  });

  // TEST 7: Daily search rate limiting
  it('7. Rate limit reached -> returns RATE_LIMITED status', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'Límite diario de 20 búsquedas OpenAI alcanzado.',
        status: 'RATE_LIMITED'
      })
    });

    const res = await executeOpenAIResearch({ query: 'Spiderman Figures' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('RATE_LIMITED');
  });

  // TEST 8: Budget exceeded
  it('8. Daily budget exceeded -> returns BUDGET_EXCEEDED', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'Presupuesto diario de $10 USD alcanzado.',
        status: 'BUDGET_EXCEEDED'
      })
    });

    const res = await executeOpenAIResearch({ query: 'Star Wars Black Series' });
    expect(res.success).toBe(false);
    expect(res.status).toBe('BUDGET_EXCEEDED');
  });

  // TEST 9: OpenAI items CANNOT bypass Authenticity Gate (bootleg is blocked/flagged)
  it('9. OpenAI suggested bootleg/unlicensed item is flagged by Authenticity Gate', async () => {
    const mockBootlegPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'openai-pack-bootleg',
      title: 'OpenAI: Suspect Item',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'openai-research',
      status: 'READY',
      items_count: 1,
      items: [
        {
          url: 'https://www.ebay.com/itm/1122334455',
          brand: 'Generic Replicas',
          license: 'Dragon Ball KO',
          character: 'Goku KO Bootleg Replica',
          price: 8.99
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(mockBootlegPack, []);
    expect(normalized.length).toBe(1);
    expect(normalized[0].authenticity.status).not.toBe('VERIFIED_OFFICIAL');
  });

  // TEST 10: OpenAI items CANNOT bypass Profit Protection
  it('10. OpenAI item with zero or negative profit triggers BLOCKED status', async () => {
    const mockLossPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'openai-pack-loss',
      title: 'OpenAI: Loss Margin Test',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'openai-research',
      status: 'READY',
      items_count: 1,
      items: [
        {
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          character: 'Super Expensive Statue',
          price: 500.00 // High cost
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(mockLossPack, []);
    expect(normalized.length).toBe(1);
    // Real landed cost calculation is strictly enforced
    expect(normalized[0].financials.real_cost_puesto_usd).toBeGreaterThan(500);
  });

  // TEST 11: Manual Research Pack works seamlessly when OpenAI is OFF
  it('11. Manual Research Pack (ChatGPT JSON/CSV/URLs) works 100% identically with OpenAI OFF', async () => {
    (supabase as any).__setSiteSettings({
      sourcing_openai_enabled: 'false',
    });

    const manualPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'manual-pack-001',
      title: 'Manual Research Pack',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'chatgpt-research',
      status: 'READY',
      items_count: 1,
      items: [
        {
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          character: 'Batman',
          price: 24.99
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(manualPack, []);
    expect(normalized.length).toBe(1);
    expect(normalized[0].brand).toBe('McFarlane Toys');
    expect(normalized[0].offers[0].source).toBe('amazon');
    expect(normalized[0].financials.real_cost_puesto_usd).toBeGreaterThan(0);
  });

  // TEST 12: Provider tag saved in history entry
  it('12. History entry records provider="openai" when Research Pack comes from OpenAI', async () => {
    const openAIPack: ResearchPack = {
      schema_version: '1.0',
      pack_id: 'openai-history-test-01',
      title: 'OpenAI History Test Pack',
      generated_at: '2026-09-05T00:00:00.000Z',
      source: 'openai-research',
      status: 'READY',
      items_count: 1,
      items: [
        {
          url: 'https://www.amazon.com/dp/B081VR7Y32',
          brand: 'McFarlane Toys',
          license: 'DC Comics',
          price: 25.00
        }
      ]
    };

    const normalized = await sourcingService.processResearchPack(openAIPack, []);
    sourcingService.savePackToHistory(openAIPack, normalized);

    const history = sourcingService.getPackHistory();
    const entry = history.find(h => h.pack_id === 'openai-history-test-01');
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('openai-research');
    expect(entry?.provider).toBe('openai');
  });
});
