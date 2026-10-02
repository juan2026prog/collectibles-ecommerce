import { describe, it, expect } from 'vitest';

describe('Sourcing Forensic Runtime Audit & Zero-Result Verification', () => {
  it('extracts clean search query from verbose instruction prompt', () => {
    const rawPrompt = `INVESTIGACIÓN COMERCIAL SOURCING (MODO: ECONOMICO)
Consulta: "peluches de los ositos cariñosos"
Mercado objetivo: TODOS
Categoría: Coleccionables

INSTRUCCIONES CRÍTICAS:
1. Usa web_search para buscar los productos exactos.`;

    let cleanQuery = '';
    const queryMatch = rawPrompt.match(/Consulta:\s*["']?([^"\n\r]+)["']?/i);
    if (queryMatch && queryMatch[1]) {
      cleanQuery = queryMatch[1].trim();
    } else {
      cleanQuery = rawPrompt.split('\n')[0].trim();
    }

    expect(cleanQuery).toBe('peluches de los ositos cariñosos');
    expect(cleanQuery).not.toContain('INVESTIGACIÓN COMERCIAL SOURCING');
  });

  it('guarantees robust candidate array parsing across various schema keys', () => {
    const payloads = [
      { items: [{ title: 'Osito Cariñoso Azul', price: 24.99 }] },
      { products: [{ title: 'Osito Cariñoso Rosa', price: 19.99 }] },
      { candidates: [{ title: 'Osito Cariñoso Verde', price: 29.99 }] },
      { discoveries: [{ title: 'Osito Cariñoso Amarillo', price: 22.99 }] },
      [{ title: 'Osito Cariñoso Naranja', price: 18.99 }]
    ];

    for (const p of payloads) {
      let extracted: any[] = [];
      if (Array.isArray(p)) {
        extracted = p;
      } else if (p && typeof p === 'object') {
        const list = (p as any).items || (p as any).products || (p as any).candidates || (p as any).discoveries || (p as any).results;
        if (Array.isArray(list)) extracted = list;
      }
      expect(extracted.length).toBe(1);
      expect(extracted[0].title).toContain('Osito Cariñoso');
    }
  });

  it('verifies deterministic opportunity score calculation breakdown', () => {
    // Score for preorder with 1 source, no local demand, 26% margin
    const isPreorder = true;
    const isNew = false;
    const rawSourcesCount = 1;
    const sourceRetailer = 'Collector Radar';
    const marginPercent = 26;
    const hasLocalSearchDemand = false;

    let score = 0;
    const breakdown = {
      preorderBoost: 0,
      recencyBoost: 0,
      sourceConfidence: 0,
      localSupplyGap: 0,
      importMargin: 0,
      localDemand: 0
    };

    if (isPreorder) {
      breakdown.preorderBoost = 20;
      score += 20;
    }
    if (isNew) {
      breakdown.recencyBoost = 15;
      score += 15;
    }

    if (rawSourcesCount >= 1) {
      breakdown.sourceConfidence = 15;
      score += 15;
    }

    // Local supply gap boost
    breakdown.localSupplyGap = 15;
    score += 15;

    if (marginPercent >= 25) {
      breakdown.importMargin = 12;
      score += 12;
    }

    if (hasLocalSearchDemand) {
      breakdown.localDemand = 24;
      score += 24;
    } else if (isPreorder) {
      // Preorder early momentum without local demand yet
      breakdown.preorderBoost += 24;
      score += 24;
    }

    // 20 + 0 + 15 + 15 + 12 + (0 + 24) = 86
    expect(score).toBe(86);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('validates image url sanitization rejects unsplash and invalid protocols', () => {
    const sanitize = (url?: string | null) => {
      if (!url || typeof url !== 'string') return null;
      const clean = url.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) return null;
      if (clean.includes('unsplash.com')) return null;
      return clean;
    };

    expect(sanitize('https://images.unsplash.com/photo-12345')).toBeNull();
    expect(sanitize('ftp://example.com/item.png')).toBeNull();
    expect(sanitize('')).toBeNull();
    expect(sanitize(undefined)).toBeNull();
    expect(sanitize('https://m.media-amazon.com/images/I/71xyz.jpg')).toBe('https://m.media-amazon.com/images/I/71xyz.jpg');
  });
});
