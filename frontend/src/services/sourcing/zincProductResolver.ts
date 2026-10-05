/**
 * COLLECTIBLES 2026 — ZINC CANONICAL PRODUCT RESOLVER
 * 
 * Reutiliza el concepto y arquitectura de búsqueda/imágenes de "Productos para Importar".
 * Conecta los candidatos descubiertos (OpenAI) con productos reales de retailers vía la capacidad
 * canónica compartida AmazonZincSearchService.
 * 
 * INVARIANTES:
 * 1. Cero scraping HTML paralelo, cero og:image, cero JSON-LD crawlers.
 * 2. Cero llamadas reales a OpenAI o Zinc en tests (mocks determinísticos).
 * 3. Matching determinístico en 4 niveles: EXACT, STRONG, AMBIGUOUS, NO_MATCH.
 * 4. Protección estricta de variantes (edición, escala, versión).
 * 5. Aislamiento estricto 1:1 de candidatos (cero contaminación cruzada).
 * 6. ASIN puede ser salida además de entrada.
 * 7. Cache en memoria con TTL para evitar consultas duplicadas.
 * 8. NO tragar errores silenciosamente (distingue AUTH_ERROR, PROVIDER_ERROR, etc.).
 * 9. Auth_error o Provider_error jamás se convierten en NO_MATCH.
 * 10. Si el resultado proviene de fallback DB, provenance = IMPORT_CANDIDATE_CACHE; si live = ZINC_PRODUCT_DATA.
 */

import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';
import { ProductNormalizationService } from './ProductNormalizationService';
import { ProductMatchingEngine } from './ProductMatchingEngine';
import {
  amazonZincSearchService,
  normalizeAmazonZincProduct,
  type CanonicalAmazonZincProduct,
  type AmazonZincSearchResult,
  type AmazonZincResolutionSource,
  type AmazonZincSearchStatus
} from './amazonZincSearchService';

export type ZincResolutionMatchLevel = 'EXACT' | 'STRONG' | 'AMBIGUOUS' | 'NO_MATCH';

export interface ZincResolvedProduct extends CanonicalAmazonZincProduct {}

export interface ZincMatchEvaluation {
  level: ZincResolutionMatchLevel;
  confidenceScore: number;
  matchedProduct: ZincResolvedProduct | null;
  reasons: string[];
  variantConflictDetected: boolean;
  variantConflictReason?: string;
}

export interface ZincResolutionTelemetry {
  total_candidates: number;
  zinc_requests_attempted: number;
  zinc_requests_succeeded: number;
  zinc_requests_failed: number;
  zinc_auth_errors: number;
  zinc_provider_errors: number;
  zinc_no_results: number;
  zinc_live_results: number;
  zinc_fallback_results: number;
  cache_hits: number;
  exact_matches: number;
  strong_matches: number;
  ambiguous_matches: number;
  no_matches: number;
  images_available: number;
  images_resolved: number;
  asins_resolved: number;
  resolver_errors: Array<{
    candidate_id?: string;
    query: string;
    error_type: AmazonZincSearchStatus;
    status_code?: number;
    error_message?: string;
  }>;
}

export interface ZincResolverOptions {
  searchFn?: (query: string) => Promise<AmazonZincSearchResult>;
  ttlMs?: number;
  maxCandidatesPerRun?: number;
}

// In-memory cache for resolved queries and ASINs
interface CacheEntry {
  result: AmazonZincSearchResult;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry>();
const asinCache = new Map<string, CacheEntry>();

/**
 * Limpia y normaliza texto eliminando puntuación superflua y colapsando espacios.
 */
function cleanText(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construye una query limpia y concisa para Zinc a partir del candidato.
 * Extrae [brand, title, franchise, variant, scale] y elimina tokens duplicados.
 */
export function buildZincResolutionQuery(candidate: {
  title?: string;
  name?: string;
  brand?: string;
  franchise?: string;
  line?: string;
  character?: string;
  claims?: any;
}): string {
  const brand = (candidate.brand && candidate.brand !== 'No verificado' && candidate.brand !== 'Collectibles')
    ? candidate.brand.trim()
    : '';

  const rawTitle = (candidate.title || candidate.name || '').trim();
  const claims = candidate.claims || {};
  const franchise = (candidate.franchise || claims.franchise || '').trim();
  const character = (candidate.character || claims.character || '').trim();
  const variant = (claims.variant || claims.edition || claims.version || '').trim();
  const scale = (claims.scale || claims.size || '').trim();

  // Tokenize and deduplicate components while preserving natural order
  const seenTokens = new Set<string>();
  const outputTokens: string[] = [];

  const addTokens = (str: string) => {
    if (!str) return;
    const words = cleanText(str).split(' ').filter(w => w.length > 0);
    for (const w of words) {
      const lower = w.toLowerCase();
      // Skip generic noise words
      if (['unverified', 'official', 'licensed', 'merchandise'].includes(lower)) continue;
      if (!seenTokens.has(lower)) {
        seenTokens.add(lower);
        outputTokens.push(w);
      }
    }
  };

  // Add brand first if not already starting the title
  if (brand && !cleanText(rawTitle).toLowerCase().startsWith(cleanText(brand).toLowerCase())) {
    addTokens(brand);
  }

  // Add main title
  addTokens(rawTitle);

  // Add character or franchise if not present in tokens
  if (character) addTokens(character);
  if (franchise) addTokens(franchise);

  // Add specific variant/edition if not already in title
  if (variant) addTokens(variant);
  if (scale) addTokens(scale);

  // Cap query at 10 most relevant tokens to keep search sharp
  return outputTokens.slice(0, 10).join(' ');
}

/**
 * Evalúa determinísticamente si un producto Zinc coincide con el candidato.
 * Jerarquía:
 * 1. EXACT: ASIN idéntico
 * 2. STRONG: Brand + Title coincidente sin conflicto de variante (Score >= 0.82)
 * 3. AMBIGUOUS: Múltiples productos muy similares sin diferenciación clara o score marginal (0.70 - 0.81)
 * 4. NO_MATCH: Score < 0.70 o conflicto directo de variante
 */
export function matchZincCandidate(
  candidate: {
    id?: string;
    title?: string;
    brand?: string;
    asin?: string;
    claims?: any;
  },
  zincProducts: ZincResolvedProduct[]
): ZincMatchEvaluation {
  if (!zincProducts || zincProducts.length === 0) {
    return {
      level: 'NO_MATCH',
      confidenceScore: 0,
      matchedProduct: null,
      reasons: ['NO_ZINC_PRODUCTS_RETURNED'],
      variantConflictDetected: false
    };
  }

  const candidateAsin = (candidate.asin || candidate.claims?.asin || '').trim().toUpperCase();

  // LEVEL 1 — EXACT ASIN MATCH
  if (candidateAsin && /^[A-Z0-9]{10}$/.test(candidateAsin)) {
    const exactMatch = zincProducts.find(p => (p.asin || p.external_product_id || '').toUpperCase() === candidateAsin);
    if (exactMatch) {
      return {
        level: 'EXACT',
        confidenceScore: 1.0,
        matchedProduct: exactMatch,
        reasons: [`EXACT_ASIN_MATCH:${candidateAsin}`],
        variantConflictDetected: false
      };
    }
  }

  const candTitle = (candidate.title || '').trim();
  const candBrand = (candidate.brand && candidate.brand !== 'No verificado' ? candidate.brand : '').trim();
  const candAttrs: any = {
    brand: candBrand
  };
  if (candidate.claims?.scale || candidate.claims?.size) candAttrs.scale = candidate.claims?.scale || candidate.claims?.size;
  if (candidate.claims?.variant) candAttrs.variant = candidate.claims?.variant;
  if (candidate.claims?.edition) candAttrs.edition = candidate.claims?.edition;
  if (candidate.claims?.version) candAttrs.version = candidate.claims?.version;

  // Evaluate each returned product
  const scoredMatches: { product: ZincResolvedProduct; score: number; reasons: string[]; conflict: boolean; conflictReason?: string }[] = [];

  for (const prod of zincProducts) {
    const prodTitle = prod.title || '';
    const prodBrand = prod.brand || '';

    // Check variant conflict with ProductMatchingEngine rules
    const prodAttrs: any = {
      brand: prodBrand
    };
    if (prod.raw_data?._normalized?.scale || prod.raw_data?.scale) prodAttrs.scale = prod.raw_data?._normalized?.scale || prod.raw_data?.scale;
    if (prod.raw_data?._normalized?.variant || prod.raw_data?.variant) prodAttrs.variant = prod.raw_data?._normalized?.variant || prod.raw_data?.variant;
    if (prod.raw_data?._normalized?.edition || prod.raw_data?.edition) prodAttrs.edition = prod.raw_data?._normalized?.edition || prod.raw_data?.edition;

    // Check edition conflict ONLY when explicit edition claims or conflicting edition keywords exist
    let conflict = { hasConflict: false, reason: undefined as string | undefined };
    if (candAttrs.edition || prodAttrs.edition || candAttrs.scale || prodAttrs.scale || candAttrs.variant || prodAttrs.variant) {
      conflict = ProductMatchingEngine.checkVariantConflict(candAttrs, {
        ...prodAttrs,
        canonical_title: prodTitle
      });
    }

    if (conflict.hasConflict) {
      scoredMatches.push({
        product: prod,
        score: 0,
        reasons: [`VARIANT_CONFLICT:${conflict.reason}`],
        conflict: true,
        conflictReason: conflict.reason
      });
      continue;
    }

    // Similarity calculation
    const candNormWords = cleanText(candTitle).toLowerCase().split(' ').filter(w => w.length > 2);
    const prodNormWords = cleanText(prodTitle).toLowerCase().split(' ').filter(w => w.length > 2);

    if (candNormWords.length === 0 || prodNormWords.length === 0) {
      scoredMatches.push({ product: prod, score: 0, reasons: ['EMPTY_TOKENS'], conflict: false });
      continue;
    }

    const candWordSet = new Set(candNormWords);
    const prodWordSet = new Set(prodNormWords);

    let intersection = 0;
    candWordSet.forEach(w => {
      if (prodWordSet.has(w)) intersection++;
    });

    const union = new Set([...candWordSet, ...prodWordSet]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // Brand alignment bonus
    let brandBonus = 0;
    if (candBrand && prodBrand) {
      const b1 = cleanText(candBrand).toLowerCase();
      const b2 = cleanText(prodBrand).toLowerCase();
      if (b1 === b2 || b1.includes(b2) || b2.includes(b1)) {
        brandBonus = 0.15;
      }
    } else if (candBrand && cleanText(prodTitle).toLowerCase().includes(cleanText(candBrand).toLowerCase())) {
      brandBonus = 0.10;
    }

    const finalScore = Math.min(1.0, Number((jaccard + brandBonus).toFixed(2)));
    scoredMatches.push({
      product: prod,
      score: finalScore,
      reasons: [`JACCARD:${(jaccard * 100).toFixed(0)}%`, `BRAND_BONUS:${brandBonus}`],
      conflict: false
    });
  }

  // Filter non-conflicting candidates and sort by score descending
  const validMatches = scoredMatches.filter(m => !m.conflict).sort((a, b) => b.score - a.score);

  if (validMatches.length === 0) {
    const firstConflict = scoredMatches.find(m => m.conflict);
    return {
      level: 'NO_MATCH',
      confidenceScore: 0,
      matchedProduct: null,
      reasons: firstConflict ? [firstConflict.reasons[0]] : ['NO_VALID_ZINC_MATCH'],
      variantConflictDetected: Boolean(firstConflict),
      variantConflictReason: firstConflict?.conflictReason
    };
  }

  const topMatch = validMatches[0];

  // Check for ambiguity: if runner up is very close in score (delta < 0.05) and has distinct ASIN
  if (validMatches.length > 1) {
    const runnerUp = validMatches[1];
    if (topMatch.score >= 0.65 && runnerUp.score >= 0.65 && (topMatch.score - runnerUp.score) < 0.05) {
      if ((topMatch.product.asin || topMatch.product.external_product_id) !== (runnerUp.product.asin || runnerUp.product.external_product_id)) {
        return {
          level: 'AMBIGUOUS',
          confidenceScore: topMatch.score,
          matchedProduct: null, // Ambiguous match never assigns image/asin
          reasons: ['MULTIPLE_SIMILAR_ZINC_MATCHES_DETECTED', `DELTA:${(topMatch.score - runnerUp.score).toFixed(2)}`],
          variantConflictDetected: false
        };
      }
    }
  }

  // LEVEL 2 — STRONG MATCH (Score >= 0.78)
  if (topMatch.score >= 0.78) {
    return {
      level: 'STRONG',
      confidenceScore: topMatch.score,
      matchedProduct: topMatch.product,
      reasons: topMatch.reasons,
      variantConflictDetected: false
    };
  }

  // Marginal match (0.65 <= score < 0.78) -> Treat as AMBIGUOUS to protect identity integrity
  if (topMatch.score >= 0.65) {
    return {
      level: 'AMBIGUOUS',
      confidenceScore: topMatch.score,
      matchedProduct: null,
      reasons: ['MARGINAL_SIMILARITY_SCORE_REQUIRES_CONFIRMATION', ...topMatch.reasons],
      variantConflictDetected: false
    };
  }

  // LEVEL 4 — NO_MATCH (Score < 0.65)
  return {
    level: 'NO_MATCH',
    confidenceScore: topMatch.score,
    matchedProduct: null,
    reasons: ['INSUFFICIENT_SIMILARITY', ...topMatch.reasons],
    variantConflictDetected: false
  };
}

/**
 * Resuelve productos Zinc para un lote de candidatos de Sourcing Intelligence
 * usando la capacidad canónica compartida con Productos para Importar.
 */
export async function resolveZincProductsForCandidates(
  candidates: SourcingProductCandidate[],
  options: ZincResolverOptions = {}
): Promise<{
  resolvedCandidates: SourcingProductCandidate[];
  telemetry: ZincResolutionTelemetry;
}> {
  const searchFn = options.searchFn || (q => amazonZincSearchService.search(q, { maxResults: 10, allowFallback: true }));
  const ttlMs = options.ttlMs || 30 * 60 * 1000;
  const maxCandidates = options.maxCandidatesPerRun || 20;

  const telemetry: ZincResolutionTelemetry = {
    total_candidates: candidates.length,
    zinc_requests_attempted: 0,
    zinc_requests_succeeded: 0,
    zinc_requests_failed: 0,
    zinc_auth_errors: 0,
    zinc_provider_errors: 0,
    zinc_no_results: 0,
    zinc_live_results: 0,
    zinc_fallback_results: 0,
    cache_hits: 0,
    exact_matches: 0,
    strong_matches: 0,
    ambiguous_matches: 0,
    no_matches: 0,
    images_available: 0,
    images_resolved: 0,
    asins_resolved: 0,
    resolver_errors: []
  };

  const targetCandidates = candidates.slice(0, maxCandidates);
  const now = new Date().toISOString();

  // Step 1: Group queries to deduplicate network calls
  const queryToCandidateIndices = new Map<string, number[]>();
  const asinToCandidateIndices = new Map<string, number[]>();

  targetCandidates.forEach((c, idx) => {
    const asin = (c.asin || c.claims?.asin || '').trim().toUpperCase();
    if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
      const existing = asinToCandidateIndices.get(asin) || [];
      existing.push(idx);
      asinToCandidateIndices.set(asin, existing);
    } else {
      const q = buildZincResolutionQuery(c);
      if (q) {
        const existing = queryToCandidateIndices.get(q) || [];
        existing.push(idx);
        queryToCandidateIndices.set(q, existing);
      }
    }
  });

  // Step 2: Fetch Zinc data for unique ASINs and Queries via the canonical search service
  const queryResultsMap = new Map<string, AmazonZincSearchResult>();
  const asinResultsMap = new Map<string, AmazonZincSearchResult>();

  const executeSearch = async (term: string): Promise<AmazonZincSearchResult> => {
    telemetry.zinc_requests_attempted++;
    try {
      const res = await searchFn(term);
      if (res.success) {
        telemetry.zinc_requests_succeeded++;
        if (res.resolution_source === 'ZINC_LIVE') {
          telemetry.zinc_live_results += res.products.length;
        } else if (res.resolution_source === 'IMPORT_CANDIDATE_CACHE') {
          telemetry.zinc_fallback_results += res.products.length;
        }
        if (res.products.length === 0) {
          telemetry.zinc_no_results++;
        }
      } else {
        telemetry.zinc_requests_failed++;
        if (res.status === 'AUTH_ERROR') {
          telemetry.zinc_auth_errors++;
        } else {
          telemetry.zinc_provider_errors++;
        }
      }
      return res;
    } catch (err: any) {
      telemetry.zinc_requests_failed++;
      telemetry.zinc_provider_errors++;
      return {
        success: false,
        status: 'NETWORK_ERROR',
        products: [],
        resolution_source: null,
        error: err.message,
        total: 0
      };
    }
  };

  // Resolve ASIN lookups
  for (const [asin] of asinToCandidateIndices) {
    const cached = asinCache.get(asin);
    if (cached && cached.expiresAt > Date.now()) {
      telemetry.cache_hits++;
      asinResultsMap.set(asin, cached.result);
      continue;
    }

    const searchRes = await executeSearch(asin);
    asinCache.set(asin, { result: searchRes, expiresAt: Date.now() + ttlMs });
    asinResultsMap.set(asin, searchRes);
  }

  // Resolve Text queries
  for (const [q] of queryToCandidateIndices) {
    const cached = queryCache.get(q);
    if (cached && cached.expiresAt > Date.now()) {
      telemetry.cache_hits++;
      queryResultsMap.set(q, cached.result);
      continue;
    }

    const searchRes = await executeSearch(q);
    queryCache.set(q, { result: searchRes, expiresAt: Date.now() + ttlMs });
    queryResultsMap.set(q, searchRes);
  }

  // Step 3: Match and enrich each candidate strictly 1:1
  const updatedCandidates = targetCandidates.map((candidate) => {
    const asin = (candidate.asin || candidate.claims?.asin || '').trim().toUpperCase();
    const candidateQuery = buildZincResolutionQuery(candidate);

    const searchRes = (asin && asinResultsMap.get(asin)) || queryResultsMap.get(candidateQuery);
    const zincProducts = searchRes?.products || [];
    const resolutionSource = searchRes?.resolution_source;

    // Track available images returned by provider
    const prodsWithImage = zincProducts.filter(p => Boolean(p.image_url));
    telemetry.images_available += prodsWithImage.length;

    // REGLA CRÍTICA: Si el provider falló con AUTH_ERROR o PROVIDER_ERROR sin fallback,
    // NO clasificar falsamente como NO_MATCH.
    if (searchRes && !searchRes.success && zincProducts.length === 0) {
      telemetry.resolver_errors.push({
        candidate_id: candidate.id,
        query: candidateQuery || asin,
        error_type: searchRes.status,
        status_code: searchRes.statusCode,
        error_message: searchRes.error
      });

      const clone: SourcingProductCandidate = { ...candidate };
      // Preservar honestamente que no se resolvió por error de provider/auth
      if (!clone.image_url || clone.provenance?.image?.status === 'UNKNOWN') {
        clone.image_url = null;
        clone.gallery_images = [];
      }
      return clone;
    }

    const evaluation = matchZincCandidate(candidate, zincProducts);
    const clone: SourcingProductCandidate = { ...candidate };

    if (evaluation.level === 'EXACT') {
      telemetry.exact_matches++;
    } else if (evaluation.level === 'STRONG') {
      telemetry.strong_matches++;
    } else if (evaluation.level === 'AMBIGUOUS') {
      telemetry.ambiguous_matches++;
    } else {
      telemetry.no_matches++;
    }

    // Apply resolved product data ONLY on EXACT or STRONG match
    if ((evaluation.level === 'EXACT' || evaluation.level === 'STRONG') && evaluation.matchedProduct) {
      const matched = evaluation.matchedProduct;
      const isFallback = resolutionSource === 'IMPORT_CANDIDATE_CACHE' || matched.resolution_source === 'IMPORT_CANDIDATE_CACHE';
      const provenanceMethod = isFallback ? 'IMPORT_CANDIDATE_CACHE' : 'ZINC_PRODUCT_DATA';
      const provenanceSource = isFallback ? 'Amazon / Collectibles DB Cache' : 'Amazon / Zinc';

      // 1. Image Resolution (Zinc product image)
      if (matched.image_url) {
        clone.image_url = matched.image_url;
        clone.gallery_images = [matched.image_url];
        telemetry.images_resolved++;

        // Add or upgrade image provenance
        clone.provenance = {
          ...clone.provenance,
          image: {
            value: matched.image_url,
            status: 'CORROBORATED',
            source: provenanceSource,
            source_url: matched.product_url || `https://www.amazon.com/dp/${matched.asin}`,
            observed_at: now,
            verification: 'SOURCE_CORROBORATED',
            method: provenanceMethod
          }
        };
      }

      // 2. ASIN Resolution (Output from text search or verified input)
      if (matched.asin && !clone.asin) {
        clone.asin = matched.asin;
        telemetry.asins_resolved++;

        clone.provenance = {
          ...clone.provenance,
          asin: {
            value: matched.asin,
            status: 'CORROBORATED',
            source: provenanceSource,
            source_url: matched.product_url || `https://www.amazon.com/dp/${matched.asin}`,
            observed_at: now,
            verification: 'SOURCE_CORROBORATED',
            method: provenanceMethod
          }
        };
      }

      // 3. Retailer URL & Origin Price if missing
      if (matched.product_url && (!clone.retailer_url || clone.retailer_url === '')) {
        clone.retailer_url = matched.product_url;
      }

      if (matched.price_usd && clone.pricing && (!clone.pricing.origin_price_usd || clone.pricing.origin_price_usd === null)) {
        clone.pricing = {
          ...clone.pricing,
          origin_price_usd: matched.price_usd,
          amazon_price_usd: matched.price_usd
        };

        clone.provenance = {
          ...clone.provenance,
          origin_price: {
            value: matched.price_usd,
            status: 'CORROBORATED',
            source: provenanceSource,
            source_url: matched.product_url || `https://www.amazon.com/dp/${matched.asin}`,
            observed_at: now,
            currency: 'USD',
            verification: 'SOURCE_CORROBORATED',
            method: provenanceMethod
          }
        };
      }
    } else {
      // In AMBIGUOUS or NO_MATCH, keep image null unless already corroborating from another trusted source
      if (!clone.image_url || clone.provenance?.image?.status === 'UNKNOWN') {
        clone.image_url = null;
        clone.gallery_images = [];
      }
    }

    return clone;
  });

  return {
    resolvedCandidates: updatedCandidates,
    telemetry
  };
}

/**
 * Export clear caches for testing.
 */
export function clearZincResolverCache(): void {
  queryCache.clear();
  asinCache.clear();
}
