// server/lib/supabaseEnvGuard.js
// Gate 3 — Authoritative fail-closed Supabase environment isolation guard.
// Prevents Preview, Development, and Test runtimes from ever connecting to
// Production Supabase (cobtsgkwcftvexaarwmo), and prevents Production from ever
// connecting to Staging (csnudufkpfzveoonjumy).

import { createClient } from '@supabase/supabase-js';

export const PROD_SUPABASE_PROJECT_REF = 'cobtsgkwcftvexaarwmo';
export const STAGING_SUPABASE_PROJECT_REF = 'csnudufkpfzveoonjumy';

export class SupabaseEnvGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SupabaseEnvGuardError';
    this.code = code;
  }
}

/**
 * Resolves the effective deployment environment without relying solely on NODE_ENV
 * (since Vercel Preview builds execute with NODE_ENV=production).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {'production' | 'preview' | 'development' | 'test'}
 */
export function resolveRuntimeEnvironment(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';

  if (env.VITEST || String(env.NODE_ENV || '').toLowerCase() === 'test') {
    return 'test';
  }

  const branch = String(env.VERCEL_GIT_COMMIT_REF || env.GIT_BRANCH || '').trim();
  if (branch && branch !== 'main') {
    return 'preview';
  }

  return 'development';
}

function normalizeSupabaseUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function extractProjectRef(normalizedUrl) {
  try {
    const host = new URL(normalizedUrl).hostname.toLowerCase();
    if (host.includes(PROD_SUPABASE_PROJECT_REF)) return PROD_SUPABASE_PROJECT_REF;
    if (host.includes(STAGING_SUPABASE_PROJECT_REF)) return STAGING_SUPABASE_PROJECT_REF;
    return host;
  } catch {
    return null;
  }
}

/**
 * Strictly validates Supabase URL(s) and credentials for the active environment.
 * Fail-closed: throws SupabaseEnvGuardError with safe, secret-free diagnostics.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ requireServiceRole?: boolean, allowLocalhostInDev?: boolean }} options
 * @returns {{ url: string, key: string, environment: string, projectRef: string, isPrivileged: boolean }}
 */
export function validateSupabaseConfig(env = process.env, options = {}) {
  const { requireServiceRole = false, allowLocalhostInDev = true } = options;
  const environment = resolveRuntimeEnvironment(env);

  const urlCandidates = [
    { name: 'SUPABASE_URL', raw: env.SUPABASE_URL },
    { name: 'VITE_SUPABASE_URL', raw: env.VITE_SUPABASE_URL },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', raw: env.NEXT_PUBLIC_SUPABASE_URL },
  ].filter(c => c.raw !== undefined && String(c.raw).trim() !== '');

  if (urlCandidates.length === 0) {
    throw new SupabaseEnvGuardError(
      'SUPABASE_URL_MISSING',
      `[SupabaseEnvGuard] Missing Supabase URL in ${environment} environment.`
    );
  }

  const resolvedCandidates = urlCandidates.map(c => {
    const normalized = normalizeSupabaseUrl(c.raw);
    if (!normalized) {
      throw new SupabaseEnvGuardError(
        'SUPABASE_URL_INVALID',
        `[SupabaseEnvGuard] Invalid Supabase URL format in ${c.name}.`
      );
    }
    return { ...c, normalized, ref: extractProjectRef(normalized) };
  });

  // Check ALL configured URLs so an alternative variable cannot silently point to another project
  const uniqueRefs = new Set(resolvedCandidates.map(c => c.ref));
  if (uniqueRefs.size > 1) {
    throw new SupabaseEnvGuardError(
      'SUPABASE_URL_CONFLICT',
      `[SupabaseEnvGuard] Conflicting Supabase URLs configured across environment variables in ${environment}.`
    );
  }

  const primary = resolvedCandidates[0];
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(primary.normalized);

  if (environment === 'production') {
    if (primary.ref === STAGING_SUPABASE_PROJECT_REF) {
      throw new SupabaseEnvGuardError(
        'STAGING_URL_FORBIDDEN_IN_PROD',
        '[SupabaseEnvGuard] Staging Supabase URL is strictly forbidden in Production.'
      );
    }
    if (primary.ref !== PROD_SUPABASE_PROJECT_REF) {
      throw new SupabaseEnvGuardError(
        'PROD_URL_REQUIRED_IN_PROD',
        '[SupabaseEnvGuard] Production runtime requires the authorized Production Supabase URL.'
      );
    }
  } else {
    // preview, development, test
    if (primary.ref === PROD_SUPABASE_PROJECT_REF) {
      throw new SupabaseEnvGuardError(
        'PROD_URL_FORBIDDEN_IN_NON_PROD',
        `[SupabaseEnvGuard] Production Supabase URL is strictly forbidden in ${environment} environment.`
      );
    }
    const isAllowedStaging = primary.ref === STAGING_SUPABASE_PROJECT_REF;
    const isAllowedLocal = allowLocalhostInDev && (environment === 'development' || environment === 'test') && isLocalhost;
    if (!isAllowedStaging && !isAllowedLocal) {
      throw new SupabaseEnvGuardError(
        'UNRECOGNIZED_NON_PROD_URL',
        `[SupabaseEnvGuard] ${environment} runtime requires the authorized Staging Supabase URL.`
      );
    }
  }

  if (requireServiceRole) {
    const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!serviceKey || serviceKey.startsWith('sb_publishable_')) {
      throw new SupabaseEnvGuardError(
        'SUPABASE_SERVICE_ROLE_KEY_MISSING',
        `[SupabaseEnvGuard] Required privileged Supabase credential missing in ${environment}.`
      );
    }
    return {
      url: primary.normalized,
      key: serviceKey,
      environment,
      projectRef: primary.ref,
      isPrivileged: true,
    };
  }

  // Public / anon read path: NEVER fall back to SUPABASE_SERVICE_ROLE_KEY
  const anonKey = String(
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!anonKey) {
    throw new SupabaseEnvGuardError(
      'SUPABASE_ANON_KEY_MISSING',
      `[SupabaseEnvGuard] Missing public Supabase anon key in ${environment}.`
    );
  }

  return {
    url: primary.normalized,
    key: anonKey,
    environment,
    projectRef: primary.ref,
    isPrivileged: false,
  };
}

/**
 * Creates a fail-closed, environment-validated Supabase client.
 */
export function createValidatedSupabaseClient(env = process.env, options = {}) {
  const { requireServiceRole = false, allowLocalhostInDev = true, clientOptions = {} } = options;
  const validated = validateSupabaseConfig(env, { requireServiceRole, allowLocalhostInDev });
  return createClient(validated.url, validated.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...clientOptions,
  });
}
