import { validateCandidate, validateStoredCandidate, deduplicateCanonicalCandidates } from '../../../../shared/sourcingCandidateValidation.js';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';

export function manualCandidates(items: any[], country: string): SourcingProductCandidate[] {
  return deduplicateCanonicalCandidates(items.map((item, index) => validateCandidate(item, { country, origin: 'MANUAL_RESEARCH', index })));
}

export function storedCandidates(rows: any[]): SourcingProductCandidate[] {
  return deduplicateCanonicalCandidates(rows.map(validateStoredCandidate));
}
