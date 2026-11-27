// Centralized Email Security & Deliverability Guard for Collectibles.
// Enforces:
// 1. Zero transmission of personal, financial, or administrative data to @collectibles.uy or *.collectibles.uy.
// 2. Stable administrative recipient fallback: collectiblesuy@gmail.com.
// 3. Functional Reply-To header (info@collectibles.com.uy or RESEND_REPLY_TO, never @collectibles.uy).
// 4. Safe halt (without faking delivery) when RESEND_FROM is unconfigured or points to an untrusted/unverified domain.

declare const Deno: any;

export const STABLE_ADMIN_EMAIL = 'collectiblesuy@gmail.com';
export const CORPORATE_PUBLIC_EMAIL = 'info@collectibles.com.uy';

const UNTRUSTED_EMAIL_DOMAINS = new Set([
  'collectibles.uy',
  'collectibles.com',
  'tudominio.com',
  'example.com',
  'example.org',
  'example.net',
  'example.invalid',
]);

function readEnv(key: string): string {
  try {
    if (typeof Deno !== 'undefined' && Deno?.env?.get) {
      return String(Deno.env.get(key) ?? '').trim();
    }
  } catch {
    // ignore
  }
  try {
    const proc = (globalThis as any).process;
    if (proc?.env && key in proc.env) {
      return String(proc.env[key] ?? '').trim();
    }
  } catch {
    // ignore
  }
  return '';
}

export function extractEmailAddress(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const candidate = angleMatch ? angleMatch[1] : trimmed;
  return candidate.trim().toLowerCase();
}

export function extractEmailDomain(raw: string | null | undefined): string {
  const email = extractEmailAddress(raw);
  const atIdx = email.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === email.length - 1) return '';
  return email.slice(atIdx + 1).toLowerCase().replace(/\.$/, '');
}

export function isValidEmailSyntax(raw: string | null | undefined): boolean {
  const email = extractEmailAddress(raw);
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email);
}

export function isUntrustedEmailAddress(raw: string | null | undefined): boolean {
  if (!isValidEmailSyntax(raw)) return true;
  const domain = extractEmailDomain(raw);
  if (!domain) return true;
  if (domain === 'collectibles.uy' || domain.endsWith('.collectibles.uy')) {
    return true;
  }
  if (UNTRUSTED_EMAIL_DOMAINS.has(domain)) {
    return true;
  }
  return false;
}

export function resolveSafeReplyTo(explicitReplyTo?: string | null): string {
  const candidates = [
    explicitReplyTo,
    readEnv('RESEND_REPLY_TO'),
    CORPORATE_PUBLIC_EMAIL,
    STABLE_ADMIN_EMAIL,
  ];
  for (const c of candidates) {
    if (c && !isUntrustedEmailAddress(c)) {
      return extractEmailAddress(c);
    }
  }
  return STABLE_ADMIN_EMAIL;
}

export interface SafeSenderResolution {
  allowed: boolean;
  from: string | null;
  replyTo: string;
  reason?: string;
}

/**
 * Validates the configured Resend sender address.
 * Never defaults to @collectibles.uy and never auto-forces @collectibles.com.uy
 * before the administrator sets RESEND_FROM after Resend domain verification.
 */
export function resolveSafeEmailSender(
  configuredFrom?: string | null,
  explicitReplyTo?: string | null,
): SafeSenderResolution {
  const replyTo = resolveSafeReplyTo(explicitReplyTo);
  const candidate = (configuredFrom || readEnv('RESEND_FROM') || '').trim();

  if (!candidate) {
    return {
      allowed: false,
      from: null,
      replyTo,
      reason: 'RESEND_FROM no configurado: verifique el dominio en Resend antes de habilitar el remitente.',
    };
  }

  if (isUntrustedEmailAddress(candidate)) {
    const blockedDomain = extractEmailDomain(candidate) || 'desconocido';
    return {
      allowed: false,
      from: null,
      replyTo,
      reason: `Remitente bloqueado por seguridad (${blockedDomain}): dominio no confiable o no autorizado.`,
    };
  }

  return {
    allowed: true,
    from: candidate,
    replyTo,
  };
}

export function sanitizeStoredRecipients(
  rawList: unknown,
  options?: { ensureAdminFallback?: boolean },
): Array<{ name: string; email: string }> {
  const result: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();

  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (rec.active === false) continue;
      const rawEmail = String(rec.email ?? '').trim();
      if (!rawEmail || isUntrustedEmailAddress(rawEmail)) {
        if (rawEmail) {
          console.warn(`[EmailGuard] Blocked untrusted stored recipient domain: ${extractEmailDomain(rawEmail)}`);
        }
        continue;
      }
      const normalized = extractEmailAddress(rawEmail);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push({
          name: String(rec.name || 'Administración').trim(),
          email: normalized,
        });
      }
    }
  }

  if (result.length === 0 && options?.ensureAdminFallback) {
    const envAdmin = readEnv('ADMIN_EMAIL');
    const safeAdmin = envAdmin && !isUntrustedEmailAddress(envAdmin)
      ? extractEmailAddress(envAdmin)
      : STABLE_ADMIN_EMAIL;
    result.push({ name: 'Administración Collectibles', email: safeAdmin });
  }

  return result;
}
