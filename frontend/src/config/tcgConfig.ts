export type CardDetails = {
  // Common / General
  card_type?: 'sports' | 'tcg' | 'general';
  set_collection?: string;
  card_number?: string;
  is_graded?: boolean;
  grading_company?: string;
  grade?: string;

  // Sports Cards Specific
  sport?: string;
  player_character?: string;
  team?: string;
  year_season?: string;
  format?: string;
  is_rookie?: boolean;
  is_autograph?: boolean;

  // TCG Specific
  game?: string;
  rarity?: string;
  language?: string;
};

export const CARD_FORMAT_OPTIONS = [
  'Single Card',
  'Pack',
  'Box',
  'Blaster Box',
  'Hobby Box',
  'Starter Deck',
  'Booster',
  'Other'
];

export const GRADING_COMPANY_OPTIONS = [
  'PSA',
  'BGS (Beckett)',
  'SGC',
  'CGC',
  'ACE Grading',
  'Other'
];

export const SPORT_OPTIONS = [
  'Fútbol',
  'Basketball / NBA',
  'Fórmula 1',
  'Baseball / MLB',
  'American Football / NFL',
  'Wrestling',
  'Comics & Entertainment',
  'Otros Sports Cards'
];

export const LANGUAGE_OPTIONS = [
  'Español',
  'Inglés',
  'Japonés',
  'Portugués',
  'Alemán',
  'Francés',
  'Otro'
];

/**
 * Checks whether a given category ID or category object belongs to the
 * TRADING CARDS / SPORTS CARDS branch in the global taxonomy tree.
 */
export function isSportsCardCategory(categoryId: string | null | undefined, categories: any[]): boolean {
  if (!categoryId || !categories || categories.length === 0) return false;
  
  let current = categories.find(c => c.id === categoryId);
  while (current) {
    const slug = (current.slug || '').toLowerCase();
    const name = (current.name || '').toLowerCase();
    if (slug === 'trading-cards-sports-cards' || name.includes('trading cards') || name.includes('sports cards')) {
      return true;
    }
    if (!current.parent_id) break;
    current = categories.find(c => c.id === current.parent_id);
  }
  return false;
}

/**
 * Checks whether a given category ID or category object belongs to the
 * TCG (Games) branch in the global taxonomy tree.
 */
export function isTCGCategory(categoryId: string | null | undefined, categories: any[]): boolean {
  if (!categoryId || !categories || categories.length === 0) return false;
  
  let current = categories.find(c => c.id === categoryId);
  while (current) {
    const slug = (current.slug || '').toLowerCase();
    const name = (current.name || '').toLowerCase();
    if (slug === 'tcg-cards' || (name === 'tcg' && current.parent_id)) {
      return true;
    }
    if (!current.parent_id) break;
    current = categories.find(c => c.id === current.parent_id);
  }
  return false;
}

/**
 * Checks whether a given category is anywhere under TCG & Boardgames top-level category.
 */
export function isUnderTCGAndBoardgames(categoryId: string | null | undefined, categories: any[]): boolean {
  if (!categoryId || !categories || categories.length === 0) return false;
  
  let current = categories.find(c => c.id === categoryId);
  while (current) {
    const slug = (current.slug || '').toLowerCase();
    const name = (current.name || '').toLowerCase();
    if (slug === 'tcg' || name.includes('tcg & boardgames') || current.id === '6e659b91-5130-4f20-9ddb-609410b9f84c') {
      return true;
    }
    if (!current.parent_id) break;
    current = categories.find(c => c.id === current.parent_id);
  }
  return false;
}

/**
 * Helper to build an indented list of categories for dropdown select components.
 */
export function buildCategoryTreeOptions(categories: any[]): { id: string; name: string; depth: number; label: string }[] {
  const tree: { id: string; name: string; depth: number; label: string }[] = [];
  const map = new Map<string | null, any[]>();
  
  categories.forEach(c => {
    const parentId = c.parent_id || null;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId)!.push(c);
  });
  
  function traverse(parentId: string | null, depth: number) {
    const children = map.get(parentId) || [];
    children.forEach(c => {
      const prefix = '— '.repeat(depth);
      tree.push({ id: c.id, name: c.name, depth, label: `${prefix}${c.name}` });
      traverse(c.id, depth + 1);
    });
  }
  
  traverse(null, 0);
  return tree;
}
