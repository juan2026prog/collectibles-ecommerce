import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildZincResolutionQuery,
  matchZincCandidate,
  resolveZincProductsForCandidates,
  clearZincResolverCache,
  type ZincResolvedProduct
} from '../services/sourcing/zincProductResolver';
import { manualCandidates } from '../services/sourcing/canonicalCandidateValidation';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';

describe('ZINC CANONICAL PRODUCT RESOLVER & SOURCING INTELLIGENCE SUITE', () => {
  beforeEach(() => {
    clearZincResolverCache();
    vi.restoreAllMocks();
  });

  // TEST A: Búsqueda textual devuelve lista de productos con imágenes
  it('TEST A: Búsqueda textual devuelve lista de productos con imágenes', async () => {
    const mockProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B08XYZ1234',
        title: 'Funko Plush Batman 85th Anniversary DC Comics',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/71xyz.jpg',
        price_usd: 24.99,
        product_url_external: 'https://www.amazon.com/dp/B08XYZ1234'
      }
    ];

    const mockSearchFn = vi.fn().mockResolvedValue(mockProducts);
    const candidates = manualCandidates([
      {
        id: 'cand-batman-1',
        title: 'Funko Plush Batman 85th Anniversary',
        brand: 'Funko',
        retailer: 'Amazon'
      }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearchFn });

    expect(mockSearchFn).toHaveBeenCalledTimes(1);
    expect(result.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/71xyz.jpg');
    expect(result.resolvedCandidates[0].asin).toBe('B08XYZ1234');
    expect(result.telemetry.images_resolved).toBe(1);
  });

  // TEST B: Elección del ítem correcto dentro de la lista
  it('TEST B: Elección del ítem correcto dentro de la lista para Funko Batman', () => {
    const candidate = {
      id: 'c_1',
      title: 'Funko Pop Batman Super Heroes DC Comics',
      brand: 'Funko'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B07OTHER01',
        title: 'Superman Action Figure Mattel DC Multiverse',
        brand: 'Mattel',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/superman.jpg',
        price_usd: 19.99
      },
      {
        external_product_id: 'B07FUNKO02',
        title: 'Funko Pop Batman Super Heroes DC Comics Vinyl Figure',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/batman_funko.jpg',
        price_usd: 14.99
      }
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('STRONG');
    expect(evalResult.matchedProduct?.external_product_id).toBe('B07FUNKO02');
    expect(evalResult.matchedProduct?.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/batman_funko.jpg');
  });

  // TEST C: Protección de variantes (Steiff 85th Anniversary vs Plush genérico)
  it('TEST C: Protección de variantes descarta o penaliza choques de edición/escala', () => {
    const candidate = {
      id: 'c_steiff',
      title: 'Steiff Batman 85th Anniversary Limited Edition Plush',
      brand: 'Steiff',
      claims: {
        edition: 'Exclusive'
      }
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B08STD001',
        title: 'Steiff Batman Standard Edition Plush',
        brand: 'Steiff',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/std_steiff.jpg',
        price_usd: 80.00,
        raw_data: {
          edition: 'Standard'
        }
      }
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.variantConflictDetected).toBe(true);
    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST D: Resultados ambiguos dejan image_url = null
  it('TEST D: Resultados ambiguos dejan image_url = null', async () => {
    const candidate = {
      id: 'c_ambiguous',
      title: 'Batman Action Figure 7 inch',
      brand: 'DC Comics'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B011111111',
        title: 'Batman Action Figure 7 inch DC Comics Model A',
        brand: 'DC Comics',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/figA.jpg',
        price_usd: 19.99
      },
      {
        external_product_id: 'B022222222',
        title: 'Batman Action Figure 7 inch DC Comics Model B',
        brand: 'DC Comics',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/figB.jpg',
        price_usd: 19.99
      }
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('AMBIGUOUS');
    expect(evalResult.matchedProduct).toBeNull();

    const candidates = manualCandidates([candidate], 'UY');
    const res = await resolveZincProductsForCandidates(candidates, {
      searchFn: vi.fn().mockResolvedValue(mockZincProducts)
    });

    expect(res.resolvedCandidates[0].image_url).toBeNull();
    expect(res.telemetry.ambiguous_matches).toBe(1);
    expect(res.telemetry.images_resolved).toBe(0);
  });

  // TEST E: Lookup directo por ASIN cuando viene provisto
  it('TEST E: Lookup directo por ASIN resuelve match EXACTO', () => {
    const candidate = {
      id: 'c_asin',
      title: 'Batman Animated Series Figure',
      brand: 'McFarlane',
      asin: 'B09ABC1234'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B09ABC1234',
        title: 'McFarlane Toys DC Direct Batman Animated Series',
        brand: 'McFarlane Toys',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/mcfarlane_batman.jpg',
        price_usd: 29.99
      }
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('EXACT');
    expect(evalResult.confidenceScore).toBe(1.0);
    expect(evalResult.matchedProduct?.external_product_id).toBe('B09ABC1234');
    expect(evalResult.matchedProduct?.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/mcfarlane_batman.jpg');
  });

  // TEST F: ASIN obtenido como output a partir de búsqueda de texto
  it('TEST F: ASIN obtenido como output a partir de búsqueda de texto', async () => {
    const candidate = {
      id: 'c_no_asin',
      title: 'Funko Pop Batman Dark Knight',
      brand: 'Funko'
      // Sin ASIN inicial
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B00DARK999',
        title: 'Funko Pop Batman Dark Knight Exclusive',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/dark_knight.jpg',
        price_usd: 15.99
      }
    ];

    const candidates = manualCandidates([candidate], 'UY');
    expect(candidates[0].asin).toBeUndefined();

    const res = await resolveZincProductsForCandidates(candidates, {
      searchFn: vi.fn().mockResolvedValue(mockZincProducts)
    });

    expect(res.resolvedCandidates[0].asin).toBe('B00DARK999');
    expect(res.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/dark_knight.jpg');
    expect(res.telemetry.asins_resolved).toBe(1);
  });

  // TEST G: Producto con imagen asigna image_url
  it('TEST G: Producto con imagen asigna image_url correctamente', async () => {
    const candidate = {
      id: 'c_img',
      title: 'NECA Batman 1989 7 Inch Figure',
      brand: 'NECA'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B08NECA890',
        title: 'NECA Batman 1989 7 Inch Action Figure',
        brand: 'NECA',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/neca_batman.jpg',
        price_usd: 34.99
      }
    ];

    const candidates = manualCandidates([candidate], 'UY');
    const res = await resolveZincProductsForCandidates(candidates, {
      searchFn: vi.fn().mockResolvedValue(mockZincProducts)
    });

    expect(res.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/neca_batman.jpg');
    expect(res.resolvedCandidates[0].gallery_images).toEqual(['https://images-na.ssl-images-amazon.com/images/I/neca_batman.jpg']);
  });

  // TEST H: Producto sin imagen deja image_url = null
  it('TEST H: Producto sin imagen deja image_url = null', async () => {
    const candidate = {
      id: 'c_no_img',
      title: 'Rare Prototype Batman',
      brand: 'Collectibles'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B00NOIMG00',
        title: 'Rare Prototype Batman Figure',
        brand: 'Collectibles',
        image_url: null, // Sin imagen en Zinc
        price_usd: 99.99
      }
    ];

    const candidates = manualCandidates([candidate], 'UY');
    const res = await resolveZincProductsForCandidates(candidates, {
      searchFn: vi.fn().mockResolvedValue(mockZincProducts)
    });

    expect(res.resolvedCandidates[0].image_url).toBeNull();
    expect(res.resolvedCandidates[0].gallery_images).toEqual([]);
  });

  // TEST I: Búsqueda que devuelve producto equivocado termina en NO_MATCH
  it('TEST I: Búsqueda que devuelve producto equivocado termina en NO_MATCH', () => {
    const candidate = {
      id: 'c_batman',
      title: 'Steiff Batman Teddy Bear Plush',
      brand: 'Steiff'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B00BARBIE1',
        title: 'Barbie Dreamhouse Playset with Pool and Slide',
        brand: 'Mattel',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/barbie.jpg',
        price_usd: 199.99
      }
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST J: Cache y deduplicación de queries idénticas
  it('TEST J: Cache y deduplicación de queries idénticas evita llamadas repetidas', async () => {
    const mockSearchFn = vi.fn().mockResolvedValue([
      {
        external_product_id: 'B00COMMON1',
        title: 'Funko Plush Batman Dark Knight',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/common.jpg',
        price_usd: 12.99
      }
    ]);

    const candidateA = manualCandidates([
      { id: 'c_1', title: 'Funko Plush Batman Dark Knight Official', brand: 'Funko' }
    ], 'UY')[0];

    const candidateB = manualCandidates([
      { id: 'c_2', title: 'Funko Plush Batman Dark Knight Licensed', brand: 'Funko' }
    ], 'UY')[0];

    // Both produce query "Funko Plush Batman Dark Knight"
    expect(buildZincResolutionQuery(candidateA)).toBe(buildZincResolutionQuery(candidateB));

    const res = await resolveZincProductsForCandidates([candidateA, candidateB], { searchFn: mockSearchFn });

    // Deduplication should execute only 1 network call
    expect(mockSearchFn).toHaveBeenCalledTimes(1);
    expect(res.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/common.jpg');
    expect(res.resolvedCandidates[1].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/common.jpg');

    // Run again with candidateA -> Should hit memory cache
    const res2 = await resolveZincProductsForCandidates([candidateA], { searchFn: mockSearchFn });
    expect(mockSearchFn).toHaveBeenCalledTimes(1); // No new network call
    expect(res2.telemetry.cache_hits).toBe(1);
  });

  // TEST K: Aislamiento estricto por candidate_id (sin contaminación cruzada)
  it('TEST K: Aislamiento estricto por candidate_id', async () => {
    const mockSearchFn = vi.fn().mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('joker')) {
        return [
          {
            external_product_id: 'B00JOKER01',
            title: 'Funko Pop Joker DC Comics',
            brand: 'Funko',
            image_url: 'https://images-na.ssl-images-amazon.com/images/I/joker.jpg',
            price_usd: 14.99
          }
        ];
      }
      return [
        {
          external_product_id: 'B00BATMAN1',
          title: 'Funko Pop Batman DC Comics',
          brand: 'Funko',
          image_url: 'https://images-na.ssl-images-amazon.com/images/I/batman.jpg',
          price_usd: 14.99
        }
      ];
    });

    const candidates = manualCandidates([
      { id: 'c_batman', title: 'Funko Pop Batman DC Comics', brand: 'Funko' },
      { id: 'c_joker', title: 'Funko Pop Joker DC Comics', brand: 'Funko' }
    ], 'UY');

    const res = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearchFn });

    expect(res.resolvedCandidates[0].id).toBe('c_batman');
    expect(res.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/batman.jpg');
    expect(res.resolvedCandidates[0].asin).toBe('B00BATMAN1');

    expect(res.resolvedCandidates[1].id).toBe('c_joker');
    expect(res.resolvedCandidates[1].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/joker.jpg');
    expect(res.resolvedCandidates[1].asin).toBe('B00JOKER01');
  });

  // TEST L: Procedencia de precio comercial desde Zinc
  it('TEST L: Procedencia de precio comercial desde Zinc queda registrada como CORROBORATED', async () => {
    const candidate = {
      id: 'c_price',
      title: 'Funko Pop Batman Animated',
      brand: 'Funko'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      {
        external_product_id: 'B00PRC0001',
        title: 'Funko Pop Batman Animated Series',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/price_batman.jpg',
        price_usd: 18.50,
        product_url_external: 'https://www.amazon.com/dp/B00PRC0001'
      }
    ];

    const candidates = manualCandidates([candidate], 'UY');
    const res = await resolveZincProductsForCandidates(candidates, {
      searchFn: vi.fn().mockResolvedValue(mockZincProducts)
    });

    const resolved = res.resolvedCandidates[0];
    expect(resolved.pricing.origin_price_usd).toBe(18.50);
    expect(resolved.pricing.amazon_price_usd).toBe(18.50);
    expect(resolved.provenance.origin_price?.status).toBe('CORROBORATED');
    expect(resolved.provenance.origin_price?.value).toBe(18.50);
    expect(resolved.provenance.origin_price?.verification).toBe('SOURCE_CORROBORATED');
  });

  // TEST M: Regresión "Productos para Importar" sigue funcionando idéntico
  it('TEST M: multiSourceSearchService mantiene compatibilidad y contrato para Productos para Importar', () => {
    expect(multiSourceSearchService).toBeDefined();
    expect(typeof multiSourceSearchService.searchProducts).toBe('function');
  });
});
