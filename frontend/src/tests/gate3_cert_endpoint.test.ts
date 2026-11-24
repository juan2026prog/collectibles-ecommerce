// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createGate3CertHandler } from '../../../api/_lib/gate3-cert-check.js';

const VALID_TOKEN = 'gate3_temp_cert_token_9f8e7d6c5b4a3210_do_not_reuse';
const STAGING_URL = 'https://csnudufkpfzveoonjumy.supabase.co';
const PROD_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const FAKE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_staging_service_role_key';

function mockRes() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

describe('Temporary Gate 3 Admin Certification Endpoint (Local Mock Verification)', () => {
  const baseEnv = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'fix/p2-p3-p4-production-readiness',
    GATE3_CERT_TOKEN: VALID_TOKEN,
    SUPABASE_URL: STAGING_URL,
    VITE_SUPABASE_URL: STAGING_URL,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
  };

  it('1. rejects non-POST methods (405) and any query params (400)', async () => {
    const handler = createGate3CertHandler({ env: baseEnv });

    const resGet = mockRes();
    await handler({ method: 'GET', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, resGet);
    expect(resGet.statusCode).toBe(405);

    const resQuery = mockRes();
    await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: { token: 'x' } }, resQuery);
    expect(resQuery.statusCode).toBe(400);
    expect(resQuery.body.error).toBe('QUERY_PARAMS_FORBIDDEN');
  });

  it('2. rejects Production and Development runtimes (403 ENV_NOT_PREVIEW)', async () => {
    for (const envName of ['production', 'development', '']) {
      const handler = createGate3CertHandler({ env: { ...baseEnv, VERCEL_ENV: envName } });
      const res = mockRes();
      await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, res);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('ENV_NOT_PREVIEW');
    }
  });

  it('3. rejects unauthorized git branches (403 BRANCH_NOT_AUTHORIZED)', async () => {
    const handler = createGate3CertHandler({ env: { ...baseEnv, VERCEL_GIT_COMMIT_REF: 'main' } });
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('BRANCH_NOT_AUTHORIZED');
  });

  it('4. rejects missing/short configured token (503) and invalid header token (401)', async () => {
    const hNoToken = createGate3CertHandler({ env: { ...baseEnv, GATE3_CERT_TOKEN: '' } });
    const rNoToken = mockRes();
    await hNoToken({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, rNoToken);
    expect(rNoToken.statusCode).toBe(503);

    const hBad = createGate3CertHandler({ env: baseEnv });
    const rBad = mockRes();
    await hBad({ method: 'POST', headers: { 'x-gate3-cert-token': 'wrong_token_value' }, query: {} }, rBad);
    expect(rBad.statusCode).toBe(401);
    expect(rBad.body.error).toBe('UNAUTHORIZED');
  });

  it('5. rejects Production Supabase URL in Preview via supabaseEnvGuard (500 PROD_URL_FORBIDDEN_IN_NON_PROD)', async () => {
    const listUsers = vi.fn();
    const handler = createGate3CertHandler({
      env: { ...baseEnv, SUPABASE_URL: PROD_URL, VITE_SUPABASE_URL: PROD_URL },
      clientFactory: () => ({ auth: { admin: { listUsers } } } as any),
    });
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('PROD_URL_FORBIDDEN_IN_NON_PROD');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('6. executes strictly read-only auth.admin.listUsers({ page: 1, perPage: 1 }) and returns ZERO PII/secrets', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [{ id: 'secret-user-id', email: 'private@example.com' }] },
      error: null,
    });
    const handler = createGate3CertHandler({
      env: baseEnv,
      clientFactory: () => ({ auth: { admin: { listUsers } } } as any),
    });

    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1 });
    expect(res.body).toMatchObject({
      ok: true,
      gate: 'GATE_3_ADMIN_CERT',
      environment: 'preview',
      branch: 'fix/p2-p3-p4-production-readiness',
      project_ref: 'csnudufkpfzveoonjumy',
      supabase_url: STAGING_URL,
      service_role_configured: true,
      admin_auth_ok: true,
      writes_performed: false,
    });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('secret-user-id');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain(VALID_TOKEN);
    expect(serialized).not.toContain(FAKE_SERVICE_KEY);
  });

  it('7. reports 502 with error_type/status when Supabase Admin rejects credential (401/403)', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: { users: [] },
      error: { name: 'AuthApiError', status: 401, message: 'Invalid API key' },
    });
    const handler = createGate3CertHandler({
      env: baseEnv,
      clientFactory: () => ({ auth: { admin: { listUsers } } } as any),
    });

    const res = mockRes();
    await handler({ method: 'POST', headers: { 'x-gate3-cert-token': VALID_TOKEN }, query: {} }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.admin_auth_ok).toBe(false);
    expect(res.body.error_status).toBe(401);
    expect(res.body.writes_performed).toBe(false);
  });
});
