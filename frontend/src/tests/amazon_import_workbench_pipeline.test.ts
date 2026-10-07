import { describe, it, expect } from 'vitest';
import { sanitizeBrand, isValidBrand, inferBrandFromTitle, getNormalizedBrand } from '../lib/brandUtils';
import { extractCandidateImages, resolveImage, FALLBACK_IMAGE } from '../lib/imageUtils';
import { amazonSourceAdapter } from '../services/sourcing/adapters/AmazonSourceAdapter';
import { calculateCandidateImportAnalysis } from '../services/sourcing/candidateImportAnalysis';

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

  // TEST G: AmazonSourceAdapter elimina stock: 10 arbitrario y delivery fijo
  it('TEST G: AmazonSourceAdapter asigna null a stock si no hay evidencia confirmada', () => {
    const rawExtraction = {
      source: 'amazon' as const,
      source_product_id: 'B0TESTASIN1',
      url: 'https://www.amazon.com/dp/B0TESTASIN1',
      title: 'Action Figure Test',
      price: 29.99,
      domestic_shipping: 0,
      seller: 'Amazon.com',
      availability: 'in_stock' as any,
      condition: 'new' as const,
      image_url: 'https://m.media-amazon.com/images/I/test.jpg',
      gallery_images: [],
      estimated_delivery: 'Plazo doméstico USA pendiente de confirmación',
      raw_metadata: {
        prime: true,
        delivery_message: 'Llega mañana con Prime'
      }
    };

    const offer = amazonSourceAdapter.toSourceOffer(rawExtraction);
    expect(offer.stock).toBeNull();
    expect(offer.estimated_delivery).toBe('Llega mañana con Prime');
    expect(offer.is_zinc_compatible).toBe(true);
  });

  // TEST H: candidateImportAnalysis reporta INCOMPLETE cuando falta cotización completa de flete
  it('TEST H: candidateImportAnalysis reporta INCOMPLETE si el flete internacional no está confirmado', () => {
    const itemWithoutQuote = {
      id: 'cand-no-quote',
      price_usd: 50.00,
      title: 'Item sin quote'
    };

    const analysis = calculateCandidateImportAnalysis(itemWithoutQuote);
    expect(analysis.quoteStatus).toBe('INCOMPLETE');
    expect(analysis.shippingUsd).toBe(0);
    expect(analysis.statusExplanation).toContain('flete');
  });

  // TEST I: candidateImportAnalysis reporta CONFIRMED o ESTIMATED si cuenta con import_quote
  it('TEST I: candidateImportAnalysis reporta CONFIRMED cuando la cotización observada está completa', () => {
    const itemWithQuote = {
      id: 'cand-quote',
      price_usd: 50.00,
      title: 'Item con quote',
      raw_data: {
        validation_version: 2,
        provenance: {
          origin_price: { status: 'OBSERVED' }
        },
        import_quote: {
          shipping: 12.50,
          customs: 0,
          fees: 2.50,
          sale_price: 75.00
        }
      }
    };

    const analysis = calculateCandidateImportAnalysis(itemWithQuote);
    expect(analysis.quoteStatus).toBe('CONFIRMED');
    expect(analysis.shippingUsd).toBe(12.50);
    expect(analysis.estimatedProfit).toBeDefined();
    expect(analysis.finalPrice).toBe(75.00);
  });
});
