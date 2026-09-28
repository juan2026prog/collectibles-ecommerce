import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGateway, executeAI } from '../services/ai/aiGateway';
import { NullAIProvider } from '../services/ai/providers/nullProvider';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('AI Gateway — Phase 1 Infrastructure Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NullAIProvider returns AI_DISABLED with zero external requests and $0 cost', async () => {
    const provider = new NullAIProvider();
    const res = await provider.execute('AI_SEARCH', 'search', { query: 'Batman' });

    expect(res.success).toBe(false);
    expect(res.status).toBe('AI_DISABLED');
    expect(res.provider).toBeNull();
    expect(provider.estimateCost(100, 100)).toBe(0);
    
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('AIGateway blocks execution when AI Global switch is OFF (Default)', async () => {
    // Mock system config: global_enabled = false
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: false,
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
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const res = await executeAI({
      engine: 'AI_SEARCH',
      operation: 'search',
      payload: { query: 'Iron Man' }
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('AI_DISABLED');
    expect(res.provider).toBeNull();
  });

  it('AIGateway executes safe fallback without throwing 500 when AI is disabled', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'ai_system_config') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    global_enabled: false,
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
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const fallbackMock = vi.fn().mockResolvedValue([{ id: 'prod-1', name: 'Funko Pop Batman' }]);

    const res = await executeAI({
      engine: 'AI_SEARCH',
      operation: 'search',
      payload: { query: 'Batman' },
      fallbackHandler: fallbackMock
    });

    expect(fallbackMock).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.status).toBe('FALLBACK');
    expect(res.fallback_executed).toBe(true);
    expect(res.data).toEqual([{ id: 'prod-1', name: 'Funko Pop Batman' }]);
  });

  it('AIGateway enforces Circuit Breaker protection when state is OPEN', async () => {
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
                    circuit_breaker_state: 'OPEN'
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
      engine: 'TREND_ANALYSIS',
      operation: 'trends'
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('CIRCUIT_OPEN');
  });
});

