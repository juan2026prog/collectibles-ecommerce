/**
 * SKU Utilities & Final Business Rule Guardrails
 * Collectibles 2026 E-commerce
 *
 * POLÍTICA DEFINITIVA DE SKU:
 * 1. Prioridad 1, 2, 3: UPC / EAN / GTIN numérico con checksum válido.
 * 2. Si no existe código universal: SKU Interno secuencial COL-XXXXXX (ej: COL-000001).
 *
 * NUNCA mostrar ni utilizar como SKU:
 * ML Item ID (MLU...), ASIN (B0...), UUID, Vendor SKU, notas USD.
 */

export function isValidGtinChecksum(code: string | null | undefined): boolean {
  if (!code) return false;
  const clean = code.trim().replace(/[^0-9]/g, '');
  const len = clean.length;
  if (![8, 12, 13, 14].includes(len)) return false;

  let sum = 0;
  for (let i = 1; i < len; i++) {
    const digit = parseInt(clean.charAt(len - 1 - i), 10);
    const weight = (i % 2 === 1) ? 3 : 1;
    sum += digit * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(clean.charAt(len - 1), 10);
}

export function isValidSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  const s = sku.trim().toUpperCase();
  if (s === '' || s === 'N/A' || s === 'SIN SKU' || s === 'X' || s === '-') return false;

  // Never allow legacy ML IDs, ASINs, USD notes, or raw UUIDs
  if (/^ML[A-Z]?[0-9]+/i.test(s)) return false;
  if (/^B0[A-Z0-9]{8}/i.test(s)) return false;
  if (s.startsWith('USD') || s.includes('-DUP-')) return false;

  // Valid if it's a GTIN Modulo 10 Checksum OR a clean internal COL-XXXXXX SKU
  if (isValidGtinChecksum(s)) return true;
  if (/^COL-[0-9]{6}$/.test(s)) return true;

  return false;
}

export function isValidInternalSku(sku: string | null | undefined): boolean {
  return isValidSku(sku);
}

export function getDisplaySku(sku: string | null | undefined): string | null {
  if (!isValidSku(sku)) {
    return null;
  }
  return sku!.trim();
}
