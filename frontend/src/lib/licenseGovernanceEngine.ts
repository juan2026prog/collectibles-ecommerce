/**
 * License Governance Engine
 * Manages license matching, detection, aliases, and license-to-product mapping rules.
 */

export interface LicenseItem {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface LicenseAliasItem {
  id: string;
  alias: string;
  canonical_license_id: string;
}

export const KNOWN_LICENSES_KEYWORDS_MAP: Record<string, string[]> = {
  'Marvel': ['marvel', 'avengers', 'vengadores', 'spiderman', 'spider-man', 'iron man', 'thor', 'captain america', 'hulk', 'x-men', 'wolverine', 'venom', 'deadpool', 'guardians of the galaxy'],
  'Disney': ['disney', 'mickey', 'minnie', 'pixar', 'toy story', 'frozen', 'lion king', 'reyes león', 'encanto', 'stitch', 'lilo'],
  'Star Wars': ['star wars', 'guerra de las galaxias', 'darth vader', 'mandalorian', 'jedi', 'grogu', 'yoda', 'boba fett'],
  'DC': ['dc', 'dc comics', 'batman', 'superman', 'wonder woman', 'joker', 'justice league', 'liga de la justicia', 'flash', 'harley quinn'],
  'Pokémon': ['pokémon', 'pokemon', 'pikachu', 'charizard', 'mewtwo', 'eevee', 'pokeball'],
  'Sonic': ['sonic', 'sonic the hedgehog', 'tails', 'knuckles', 'shadow the hedgehog'],
  'Minecraft': ['minecraft', 'creeper', 'steve minecraft'],
  'Roblox': ['roblox'],
  'Harry Potter': ['harry potter', 'hogwarts', 'gryffindor', 'slytherin', 'voldemort'],
  'Dragon Ball': ['dragon ball', 'dragon ball z', 'dragon ball super', 'goku', 'vegeta', 'gohan', 'trunks'],
  'Naruto': ['naruto', 'naruto shippuden', 'sasuke', 'kakashi', 'itachi'],
  'One Piece': ['one piece', 'luffy', 'zoro'],
  'Zelda': ['zelda', 'the legend of zelda', 'link zelda']
};

/**
 * Normalizes text for case-insensitive and diacritic-insensitive matching
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects potential licenses in product title or metadata
 */
export function detectLicensesFromText(
  text: string,
  licenses: LicenseItem[] = [],
  aliases: LicenseAliasItem[] = []
): Array<{ license: LicenseItem; confidence: number }> {
  if (!text) return [];
  const normText = normalizeText(text);
  const detected: Map<string, { license: LicenseItem; confidence: number }> = new Map();

  // 1. Direct License Name / Alias Match
  for (const lic of licenses) {
    const normName = normalizeText(lic.name);
    if (normName && normText.includes(normName)) {
      detected.set(lic.id, { license: lic, confidence: 0.95 });
    }
  }

  for (const aliasObj of aliases) {
    const normAlias = normalizeText(aliasObj.alias);
    if (normAlias && normText.includes(normAlias)) {
      const parentLic = licenses.find(l => l.id === aliasObj.canonical_license_id);
      if (parentLic && !detected.has(parentLic.id)) {
        detected.set(parentLic.id, { license: parentLic, confidence: 0.95 });
      }
    }
  }

  // 2. Keyword fallback match
  if (detected.size === 0) {
    for (const [licName, keywords] of Object.entries(KNOWN_LICENSES_KEYWORDS_MAP)) {
      const match = keywords.some(kw => normText.includes(normalizeText(kw)));
      if (match) {
        const parentLic = licenses.find(l => normalizeText(l.name) === normalizeText(licName));
        if (parentLic && !detected.has(parentLic.id)) {
          detected.set(parentLic.id, { license: parentLic, confidence: 0.85 });
        }
      }
    }
  }

  return Array.from(detected.values());
}
