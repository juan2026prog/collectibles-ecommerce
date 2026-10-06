import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCandidate } from '../../../shared/sourcingCandidateValidation.js';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, writes: [] as any[], admin: true, errors: new Set<string>() }));
vi.mock('../../../node_modules/@supabase/supabase-js/dist/index.mjs', () => ({ createClient: () => ({ from(table: string) {
  const query: any = { filters: [] as any[], select() { return this; }, limit() { return this; }, eq(field: string, value: any) { this.filters.push([field, value]); return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    insert(row: any) { state.writes.push({ table, row }); return Promise.resolve({ error: state.errors.has(table) ? { message: 'test query error' } : null }); },
    upsert(row: any) { return this.insert(row); }, update(row: any) { state.writes.push({ table, row }); return this; },
    then(resolve: any) { return Promise.resolve({ data: state.tables[table] || [], error: state.errors.has(table) ? { message: 'table unavailable' } : null }).then(resolve); }
  }; return query;
} }) }));
vi.mock('../../../server/lib/authGuard.js', () => ({ authenticateRequest: vi.fn(async () => ({ authenticated: true, isSuperAdmin: state.admin, isAdmin: true, isCron: false })) }));
vi.mock('../../../server/lib/sourcingGateway.js', () => ({ researchViaGateway: vi.fn() }));
vi.mock('../../../server/lib/sourcingSourceVerifier.js', () => ({ validateCandidateBatch: vi.fn(async (items: any[], context: any) => items.map(i => validateCandidate(i, context))) }));
import handler from '../../../api/sourcing-discovery.js';
import { researchViaGateway } from '../../../server/lib/sourcingGateway.js';
import { validateCandidateBatch } from '../../../server/lib/sourcingSourceVerifier.js';

const response = () => ({ statusCode: 0, payload: null as any, status(code: number) { this.statusCode = code; return this; }, json(payload: any) { this.payload = payload; return this; } });

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_mock_service_role_key';
  state.tables = {};
  state.writes = [];
  state.admin = true;
  state.errors.clear();
  vi.clearAllMocks();
});

describe('Automatic Discovery signal-led shared pipeline', () => {
  it('does not start paid research when run auditing cannot be persisted', async () => {
    state.errors.add('sourcing_discovery_runs');
    const res = response(); await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(502); expect(res.payload.error).toBe('run_persistence');
    expect(researchViaGateway).not.toHaveBeenCalled(); expect(res.payload.purchases_executed).toBe(0);
  });
  it('no real signals means no invented brand/query or paid research', async () => {
    state.tables.sourcing_watchlist = [{ name: 'Batman', priority: 'HIGH' }];
    const res = response(); await handler({ method: 'POST', headers: {}, body: { country: 'UY' } }, res);
    expect(researchViaGateway).not.toHaveBeenCalled(); expect(res.payload.candidates_generated).toBe(0);
    expect(res.payload.purchases_executed).toBe(0); expect(res.payload.auto_publications).toBe(0);
  });
  it('Radar/Release Calendar and retailers seed research; Watchlist never excludes other products', async () => {
    state.tables.release_events = [{ id: 'release1', title: 'Care Bears Cheer Bear 14 inch Plush', manufacturer: 'Basic Fun', source_url: 'https://www.basicfun.com/care-bears/' }];
    state.tables.sourcing_watchlist = [{ name: 'Batman', priority: 'HIGH' }];
    const canonical = validateCandidate({ title: 'Care Bears Grumpy Bear 14 inch Plush', url: 'https://www.basicfun.com/care-bears/' });
    vi.mocked(researchViaGateway).mockResolvedValue({ success: true, data: { canonical_candidates: [canonical] }, cached: true, sources: [] } as any);
    const res = response(); await handler({ method: 'POST', headers: {}, body: { country: 'UY' } }, res);
    expect(researchViaGateway).toHaveBeenCalledTimes(1);
    expect(vi.mocked(researchViaGateway).mock.calls[0][1].query).toContain('Care Bears Cheer Bear');
    expect(validateCandidateBatch).toHaveBeenCalled(); expect(res.payload.candidates_generated).toBe(2);
    const persisted = state.writes.filter(w => w.table === 'sourcing_discoveries');
    expect(persisted).toHaveLength(2);
    for (const { row } of persisted) {
      expect(row.discovered_from).toBe('DISCOVERED_OUTSIDE_WATCHLIST'); expect(row.evidence.canonical_candidate.validation_version).toBe(1);
      expect(row.margin_percent).toBeNull(); expect(row.confidence_score).toBeNull(); expect(row.opportunity_score).toBe(0);
    }
    expect(res.payload.source_health.release_calendar.message).toContain('comparten release_events');
  });
  it('unavailable collector is UNKNOWN and never claims CONNECTED_NO_DATA or local scarcity', async () => {
    state.errors.add('ml_raw_items');
    const res = response(); await handler({ method: 'POST', headers: {}, body: { country: 'UY' } }, res);
    expect(res.payload.source_health.mercadolibre_uy.status).toBe('UNKNOWN'); expect(res.payload.sources_failed).toContain('mercadolibre_uy');
    expect(res.payload.candidates_generated).toBe(0);
  });
  it('an ordinary admin cannot run SUPERADMIN discovery', async () => {
    state.admin = false; const res = response(); await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(403); expect(researchViaGateway).not.toHaveBeenCalled(); expect(state.writes).toHaveLength(0);
  });
  it('the endpoint reports persistence failures rather than claiming successful candidate creation', async () => {
    state.tables.release_events = [{ id: 'release1', title: 'Verified product', source_url: 'https://www.basicfun.com/product' }];
    vi.mocked(researchViaGateway).mockRejectedValue(new Error('gateway unavailable'));
    state.errors.add('sourcing_discoveries'); const res = response(); await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.payload.discoveries_created).toBe(0); expect(res.payload.sources_failed).toContain('candidate_persistence');
    expect(res.payload.status).toBe('PARTIAL_SUCCESS');
  });
  it('fails closed when SUPABASE_SERVICE_ROLE_KEY is missing without using anon fallback', async () => {
    const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = response();
      await handler({ method: 'POST', headers: {}, body: {} }, res);
      expect(res.statusCode).toBe(500);
      expect(res.payload.error).toBe('SERVER_CONFIGURATION_ERROR');
      expect(res.payload.status).toBe('FAILED');
      expect(state.writes).toHaveLength(0);
      expect(JSON.stringify(res.payload)).not.toContain('sb_publishable');
      expect(JSON.stringify(res.payload)).not.toContain('ey');
    } finally {
      if (originalServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    }
  });
  it('blocks non-superadmin request before any database persistence attempt', async () => {
    state.admin = false;
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('SUPERADMIN requerido');
    expect(state.writes).toHaveLength(0);
  });
  it('never exposes service role keys or tokens in response payloads', async () => {
    const testSecret = 'test_service_role_secret_abc123';
    process.env.SUPABASE_SERVICE_ROLE_KEY = testSecret;
    try {
      state.errors.add('sourcing_discovery_runs');
      const res = response();
      await handler({ method: 'POST', headers: {}, body: {} }, res);
      expect(res.statusCode).toBe(502);
      expect(JSON.stringify(res.payload)).not.toContain(testSecret);
    } finally {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});
