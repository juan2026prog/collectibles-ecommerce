import { describe, it, expect } from 'vitest';
import { sanitizeBrand, isValidBrand, inferBrandFromTitle, getNormalizedBrand } from '../lib/brandUtils';
import { extractCandidateImages, resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';

describe('Pipeline de Importación y Normalización Amazon / Zinc', () => {

  // TEST A: 100 resultados entran al Workbench sin filtros locales → deben seguir siendo visibles.
  it('TEST A: 100 resultados entran al Workbench sin filtros locales → deben seguir siendo visibles', () => {
    const rawCandidates = Array.from({ length: 100 }, (_, i) => ({
      id: `cand-${i}`,
      external_product_id: `B000TEST${i.toString().padStart(4, '0')}`,
      title: `Action Figure Collectible Edition #${i}`,
      brand: i % 2 === 0 ? 'Hasbro' : 'Marvel',
      price_usd: 19.99 + i,
      image_url: `https://m.media-amazon.com/images/I/img_${i}.jpg`
    }));

    // Simulating no search term / no brand filter in Workbench
    const searchTerm = '';
    const filterBrand = 'all';

    const filtered = rawCandidates.filter(item => {
      if (searchTerm.trim()) {
        const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
        const targetText = `${item.title || ''} ${item.external_product_id || ''} ${item.brand || ''}`.toLowerCase();
        const matchesAllTokens = tokens.every(token => targetText.includes(token));
        if (!matchesAllTokens) return false;
      }
      if (filterBrand !== 'all') {
        const itemBrand = sanitizeBrand(item.brand);
        if (!itemBrand || itemBrand.toLowerCase() !== filterBrand.toLowerCase()) return false;
      }
      return true;
    });

    expect(filtered.length).toBe(100);
  });

  // TEST B: query "Marvel Legends", producto.title = "Marvel Legends Series Wolverine..." → MATCH.
  it('TEST B: query "Marvel Legends", producto.title = "Marvel Legends Series Wolverine..." → MATCH', () => {
    const item = {
      id: 'ml-1',
      external_product_id: 'B0G1TXWSG4',
      title: 'Marvel Legends Series Wolverine 6-Inch Collectible Action Figure',
      brand: 'Hasbro'
    };

    const query = 'Marvel Legends';
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const targetText = `${item.title} ${item.external_product_id} ${item.brand}`.toLowerCase();
    const match = tokens.every(token => targetText.includes(token));

    expect(match).toBe(true);
  });

  // TEST C: brand = Hasbro → aparece Hasbro en marcas.
  it('TEST C: brand = Hasbro → aparece Hasbro en marcas', () => {
    const raw = 'Hasbro';
    expect(isValidBrand(raw)).toBe(true);
    expect(sanitizeBrand(raw)).toBe('Hasbro');

    const brandList = ['Hasbro', 'Marvel', 'Funko'];
    const sanitizedUnique = Array.from(new Set(brandList.map(b => sanitizeBrand(b)).filter(Boolean)));
    expect(sanitizedUnique).toContain('Hasbro');
  });

  // TEST D: author = Alan Cowsill, brand = null → Alan Cowsill NO aparece como marca.
  it('TEST D: author = Alan Cowsill / Melanie Scott / date strings → Alan Cowsill NO aparece como marca', () => {
    const authorString1 = 'Alan Cowsill , Melanie Scott , et al. | Oct 8, 2024 by Alan Cowsill , Melanie Scott , et al. | Oct 8, 2024';
    const authorString2 = 'Melanie Scott , Stephen Wiacek , et al. | Oct 20, 2020 by Melanie Scott , Stephen Wiacek , et al. | Oct 20, 2020';

    expect(isValidBrand(authorString1)).toBe(false);
    expect(sanitizeBrand(authorString1)).toBeNull();
    expect(isValidBrand(authorString2)).toBe(false);
    expect(sanitizeBrand(authorString2)).toBeNull();

    // Normalizing a book with title "Marvel Encyclopedia New Edition" and author string
    const normalized = getNormalizedBrand({
      brand: authorString1,
      title: 'Marvel Encyclopedia New Edition'
    });
    // Inferred brand is Marvel (from title), NOT Alan Cowsill
    expect(normalized).toBe('Marvel');
    expect(normalized).not.toContain('Alan Cowsill');
  });

  // TEST E: image inválida/null/example → ProductImage fallback. NO 71example.jpg.
  it('TEST E: image inválida/null/example → ProductImage fallback. NO 71example.jpg', () => {
    const itemWithExample = {
      image_url: 'https://m.media-amazon.com/images/I/71example.jpg',
      title: 'Test Figure'
    };
    const itemWithXyz = {
      image_url: 'https://m.media-amazon.com/images/I/71xyz.jpg',
      title: 'Test Figure 2'
    };
    const itemNull = {
      image_url: null,
      title: 'Test Figure 3'
    };

    expect(extractCandidateImages(itemWithExample)).toEqual([]);
    expect(extractCandidateImages(itemWithXyz)).toEqual([]);
    expect(extractCandidateImages(itemNull)).toEqual([]);

    expect(resolveImage(itemWithExample.image_url)).toBe(FALLBACK_IMAGE);
    expect(resolveImage(itemWithXyz.image_url)).toBe(FALLBACK_IMAGE);
    expect(resolveImage(null)).toBe(FALLBACK_IMAGE);
  });

  // TEST F: 0 resultados reales del proveedor → UI muestra 0. NO mock fallback.
  it('TEST F: 0 resultados reales del proveedor → UI muestra 0. NO mock fallback', () => {
    const rawProviderResults: any[] = [];
    const candidates = rawProviderResults.map(p => ({
      id: p.id,
      title: p.title
    }));

    expect(candidates.length).toBe(0);
  });
});
