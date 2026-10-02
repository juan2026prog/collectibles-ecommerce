// ============================================================
// COLLECTIBLES 2026 — SERVER-SIDE AI AUTHENTICATION & RBAC GUARD
// Path: /server/lib/authGuard.js
// Authoritative security middleware for all AI Gateway endpoints.
// Zero hardcoded emails. Strict JWT verification & role validation.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CRON_SECRET = process.env.CRON_SECRET || 'cron_secret_collectibles_2026';

// In-flight duplicate request registry to prevent double-click paid execution
const inFlightRequests = new Map();

/**
 * Authoritatively authenticates incoming requests using Supabase Auth & RBAC.
 */
export async function authenticateRequest(req, options = {}) {
  const { allowCron = false } = options;

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const cronSecretHeader = req.headers['x-cron-secret'] || '';
  
  // 1. Check Server-to-Server Vercel Cron Authentication
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || 
    (CRON_SECRET && cronSecretHeader === CRON_SECRET) ||
    (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`);

  if (isVercelCron && allowCron) {
    return {
      authenticated: true,
      isCron: true,
      isAdmin: true,
      isSuperAdmin: true,
      user: { id: 'system-cron-worker', email: 'cron@system.local' },
      role: 'cron'
    };
  }

  // 2. Check Unit Test Mock Authentication (Strictly during vitest / test runs)
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-auth']) {
    const testRole = String(req.headers['x-test-auth']).toLowerCase();
    const isSuper = testRole === 'superadmin' || testRole === 'super_admin' || testRole === 'god_admin';
    const isAdm = isSuper || testRole === 'admin';
    return {
      authenticated: true,
      isCron: false,
      isAdmin: isAdm,
      isSuperAdmin: isSuper,
      user: { id: `test-user-${testRole}`, email: `${testRole}@test.local` },
      role: testRole
    };
  }

  // 3. Reject unauthenticated requests immediately
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      isCron: false,
      isAdmin: false,
      isSuperAdmin: false,
      user: null,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Cabecera Authorization con token Bearer requerida para acceder a este recurso.'
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      authenticated: false,
      isCron: false,
      isAdmin: false,
      isSuperAdmin: false,
      user: null,
      error: 'EMPTY_TOKEN',
      message: 'Token de autorización vacío o inválido.'
    };
  }

  // Fast fail-closed validation for non-JWT malformed tokens
  if (token.split('.').length !== 3) {
    return {
      authenticated: false,
      isCron: false,
      isAdmin: false,
      isSuperAdmin: false,
      user: null,
      error: 'INVALID_TOKEN',
      message: 'Formato de token Bearer inválido (estructura JWT no válida).'
    };
  }

  // 4. Validate Token Server-Side with Supabase Auth
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        authenticated: false,
        isCron: false,
        isAdmin: false,
        isSuperAdmin: false,
        user: null,
        error: 'INVALID_TOKEN',
        message: 'Token de sesión expirado o inválido.'
      };
    }

    // 5. Authoritative RBAC evaluation from JWT metadata, profiles table, and user_roles table
    const jwtRole = String(user.app_metadata?.role || user.user_metadata?.role || user.role || '').toLowerCase();
    let isSuperAdmin = ['superadmin', 'super_admin', 'god_admin'].includes(jwtRole);
    let isAdmin = isSuperAdmin || ['admin'].includes(jwtRole);

    // If not already superadmin from JWT, query profiles table (by id, and fallback by email if available)
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        const profileRole = String(profile.role || '').toLowerCase();
        if (['superadmin', 'super_admin', 'god_admin'].includes(profileRole)) {
          isSuperAdmin = true;
          isAdmin = true;
        } else if (profileRole === 'admin' || profile.is_admin === true) {
          isAdmin = true;
        }
      } else if (user.email) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('role, is_admin')
          .eq('email', user.email)
          .maybeSingle();

        if (profileByEmail) {
          const profileRole = String(profileByEmail.role || '').toLowerCase();
          if (['superadmin', 'super_admin', 'god_admin'].includes(profileRole)) {
            isSuperAdmin = true;
            isAdmin = true;
          } else if (profileRole === 'admin' || profileByEmail.is_admin === true) {
            isAdmin = true;
          }
        }
      }
    }

    // If not already admin, check user_roles table
    if (!isAdmin) {
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (Array.isArray(rolesData)) {
        const roles = rolesData.map(r => String(r.role || '').toLowerCase());
        if (roles.some(r => ['superadmin', 'super_admin', 'god_admin'].includes(r))) {
          isSuperAdmin = true;
          isAdmin = true;
        } else if (roles.includes('admin')) {
          isAdmin = true;
        }
      }
    }

    return {
      authenticated: true,
      isCron: false,
      isAdmin,
      isSuperAdmin,
      user,
      role: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'authenticated_user')
    };

  } catch (err) {
    return {
      authenticated: false,
      isCron: false,
      isAdmin: false,
      isSuperAdmin: false,
      user: null,
      error: 'AUTH_VERIFICATION_ERROR',
      message: `Error al validar credenciales: ${err.message}`
    };
  }
}

/**
 * Middleware helper that blocks unauthorized calls and returns 401/403.
 */
export async function requireAuth(req, res, options = {}) {
  const auth = await authenticateRequest(req, options);

  if (!auth.authenticated) {
    res.status(401).json({
      success: false,
      status: 'UNAUTHORIZED',
      error: auth.message,
      code: auth.error
    });
    return null;
  }

  if (options.requireSuperAdmin && !auth.isSuperAdmin) {
    res.status(403).json({
      success: false,
      status: 'SUPERADMIN_REQUIRED',
      error: 'Acceso denegado: Se requieren privilegios de Superadmin para realizar esta acción.',
      code: 'SUPERADMIN_REQUIRED'
    });
    return null;
  }

  if (options.requireAdmin && !auth.isAdmin) {
    res.status(403).json({
      success: false,
      status: 'FORBIDDEN',
      error: 'Acceso denegado: Se requieren privilegios de Administrador.',
      code: 'ADMIN_REQUIRED'
    });
    return null;
  }

  return auth;
}

/**
 * Duplicate in-flight request lock helper.
 * Prevents multiple concurrent executions of identical queries.
 */
export async function acquireInFlightLock(key, ttlMs = 45000) {
  const existing = inFlightRequests.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return { acquired: false, existingPromise: existing.promise };
  }

  let resolveLock;
  let rejectLock;
  const promise = new Promise((resolve, reject) => {
    resolveLock = resolve;
    rejectLock = reject;
  });

  const record = {
    expiresAt: Date.now() + ttlMs,
    promise,
    resolve: resolveLock,
    reject: rejectLock
  };

  inFlightRequests.set(key, record);

  const release = (result, error) => {
    if (error) {
      record.reject(error);
    } else {
      record.resolve(result);
    }
    inFlightRequests.delete(key);
  };

  return { acquired: true, release };
}
