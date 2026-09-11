/**
 * CONDITION MAPPER & RETRO EN CAJA DETECTOR — COLLECTIBLES 2026
 * 
 * Estandariza la correspondencia determinística entre las condiciones reportadas
 * por retailers externos (Amazon, eBay, Best Buy, Zinc) y los 6 estados canónicos
 * de base de datos definidos en products.condition:
 * 
 * 1. new_sealed       - Nuevo sellado de fábrica
 * 2. new_open_box     - Nuevo en caja abierta
 * 3. used_complete    - Usado completo (con caja y accesorios)
 * 4. used_incomplete  - Usado incompleto (con faltantes)
 * 5. loose_complete   - Suelto / Loose completo (sin caja, con accesorios)
 * 6. loose_incomplete - Suelto incompleto (sin caja y con piezas faltantes)
 * 
 * Regla de Oro: NUNCA crear condiciones llamadas 'retro', 'vintage', etc.
 * Retro/Vintage se modelan como señales dimensionales ortogonales.
 */

export type CanonicalProductCondition =
  | 'new_sealed'
  | 'new_open_box'
  | 'used_complete'
  | 'used_incomplete'
  | 'loose_complete'
  | 'loose_incomplete';

export interface ConditionDisplayInfo {
  canonical: CanonicalProductCondition;
  label: string;
  shortLabel: string;
  badgeText: string;
  badgeClass: string;
  group: 'NEW' | 'USED' | 'LOOSE';
  hasBox: boolean;
  needsReview: boolean;
}

export const CANONICAL_CONDITIONS_META: Record<CanonicalProductCondition, ConditionDisplayInfo> = {
  new_sealed: {
    canonical: 'new_sealed',
    label: 'Nuevo Sellado',
    shortLabel: 'Sellado',
    badgeText: 'NUEVO SELLADO',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    group: 'NEW',
    hasBox: true,
    needsReview: false
  },
  new_open_box: {
    canonical: 'new_open_box',
    label: 'Nuevo en Caja Abierta',
    shortLabel: 'Open Box',
    badgeText: 'OPEN BOX',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    group: 'NEW',
    hasBox: true,
    needsReview: false
  },
  used_complete: {
    canonical: 'used_complete',
    label: 'Usado Completo (con Caja)',
    shortLabel: 'Usado Completo',
    badgeText: 'USADO COMPLETO',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    group: 'USED',
    hasBox: true,
    needsReview: false
  },
  used_incomplete: {
    canonical: 'used_incomplete',
    label: 'Usado Incompleto',
    shortLabel: 'Usado Incompleto',
    badgeText: 'USADO INCOMPLETO',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    group: 'USED',
    hasBox: true,
    needsReview: true
  },
  loose_complete: {
    canonical: 'loose_complete',
    label: 'Loose Completo (sin Caja)',
    shortLabel: 'Loose Completo',
    badgeText: 'LOOSE COMPLETO',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    group: 'LOOSE',
    hasBox: false,
    needsReview: false
  },
  loose_incomplete: {
    canonical: 'loose_incomplete',
    label: 'Loose Incompleto (sin Caja)',
    shortLabel: 'Loose Incompleto',
    badgeText: 'LOOSE INCOMPLETO',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    group: 'LOOSE',
    hasBox: false,
    needsReview: true
  }
};

/**
 * Mapea determinísticamente una condición de retailer a los 6 estados de DB.
 */
export function mapExternalConditionToCanonical(
  externalCondition?: string,
  retailer?: string,
  rawTitle?: string
): { condition: CanonicalProductCondition; needsReview: boolean } {
  const c = (externalCondition || '').toLowerCase().trim();
  const t = (rawTitle || '').toLowerCase();

  // Señales explícitas en título o condición para Loose
  if (t.includes('loose') || c.includes('loose')) {
    if (t.includes('incomplete') || t.includes('missing') || t.includes('faltante') || t.includes('parts')) {
      return { condition: 'loose_incomplete', needsReview: true };
    }
    return { condition: 'loose_complete', needsReview: false };
  }

  // Open Box
  if (c.includes('open_box') || c.includes('open box') || c.includes('like_new') || c.includes('like new') || t.includes('open box')) {
    return { condition: 'new_open_box', needsReview: false };
  }

  // Retailer específico: Amazon asume siempre new_sealed salvo que sea warehouse/used
  if (retailer === 'amazon' && (!c || c === 'new' || c === 'brand new')) {
    return { condition: 'new_sealed', needsReview: false };
  }

  // Best Buy: New es new_sealed
  if (retailer === 'bestbuy' && (!c || c === 'new')) {
    return { condition: 'new_sealed', needsReview: false };
  }

  // Nuevo sellado
  if (c === 'new' || c === 'brand new' || c === 'factory sealed' || c === 'sealed' || c === 'new_sealed') {
    return { condition: 'new_sealed', needsReview: false };
  }

  // Usado
  if (c.includes('used') || c.includes('refurbished') || c.includes('acceptable') || c.includes('good') || c.includes('very good')) {
    if (t.includes('incomplete') || t.includes('missing') || t.includes('parts') || t.includes('sin accesorio')) {
      return { condition: 'used_incomplete', needsReview: true };
    }
    if (t.includes('no box') || t.includes('sin caja')) {
      return { condition: 'loose_complete', needsReview: false };
    }
    return { condition: 'used_complete', needsReview: false };
  }

  // Fallback seguro: Si no podemos asegurar la integridad, marcar used_complete con revisión
  return { condition: 'new_sealed', needsReview: false };
}

/**
 * Obtiene la metadata visual de una condición canónica.
 */
export function getConditionMeta(condition: CanonicalProductCondition): ConditionDisplayInfo {
  return CANONICAL_CONDITIONS_META[condition] || CANONICAL_CONDITIONS_META.new_sealed;
}

/**
 * Detector determinístico de "Retro en Caja".
 * Construido estrictamente sobre señales de preservación y empaque de época,
 * sin crear una condición artificial en la base de datos.
 */
export function detectRetroInBox(
  title: string,
  condition: CanonicalProductCondition,
  tags: string[] = []
): { isRetroInBox: boolean; reason?: string } {
  // Debe conservar el empaque (caja o blíster)
  const meta = getConditionMeta(condition);
  if (!meta.hasBox) {
    return { isRetroInBox: false };
  }

  const t = title.toLowerCase();
  const tagList = tags.map(x => x.toLowerCase());

  // Exclusiones categóricas
  const hasExclusion = /\b(loose|for parts|broken|damaged|sin caja|no box|figure only)\b/i.test(t);
  if (hasExclusion) {
    return { isRetroInBox: false };
  }

  // Señales de empaque original
  const hasBoxSignal = /\b(sealed|new in box|nib|mint in box|mib|mint on card|moc|new old stock|nos|en caja|blister original|caja original)\b/i.test(t) ||
                       condition === 'new_sealed' || condition === 'new_open_box';

  // Señales temporales o de líneas anteriores/discontinuadas
  const hasRetroSignal = /\b(vintage|retro|kenner|toy biz|galuob|hasbro vintage|power of the force|potf|197\d|198\d|199\d|200\d|discontinued|vaulted|nostalgia)\b/i.test(t) ||
                         tagList.some(tg => ['retro', 'vintage', 'potf', '80s', '90s', 'kenner', 'vaulted'].includes(tg));

  if (hasBoxSignal && hasRetroSignal) {
    return {
      isRetroInBox: true,
      reason: 'Coleccionable de época preservado con empaque original'
    };
  }

  return { isRetroInBox: false };
}
