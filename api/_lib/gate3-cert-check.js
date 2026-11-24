// api/_lib/gate3-cert-check.js
// TEMPORARY Gate 3 Administrative Runtime Certification Handler.
// Hosted inside api/_lib/ to respect Vercel Hobby 12-function limit, dispatched
// exclusively from POST /api/gsc-monitor when header x-gate3-cert-token is present
// AND VERCEL_ENV === 'preview' AND VERCEL_GIT_COMMIT_REF === 'fix/p2-p3-p4-production-readiness'.
// MUST BE REMOVED immediately after completing the single certification request.

import crypto from 'node:crypto';
import {
  STAGING_SUPABASE_PROJECT_REF,
  createValidatedSupabaseClient,
  validateSupabaseConfig,
} from '../../server/lib/supabaseEnvGuard.js';

const AUTHORIZED_BRANCH = 'fix/p2-p3-p4-production-readiness';
const MIN_TOKEN_LENGTH = 24;

function timingSafeTokenEquals(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const providedHash = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

export function createGate3CertHandler({
  env = process.env,
  clientFactory = createValidatedSupabaseClient,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    // Never allow credentials in URL query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({ ok: false, error: 'QUERY_PARAMS_FORBIDDEN' });
    }

    // 1. Strict Preview runtime enforcement
    if (String(env.VERCEL_ENV || '').trim().toLowerCase() !== 'preview') {
      return res.status(403).json({ ok: false, error: 'ENV_NOT_PREVIEW' });
    }

    // 2. Strict branch enforcement
    if (String(env.VERCEL_GIT_COMMIT_REF || '').trim() !== AUTHORIZED_BRANCH) {
      return res.status(403).json({ ok: false, error: 'BRANCH_NOT_AUTHORIZED' });
    }

    // 3. Independent temporary token verification (fail-closed)
    const expectedToken = String(env.GATE3_CERT_TOKEN || '').trim();
    if (!expectedToken || expectedToken.length < MIN_TOKEN_LENGTH) {
      return res.status(503).json({ ok: false, error: 'CERT_TOKEN_NOT_CONFIGURED' });
    }

    const headers = req.headers || {};
    const providedToken = String(
      headers['x-gate3-cert-token'] ||
      headers['X-Gate3-Cert-Token'] ||
      ''
    ).trim();

    if (!providedToken || !timingSafeTokenEquals(providedToken, expectedToken)) {
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    // 4. Authoritative Supabase environment validation (Staging only, service_role required)
    let validated;
    try {
      validated = validateSupabaseConfig(env, { requireServiceRole: true });
      if (validated.projectRef !== STAGING_SUPABASE_PROJECT_REF) {
        return res.status(403).json({ ok: false, error: 'NON_STAGING_PROJECT_FORBIDDEN' });
      }
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err?.code || 'SUPABASE_ENV_GUARD_REJECTED',
        writes_performed: false,
      });
    }

    // 5. Read-only Supabase Auth Admin check (zero writes, zero user/PII returned)
    try {
      const adminClient = clientFactory(env, { requireServiceRole: true });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });

      if (error) {
        return res.status(502).json({
          ok: false,
          gate: 'GATE_3_ADMIN_CERT',
          environment: validated.environment,
          branch: AUTHORIZED_BRANCH,
          project_ref: validated.projectRef,
          service_role_configured: true,
          admin_auth_ok: false,
          error_type: error.name || 'AuthApiError',
          error_status: error.status || null,
          writes_performed: false,
          checked_at: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        ok: true,
        gate: 'GATE_3_ADMIN_CERT',
        environment: validated.environment,
        branch: AUTHORIZED_BRANCH,
        project_ref: validated.projectRef,
        supabase_url: validated.url,
        service_role_configured: true,
        admin_auth_ok: true,
        writes_performed: false,
        checked_at: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        gate: 'GATE_3_ADMIN_CERT',
        environment: validated.environment,
        project_ref: validated.projectRef,
        admin_auth_ok: false,
        error_type: err?.name || 'UnexpectedError',
        writes_performed: false,
        checked_at: new Date().toISOString(),
      });
    }
  };
}

export default createGate3CertHandler();
