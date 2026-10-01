// supabase/functions/_shared/brandUtils.ts
/**
 * Centralized brand sanitization and extraction utilities for Supabase Edge Functions.
 */

const KNOWN_CANONICAL_BRANDS: Record<string, string> = {
  'hasbro': 'Hasbro',
  'marvel': 'Marvel',
  'funko': 'Funko',
  'neca': 'NECA',
  'bandai': 'Bandai',
  'bandai spirits': 'Bandai',
  'bandai namco': 'Bandai',
  'banpresto': 'Banpresto',
  'lego': 'LEGO',
  'mcfarlane': 'McFarlane Toys',
  'mcfarlane toys': 'McFarlane Toys',
  'mattel': 'Mattel',
  'jazwares': 'Jazwares',
  'iron studios': 'Iron Studios',
  'good smile': 'Good Smile Company',
  'good smile company': 'Good Smile Company',
  'super7': 'Super7',
  'kotobukiya': 'Kotobukiya',
  'mezco': 'Mezco',
  'mezco toyz': 'Mezco',
  'hot toys': 'Hot Toys',
  'star wars': 'Star Wars',
  'pokemon': 'Pokémon',
  'pokémon': 'Pokémon',
  'dc comics': 'DC Comics',
  'dc multiverse': 'DC Comics',
  'jada': 'Jada Toys',
  'jada toys': 'Jada Toys',
  'spin master': 'Spin Master',
  'storm collectibles': 'Storm Collectibles',
  'tamashii nations': 'Tamashii Nations',
  'square enix': 'Square Enix',
  'sega': 'SEGA',
  'nintendo': 'Nintendo',
  'playmates': 'Playmates Toys',
  'playmates toys': 'Playmates Toys',
  'medicom': 'Medicom Toy',
  'medicom toy': 'Medicom Toy',
  'mafex': 'MAFEX',
  'gentle giant': 'Gentle Giant',
  'sideshow': 'Sideshow',
  'threezero': 'Threezero',
};

const INVALID_BRAND_PATTERNS = [
  /\|/,
  /\bet\s+al\.?\b/i,
  /\bby\s+[a-z]+/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i,
  /\b(hardcover|paperback|kindle|audiobook|comic|mass market)\b/i,
  /\b(edition|illustrated|annotated)\b/i,
];

const GENERIC_EXCLUSIONS = new Set([
  'generic',
  'generico',
  'genérico',
  'sin marca',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'various',
  'various authors',
  'multi',
  'collectibles',
  'unbranded'
]);

export function isValidBrand(brand: string | null | undefined): boolean {
  if (!brand || typeof brand !== 'string') return false;
  const trimmed = brand.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 50) return false;
  
  const lower = trimmed.toLowerCase();
  if (GENERIC_EXCLUSIONS.has(lower)) return false;

  for (const pattern of INVALID_BRAND_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  if ((trimmed.match(/,/g) || []).length >= 2) return false;

  return true;
}

export function sanitizeBrand(rawBrand: string | null | undefined): string | null {
  if (!rawBrand || typeof rawBrand !== 'string') return null;

  let cleaned = rawBrand
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!isValidBrand(cleaned)) return null;

  const lower = cleaned.toLowerCase();
  if (KNOWN_CANONICAL_BRANDS[lower]) {
    return KNOWN_CANONICAL_BRANDS[lower];
  }

  return cleaned;
}

export function inferBrandFromTitle(title: string | null | undefined): string | null {
  if (!title || typeof title !== 'string') return null;
  const t = title.toLowerCase();

  if (t.includes('pokemon') || t.includes('pokémon')) return 'Pokémon';
  if (t.includes('neca')) return 'NECA';
  if (t.includes('funko') || t.includes('pop!')) return 'Funko';
  if (t.includes('hasbro') || t.includes('marvel legends') || t.includes('star wars the black series')) return 'Hasbro';
  if (t.includes('mcfarlane')) return 'McFarlane Toys';
  if (t.includes('bandai') || t.includes('gunpla') || t.includes('s.h.figuarts') || t.includes('tamashii')) return 'Bandai';
  if (t.includes('lego')) return 'LEGO';
  if (t.includes('super7')) return 'Super7';
  if (t.includes('mattel') || t.includes('masters of the universe') || t.includes('hot wheels')) return 'Mattel';
  if (t.includes('jazwares')) return 'Jazwares';
  if (t.includes('good smile') || t.includes('nendoroid') || t.includes('figma')) return 'Good Smile Company';
  if (t.includes('kotobukiya')) return 'Kotobukiya';
  if (t.includes('mezco') || t.includes('one:12')) return 'Mezco';
  if (t.includes('hot toys')) return 'Hot Toys';
  if (t.includes('iron studios')) return 'Iron Studios';
  if (t.includes('jada toys') || t.includes('jada')) return 'Jada Toys';
  if (t.includes('marvel')) return 'Marvel';
  if (t.includes('star wars')) return 'Star Wars';
  if (t.includes('dc multiverse') || t.includes('dc comics')) return 'DC Comics';

  return null;
}

export function getNormalizedBrand(product: {
  brand?: string | null;
  manufacturer?: string | null;
  title?: string | null;
}): string | null {
  const directBrand = sanitizeBrand(product.brand);
  if (directBrand) return directBrand;

  const mfgBrand = sanitizeBrand(product.manufacturer);
  if (mfgBrand) return mfgBrand;

  return inferBrandFromTitle(product.title);
}
