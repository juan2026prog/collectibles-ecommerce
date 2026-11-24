import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROD_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  SupabaseEnvGuardError,
  resolveRuntimeEnvironment,
  validateSupabaseConfig,
} from '../../../server/lib/supabaseEnvGuard.js';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PROD_URL = `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
const FAKE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_service_role_key_do_not_use';
const FAKE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_anon_key_do_not_use';

describe('GATE 3 — Aislamiento Definitivo de Staging y Producción (10 Pruebas Obligatorias)', () => {
  it('1. Preview + URL Staging: PERMITIDO (incluso cuando NODE_ENV=production)', () => {
    const env = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      VITE_SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(resolveRuntimeEnvironment(env)).toBe('preview');
    const cfg = validateSupabaseConfig(env, { requireServiceRole: true });
    expect(cfg.url).toBe(STAGING_URL);
    expect(cfg.projectRef).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(cfg.environment).toBe('preview');
    expect(cfg.isPrivileged).toBe(true);
  });

  it('2. Preview + URL Producción: RECHAZADO (PROD_URL_FORBIDDEN_IN_NON_PROD)', () => {
    const env = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(env, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);
    try {
      validateSupabaseConfig(env, { requireServiceRole: true });
    } catch (err: any) {
      expect(err.code).toBe('PROD_URL_FORBIDDEN_IN_NON_PROD');
      expect(err.message).not.toContain(FAKE_SERVICE_KEY);
    }
  });

  it('3. Preview + URL faltante: RECHAZADO fail-closed (SUPABASE_URL_MISSING)', () => {
    const env = {
      VERCEL_ENV: 'preview',
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(env, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);
    try {
      validateSupabaseConfig(env, { requireServiceRole: true });
    } catch (err: any) {
      expect(err.code).toBe('SUPABASE_URL_MISSING');
    }
  });

  it('4. Development + URL Producción: RECHAZADO (PROD_URL_FORBIDDEN_IN_NON_PROD)', () => {
    const env = {
      VERCEL_ENV: 'development',
      VITE_SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
    };
    expect(() => validateSupabaseConfig(env, { requireServiceRole: false })).toThrow(SupabaseEnvGuardError);
    try {
      validateSupabaseConfig(env, { requireServiceRole: false });
    } catch (err: any) {
      expect(err.code).toBe('PROD_URL_FORBIDDEN_IN_NON_PROD');
    }
  });

  it('5. Production + URL Producción: PERMITIDO', () => {
    const env = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(resolveRuntimeEnvironment(env)).toBe('production');
    const cfg = validateSupabaseConfig(env, { requireServiceRole: true });
    expect(cfg.url).toBe(PROD_URL);
    expect(cfg.projectRef).toBe(PROD_SUPABASE_PROJECT_REF);
    expect(cfg.environment).toBe('production');
  });

  it('6. Production + URL Staging: RECHAZADO (STAGING_URL_FORBIDDEN_IN_PROD)', () => {
    const env = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(env, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);
    try {
      validateSupabaseConfig(env, { requireServiceRole: true });
    } catch (err: any) {
      expect(err.code).toBe('STAGING_URL_FORBIDDEN_IN_PROD');
    }
  });

  it('7. Credenciales faltantes o degradación service_role -> anon: RECHAZO SEGURO sin exponer secretos', () => {
    // Privileged operation without service_role MUST fail even if ANON_KEY exists
    const envNoService = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      SUPABASE_ANON_KEY: FAKE_ANON_KEY,
    };
    expect(() => validateSupabaseConfig(envNoService, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);

    // Publishable key cannot impersonate service_role
    const envPublishable = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_fake_key',
    };
    expect(() => validateSupabaseConfig(envPublishable, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);

    // Public read without anon key MUST NOT fall back to SUPABASE_SERVICE_ROLE_KEY
    const envOnlyService = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(envOnlyService, { requireServiceRole: false })).toThrow(SupabaseEnvGuardError);
  });

  it('8. Configuración alternativa que intenta volver a Producción (URL conflict): RECHAZADA', () => {
    const envConflict = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      VITE_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(envConflict, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);
    try {
      validateSupabaseConfig(envConflict, { requireServiceRole: true });
    } catch (err: any) {
      expect(err.code).toBe('SUPABASE_URL_CONFLICT');
    }

    const envNextPublicConflict = {
      VERCEL_ENV: 'preview',
      SUPABASE_URL: STAGING_URL,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
    };
    expect(() => validateSupabaseConfig(envNextPublicConflict, { requireServiceRole: true })).toThrow(SupabaseEnvGuardError);
  });

  it('9. Ninguna clave administrativa ni URL de Producción hardcodeada en llamadas de admin cliente', () => {
    const adminOrders = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/pages/admin/AdminOrders.tsx'), 'utf8');
    const adminRefunds = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/pages/admin/AdminRefunds.tsx'), 'utf8');
    const supabaseClient = fs.readFileSync(path.join(REPO_ROOT, 'frontend/src/lib/supabase.ts'), 'utf8');

    expect(adminOrders).not.toContain(PROD_SUPABASE_PROJECT_REF);
    expect(adminRefunds).not.toContain(PROD_SUPABASE_PROJECT_REF);
    expect(supabaseClient).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(adminOrders).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('10. Todas las funciones de servidor auditadas usan supabaseEnvGuard y no contienen fallback a Producción', () => {
    const guardedServerFiles = [
      'api/ai-execute.js',
      'api/ai-estimate.js',
      'api/currency-sync.js',
      'api/sourcing-discovery.js',
      'api/support-chat.js',
      'api/_lib/public-supabase.js',
      'server/lib/authGuard.js',
      'server/lib/radarNewsRefresh.js',
    ];

    for (const rel of guardedServerFiles) {
      const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(content, `${rel} must import supabaseEnvGuard`).toContain('supabaseEnvGuard.js');
      expect(content, `${rel} must not contain hardcoded Prod project ref`).not.toContain(PROD_SUPABASE_PROJECT_REF);
    }

    const merchantFeed = fs.readFileSync(path.join(REPO_ROOT, 'api/merchant-feed.js'), 'utf8');
    expect(merchantFeed).not.toContain("VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co'");
    expect(merchantFeed).not.toContain('process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY');
  });
});
