import type { VaultItem } from '../types/index.ts';

export interface LineCompletionResult {
  line_name: string;
  lineName: string;
  total_pieces: number;
  totalInLine: number;
  owned_pieces: number;
  ownedCount: number;
  missing_pieces: number;
  missingCount: number;
  completion_percentage: number;
  completionPercentage: number;
  owned_items: any[];
  missing_items: any[];
  ownedTitles: string[];
  missingTitles: string[];
}

/**
 * Evaluates completion of a specific collector line or wave based on an authoritative set of target piece names/titles.
 */
export function calculateLineCompletion(
  lineName: string,
  targetTitles: (string | { id?: string; title?: string; name?: string; character?: string })[],
  userVaultItems: VaultItem[]
): LineCompletionResult {
  if (!targetTitles || targetTitles.length === 0) {
    return {
      line_name: lineName,
      lineName,
      total_pieces: 0,
      totalInLine: 0,
      owned_pieces: 0,
      ownedCount: 0,
      missing_pieces: 0,
      missingCount: 0,
      completion_percentage: 0,
      completionPercentage: 0,
      owned_items: [],
      missing_items: [],
      ownedTitles: [],
      missingTitles: []
    };
  }

  const normalizedUserTitles = userVaultItems
    .filter(i => ['OWNED', 'ORDERED', 'PREORDERED'].includes(i.status))
    .map(i => (i.product?.title || i.external_item?.name || '').toLowerCase().trim());

  const ownedItems: any[] = [];
  const missingItems: any[] = [];
  const ownedTitles: string[] = [];
  const missingTitles: string[] = [];

  for (const target of targetTitles) {
    const rawTitle = typeof target === 'string' 
      ? target 
      : (target.title || target.name || target.character || '');
    const normTarget = rawTitle.toLowerCase().trim();
    
    const isOwned = normalizedUserTitles.some(t => 
      t.length > 0 && normTarget.length > 0 && (t.includes(normTarget) || normTarget.includes(t))
    );

    if (isOwned) {
      ownedItems.push(target);
      ownedTitles.push(rawTitle);
    } else {
      missingItems.push(target);
      missingTitles.push(rawTitle);
    }
  }

  const percentage = Math.round((ownedItems.length / targetTitles.length) * 100);

  return {
    line_name: lineName,
    lineName,
    total_pieces: targetTitles.length,
    totalInLine: targetTitles.length,
    owned_pieces: ownedItems.length,
    ownedCount: ownedItems.length,
    missing_pieces: missingItems.length,
    missingCount: missingItems.length,
    completion_percentage: percentage,
    completionPercentage: percentage,
    owned_items: ownedItems,
    missing_items: missingItems,
    ownedTitles,
    missingTitles
  };
}
