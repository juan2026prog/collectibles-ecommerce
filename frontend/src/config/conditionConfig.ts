export type StoreType = 'standard' | 'vintage' | 'mixed' | 'tcg';

export type ProductCondition = 
  | 'new_sealed'
  | 'new_open_box'
  | 'used_complete'
  | 'used_incomplete'
  | 'loose_complete'
  | 'loose_incomplete';

export interface ConditionOption {
  value: ProductCondition;
  label: string;
  category: 'New' | 'Used' | 'Loose';
}

export const CONDITION_OPTIONS: ConditionOption[] = [
  { value: 'new_sealed', label: 'New / Sealed', category: 'New' },
  { value: 'new_open_box', label: 'New / Open Box', category: 'New' },
  { value: 'used_complete', label: 'Used / Complete', category: 'Used' },
  { value: 'used_incomplete', label: 'Used / Incomplete', category: 'Used' },
  { value: 'loose_complete', label: 'Loose / Complete', category: 'Loose' },
  { value: 'loose_incomplete', label: 'Loose / Incomplete', category: 'Loose' },
];

export const VALID_PRODUCT_CONDITIONS: readonly ProductCondition[] = [
  'new_sealed',
  'new_open_box',
  'used_complete',
  'used_incomplete',
  'loose_complete',
  'loose_incomplete',
];


export function isValidCondition(val: any): val is ProductCondition {
  return typeof val === 'string' && (VALID_PRODUCT_CONDITIONS as readonly string[]).includes(val);
}

/**
 * Normalizes any condition value.
 * Converts '', undefined, null, whitespace or invalid strings to null.
 * Returns valid ProductCondition or null. Never returns empty string ''.
 */
export function normalizeCondition(val?: string | null): ProductCondition | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (isValidCondition(trimmed)) {
    return trimmed;
  }
  const normLower = trimmed.toLowerCase();
  const found = CONDITION_OPTIONS.find(opt => 
    opt.value.toLowerCase() === normLower ||
    opt.label.toLowerCase() === normLower ||
    `${opt.label} (${opt.value})`.toLowerCase() === normLower ||
    normLower.includes(opt.value.toLowerCase())
  );
  if (found) return found.value;
  return null;
}


export const STORE_TYPE_OPTIONS: { value: StoreType; label: string; desc: string }[] = [
  { 
    value: 'standard', 
    label: 'Standard Store', 
    desc: 'Tienda estándar de productos nuevos.' 
  },
  { 
    value: 'vintage', 
    label: 'Vintage / Pre-Owned Store', 
    desc: 'Tienda especializada en piezas vintage, usadas, loose o de colección.' 
  },
  { 
    value: 'mixed', 
    label: 'Mixed Store', 
    desc: 'Tienda con catálogo combinado de productos nuevos y pre-owned.' 
  },
  { 
    value: 'tcg', 
    label: 'TCG STORE', 
    desc: 'Tienda especializada en TCG, Trading Cards / Sports Cards y Board Games.' 
  },
];

export function getConditionLabel(value?: string | null): string {
  if (!value) return '—';
  const found = CONDITION_OPTIONS.find(c => c.value === value);
  return found ? found.label : value;
}

export function getStoreTypeLabel(value?: string | null): string {
  switch (value) {
    case 'vintage': return 'Vintage / Pre-Owned Store';
    case 'mixed': return 'Mixed Store';
    case 'tcg': return 'TCG STORE';
    case 'standard':
    default:
      return 'Standard Store';
  }
}

export function getConditionBadgeInfo(condition?: string | null) {
  if (!condition) return null;
  switch (condition) {
    case 'loose_complete':
    case 'loose_incomplete':
      return { label: 'LOOSE', className: 'bg-amber-500 text-white border-amber-600' };
    case 'used_complete':
    case 'used_incomplete':
      return { label: 'USED', className: 'bg-slate-700 text-white border-slate-800' };
    case 'new_open_box':
      return { label: 'OPEN BOX', className: 'bg-blue-600 text-white border-blue-700' };
    default:
      return null; // new_sealed & null have no badge
  }
}
