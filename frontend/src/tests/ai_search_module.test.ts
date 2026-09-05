import { describe, it, expect } from 'vitest';
import { interpretUserQuery } from '../lib/search/aiQueryInterpreter';

describe('Módulo 01: Collectibles AI Search Engine Tests', () => {
  it('detects scale accurately in natural text', () => {
    const res1 = interpretUserQuery('figura iron man 1:6 hot toys');
    expect(res1.detectedScale).toBe('1:6');
    expect(res1.detectedBrand).toBe('HOT TOYS');

    const res2 = interpretUserQuery('batman one:12 mezco');
    expect(res2.detectedScale).toBe('1:12');
  });

  it('detects maximum price conditions and extracts priceMax', () => {
    const res = interpretUserQuery('figuras marvel legends menos de 50');
    expect(res.priceMax).toBe(50);
  });

  it('identifies conversational questions correctly', () => {
    const res = interpretUserQuery('¿Qué figura de Spider-Man recomiendas para empezar?');
    expect(res.isQuestion).toBe(true);
    expect(res.intent).toBe('question');
    expect(res.detectedLicense).toBe('SPIDER-MAN');
  });
});
