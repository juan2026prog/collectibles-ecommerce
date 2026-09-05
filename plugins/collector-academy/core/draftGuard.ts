import { AcademyContentStatus } from '../types';

/**
 * Strict Guardrail: AI Generated drafts CANNOT be published automatically.
 * Must transition through editorial review.
 */
export function validatePublishAction(currentStatus: AcademyContentStatus, newStatus: AcademyContentStatus): {
  allowed: boolean;
  error?: string;
} {
  if (newStatus === 'PUBLISHED') {
    if (currentStatus === 'AI_DRAFT') {
      return {
        allowed: false,
        error: 'Prohibida la auto-publicación: Los borradores generados por IA deben pasar a REVIEW y contar con aprobación editorial humana antes de ser publicados.'
      };
    }
  }

  return { allowed: true };
}
