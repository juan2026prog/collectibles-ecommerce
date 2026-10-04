/**
 * COLLECTIBLES 2026 — ZINC CANONICAL PRODUCT RESOLVER
 * 
 * Reutiliza el concepto y arquitectura de búsqueda/imágenes de "Productos para Importar".
 * Conecta los candidatos descubiertos (OpenAI) con productos reales de retailers vía Zinc / Edge Functions
 * aplicando matching determinístico estricto, protección de variantes y gobernanza de identidad 1:1.
 * 
 * INVARIANTES:
 * 1. Cero scraping HTML paralelo, cero og:image, cero JSON-LD crawlers.
 * 2. Cero llamadas reales a OpenAI o Zinc en tests (mocks determinísticos).
 * 3. Matching determinístico en 4 niveles: EXACT, STRONG, AMBIGUOUS, NO_MATCH.
 * 4. Protección estricta de variantes (edición, escala, versión).
 * 5. Aislamiento estricto 1:1 de candidatos (cero contaminación cruzada).
 * 6. ASIN puede ser salida además de entrada.
 * 7. Cache en memoria con TTL para evitar consultas duplicadas.
 */

import { supabase } from '../../lib/supabase';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';
import { ProductNormalizationService } from './ProductNormalizationService';
import { ProductMatchingEngine } from './ProductMatchingEngine';

export type ZincResolutionMatchLevel = 'EXACT' | 'STRONG' | 'AMBIGUOUS' | 'NO_MATCH';

export interface ZincResolvedProduct {
  external_product_id: string; // ASIN
  title: string;
  brand?: string;
  image_url: string | null;
  main_image_url_external?: string | null;
  price_usd?: number | null;
  product_url_external?: string | null;
  availability?: string | null;
  stars?: number | null;
  num_reviews?: number | null;
  raw_data?: any;
}

export interface ZincMatchEvaluation {
  level: ZincResolutionMatchLevel;
  confidenceScore: number;
  matchedProduct: ZincResolvedProduct | null;
  reasons: string[];
  variantConflictDetected: boolean;
  variantConflictReason?: string;
}

export interface ZincResolutionResult {
  candidateId: string;
  status: 'RESOLVED' | 'NO_MATCH' | 'AMBIGUOUS' | 'ERROR';
  matchLevel: ZincResolutionMatchLevel;
  resolvedProduct: ZincResolvedProduct | null;
  imageUrl: string | null;
  asin: string | null;
  priceUsd: number | null;
  reasons: string[];
  fromCache: boolean;
}

export interface ZincResolverOptions {
  searchFn?: (query: string) => Promise<ZincResolvedProduct[]>;
  directAsinFn?: (asin: string) => Promise<ZincResolvedProduct | null>;
  ttlMs?: number;
  maxCandidatesPerRun?: number;
}

// In-memory cache for resolved queries and ASINs
interface CacheEntry {
  products: ZincResolvedProduct[];
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
 * 2. STRONG: Brand + Title coincidente sin conflicto de variante (Score >= 0.85)
 * 3. AMBIGUOUS: Múltiples productos muy similares sin diferenciación clara o score marginal (0.70 - 0.84)
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
    const exactMatch = zincProducts.find(p => (p.external_product_id || '').toUpperCase() === candidateAsin);
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
  const candAttrs = {
    brand: candBrand,
    scale: candidate.claims?.scale || candidate.claims?.size,
    variant: candidate.claims?.variant,
    edition: candidate.claims?.edition,
    version: candidate.claims?.version
  };

  // Evaluate each returned product
  const scoredMatches: { product: ZincResolvedProduct; score: number; reasons: string[]; conflict: boolean; conflictReason?: string }[] = [];

  for (const prod of zincProducts) {
    const prodTitle = prod.title || '';
    const prodBrand = prod.brand || '';

    // Check variant conflict with ProductMatchingEngine rules
    const prodAttrs = {
      brand: prodBrand,
      scale: prod.raw_data?._normalized?.scale || prod.raw_data?.scale,
      variant: prod.raw_data?._normalized?.variant || prod.raw_data?.variant,
      edition: prod.raw_data?._normalized?.edition || prod.raw_data?.edition
    };

    const conflict = ProductMatchingEngine.checkVariantConflict(candAttrs, {
      ...prodAttrs,
      canonical_title: prodTitle
    });

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
    if (topMatch.score >= 0.70 && runnerUp.score >= 0.70 && (topMatch.score - runnerUp.score) < 0.05) {
      if (topMatch.product.external_product_id !== runnerUp.product.external_product_id) {
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

  // LEVEL 2 — STRONG MATCH (Score >= 0.82)
  if (topMatch.score >= 0.82) {
    return {
      level: 'STRONG',
      confidenceScore: topMatch.score,
      matchedProduct: topMatch.product,
      reasons: topMatch.reasons,
      variantConflictDetected: false
    };
  }

  // Marginal match (0.70 <= score < 0.82) -> Treat as AMBIGUOUS to protect identity integrity
  if (topMatch.score >= 0.70) {
    return {
      level: 'AMBIGUOUS',
      confidenceScore: topMatch.score,
      matchedProduct: null,
      reasons: ['MARGINAL_SIMILARITY_SCORE_REQUIRES_CONFIRMATION', ...topMatch.reasons],
      variantConflictDetected: false
    };
  }

  // LEVEL 4 — NO_MATCH (Score < 0.70)
  return {
    level: 'NO_MATCH',
    confidenceScore: topMatch.score,
    matchedProduct: null,
    reasons: ['INSUFFICIENT_SIMILARITY', ...topMatch.reasons],
    variantConflictDetected: false
  };
}

/**
 * Realiza búsqueda en Zinc a través de la Edge Function oficial `zinc-search-products`
 * respetando el mismo pipeline de "Productos para Importar".
 */
export async function defaultZincSearch(query: string, maxResults: number = 10): Promise<ZincResolvedProduct[]> {
  try {
    const { data, error } = await supabase.functions.invoke('zinc-search-products', {
      body: { query, max_results: maxResults, page: 1, retailer: 'amazon' }
    });

    if (error || !data) {
      return [];
    }

    const rawList = data.results || data.candidates || [];
    if (!Array.isArray(rawList)) return [];

    return rawList.map((r: any) => ({
      external_product_id: r.product_id || r.external_product_id || '',
      title: r.title || '',
      brand: r.brand || r._normalized?.brand || undefined,
      image_url: r.main_image_url_external || r.image_url || r.image || null,
      main_image_url_external: r.main_image_url_external || r.image_url || null,
      price_usd: r.price !== undefined && r.price !== null ? (r.price > 1000 ? r.price / 100 : r.price) : (r.price_usd ?? null),
      product_url_external: r.product_url_external || (r.product_id ? `https://www.amazon.com/dp/${r.product_id}` : null),
      availability: r.availability || null,
      stars: r.stars || r.rating || null,
      num_reviews: r.num_reviews || r.review_count || null,
      raw_data: r
    }));
  } catch {
    return [];
  }
}

/**
 * Resuelve productos Zinc para un lote de candidatos de Sourcing Intelligence.
 * Garantiza:
 * - Cache con TTL (30 min)
 * - Deduplicación de queries idénticas
 * - Asignación 1:1 a cada candidato por candidate_id
 * - Enriquecimiento de imagen, ASIN y procedencia sin inventar datos
 */
export async function resolveZincProductsForCandidates(
  candidates: SourcingProductCandidate[],
  options: ZincResolverOptions = {}
): Promise<{
  resolvedCandidates: SourcingProductCandidate[];
  telemetry: {
    total_candidates: number;
    exact_matches: number;
    strong_matches: number;
    ambiguous_matches: number;
    no_matches: number;
    images_resolved: number;
    asins_resolved: number;
    cache_hits: number;
    zinc_queries_executed: number;
  };
}> {
  const searchFn = options.searchFn || defaultZincSearch;
  const ttlMs = options.ttlMs || 30 * 60 * 1000;
  const maxCandidates = options.maxCandidatesPerRun || 20;

  const telemetry = {
    total_candidates: candidates.length,
    exact_matches: 0,
    strong_matches: 0,
    ambiguous_matches: 0,
    no_matches: 0,
    images_resolved: 0,
    asins_resolved: 0,
    cache_hits: 0,
    zinc_queries_executed: 0
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

  // Step 2: Fetch Zinc data for unique ASINs and Queries
  const queryResultsMap = new Map<string, ZincResolvedProduct[]>();
  const asinResultsMap = new Map<string, ZincResolvedProduct[]>();

  // Resolve ASIN lookups
  for (const [asin] of asinToCandidateIndices) {
    const cached = asinCache.get(asin);
    if (cached && cached.expiresAt > Date.now()) {
      telemetry.cache_hits++;
      asinResultsMap.set(asin, cached.products);
      continue;
    }

    telemetry.zinc_queries_executed++;
    const products = await searchFn(asin);
    asinCache.set(asin, { products, expiresAt: Date.now() + ttlMs });
    asinResultsMap.set(asin, products);
  }

  // Resolve Text queries
  for (const [q] of queryToCandidateIndices) {
    const cached = queryCache.get(q);
    if (cached && cached.expiresAt > Date.now()) {
      telemetry.cache_hits++;
      queryResultsMap.set(q, cached.products);
      continue;
    }

    telemetry.zinc_queries_executed++;
    const products = await searchFn(q);
    queryCache.set(q, { products, expiresAt: Date.now() + ttlMs });
    queryResultsMap.set(q, products);
  }

  // Step 3: Match and enrich each candidate strictly 1:1
  const updatedCandidates = targetCandidates.map((candidate, idx) => {
    const asin = (candidate.asin || candidate.claims?.asin || '').trim().toUpperCase();
    const candidateQuery = buildZincResolutionQuery(candidate);

    const zincProducts = (asin && asinResultsMap.get(asin)) || queryResultsMap.get(candidateQuery) || [];
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
            source: 'Amazon / Zinc',
            source_url: matched.product_url_external || `https://www.amazon.com/dp/${matched.external_product_id}`,
            observed_at: now,
            verification: 'SOURCE_CORROBORATED',
            method: 'ZINC_PRODUCT_DATA'
          }
        };
      }

      // 2. ASIN Resolution (Output from text search or verified input)
      if (matched.external_product_id && !clone.asin) {
        clone.asin = matched.external_product_id;
        telemetry.asins_resolved++;

        clone.provenance = {
          ...clone.provenance,
          asin: {
            value: matched.external_product_id,
            status: 'CORROBORATED',
            source: 'Amazon / Zinc',
            source_url: matched.product_url_external || `https://www.amazon.com/dp/${matched.external_product_id}`,
            observed_at: now,
            verification: 'SOURCE_CORROBORATED',
            method: 'ZINC_PRODUCT_DATA'
          }
        };
      }

      // 3. Retailer URL & Origin Price if missing
      if (matched.product_url_external && (!clone.retailer_url || clone.retailer_url === '')) {
        clone.retailer_url = matched.product_url_external;
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
            source: 'Amazon / Zinc',
            source_url: matched.product_url_external || `https://www.amazon.com/dp/${matched.external_product_id}`,
            observed_at: now,
            currency: 'USD',
            verification: 'SOURCE_CORROBORATED',
            method: 'ZINC_PRODUCT_DATA'
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
