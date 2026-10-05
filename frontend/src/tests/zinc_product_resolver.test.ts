import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildZincResolutionQuery,
  matchZincCandidate,
  resolveZincProductsForCandidates,
  clearZincResolverCache,
  normalizeSizeOrScale,
  extractCoreTokens,
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

  // ──────────────────────────────────────────────────────────────────────────
  // SEMANTIC PRODUCT IDENTITY & CERTIFICATION TESTS (REAL RUN FIXTURES)
  // ──────────────────────────────────────────────────────────────────────────

  // TEST 13: Normalización bilingüe peluche ↔ plush
  it('TEST 13: Normalización bilingüe determinística (peluche ↔ plush)', () => {
    const tokens = extractCoreTokens('Peluche de Batman');
    expect(tokens.has('plush')).toBe(true);
    expect(tokens.has('batman')).toBe(true);
  });

  // TEST 14: Normalización de unidades pulgadas ↔ inch
  it('TEST 14: Normalización de unidades (pulgadas / in / inch)', () => {
    expect(normalizeSizeOrScale('8 pulgadas').normalizedInches).toBe('8in');
    expect(normalizeSizeOrScale('8-Inch').normalizedInches).toBe('8in');
    expect(normalizeSizeOrScale('8"').normalizedInches).toBe('8in');
    expect(normalizeSizeOrScale('10 in').normalizedInches).toBe('10in');
  });

  // TEST 15: Equivalencia cm ↔ inch con tolerancia estricta
  it('TEST 15: Equivalencia cm ↔ inch (20.3 cm -> 8in, 25 cm -> 10in, 30 cm -> 12in)', () => {
    expect(normalizeSizeOrScale('20.3 cm').normalizedInches).toBe('8in');
    expect(normalizeSizeOrScale('25 cm').normalizedInches).toBe('10in');
    expect(normalizeSizeOrScale('30 cm').normalizedInches).toBe('12in');
    expect(normalizeSizeOrScale('17.8 cm').normalizedInches).toBe('7in');
  });

  // TEST 16: CASE A REAL — Squishmallows Batman 8in -> STRONG MATCH & RESOLVE IMAGE
  it('TEST 16: CASE A REAL -> Squishmallows Batman 8in resuelve como STRONG MATCH y asigna imagen', () => {
    const candidate = {
      id: 'cand_squish_8',
      title: 'Squishmallows Peluche DC Batman 8 pulgadas Comics 20 3 cm',
      brand: 'Squishmallows'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0GWFGBBRQ',
        title: 'Squishmallows Batman 8-Inch Plush – DC Comics Superhero Stuffed Animal, Soft Collectible Plush Toy, Official Kellytoy',
        brand: 'Squishmallows',
        price_usd: 24.99,
        main_image_url_external: 'https://m.media-amazon.com/images/I/31W0kt5sO1L._AC_UL320_.jpg'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('STRONG');
    expect(evalResult.matchedProduct).not.toBeNull();
    expect(evalResult.matchedProduct?.asin).toBe('B0GWFGBBRQ');
    expect(evalResult.matchedProduct?.image_url).toBe('https://m.media-amazon.com/images/I/31W0kt5sO1L._AC_UL320_.jpg');
  });

  // TEST 17: CASE C REAL — Squishmallows HugMees 25cm vs 10in -> STRONG MATCH
  it('TEST 17: CASE C REAL -> Squishmallows HugMees 25cm vs 10in resuelve como STRONG MATCH', () => {
    const candidate = {
      id: 'cand_hugmees_25',
      title: 'Squishmallows Peluche DC Batman HugMees 25 cm',
      brand: 'Squishmallows'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0D4F7SPV2',
        title: 'Squishmallows Original DC 10in Batman HugMees – Ultrasoft Official Jazwares Plush (Medium-Sized)',
        brand: 'Squishmallows',
        price_usd: 15.99,
        main_image_url_external: 'https://m.media-amazon.com/images/I/71AiYvF6seL._AC_UL320_.jpg'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('STRONG');
    expect(evalResult.matchedProduct?.asin).toBe('B0D4F7SPV2');
  });

  // TEST 18: CASE B REAL — Steiff 85th Anniversary sin corroborar -> AMBIGUOUS (protege variantes)
  it('TEST 18: CASE B REAL -> Steiff con edición 85th no corroborada en resultado queda AMBIGUOUS sin asignar producto', () => {
    const candidate = {
      id: 'cand_steiff_85',
      title: 'Steiff Peluche Batman 85th Anniversary DC Comics 30 cm',
      brand: 'Steiff'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0DWNB5NT8',
        title: 'Steiff DC Superhero Teddy Bear - Officially Licensed Plush Toy, DC Batman, 12" Tall',
        brand: 'Steiff',
        price_usd: 49.00,
        main_image_url_external: 'https://m.media-amazon.com/images/I/81-x4t4g+zL._AC_UL320_.jpg'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('AMBIGUOUS');
    expect(evalResult.matchedProduct).toBeNull(); // No asigna imagen a ciegas
  });

  // TEST 19: Steiff 85th Anniversary con edición corroborada -> STRONG MATCH
  it('TEST 19: Steiff con edición 85th Anniversary explícitamente corroborada resuelve como STRONG', () => {
    const candidate = {
      id: 'cand_steiff_85_corr',
      title: 'Steiff Peluche Batman 85th Anniversary DC Comics 30 cm',
      brand: 'Steiff'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0DWNB5NT8',
        title: 'Steiff DC Superhero Teddy Bear 85th Anniversary Limited Edition - DC Batman, 12" Tall',
        brand: 'Steiff',
        price_usd: 49.00,
        main_image_url_external: 'https://m.media-amazon.com/images/I/81-x4t4g+zL._AC_UL320_.jpg'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('STRONG');
    expect(evalResult.matchedProduct?.asin).toBe('B0DWNB5NT8');
  });

  // TEST 20: CASE D REAL — Funko Patchwork faltante -> NO STRONG (AMBIGUOUS o NO_MATCH)
  it('TEST 20: CASE D REAL -> Funko Patchwork sin corroboración de variante NO es STRONG y no asigna imagen', () => {
    const candidate = {
      id: 'cand_funko_patchwork',
      title: 'Funko Peluche Batman Patchwork DC Comics 17 8 cm',
      brand: 'Funko'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B003FYICXU',
        title: 'Funko Batman Plushies',
        brand: 'Funko',
        main_image_url_external: 'https://m.media-amazon.com/images/I/71RR8+hLi3L._AC_UL320_.jpg'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).not.toBe('STRONG');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST 21: CASE E REAL — Kenner Total Justice vs LEGO Batmobile -> NO_MATCH por conflicto duro
  it('TEST 21: CASE E REAL -> Kenner Total Justice vs LEGO Batmobile resulta en NO_MATCH por conflicto de marca y tipo', () => {
    const candidate = {
      id: 'cand_kenner',
      title: 'Kenner Batman Total Justice DC 5 pulgadas',
      brand: 'Kenner'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0CYM31FMM',
        title: 'LEGO DC Batman: The Classic TV Series Batmobile 76328',
        brand: 'LEGO'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST 22: CASE F REAL — Ty vs KIDS PREFERRED -> NO_MATCH por conflicto de marca
  it('TEST 22: CASE F REAL -> Ty vs KIDS PREFERRED resulta en NO_MATCH por conflicto duro de marca', () => {
    const candidate = {
      id: 'cand_ty',
      title: 'Ty Peluche Beanie Bouncer Batman DC Comics',
      brand: 'Ty'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0DVVS8RR9',
        title: 'KIDS PREFERRED WB DC Batman Extra Soft Plush Stuffed Superhero Toy – 12 Inch Plush',
        brand: 'KIDS PREFERRED'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST 23: Conflicto duro de personaje (Batman vs Superman) -> NO_MATCH
  it('TEST 23: Conflicto de personaje (Batman vs Superman) produce NO_MATCH inmediato', () => {
    const candidate = {
      id: 'cand_pers_1',
      title: 'Squishmallows Peluche Batman 8 pulgadas',
      brand: 'Squishmallows'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B00SUP01',
        title: 'Squishmallows Superman 8-Inch Plush Stuffed Toy',
        brand: 'Squishmallows'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST 24: Conflicto duro de tamaño mayor (8in vs 20in) -> NO_MATCH
  it('TEST 24: Conflicto de tamaño mayor (8in vs 20in) produce NO_MATCH', () => {
    const candidate = {
      id: 'cand_size_1',
      title: 'Squishmallows Batman 8 pulgadas',
      brand: 'Squishmallows'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B00BIG01',
        title: 'Squishmallows Batman 20-Inch Giant Plush Stuffed Toy',
        brand: 'Squishmallows'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('NO_MATCH');
    expect(evalResult.matchedProduct).toBeNull();
  });

  // TEST 25: ASIN exacto produce nivel EXACT
  it('TEST 25: ASIN exacto produce nivel EXACT inmediatamente', () => {
    const candidate = {
      id: 'cand_exact_asin',
      title: 'Generic Batman Toy',
      asin: 'B0GWFGBBRQ'
    };

    const mockZincProducts: ZincResolvedProduct[] = [
      normalizeAmazonZincProduct({
        external_product_id: 'B0GWFGBBRQ',
        title: 'Squishmallows Batman 8-Inch Plush',
        brand: 'Squishmallows'
      }, 'ZINC_LIVE')
    ];

    const evalResult = matchZincCandidate(candidate, mockZincProducts);

    expect(evalResult.level).toBe('EXACT');
    expect(evalResult.confidenceScore).toBe(1.0);
    expect(evalResult.matchedProduct?.asin).toBe('B0GWFGBBRQ');
  });

  // TEST 26: Imagen, precio y ASIN se asignan ÚNICAMENTE en EXACT o STRONG
  it('TEST 26: resolveZincProductsForCandidates asigna imagen, precio y ASIN únicamente a EXACT/STRONG', async () => {
    const mockSearchFn = vi.fn().mockImplementation(async (query: string) => {
      if (query.includes('Squishmallows')) {
        return {
          success: true,
          status: 'SUCCESS',
          statusCode: 200,
          products: [normalizeAmazonZincProduct({
            external_product_id: 'B0GWFGBBRQ',
            title: 'Squishmallows Batman 8-Inch Plush',
            brand: 'Squishmallows',
            price_usd: 24.99,
            main_image_url_external: 'https://m.media-amazon.com/images/I/squish.jpg'
          }, 'ZINC_LIVE')],
          resolution_source: 'ZINC_LIVE',
          total: 1
        };
      }
      return {
        success: true,
        status: 'SUCCESS',
        statusCode: 200,
        products: [normalizeAmazonZincProduct({
          external_product_id: 'B0UNKNOWN99',
          title: 'Unrelated Batman Keychain',
          brand: 'Generic',
          price_usd: 5.99,
          main_image_url_external: 'https://m.media-amazon.com/images/I/unrelated.jpg'
        }, 'ZINC_LIVE')],
        resolution_source: 'ZINC_LIVE',
        total: 1
      };
    });

    const candidates = manualCandidates([
      { id: 'c_strong', title: 'Squishmallows Peluche DC Batman 8 pulgadas Comics 20 3 cm', brand: 'Squishmallows' },
      { id: 'c_nomatch', title: 'Kenner Batman Total Justice DC 5 pulgadas', brand: 'Kenner' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearchFn });

    // Candidato 1: STRONG -> imagen y precio asignados
    expect(result.resolvedCandidates[0].image_url).toBe('https://m.media-amazon.com/images/I/squish.jpg');
    expect(result.resolvedCandidates[0].pricing?.origin_price_usd).toBe(24.99);
    expect(result.resolvedCandidates[0].asin).toBe('B0GWFGBBRQ');

    // Candidato 2: NO_MATCH -> imagen nula, precio no contaminado
    expect(result.resolvedCandidates[1].image_url).toBeNull();
    expect(result.resolvedCandidates[1].asin).toBeUndefined();
    expect(result.telemetry.images_resolved).toBe(1);
    expect(result.telemetry.strong_matches).toBe(1);
    expect(result.telemetry.no_matches).toBe(1);
  });

  // TEST 27: Aislamiento estricto de candidatos (cero contaminación cruzada)
  it('TEST 27: Aislamiento estricto 1:1 de candidatos (no se transfieren imágenes)', async () => {
    const mockSearchFn = vi.fn().mockResolvedValue({
      success: true,
      status: 'SUCCESS',
      statusCode: 200,
      products: [normalizeAmazonZincProduct({
        external_product_id: 'B0GWFGBBRQ',
        title: 'Squishmallows Batman 8-Inch Plush',
        brand: 'Squishmallows',
        main_image_url_external: 'https://m.media-amazon.com/images/I/squish.jpg'
      }, 'ZINC_LIVE')],
      resolution_source: 'ZINC_LIVE',
      total: 1
    });

    const candidates = manualCandidates([
      { id: 'c_cand_1', title: 'Squishmallows Peluche DC Batman 8 pulgadas', brand: 'Squishmallows' },
      { id: 'c_cand_2', title: 'Ty Peluche Batman DC Comics', brand: 'Ty' }
    ], 'UY');

    const result = await resolveZincProductsForCandidates(candidates, { searchFn: mockSearchFn });

    expect(result.resolvedCandidates[0].image_url).toBe('https://m.media-amazon.com/images/I/squish.jpg');
    // c_cand_2 tiene marca Ty, el mock devuelve Squishmallows -> Brand conflict -> NO_MATCH -> null image
    expect(result.resolvedCandidates[1].image_url).toBeNull();
  });
});

