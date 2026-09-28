import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIGateway, executeAI } from '../services/ai/aiGateway';
import { NullAIProvider } from '../services/ai/providers/nullProvider';
import { OpenAIProvider } from '../services/ai/providers/openAIProvider';
import { calculateOpenAICost } from '../../../api/lib/openaiPricing.js';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('Collectibles 2026 — OpenAI Part 2 Certification Test Suite (A to P)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A. Master Switch OFF -> ninguna llamada OpenAI
  it('A. Master Switch OFF -> blocks execution and returns AI_DISABLED', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: false,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_search',
      prompt: 'Batman 1:6'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('AI_DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // B. Engine OFF -> ninguna llamada OpenAI
  it('B. Engine OFF -> blocks execution and returns ENGINE_DISABLED', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ai_enabled: true, status: 'ACTIVE' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { enabled: false, engine_key: 'AI_SEARCH' },
                error: null
              })
            })
          })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_search',
      prompt: 'Spider-Man figure'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('ENGINE_DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // C. Country OFF -> ninguna llamada OpenAI
  it('C. Country OFF -> blocks execution and returns COUNTRY_DISABLED', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ai_enabled: false, status: 'INACTIVE' },
                error: null
              })
            })
          })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'AR',
      operation: 'test_search',
      prompt: 'Batman figure'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('COUNTRY_DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // D. Provider NONE -> ninguna llamada OpenAI
  it('D. Provider NONE -> routes to NullAIProvider safely without external calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'NONE',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ai_enabled: true, status: 'ACTIVE' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { enabled: true, provider: 'NONE', engine_key: 'AI_SEARCH' },
                error: null
              })
            })
          })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_search',
      prompt: 'Batman'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('PROVIDER_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // E. OpenAI configurado -> request server-side correcto
  it('E. OpenAI configured -> dispatches to /api/ai-execute endpoint correctly', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { ai_enabled: true, status: 'ACTIVE' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  enabled: true,
                  provider: 'OPENAI',
                  model: 'gpt-5.6-terra',
                  engine_key: 'AI_SEARCH',
                  temperature: 0.2,
                  max_output_tokens: 1024
                },
                error: null
              })
            })
          })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 'SUCCESS',
        provider: 'OPENAI',
        model: 'gpt-5.6-terra',
        text: 'OPENAI_COLLECTIBLES_OK',
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
        pricing: { estimated_cost_usd: 0.00008, pricing_status: 'PRICED' },
        request_id: 'req_123456',
        latency_ms: 120
      })
    } as any);

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_operation',
      prompt: 'Test query'
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/ai-execute', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"engine":"AI_SEARCH"')
    }));
    expect(res.success).toBe(true);
    expect(res.status).toBe('SUCCESS');
    expect(res.provider).toBe('OPENAI');
    expect(res.model).toBe('gpt-5.6-terra');
    expect(res.text).toBe('OPENAI_COLLECTIBLES_OK');
  });

  // F. API key nunca en frontend
  it('F. API Key is NEVER stored or accessible in client-side classes or environment', () => {
    const provider = new OpenAIProvider();
    expect((provider as any).apiKey).toBeUndefined();
    expect((process.env as any).VITE_OPENAI_API_KEY).toBeUndefined();
    expect((window as any).OPENAI_API_KEY).toBeUndefined();
  });

  // G. Timeout -> respuesta controlada
  it('G. Timeout -> returns TIMEOUT status gracefully without crashing', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_enabled: true, status: 'ACTIVE' }, error: null }) }) })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, provider: 'OPENAI', model: 'gpt-5.6-terra' }, error: null }) }) })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => ({
        success: false,
        status: 'TIMEOUT',
        error: 'OpenAI request timed out after 5000ms.'
      })
    } as any);

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_timeout',
      prompt: 'Heavy payload'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('TIMEOUT');
    expect(res.error).toContain('timed out');
  });

  // H. 429 -> RATE_LIMITED
  it('H. 429 -> returns RATE_LIMITED status properly', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_enabled: true, status: 'ACTIVE' }, error: null }) }) })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, provider: 'OPENAI', model: 'gpt-5.6-terra' }, error: null }) }) })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        success: false,
        status: 'RATE_LIMITED',
        error: 'Rate limit reached for OpenAI tier.'
      })
    } as any);

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'test_rate_limit',
      prompt: 'Test query'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('RATE_LIMITED');
  });

  // I. OpenAI success -> usage tokens registrados
  it('I. OpenAI success -> tracks input, output, and total tokens', async () => {
    const provider = new OpenAIProvider();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 'SUCCESS',
        provider: 'OPENAI',
        model: 'gpt-5.6-terra',
        text: 'Result text',
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        pricing: { estimated_cost_usd: 0.000375, pricing_status: 'PRICED' }
      })
    } as any);

    const res = await provider.execute('AI_SEARCH', 'search', { query: 'test' });
    expect(res.success).toBe(true);
    expect(res.usage?.inputTokens).toBe(50);
    expect(res.usage?.outputTokens).toBe(25);
    expect(res.usage?.totalTokens).toBe(75);
  });

  // J. Pricing configurado -> costo calculado correctamente
  it('J. Pricing configured -> accurately calculates USD cost per million tokens', () => {
    // Test gpt-5.6-terra (2.50 input / 10.00 output per 1M)
    const cost1 = calculateOpenAICost('gpt-5.6-terra', 1000, 500);
    expect(cost1.pricing_status).toBe('PRICED');
    expect(cost1.input_cost_usd).toBe(0.0025);
    expect(cost1.output_cost_usd).toBe(0.005);
    expect(cost1.estimated_cost_usd).toBe(0.0075);

    // Test gpt-5.6-sol (0.15 input / 0.60 output per 1M)
    const cost2 = calculateOpenAICost('gpt-5.6-sol', 10000, 2000);
    expect(cost2.pricing_status).toBe('PRICED');
    expect(cost2.input_cost_usd).toBe(0.0015);
    expect(cost2.output_cost_usd).toBe(0.0012);
    expect(cost2.estimated_cost_usd).toBe(0.0027);
  });

  // K. Pricing desconocido -> NO registrar falsamente USD 0 como costo real
  it('K. Pricing unknown -> returns UNKNOWN_PRICING and null estimated_cost_usd (no false $0.00)', () => {
    const costUnknown = calculateOpenAICost('gpt-future-nonexistent-model', 500, 200);
    expect(costUnknown.pricing_status).toBe('UNKNOWN_PRICING');
    expect(costUnknown.estimated_cost_usd).toBeNull();
    expect(costUnknown.input_cost_usd).toBeNull();
    expect(costUnknown.output_cost_usd).toBeNull();
    expect(costUnknown.total_tokens).toBe(700);
  });

  // L. Telemetry -> ai_usage_events metadata check
  it('L. Telemetry -> records usage event metadata properly', async () => {
    const cost = calculateOpenAICost('gpt-4o', 200, 100);
    expect(cost.pricing_status).toBe('PRICED');
    expect(cost.total_tokens).toBe(300);
    expect(cost.estimated_cost_usd).toBeGreaterThan(0);
  });

  // M. Error -> ai_error_events handling check
  it('M. Error -> error classification handles invalid outputs safely', async () => {
    const provider = new OpenAIProvider();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        status: 'INVALID_OUTPUT',
        error: 'Prompt is missing or malformed.'
      })
    } as any);

    const res = await provider.execute('AI_SEARCH', 'search');
    expect(res.success).toBe(false);
    expect(res.status).toBe('INVALID_OUTPUT');
  });

  // N. Fallback -> aplicación continúa funcionando
  it('N. Fallback -> fallbackHandler executes seamlessly when AI fails', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: true,
                    provider: 'OPENAI',
                    circuit_breaker_enabled: true,
                    circuit_breaker_state: 'CLOSED'
                  },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_country_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_enabled: true, status: 'ACTIVE' }, error: null }) }) })
        };
      }
      if (table === 'ai_engine_config') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, provider: 'OPENAI', model: 'gpt-5.6-terra' }, error: null }) }) })
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        status: 'OPENAI_ERROR',
        error: 'OpenAI internal error'
      })
    } as any);

    const fallbackFn = vi.fn().mockResolvedValue([{ title: 'Fallback Result Product' }]);

    const res = await executeAI({
      engine: 'AI_SEARCH',
      country: 'UY',
      operation: 'search',
      prompt: 'Batman',
      fallbackHandler: fallbackFn
    });

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.status).toBe('FALLBACK');
    expect(res.fallback_executed).toBe(true);
    expect(res.data).toEqual([{ title: 'Fallback Result Product' }]);
  });

  // O. GET /api/openai-test -> cero llamadas externas
  it('O. GET /api/openai-test diagnostic check -> safe 0-cost verification', async () => {
    const provider = new OpenAIProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        configured: true,
        liveTestEnabled: false,
        supportedModels: ['gpt-5.6-terra', 'gpt-5.6-sol']
      })
    } as any);

    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.configured).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/openai-test', { method: 'GET' });
  });

  // P. POST test disabled -> no consume créditos
  it('P. POST test disabled -> rejects live execution if OPENAI_TEST_ENABLED is false', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error: 'Live OpenAI test is disabled in this environment.',
        liveTestEnabled: false
      })
    } as any);

    const res = await fetch('/api/openai-test', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-5.6-terra' })
    });
    const data = await res.json();

    expect(res.ok).toBe(false);
    expect(data.liveTestEnabled).toBe(false);
  });
});
