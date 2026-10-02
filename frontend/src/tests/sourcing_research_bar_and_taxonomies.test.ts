import { describe, it, expect } from 'vitest';
import { 
  COLLECTIBLES_PRODUCT_FAMILIES as BACKEND_PRODUCT_FAMILIES,
  normalizeProductFamily,
  generateResearchCacheKey,
  buildOptimizedResearchPrompt,
  calculatePreFlightEstimate
} from '../../../server/lib/researchCostOptimizer.js';
import { COLLECTIBLES_PRODUCT_FAMILIES as FRONTEND_PRODUCT_FAMILIES } from '../types/sourcingIntelligence';

describe('COLLECTIBLES 2026 — SOURCING RESEARCH BAR & PRODUCT FAMILIES TAXONOMY', () => {

  it('1. Backend and Frontend share the exact 13 canonical Collectibles product families', () => {
    expect(BACKEND_PRODUCT_FAMILIES).toBeDefined();
    expect(FRONTEND_PRODUCT_FAMILIES).toBeDefined();
    expect(BACKEND_PRODUCT_FAMILIES.length).toBe(13);
    expect(FRONTEND_PRODUCT_FAMILIES.length).toBe(13);

    const expectedFamilies = [
      { id: 'ALL', label: 'Todos' },
      { id: 'FIGURES', label: 'Figuras' },
      { id: 'STATUES_BUSTS', label: 'Estatuas y Bustos' },
      { id: 'PLUSH', label: 'Peluches' },
      { id: 'COMICS_MANGA', label: 'Cómics y Manga' },
      { id: 'TCG_CARDS', label: 'TCG y Cartas' },
      { id: 'APPAREL_ACCESSORIES', label: 'Ropa y Accesorios' },
      { id: 'BUILDING_SETS', label: 'Building Sets / LEGO' },
      { id: 'BOARD_GAMES', label: 'Board Games' },
      { id: 'PUZZLES', label: 'Puzzles' },
      { id: 'REPLICAS_PROPS', label: 'Réplicas y Props' },
      { id: 'VEHICLES', label: 'Vehículos' },
      { id: 'OTHER_COLLECTIBLES', label: 'Otros Coleccionables' }
    ];

    expectedFamilies.forEach((expected, index) => {
      expect(BACKEND_PRODUCT_FAMILIES[index]).toEqual(expected);
      expect(FRONTEND_PRODUCT_FAMILIES[index]).toEqual(expected);
    });
  });

  it('2. normalizeProductFamily handles IDs, Labels, case-insensitivity and defaults safely to ALL', () => {
    expect(normalizeProductFamily('PLUSH')).toBe('PLUSH');
    expect(normalizeProductFamily('plush')).toBe('PLUSH');
    expect(normalizeProductFamily('Peluches')).toBe('PLUSH');
    expect(normalizeProductFamily('peluches')).toBe('PLUSH');
    expect(normalizeProductFamily('FIGURES')).toBe('FIGURES');
    expect(normalizeProductFamily('Figuras')).toBe('FIGURES');
    expect(normalizeProductFamily('ALL')).toBe('ALL');
    expect(normalizeProductFamily('Todos')).toBe('ALL');
    expect(normalizeProductFamily(null)).toBe('ALL');
    expect(normalizeProductFamily(undefined)).toBe('ALL');
    expect(normalizeProductFamily('UNKNOWN_XYZ')).toBe('ALL');
  });

  it('3. Cache key separates queries by product family and time scope', () => {
    const keyAll = generateResearchCacheKey('ositos cariñosos', 'GLOBAL', 'ECONOMICO', 'AUTO', 'ALL_TIME', 'ALL');
    const keyPlush = generateResearchCacheKey('ositos cariñosos', 'GLOBAL', 'ECONOMICO', 'AUTO', 'ALL_TIME', 'PLUSH');
    const keyFigures = generateResearchCacheKey('ositos cariñosos', 'GLOBAL', 'ECONOMICO', 'AUTO', 'ALL_TIME', 'FIGURES');
    const keyPlush7d = generateResearchCacheKey('ositos cariñosos', 'GLOBAL', 'ECONOMICO', 'AUTO', '7d', 'PLUSH');

    expect(keyAll).not.toBe(keyPlush);
    expect(keyPlush).not.toBe(keyFigures);
    expect(keyPlush).not.toBe(keyPlush7d);

    // Identical parameters generate identical deterministic cache keys
    const keyPlushDuplicate = generateResearchCacheKey('Ositos Cariñosos', 'GLOBAL', 'ECONOMICO', 'AUTO', 'ALL_TIME', 'peluches');
    expect(keyPlush).toBe(keyPlushDuplicate);
  });

  it('4. Prompt generation respects Target Market ALL (Global) vs UY and product family restriction', () => {
    const promptGlobalAll = buildOptimizedResearchPrompt('Care Bears', 'ALL', { key: 'ECONOMICO', maxCandidates: 5 }, 'ALL_TIME', 'ALL');
    expect(promptGlobalAll).toContain('Mercado objetivo comercial: GLOBAL (Oportunidades internacionales sin restricción de país único)');
    expect(promptGlobalAll).toContain('Familia de producto: Todos');
    expect(promptGlobalAll).not.toContain('Restricción de familia de producto:');

    const promptUruguayPlush = buildOptimizedResearchPrompt('Care Bears', 'UY', { key: 'ECONOMICO', maxCandidates: 5 }, '7d', 'PLUSH');
    expect(promptUruguayPlush).toContain('Mercado objetivo comercial: UY');
    expect(promptUruguayPlush).toContain('Familia de producto: Peluches');
    expect(promptUruguayPlush).toContain('Restricción de familia de producto: Restringir resultados estrictamente a la familia Peluches (PLUSH).');
    expect(promptUruguayPlush).toContain('Ventana temporal: Últimos 7 días');
  });

  it('5. calculatePreFlightEstimate returns exact zero-cost metadata with product family info', () => {
    const estimate = calculatePreFlightEstimate({
      query: 'pokemon booster box',
      country: 'ALL',
      researchDepth: 'ECONOMICO',
      requestedModel: 'AUTO',
      isWebSearch: true,
      timeScope: '30d',
      productFamily: 'TCG_CARDS'
    });

    expect(estimate.openai_calls_used).toBe(0);
    expect(estimate.product_family).toBe('TCG_CARDS');
    expect(estimate.product_family_label).toBe('TCG y Cartas');
    expect(estimate.target_country).toBe('ALL');
    expect(estimate.time_scope).toBe('30d');
    expect(estimate.estimated_total_max_usd).toBeGreaterThan(0);
    expect(estimate.estimated_total_max_usd).toBeLessThan(0.01);
  });

});
