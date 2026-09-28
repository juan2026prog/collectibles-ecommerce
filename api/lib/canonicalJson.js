// ============================================================
// COLLECTIBLES 2026 — CANONICAL JSON & EVIDENCE FINGERPRINTING
// Deterministic canonical serialization and SHA-256 fingerprinting.
// Excludes secrets, tokens, PII, and handles nested key sorting.
// ============================================================

import crypto from 'crypto';

const SENSITIVE_KEY_REGEX = /^(password|secret|token|apikey|api_key|auth|authorization|email|phone|address|customer_name|buyer_name|credit_card|card_number|cvv)$/i;

/**
 * Recursively normalizes an arbitrary value to a deterministic JSON structure.
 * Keys of objects are sorted alphabetically. Sensitive keys are stripped.
 */
export function canonicalizeValue(val) {
  if (val === null || val === undefined) {
    return null;
  }

  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }

  if (typeof val === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result = {};
    for (const key of sortedKeys) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        continue;
      }
      const cleaned = canonicalizeValue(val[key]);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }

  return String(val);
}

/**
 * Returns a canonical deterministic JSON string.
 */
export function stringifyCanonical(val) {
  return JSON.stringify(canonicalizeValue(val));
}

/**
 * Generates a deterministic SHA-256 hex digest of the canonicalized evidence.
 */
export function generateEvidenceFingerprint(evidence) {
  const canonical = stringifyCanonical(evidence || {});
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
