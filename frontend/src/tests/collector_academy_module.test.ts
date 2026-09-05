import { describe, it, expect } from 'vitest';
import { validatePublishAction } from '../plugins/collector-academy/core/draftGuard';

describe('Módulo 05: Collector Academy Engine Tests', () => {
  it('blocks publication directly from AI_DRAFT (prohibits automated AI publishing)', () => {
    const result = validatePublishAction('AI_DRAFT', 'PUBLISHED');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Prohibida la auto-publicación');
  });

  it('allows publication when transition is made from REVIEW or DRAFT after human oversight', () => {
    const fromReview = validatePublishAction('REVIEW', 'PUBLISHED');
    expect(fromReview.allowed).toBe(true);

    const fromDraft = validatePublishAction('DRAFT', 'PUBLISHED');
    expect(fromDraft.allowed).toBe(true);
  });
});
