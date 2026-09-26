// supabase/functions/_shared/skypostal/skypostal-sanitizer.ts

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /private[_-]?key/i,
  /auth/i,
  /session[_-]?id/i,
  /cookie/i,
  /card[_-]?number/i,
  /cvv/i,
  /credit[_-]?card/i,
  /ssn/i
];

/**
 * Recursively sanitizes payloads (requests, responses, event logs)
 * to mask secrets, credentials, tokens, and sensitive PII before persistence or logging.
 */
export function sanitizeProviderPayload<T = any>(payload: T, depth: number = 0): T {
  if (depth > 8) return '[MAX_DEPTH_EXCEEDED]' as unknown as T;
  if (payload === null || payload === undefined) return payload;

  if (typeof payload === 'string') {
    // Check if string contains JWT / Bearer / Secret patterns
    if (/bearer\s+[a-zA-Z0-9\-_.]+/i.test(payload)) {
      return payload.replace(/bearer\s+[a-zA-Z0-9\-_.]+/gi, 'Bearer [REDACTED_TOKEN]') as unknown as T;
    }
    return payload;
  }

  if (typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeProviderPayload(item, depth + 1)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload)) {
    const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));

    if (isSensitiveKey) {
      if (typeof value === 'string' && value.length > 8) {
        // Mask with prefix/suffix for debuggability if safe, or fully redact
        sanitized[key] = '[REDACTED_SECRET]';
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeProviderPayload(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Masks national identity numbers or tax identifiers (RUT, CPF, DNI, RFC, CI) for display or logging
 */
export function maskTaxIdentifier(id?: string): string {
  if (!id) return '';
  const trimmed = id.trim();
  if (trimmed.length <= 4) return '***';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}
