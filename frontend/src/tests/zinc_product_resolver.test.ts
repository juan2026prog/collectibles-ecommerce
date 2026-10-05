import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildZincResolutionQuery,
  matchZincCandidate,
  resolveZincProductsForCandidates,
  clearZincResolverCache,
  type ZincResolvedProduct
} from '../services/sourcing/zincProductResolver';
import {
  amazonZincSearchService,
  normalizeAmazonZincProduct,
  type AmazonZincSearchResult
} from '../services/sourcing/amazonZincSearchService';
import { manualCandidates } from '../services/sourcing/canonicalCandidateValidation';
import { multiSourceSearchService } from '../services/sourcing/multiSourceSearchService';

describe('CANONICAL AMAZON / ZINC SEARCH & SOURCING RESOLVER SUITE', () => {
  beforeEach(() => {
    clearZincResolverCache();
    vi.restoreAllMocks();
  });

  // TEST 1: Authenticated shared search -> Edge Function success -> results normalized
  it('TEST 1: Búsqueda compartida exitosa normaliza resultados de Edge Function', () => {
    const rawEdgeResult = {
      external_product_id: 'B08XYZ1234',
      title: 'Funko Plush Batman 85th Anniversary DC Comics',
      brand: 'Funko',
      main_image_url_external: 'https://images-na.ssl-images-amazon.com/images/I/71xyz.jpg',
      price_usd: 24.99,
      product_url_external: 'https://www.amazon.com/dp/B08XYZ1234',
      availability: 'available',
      prime: true
    };

    const normalized = normalizeAmazonZincProduct(rawEdgeResult, 'ZINC_LIVE');

    expect(normalized.asin).toBe('B08XYZ1234');
    expect(normalized.title).toBe('Funko Plush Batman 85th Anniversary DC Comics');
    expect(normalized.brand).toBe('Funko');
    expect(normalized.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/71xyz.jpg');
    expect(normalized.price_usd).toBe(24.99);
    expect(normalized.currency).toBe('USD');
    expect(normalized.resolution_source).toBe('ZINC_LIVE');
  });

  // TEST 2: 401/403 -> AUTH_ERROR -> NO convertir a NO_MATCH
  it('TEST 2: Error 401/403 se clasifica como AUTH_ERROR y NO se convierte falsamente en NO_MATCH', async () => {
    const mockAuthErrorSearch = vi.fn().mockResolvedValue({
      success: false,
      status: 'AUTH_ERROR',
      statusCode: 401,
      products: [],
      resolution_source: null,
      error: 'Invalid or expired token',
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_auth_1', title: 'Funko Plush Batman', brand: 'Funko' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockAuthErrorSearch });

    expect(result.telemetry.zinc_requests_failed).toBe(1);
    expect(result.telemetry.zinc_auth_errors).toBe(1);
    // CRITICAL: Debe ser 0 NO_MATCH porque falló la llamada de autenticación
    expect(result.telemetry.no_matches).toBe(0);
    expect(result.telemetry.resolver_errors.length).toBeGreaterThan(0);
    expect(result.telemetry.resolver_errors[0].error_type).toBe('AUTH_ERROR');
    expect(result.resolvedCandidates[0].image_url).toBeNull();
  });

  // TEST 3: Provider error -> PROVIDER_ERROR
  it('TEST 3: Error de provider (500) se clasifica como PROVIDER_ERROR', async () => {
    const mockProviderErrorSearch = vi.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_ERROR',
      statusCode: 500,
      products: [],
      resolution_source: null,
      error: 'Zinc gateway timeout',
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_prov_1', title: 'Steiff Batman Bear', brand: 'Steiff' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockProviderErrorSearch });

    expect(result.telemetry.zinc_requests_failed).toBe(1);
    expect(result.telemetry.zinc_provider_errors).toBe(1);
    expect(result.telemetry.no_matches).toBe(0);
  });

  // TEST 4: Valid response results=[] -> NO_RESULTS -> Evalúa a NO_MATCH
  it('TEST 4: Respuesta válida con 0 resultados produce NO_RESULTS y NO_MATCH legítimo', async () => {
    const mockNoResultsSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'NO_RESULTS',
      statusCode: 200,
      products: [],
      resolution_source: null,
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_none_1', title: 'Nonexistent Exclusive Prototype', brand: 'Unknown' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockNoResultsSearch });

    expect(result.telemetry.zinc_requests_succeeded).toBe(1);
    expect(result.telemetry.zinc_no_results).toBe(1);
    expect(result.telemetry.no_matches).toBe(1);
  });

  // TEST 5: Edge failure + valid DB fallback -> products returned -> provenance IMPORT_CANDIDATE_CACHE
  it('TEST 5: Falla en Edge Function con DB fallback devuelve productos con provenance IMPORT_CANDIDATE_CACHE', async () => {
    const fallbackProduct = normalizeAmazonZincProduct({
      external_product_id: 'B07FALLBK1',
      title: 'Funko Pop Batman Dark Knight',
      brand: 'Funko',
      main_image_url_external: 'https://images-na.ssl-images-amazon.com/images/I/fallback.jpg',
      price_usd: 15.00
    }, 'IMPORT_CANDIDATE_CACHE');

    const mockFallbackSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'AUTH_ERROR',
      statusCode: 403,
      products: [fallbackProduct],
      resolution_source: 'IMPORT_CANDIDATE_CACHE',
      error: 'Live call failed, returned DB cache fallback',
      total: 1
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_fb_1', title: 'Funko Pop Batman Dark Knight', brand: 'Funko' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockFallbackSearch });

    expect(result.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/fallback.jpg');
    expect(result.resolvedCandidates[0].provenance.image?.method).toBe('IMPORT_CANDIDATE_CACHE');
    expect(result.resolvedCandidates[0].provenance.image?.source).toBe('Amazon / Collectibles DB Cache');
    expect(result.telemetry.zinc_fallback_results).toBe(1);
  });

  // TEST 6: Funko Batman result -> STRONG/EXACT -> image assigned
  it('TEST 6: Funko Batman resultado -> STRONG/EXACT -> imagen asignada', async () => {
    const mockProduct = normalizeAmazonZincProduct({
      external_product_id: 'B08FUNKO01',
      title: 'Funko Plush Batman 85th Anniversary Plush Toy',
      brand: 'Funko',
      image_url: 'https://images-na.ssl-images-amazon.com/images/I/funko_batman.jpg',
      price_usd: 24.99,
      product_url_external: 'https://www.amazon.com/dp/B08FUNKO01'
    }, 'ZINC_LIVE');

    const mockSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      products: [mockProduct],
      resolution_source: 'ZINC_LIVE',
      total: 1
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_funko', title: 'Funko Plush Batman 85th Anniversary', brand: 'Funko' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearch });

    expect(result.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/funko_batman.jpg');
    expect(result.resolvedCandidates[0].asin).toBe('B08FUNKO01');
    expect(result.resolvedCandidates[0].provenance.image?.method).toBe('ZINC_PRODUCT_DATA');
    expect(result.telemetry.images_resolved).toBe(1);
  });

  // TEST 7: Steiff Batman result -> correct Steiff product selected
  it('TEST 7: Steiff Batman resultado -> producto Steiff correcto seleccionado', () => {
    const candidate = {
      id: 'c_steiff',
      title: 'Steiff Batman 85th Anniversary Plush',
      brand: 'Steiff'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B00SUPERMAN',
        title: 'Superman Action Figure Mattel',
        brand: 'Mattel',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/superman.jpg'
      }),
      normalizeAmazonZincProduct({
        external_product_id: 'B08STEIFF0',
        title: 'Steiff Batman 85th Anniversary Collector Teddy Bear Plush',
        brand: 'Steiff',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/steiff.jpg'
      })
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('STRONG');
    expect(evalResult.matchedProduct?.asin).toBe('B08STEIFF0');
    expect(evalResult.matchedProduct?.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/steiff.jpg');
  });

  // TEST 8: Ambiguous Batman products -> no automatic image
  it('TEST 8: Productos Batman ambiguos -> no asigna imagen automáticamente', async () => {
    const candidate = {
      id: 'c_amb',
      title: 'Batman Action Figure 7 inch',
      brand: 'DC Comics'
    };

    const prodA = normalizeAmazonZincProduct({
      external_product_id: 'B011111111',
      title: 'Batman Action Figure 7 inch DC Comics Model A',
      brand: 'DC Comics',
      image_url: 'https://images-na.ssl-images-amazon.com/images/I/figA.jpg'
    });

    const prodB = normalizeAmazonZincProduct({
      external_product_id: 'B022222222',
      title: 'Batman Action Figure 7 inch DC Comics Model B',
      brand: 'DC Comics',
      image_url: 'https://images-na.ssl-images-amazon.com/images/I/figB.jpg'
    });

    const mockSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      products: [prodA, prodB],
      resolution_source: 'ZINC_LIVE',
      total: 2
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([candidate], 'UY');
    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearch });

    expect(result.resolvedCandidates[0].image_url).toBeNull();
    expect(result.telemetry.ambiguous_matches).toBe(1);
    expect(result.telemetry.images_resolved).toBe(0);
  });

  // TEST 9: external_product_id -> canonical asin
  it('TEST 9: external_product_id se mapea a canonical asin', () => {
    const normalized = normalizeAmazonZincProduct({
      external_product_id: 'B099999999',
      title: 'Test Batman Figure'
    });
    expect(normalized.asin).toBe('B099999999');
    expect(normalized.external_product_id).toBe('B099999999');
  });

  // TEST 10: main_image_url_external -> canonical image_url
  it('TEST 10: main_image_url_external se mapea a canonical image_url si falta image_url', () => {
    const normalized = normalizeAmazonZincProduct({
      external_product_id: 'B099999999',
      title: 'Test Batman Figure',
      main_image_url_external: 'https://images-na.ssl-images-amazon.com/images/I/main.jpg'
    });
    expect(normalized.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/main.jpg');
  });

  // TEST 11: image_url -> canonical image_url
  it('TEST 11: image_url directo se preserva en el normalizador canónico', () => {
    const normalized = normalizeAmazonZincProduct({
      external_product_id: 'B099999999',
      title: 'Test Batman Figure',
      image_url: 'https://images-na.ssl-images-amazon.com/images/I/direct.jpg'
    });
    expect(normalized.image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/direct.jpg');
  });

  // TEST 12: price_usd -> canonical USD price
  it('TEST 12: price_usd y price en centavos se normalizan correctamente a USD', () => {
    const normFromUsd = normalizeAmazonZincProduct({
      external_product_id: 'B01',
      title: 'A',
      price_usd: 25.50
    });
    expect(normFromUsd.price_usd).toBe(25.50);
    expect(normFromUsd.currency).toBe('USD');

    const normFromCents = normalizeAmazonZincProduct({
      external_product_id: 'B02',
      title: 'B',
      price: 2550 // cents
    });
    expect(normFromCents.price_usd).toBe(25.50);
  });

  // TEST 13: Candidate isolation
  it('TEST 13: Aislamiento estricto 1:1 por candidate_id', async () => {
    const mockSearchFn = vi.fn().mockImplementation(async (term: string) => {
      if (term.toLowerCase().includes('joker')) {
        return {
          success: true,
          status: 'SUCCESS',
          products: [normalizeAmazonZincProduct({
            external_product_id: 'B00JOKER01',
            title: 'Funko Pop Joker DC Comics',
            brand: 'Funko',
            image_url: 'https://images-na.ssl-images-amazon.com/images/I/joker.jpg'
          })],
          resolution_source: 'ZINC_LIVE',
          total: 1
        } as AmazonZincSearchResult;
      }
      return {
        success: true,
        status: 'SUCCESS',
        products: [normalizeAmazonZincProduct({
          external_product_id: 'B00BATMAN1',
          title: 'Funko Pop Batman DC Comics',
          brand: 'Funko',
          image_url: 'https://images-na.ssl-images-amazon.com/images/I/batman.jpg'
        })],
        resolution_source: 'ZINC_LIVE',
        total: 1
      } as AmazonZincSearchResult;
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

  // TEST 14: Query dedupe & cache
  it('TEST 14: Deduplicación y cache en memoria evita llamadas redundantes', async () => {
    const mockSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B00COMMON1',
        title: 'Funko Plush Batman Dark Knight',
        brand: 'Funko',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/common.jpg'
      })],
      resolution_source: 'ZINC_LIVE',
      total: 1
    } as AmazonZincSearchResult);

    const candidateA = manualCandidates([
      { id: 'c_1', title: 'Funko Plush Batman Dark Knight Official', brand: 'Funko' }
    ], 'UY')[0];

    const candidateB = manualCandidates([
      { id: 'c_2', title: 'Funko Plush Batman Dark Knight Licensed', brand: 'Funko' }
    ], 'UY')[0];

    const res = await resolveZincProductsForCandidates([candidateA, candidateB], { searchFn: mockSearch });

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(res.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/common.jpg');
    expect(res.resolvedCandidates[1].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/common.jpg');

    const res2 = await resolveZincProductsForCandidates([candidateA], { searchFn: mockSearch });
    expect(mockSearch).toHaveBeenCalledTimes(1); // Cached
    expect(res2.telemetry.cache_hits).toBe(1);
  });

  // TEST 15: Productos para Importar regression
  it('TEST 15: multiSourceSearchService mantiene compatibilidad consumiendo amazonZincSearchService', () => {
    expect(multiSourceSearchService).toBeDefined();
    expect(typeof multiSourceSearchService.searchProducts).toBe('function');
  });

  // TEST 16 & CRITICAL REGRESSION: 11 candidates con 401/403 en producción
  it('TEST 16 & CRITICAL REGRESSION: 11 candidatos con error 401/403 reportan AUTH_ERROR y NO falsa clasificación NO_MATCH', async () => {
    const mock401Search = vi.fn().mockResolvedValue({
      success: false,
      status: 'AUTH_ERROR',
      statusCode: 401,
      products: [],
      resolution_source: null,
      error: 'Invalid or expired token',
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates(
      Array.from({ length: 11 }, (_, i) => ({
        id: `c_${i + 1}`,
        title: `Batman Plush Item ${i + 1}`,
        brand: 'DC Comics'
      })),
      'UY'
    );

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mock401Search });

    // En el bug original: 11 NO_MATCH y 0 errores
    // Con el fix: 11 AUTH_ERROR y 0 NO_MATCH falsos
    expect(result.telemetry.total_candidates).toBe(11);
    expect(result.telemetry.zinc_requests_failed).toBe(11);
    expect(result.telemetry.zinc_auth_errors).toBe(11);
    expect(result.telemetry.no_matches).toBe(0);
    expect(result.telemetry.images_resolved).toBe(0);
    expect(result.telemetry.resolver_errors.length).toBe(11);
    expect(result.telemetry.resolver_errors[0].error_type).toBe('AUTH_ERROR');
  });
});
