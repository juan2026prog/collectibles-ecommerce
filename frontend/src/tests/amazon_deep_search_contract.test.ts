import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const admin = read('../pages/admin/AdminInternationalAmazon.tsx');
const workbench = read('../components/admin/sourcing/ImportWorkbench.tsx');
const edge = read('../../../supabase/functions/zinc-search-products/index.ts');

describe('Amazon deep search contract', () => {
  it('defaults to neutral Amazon mode and 100 results', () => {
    expect(admin).toContain('onlyRecognizedBrands: false');
    expect(admin).toContain('includeGenerics: true');
    expect(admin).toContain("max_results: '100'");
  });

  it('offers deep result targets up to 1000 and sends real filters', () => {
    expect(admin).toContain('[20, 50, 100, 250, 500, 1000]');
    expect(admin).toContain('onlyRecognizedBrands: Boolean(params.onlyRecognizedBrands)');
    expect(admin).toContain('includeGenerics: Boolean(params.includeGenerics)');
    expect(admin).toContain('min_reviews: params.min_reviews ? Number(params.min_reviews) : null');
    expect(admin).toContain('availability: params.availability || null');
  });

  it('uses the exact current search batch instead of reloading unrelated recent candidates', () => {
    expect(admin).toContain('setCandidates(resultItems)');
    expect(admin).toContain('setSearchMeta(data?.meta || null)');
    expect(admin).not.toContain("opportunity_score: c.mapping_confidence || 80");
  });

  it('backend paginates Zinc, caps at 1000, deduplicates ASIN and applies brand/generic policy', () => {
    expect(edge).toContain('const MAX_DEEP_RESULTS = 1000');
    expect(edge).toContain('while (uniqueProducts.size < targetResults');
    expect(edge).toContain('uniqueProducts.has(asin)');
    expect(edge).toContain('onlyRecognizedBrands = false');
    expect(edge).toContain('includeGenerics = true');
    expect(edge).toContain('recognized || (includeGenerics && generic)');
  });

  it('AI recommended requires an explicit real AI score >= 80', () => {
    expect(workbench).toContain('const getAiScore');
    expect(workbench).toContain("activeChip === 'ai_recommended' && (aiScore === null || aiScore < 80)");
    expect(workbench).toContain('Solo productos con evaluación IA real y score ≥ 80');
  });

  it('renders only a paginated slice and defaults to 50 visible products', () => {
    expect(workbench).toContain("useState<number | 'custom'>(50)");
    expect(workbench).toContain('sortedCandidates.slice(start, start + effectivePageSize)');
    expect(workbench).toContain('[25, 50, 100]');
  });
});
