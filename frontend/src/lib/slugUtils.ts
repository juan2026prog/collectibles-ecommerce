import { supabase } from './supabase';

/**
 * Normalizes text to a clean, standard, URL-friendly slug.
 * - Converts to lowercase
 * - Strips accents & diacritics (e.g. á -> a, ñ -> n, ü -> u, Ç -> c)
 * - Converts spaces, slashes (/), and special symbols/emojis into hyphens (-)
 * - Collapses consecutive hyphens into a single (-)
 * - Trims leading and trailing hyphens
 */
export function slugify(text: string): string {
  if (!text) return 'producto';

  const cleanText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics / accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')    // Non-alphanumeric to hyphen
    .replace(/-+/g, '-')             // Collapse multiple hyphens
    .replace(/(^-|-$)/g, '');        // Trim hyphens at ends

  return cleanText || 'producto';
}

/**
 * Checks whether a proposed public product slug contains prohibited external marketplace references
 * such as Mercado Libre IDs, permalinks, or prefixes (e.g. mercadolibre-MLU123456).
 */
export function isProhibitedSlug(slug: string): boolean {
  if (!slug) return false;
  const s = slug.toLowerCase().trim();

  // Explicit prohibited keywords
  if (s.includes('mercadolibre') || s.includes('mercado-libre')) return true;

  // Mercado Libre item ID pattern matches (e.g., MLU12345678, MLU-123456, ml-u-12345)
  if (/^ml[uamb]\d+/i.test(s) || /ml[uamb]\d{6,}/i.test(s) || /^ml[uamb]-\d+/i.test(s)) return true;

  return false;
}

/**
 * Given a title and an optional raw slug, produces a clean public slug.
 * If rawSlug is prohibited or empty, regenerates a clean slug directly from title.
 */
export function cleanOrSanitizeSlug(title: string, rawSlug?: string): { slug: string; wasCleaned: boolean } {
  const normalizedRaw = rawSlug ? slugify(rawSlug) : '';

  if (normalizedRaw && !isProhibitedSlug(normalizedRaw)) {
    return { slug: normalizedRaw, wasCleaned: false };
  }

  const cleanFromTitle = slugify(title || 'producto');
  return { slug: cleanFromTitle, wasCleaned: true };
}

/**
 * Generates a guaranteed unique public product slug by checking the Supabase database.
 * If a collision occurs with another product, automatically appends a suffix
 * (e.g., base-slug-2, base-slug-3, base-slug-4) without ever using ML IDs.
 */
export async function generateUniqueSlug(title: string, currentProductId?: string, rawSlugInput?: string): Promise<string> {
  const { slug: baseSlug } = cleanOrSanitizeSlug(title, rawSlugInput);
  let candidateSlug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    // Safety check: if candidate accidentally is prohibited, fallback to title slugify
    if (isProhibitedSlug(candidateSlug)) {
      candidateSlug = slugify(title || 'producto');
    }

    let query = supabase
      .from('products')
      .select('id')
      .eq('slug', candidateSlug);

    if (currentProductId) {
      query = query.neq('id', currentProductId);
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[slugUtils] Error checking slug uniqueness, appending safety suffix:', error);
      const fallbackSuffix = Math.random().toString(36).substring(2, 6);
      return `${candidateSlug}-${fallbackSuffix}`;
    }

    if (!data) {
      isUnique = true;
    } else {
      counter++;
      if (counter <= 50) {
        candidateSlug = `${baseSlug}-${counter}`;
      } else {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        candidateSlug = `${baseSlug}-${randomSuffix}`;
      }
    }
  }

  return candidateSlug;
}
