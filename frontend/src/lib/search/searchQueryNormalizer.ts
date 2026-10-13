import { supabase } from '../supabase';

export interface SearchTokens {
  raw: string;
  normalized: string;
  terms: string[];
  brandIds: string[];
  licenseIds: string[];
}

export function normalizeSearchText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Built-in synonym mappings for collectible merchandise terms, character aliases, and variations.
 */
const KNOWN_SYNONYMS: Record<string, string[]> = {
  'pokemon': ['pokémon', 'pokemon'],
  'pokémon': ['pokemon', 'pokémon'],
  'spiderman': ['spider-man', 'spider man', 'spiderman'],
  'spider-man': ['spiderman', 'spider man', 'spider-man'],
  'spider man': ['spiderman', 'spider-man'],
  'neca': ['neca'],
  'funko': ['funko', 'pop'],
  'batman': ['batman', 'el caballero de la noche', 'the dark knight'],
  'chucky': ['chucky', "child's play", 'childs play'],
  'dbz': ['dragon ball', 'dragon ball z'],
  'dragon ball': ['dragon ball', 'dbz', 'dragon ball z', 'dragon ball super'],
  'dragon ball z': ['dragon ball', 'dbz'],
  'motu': ['masters of the universe', 'he-man'],
  'he-man': ['masters of the universe', 'motu'],
  'tmnt': ['tortugas ninja', 'teenage mutant ninja turtles'],
  'tortugas ninja': ['tmnt', 'teenage mutant ninja turtles'],
  'marvel legends': ['marvel legends', 'hasbro marvel']
};

/**
 * Resolves a search query string into clean tokens, synonym expansions, and matched brand/license IDs.
 */
export async function resolveSearchTokens(query: string): Promise<SearchTokens> {
  const raw = (query || '').trim();
  const normalized = normalizeSearchText(raw);

  if (!normalized) {
    return {
      raw,
      normalized: '',
      terms: [],
      brandIds: [],
      licenseIds: []
    };
  }

  // Gather term variations (original raw, normalized, and known synonyms)
  const termSet = new Set<string>();
  if (raw) termSet.add(raw);
  if (normalized) termSet.add(normalized);

  // Strip punctuation and add cleaned phrase if different
  const cleanedPunctuation = normalized.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanedPunctuation && cleanedPunctuation !== normalized) {
    termSet.add(cleanedPunctuation);
  }

  // If query contains parentheses, extract the main clause before the parenthesis
  if (normalized.includes('(')) {
    const beforeParen = normalized.split('(')[0].replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (beforeParen.length >= 3) {
      termSet.add(beforeParen);
    }
  }

  const synonyms = KNOWN_SYNONYMS[normalized];
  if (synonyms) {
    synonyms.forEach(s => termSet.add(s));
  }

  // Try sub-tokens if multi-word query
  const words = normalized.split(/\s+/).filter(w => w.length > 1);
  words.forEach(w => {
    const subSyns = KNOWN_SYNONYMS[w];
    if (subSyns) subSyns.forEach(s => termSet.add(s));
  });

  // Query database brands and licenses asynchronously in parallel
  let brandIds: string[] = [];
  let licenseIds: string[] = [];

  try {
    const sanitizedQuery = normalized.replace(/[%_,]/g, ' ').trim();
    if (sanitizedQuery.length >= 2) {
      const [brandRes, licRes] = await Promise.all([
        supabase
          .from('brands')
          .select('id, name')
          .eq('status', 'approved')
          .eq('is_active', true)
          .ilike('name', `%${sanitizedQuery}%`)
          .limit(10),
        supabase
          .from('licenses')
          .select('id, name')
          .eq('is_active', true)
          .ilike('name', `%${sanitizedQuery}%`)
          .limit(10)
      ]);

      if (brandRes.data) {
        brandIds = brandRes.data.map(b => b.id);
      }
      if (licRes.data) {
        licenseIds = licRes.data.map(l => l.id);
      }
    }
  } catch (err) {
    console.warn('[searchQueryNormalizer] Error resolving brand/license tokens:', err);
  }

  return {
    raw,
    normalized,
    terms: Array.from(termSet),
    brandIds,
    licenseIds
  };
}

/**
 * Builds PostgREST-compatible OR filter clause for products table based on search tokens.
 */
export function buildProductSearchOrClause(tokens: SearchTokens): string {
  const orParts: string[] = [];

  for (const term of tokens.terms) {
    const safeTerm = term.replace(/[,()]/g, ' ').trim();
    if (safeTerm) {
      orParts.push(`title.ilike.%${safeTerm}%`);
      orParts.push(`description.ilike.%${safeTerm}%`);
    }
  }

  if (tokens.brandIds.length > 0) {
    orParts.push(`brand_id.in.(${tokens.brandIds.join(',')})`);
  }

  if (tokens.licenseIds.length > 0) {
    orParts.push(`license_id.in.(${tokens.licenseIds.join(',')})`);
  }

  // Fallback to title and description search on raw query if nothing was generated
  if (orParts.length === 0 && tokens.raw) {
    const safeRaw = tokens.raw.replace(/[,()]/g, ' ').trim();
    return `title.ilike.%${safeRaw}%,description.ilike.%${safeRaw}%`;
  }

  return orParts.join(',');
}
