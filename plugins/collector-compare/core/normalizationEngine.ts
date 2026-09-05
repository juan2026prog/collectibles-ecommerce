/**
 * Normalization Engine for Collector Attributes (Scales, Dimensions, Weights, Casing)
 */

export const KNOWN_SCALES = [
  '1:4',
  '1:6',
  '1:10',
  '1:12',
  '1:18',
  '1:24',
  '1:43',
  '1:64'
] as const;

export type KnownScale = typeof KNOWN_SCALES[number];

/**
 * Normalizes user/vendor scale strings into standard collector ratios (e.g., 1:12, 1:6).
 */
export function normalizeScale(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();

  // Direct exact ratios
  const ratioMatch = s.match(/1[\s/:_-]+(4|6|10|12|18|24|43|64)\b/);
  if (ratioMatch) {
    return `1:${ratioMatch[1]}`;
  }

  // Textual representations
  if (s.includes('sixth scale') || s.includes('1/6th') || s.includes('one sixth')) {
    return '1:6';
  }
  if (s.includes('quarter scale') || s.includes('1/4th') || s.includes('one fourth')) {
    return '1:4';
  }
  if (s.includes('one twelfth') || s.includes('1/12th')) {
    return '1:12';
  }

  return null;
}

/**
 * Normalizes height from centimeters or inches into a structured object.
 */
export function normalizeHeight(raw: any): { cm: number; inches: number; display: string } | null {
  if (raw === null || raw === undefined) return null;

  let cmValue: number | null = null;

  if (typeof raw === 'number' && !isNaN(raw)) {
    cmValue = raw;
  } else if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase().replace(',', '.');

    // Check for inches first: e.g. "7 inch", "7 in", "7\""
    const inchMatch = s.match(/([0-9.]+)\s*(?:inch|inches|in|\")/);
    if (inchMatch) {
      const inches = parseFloat(inchMatch[1]);
      if (!isNaN(inches) && inches > 0) {
        cmValue = Math.round(inches * 2.54 * 10) / 10;
      }
    } else {
      // Check for cm or mm
      const mmMatch = s.match(/([0-9.]+)\s*mm/);
      if (mmMatch) {
        const mm = parseFloat(mmMatch[1]);
        if (!isNaN(mm)) cmValue = Math.round(mm / 10 * 10) / 10;
      } else {
        const cmMatch = s.match(/([0-9.]+)\s*(?:cm)?/);
        if (cmMatch) {
          const val = parseFloat(cmMatch[1]);
          if (!isNaN(val) && val > 0) {
            cmValue = Math.round(val * 10) / 10;
          }
        }
      }
    }
  }

  if (cmValue === null || cmValue <= 0) return null;

  const inchesValue = Math.round((cmValue / 2.54) * 10) / 10;
  return {
    cm: cmValue,
    inches: inchesValue,
    display: `${cmValue} cm (~${inchesValue}")`
  };
}

/**
 * Normalizes weight in kilograms, grams, or pounds.
 */
export function normalizeWeight(raw: any): { kg: number; display: string } | null {
  if (raw === null || raw === undefined) return null;

  let kgValue: number | null = null;

  if (typeof raw === 'number' && !isNaN(raw)) {
    kgValue = raw;
  } else if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase().replace(',', '.');

    // Check for grams
    const gMatch = s.match(/([0-9.]+)\s*(?:g|gr|gramos|grams)\b/);
    if (gMatch) {
      const g = parseFloat(gMatch[1]);
      if (!isNaN(g)) kgValue = Math.round((g / 1000) * 100) / 100;
    } else {
      // Check for pounds (lbs)
      const lbMatch = s.match(/([0-9.]+)\s*(?:lb|lbs|libras)\b/);
      if (lbMatch) {
        const lbs = parseFloat(lbMatch[1]);
        if (!isNaN(lbs)) kgValue = Math.round(lbs * 0.453592 * 100) / 100;
      } else {
        // Assume kg
        const kgMatch = s.match(/([0-9.]+)\s*(?:kg|kilos)?/);
        if (kgMatch) {
          const val = parseFloat(kgMatch[1]);
          if (!isNaN(val) && val > 0) kgValue = Math.round(val * 100) / 100;
        }
      }
    }
  }

  if (kgValue === null || kgValue <= 0) return null;

  return {
    kg: kgValue,
    display: `${kgValue} kg`
  };
}

/**
 * Formats a value or returns 'No informado' when missing.
 */
export function formatOrFallback(val: any, fallback = 'No informado'): string {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'string' && val.trim().length === 0) return fallback;
  return String(val);
}
