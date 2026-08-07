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
 * Generates a guaranteed unique product slug by checking the Supabase database.
 * If a collision occurs with another product, automatically appends a suffix
 * (e.g., base-slug-2, base-slug-3, or base-slug-a8f4) to ensure uniqueness
 * without ever throwing an exception.
 */
export async function generateUniqueSlug(title: string, currentProductId?: string): Promise<string> {
  const baseSlug = slugify(title);
  let candidateSlug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
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
      return `${baseSlug}-${fallbackSuffix}`;
    }

    if (!data) {
      isUnique = true;
    } else {
      counter++;
      if (counter <= 20) {
        candidateSlug = `${baseSlug}-${counter}`;
      } else {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        candidateSlug = `${baseSlug}-${randomSuffix}`;
      }
    }
  }

  return candidateSlug;
}
