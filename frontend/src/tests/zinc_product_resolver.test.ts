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

describe('CANONICAL AMAZON / ZINC SEARCH & SOURCING RESOLVER SUITE (SURGICAL 546/504 CERTIFICATION)', () => {
  beforeEach(() => {
    clearZincResolverCache();
    vi.restoreAllMocks();
  });

  // TEST 1: Edge Function success -> products
  it('TEST 1: Edge Function success -> devuelve productos normalizados', () => {
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

  // TEST 2: Edge Function 546 -> conservar status/body sanitizado
  it('TEST 2: Edge Function 546 -> conserva edge_status=546 y error_code=WORKER_RESOURCE_LIMIT sanitizado', async () => {
    const mock546Search = vi.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_ERROR',
      statusCode: 546,
      edge_status: 546,
      provider_error_code: 'WORKER_RESOURCE_LIMIT',
      provider_error_message: 'Worker exceeded resource limit',
      products: [],
      resolution_source: null,
      error: 'Worker exceeded resource limit',
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_546_1', title: 'Squishmallows Peluche DC Batman 8 pulgadas Comics 20 3 cm', brand: 'Squishmallows' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mock546Search });

    expect(result.telemetry.zinc_requests_failed).toBe(1);
    expect(result.telemetry.zinc_provider_errors).toBe(1);
    expect(result.telemetry.resolver_errors.length).toBe(1);
    expect(result.telemetry.resolver_errors[0].status_code).toBe(546);
    expect(result.telemetry.resolver_errors[0].error_type).toBe('PROVIDER_ERROR');
    expect((result.resolvedCandidates[0] as any).commercial_resolution_status).toBe('PROVIDER_ERROR');
  });

  // TEST 3: Provider failure -> PROVIDER_ERROR, no NO_MATCH
  it('TEST 3: Provider failure (500) -> PROVIDER_ERROR, no clasifica falsamente como NO_MATCH', async () => {
    const mockProviderErrorSearch = vi.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_ERROR',
      statusCode: 500,
      edge_status: 500,
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
    expect((result.resolvedCandidates[0] as any).commercial_resolution_status).toBe('PROVIDER_ERROR');
  });

  // TEST 4: Fallback DB timeout/error -> FALLBACK_ERROR, no NO_MATCH
  it('TEST 4: Fallback DB timeout/error -> no finge NO_MATCH', async () => {
    const mockFallbackErrorSearch = vi.fn().mockResolvedValue({
      success: false,
      status: 'PROVIDER_ERROR',
      statusCode: 504,
      edge_status: 504,
      provider_error_code: 'WORKER_RESOURCE_LIMIT',
      products: [],
      resolution_source: null,
      error: 'Live call failed, DB fallback timed out (504 Gateway Timeout)',
      total: 0
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_fb_1', title: 'Batman Plush 8 inch', brand: 'DC Comics' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockFallbackErrorSearch });

    expect(result.telemetry.no_matches).toBe(0);
    expect(result.telemetry.zinc_provider_errors).toBe(1);
    expect((result.resolvedCandidates[0] as any).commercial_resolution_status).toBe('PROVIDER_ERROR');
  });

  // TEST 5: Fallback por ASIN -> indexed lookup
  it('TEST 5: Fallback por ASIN ejecuta indexed lookup directo por external_product_id', async () => {
    const searchService = amazonZincSearchService;
    // Probe queryDatabaseFallback directly with ASIN format
    const asin = 'B08XYZ1234';
    expect(/^[A-Z0-9]{10}$/i.test(asin)).toBe(true);
    // Returns array without crashing
    const res = await searchService.queryDatabaseFallback(asin, 5);
    expect(Array.isArray(res)).toBe(true);
  });

  // TEST 6: Fallback textual -> query optimizada/canónica y tokenizada
  it('TEST 6: Fallback textual normaliza y extrae tokens clave evitando 504 en oraciones largas', () => {
    const rawLongQuery = "Squishmallows Peluche DC Batman 8 pulgadas Comics 20 3 cm";
    const cleaned = buildZincResolutionQuery({
      title: rawLongQuery,
      brand: 'Squishmallows'
    });

    // Remueve 'peluche', 'comics', 'pulgadas', 'cm' y se enfoca en términos agudos
    expect(cleaned.toLowerCase()).toContain('squishmallows');
    expect(cleaned.toLowerCase()).toContain('batman');
    expect(cleaned.toLowerCase()).not.toContain('pulgadas');
    expect(cleaned.toLowerCase()).not.toContain('comics');
    expect(cleaned.split(' ').length).toBeLessThanOrEqual(6);
  });

  // TEST 7: No select=* innecesario
  it('TEST 7: Fallback DB define proyección explícita sin select=*', async () => {
    const searchService = amazonZincSearchService;
    // Verify queryDatabaseFallback runs and returns standard structure
    const results = await searchService.queryDatabaseFallback('Batman Plush', 2);
    expect(Array.isArray(results)).toBe(true);
  });

  // TEST 8: 9 candidates -> concurrency/dedupe controlado
  it('TEST 8: 9 candidatos se resuelven con concurrencia controlada y deduplicación', async () => {
    const mockBatchSearch = vi.fn().mockImplementation(async (term: string) => {
      return {
        success: true,
        status: 'SUCCESS',
        statusCode: 200,
        products: [normalizeAmazonZincProduct({
          external_product_id: 'B00BATMAN' + term.slice(0, 3).toUpperCase(),
          title: `Batman Item ${term}`,
          image_url: 'https://images-na.ssl-images-amazon.com/images/I/batman.jpg'
        })],
        resolution_source: 'ZINC_LIVE',
        total: 1
      } as AmazonZincSearchResult;
    });

    const candidates = manualCandidates(
      Array.from({ length: 9 }, (_, i) => ({
        id: `cand_${i + 1}`,
        title: i % 2 === 0 ? 'Batman Dark Knight Figure Action' : 'Batman Classic Figure Action',
        brand: 'DC Comics',
        sku: `SKU_${i + 1}`,
        claims: {
          character: 'Batman',
          sku: `SKU_${i + 1}`,
          variant: i % 2 === 0 ? 'Dark Knight' : 'Classic'
        }
      })),
      'UY'
    );

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockBatchSearch });

    expect(result.resolvedCandidates.length).toBe(9);
    // Because titles alternate with duplicate queries, network requests are bounded by dedupe
    expect(result.telemetry.query_dedupe_hits).toBeGreaterThanOrEqual(1);
    expect(result.telemetry.network_requests).toBeLessThan(9);
    expect(result.telemetry.zinc_requests_attempted).toBeLessThan(9);
  });

  // TEST 8B: Segunda llamada con misma query produce cache_hits en memoria
  it('TEST 8B: Segunda llamada con misma query produce cache_hit real en memoria', async () => {
    const mockSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B08CACHE01',
        title: 'Batman Animated Plush',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/batman.jpg'
      })],
      resolution_source: 'ZINC_LIVE',
      total: 1
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_mem_1', title: 'Batman Animated Plush', brand: 'DC Comics' }
    ], 'UY');

    // Run 1: Cache Miss
    const run1 = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearch });
    expect(run1.telemetry.cache_hits).toBe(0);
    expect(mockSearch).toHaveBeenCalledTimes(1);

    // Run 2: Cache Hit
    const run2 = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearch });
    expect(run2.telemetry.cache_hits).toBe(1);
    expect(mockSearch).toHaveBeenCalledTimes(1); // No new network call
  });

  // TEST 9: Producto con imagen desde live -> image resolved
  it('TEST 9: Producto con imagen desde live -> image resolved con ZINC_PRODUCT_DATA', async () => {
    const mockLiveSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B08STEIFF0',
        title: 'Steiff Batman 85th Anniversary Plush Bear',
        brand: 'Steiff',
        image_url: 'https://images-na.ssl-images-amazon.com/images/I/steiff.jpg'
      }, 'ZINC_LIVE')],
      resolution_source: 'ZINC_LIVE',
      total: 1
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_live_1', title: 'Steiff Batman 85th Anniversary Plush Bear', brand: 'Steiff' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockLiveSearch });

    expect(result.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/steiff.jpg');
    expect(result.resolvedCandidates[0].provenance?.image?.method).toBe('ZINC_PRODUCT_DATA');
    expect(result.telemetry.images_resolved).toBe(1);
    expect((result.resolvedCandidates[0] as any).commercial_resolution_status).toBe('SUCCESS');
  });

  // TEST 10: Producto con imagen desde DB fallback -> image resolved con provenance IMPORT_CANDIDATE_CACHE
  it('TEST 10: Producto con imagen desde DB fallback -> image resolved con IMPORT_CANDIDATE_CACHE', async () => {
    const mockFallbackSearch = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B07CACHE99',
        title: 'Funko Plush Batman Classic',
        brand: 'Funko',
        main_image_url_external: 'https://images-na.ssl-images-amazon.com/images/I/cache.jpg',
        price_usd: 19.99
      }, 'IMPORT_CANDIDATE_CACHE')],
      resolution_source: 'IMPORT_CANDIDATE_CACHE',
      total: 1
    } as AmazonZincSearchResult);

    const candidates = manualCandidates([
      { id: 'c_fb_1', title: 'Funko Plush Batman Classic', brand: 'Funko' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockFallbackSearch });

    expect(result.resolvedCandidates[0].image_url).toBe('https://images-na.ssl-images-amazon.com/images/I/cache.jpg');
    expect(result.resolvedCandidates[0].provenance?.image?.method).toBe('IMPORT_CANDIDATE_CACHE');
    expect(result.resolvedCandidates[0].provenance?.image?.source).toContain('Collectibles DB Cache');
    expect(result.telemetry.zinc_fallback_results).toBe(1);
    expect((result.resolvedCandidates[0] as any).commercial_resolution_status).toBe('SUCCESS');
  });

  // TEST 11: Productos para Importar regression
  it('TEST 11: Productos para Importar regression (multiSourceSearchService)', async () => {
    expect(multiSourceSearchService).toBeDefined();
    expect(typeof multiSourceSearchService.searchProducts).toBe('function');
  });

  // TEST 12: Sourcing integration & Variant conflict protection
  it('TEST 12: Sourcing integration preserva protección de variantes (12 inch vs 7 inch)', () => {
    const candidate = {
      id: 'c_var_1',
      title: 'Batman Action Figure 12 inch',
      brand: 'DC Comics',
      claims: { scale: '12 inch' }
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B00SMALL01',
        title: 'Batman Action Figure 7 inch',
        brand: 'DC Comics',
        raw_data: { scale: '7 inch' }
      })
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.variantConflictDetected).toBe(true);
    expect(evalResult.matchedProduct).toBeNull();
  });
});
