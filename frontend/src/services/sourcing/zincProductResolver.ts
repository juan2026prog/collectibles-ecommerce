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
  query_dedupe_hits: number;
  network_requests: number;
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
      // Skip generic noise words, redundancy, and local/dimension duplication
      if (['unverified', 'official', 'licensed', 'merchandise', 'peluche', 'plush', 'comics', 'comic', 'cm', 'pulgadas'].includes(lower)) continue;
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

  // Cap query at 6 most relevant tokens to keep search sharp
  return outputTokens.slice(0, 6).join(' ');
}

/**
 * Evalúa determinísticamente si un producto Zinc coincide con el candidato.
 * Jerarquía:
 * 1. EXACT: ASIN idéntico
 * 2. STRONG: Brand + Title coincidente sin conflicto de variante (Score >= 0.82)
 * 3. AMBIGUOUS: Múltiples productos muy similares sin diferenciación clara o score marginal (0.70 - 0.81)
 * 4. NO_MATCH: Score < 0.70 o conflicto directo de variante
 */
/**
 * Diccionario de normalización bilingüe determinístico para atributos y tipos de producto.
 */
const BILINGUAL_TOKEN_MAP: Record<string, string> = {
  'peluche': 'plush',
  'peluches': 'plush',
  'pulgada': 'inch',
  'pulgadas': 'inch',
  'pulg': 'inch',
  'figura': 'figure',
  'figuras': 'figure',
  'estatua': 'statue',
  'estatuas': 'statue',
  'muñeco': 'doll',
  'muñecos': 'doll',
  'edicion': 'edition',
  'edición': 'edition',
  'aniversario': 'anniversary',
  'estandar': 'standard',
  'estándar': 'standard',
  'clasico': 'classic',
  'clásico': 'classic'
};

/**
 * Normaliza y extrae especificación de tamaño/escala en pulgadas normalizadas (ej: '8in', '10in', '12in').
 * Convierte de forma determinística equivalencias comunes de cm a pulgadas cuando la correspondencia es inequívoca:
 * 20.3 cm / 20 cm -> 8in
 * 25 cm -> 10in
 * 30 cm / 30.5 cm -> 12in
 * 17.8 cm / 18 cm -> 7in
 * 12.7 cm / 13 cm -> 5in
 */
export function normalizeSizeOrScale(text: string): { normalizedInches?: string; rawValue: string } {
  if (!text) return { rawValue: '' };
  const raw = text.trim();
  const lower = raw.toLowerCase()
    .replace(/["']/g, ' inch ')
    .replace(/-/g, ' ');

  // 1. Detección directa de pulgadas: '8 pulgadas', '8-inch', '8 in', '8inch', '8"'
  const inchMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:inch|inches|pulgada|pulgadas|in)\b/);
  if (inchMatch) {
    const val = parseFloat(inchMatch[1]);
    const rounded = Math.round(val);
    return { normalizedInches: `${rounded}in`, rawValue: raw };
  }

  // 2. Detección de cm: '20.3 cm', '25 cm', '30 cm', '17.8 cm'
  const cmMatch = lower.match(/(\d+(?:\.\d+)?)\s*cm\b/);
  if (cmMatch) {
    const cm = parseFloat(cmMatch[1]);
    // Conversión a pulgadas con redondeo a enteros estándar de retail (5, 7, 8, 10, 12, etc.)
    const convertedInches = cm / 2.54;
    const rounded = Math.round(convertedInches);
    // Tolerancia estricta: sólo si el redondeo dista menos de 0.4 pulgadas del valor real convertido
    if (Math.abs(convertedInches - rounded) <= 0.45) {
      return { normalizedInches: `${rounded}in`, rawValue: raw };
    }
  }

  // 3. Escalas proporcionales: '1:12', '1/12', '1:6'
  const ratioMatch = lower.match(/1[:\/](\d+)/);
  if (ratioMatch) {
    return { normalizedInches: `1:${ratioMatch[1]}`, rawValue: raw };
  }

  return { rawValue: raw };
}

/**
 * Extrae tokens núcleo (core tokens) eliminando ruido comercial y palabras funcionales sin identidad.
 * Preserva estrictamente marcas, personajes, líneas, variantes y números clave.
 */
export function extractCoreTokens(text: string): Set<string> {
  if (!text) return new Set();
  const words = cleanText(text).toLowerCase().split(' ').filter(w => w.length > 0);
  const core = new Set<string>();

  const commercialStopwords = new Set([
    'official', 'licensed', 'authentic', 'original', 'collectible', 'collectibles',
    'toy', 'toys', 'kids', 'adults', 'gift', 'gifts', 'birthday', 'item', 'merchandise',
    'stuffed', 'animal', 'soft', 'super', 'ultrasoft', 'huggable', 'cuddle', 'pillow',
    'para', 'para', 'con', 'and', 'the', 'for', 'with', 'from', 'del', 'los', 'las', 'por'
  ]);

  for (const w of words) {
    const translated = BILINGUAL_TOKEN_MAP[w] || w;
    if (commercialStopwords.has(translated)) continue;
    if (translated.length <= 1) continue;
    core.add(translated);
  }

  return core;
}

export interface ExtractedProductIdentity {
  brand?: string;
  character?: string;
  franchise?: string;
  productLine?: string;
  productType?: string;
  variant?: string;
  edition?: string;
  sizeInches?: string;
  coreTokens: Set<string>;
}

/**
 * Extrae los componentes de identidad canónicos a partir del título y metadata del producto.
 */
export function extractSemanticIdentity(item: {
  title?: string;
  brand?: string;
  claims?: any;
}): ExtractedProductIdentity {
  const rawTitle = (item.title || '').trim();
  const lowerTitle = rawTitle.toLowerCase();
  const claims = item.claims || {};

  // 1. Marca
  let brand = (item.brand && item.brand !== 'No verificado' && item.brand !== 'Collectibles')
    ? item.brand.trim()
    : '';
  if (!brand) {
    if (lowerTitle.includes('squishmallow')) brand = 'Squishmallows';
    else if (lowerTitle.includes('steiff')) brand = 'Steiff';
    else if (lowerTitle.includes('funko')) brand = 'Funko';
    else if (lowerTitle.includes('ty ')) brand = 'Ty';
    else if (lowerTitle.includes('kenner')) brand = 'Kenner';
    else if (lowerTitle.includes('jakks pacific') || lowerTitle.includes('jakks')) brand = 'Jakks Pacific';
    else if (lowerTitle.includes('lego')) brand = 'LEGO';
    else if (lowerTitle.includes('kids preferred')) brand = 'KIDS PREFERRED';
    else if (lowerTitle.includes('mcfarlane')) brand = 'McFarlane Toys';
    else if (lowerTitle.includes('mattel')) brand = 'Mattel';
    else if (lowerTitle.includes('hasbro')) brand = 'Hasbro';
  }

  // 2. Personaje
  let character = claims.character || '';
  if (!character) {
    if (lowerTitle.includes('batman')) character = 'Batman';
    else if (lowerTitle.includes('joker')) character = 'The Joker';
    else if (lowerTitle.includes('superman')) character = 'Superman';
    else if (lowerTitle.includes('sonic')) character = 'Sonic';
    else if (lowerTitle.includes('robin')) character = 'Robin';
    else if (lowerTitle.includes('ryu')) character = 'Ryu';
    else if (lowerTitle.includes('chun-li') || lowerTitle.includes('chun li')) character = 'Chun-Li';
  }

  // 3. Franquicia / Licencia
  let franchise = claims.franchise || '';
  if (!franchise) {
    if (lowerTitle.includes('dc comics') || lowerTitle.includes('dc ') || lowerTitle.includes('batman')) franchise = 'DC';
    else if (lowerTitle.includes('marvel') || lowerTitle.includes('spider-man')) franchise = 'Marvel';
    else if (lowerTitle.includes('sonic the hedgehog') || lowerTitle.includes('sonic')) franchise = 'Sonic';
    else if (lowerTitle.includes('street fighter')) franchise = 'Street Fighter';
  }

  // 4. Tipo de Producto
  let productType = '';
  if (lowerTitle.includes('peluche') || lowerTitle.includes('plush') || lowerTitle.includes('teddy bear') || lowerTitle.includes('stuffed')) {
    productType = 'plush';
  } else if (lowerTitle.includes('lego') || lowerTitle.includes('building set') || lowerTitle.includes('batmobile')) {
    productType = 'building_or_vehicle';
  } else if (lowerTitle.includes('action figure') || lowerTitle.includes('figura de accion') || lowerTitle.includes('figura')) {
    productType = 'figure';
  }

  // 5. Línea de producto específica (ej: HugMees, Beanie Bouncer, Total Justice, Pop, Phunny)
  let productLine = '';
  if (lowerTitle.includes('hugmees') || lowerTitle.includes('hug mees')) productLine = 'HugMees';
  else if (lowerTitle.includes('beanie bouncer') || lowerTitle.includes('beanie babies')) productLine = 'Beanie Bouncer';
  else if (lowerTitle.includes('total justice')) productLine = 'Total Justice';
  else if (lowerTitle.includes('pop!') || lowerTitle.includes('pop movies') || lowerTitle.includes('pop heroes')) productLine = 'Pop';
  else if (lowerTitle.includes('phunny')) productLine = 'Phunny';

  // 6. Variante / Edición específica
  let variant = claims.variant || '';
  if (!variant) {
    if (lowerTitle.includes('patchwork')) variant = 'Patchwork';
    else if (lowerTitle.includes('player 2')) variant = 'Player 2';
    else if (lowerTitle.includes('bloody')) variant = 'Bloody';
    else if (lowerTitle.includes('classic blue')) variant = 'Classic Blue';
    else if (lowerTitle.includes('dark knight')) variant = 'Dark Knight';
  }

  let edition = claims.edition || '';
  if (!edition) {
    if (lowerTitle.includes('85th anniversary') || lowerTitle.includes('85th') || lowerTitle.includes('85 aniversario')) {
      edition = '85th Anniversary';
    }
  }

  // 7. Tamaño / Escala normalizada
  let sizeInches = '';
  const candidateSizeRaw = claims.scale || claims.size || '';
  if (candidateSizeRaw) {
    const parsed = normalizeSizeOrScale(candidateSizeRaw);
    if (parsed.normalizedInches) sizeInches = parsed.normalizedInches;
  }
  if (!sizeInches) {
    const parsedFromTitle = normalizeSizeOrScale(rawTitle);
    if (parsedFromTitle.normalizedInches) sizeInches = parsedFromTitle.normalizedInches;
  }

  const coreTokens = extractCoreTokens(rawTitle);

  return {
    brand,
    character,
    franchise,
    productLine,
    productType,
    variant,
    edition,
    sizeInches,
    coreTokens
  };
}

/**
 * Evalúa determinísticamente si un producto Zinc coincide con el candidato
 * mediante Análisis de Identidad Canónica por Componentes.
 * 
 * Jerarquía de Decisión:
 * 1. EXACT: ASIN exacto validado o concordancia exhaustiva de componentes
 * 2. STRONG: Sin conflictos duros + múltiples concordancias determinísticas (Marca + Personaje + Tipo + Tamaño/Línea)
 * 3. AMBIGUOUS: Identidad plausible pero variante/edición crítica no corroborada o múltiples resultados competitivos
 * 4. NO_MATCH: Conflicto duro de marca/personaje/tipo o evidencia insuficiente
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

  // NIVEL 1 — EXACT ASIN MATCH
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

  const candId = extractSemanticIdentity(candidate);

  const scoredMatches: {
    product: ZincResolvedProduct;
    score: number;
    level: ZincResolutionMatchLevel;
    reasons: string[];
    hardConflict: boolean;
    conflictReason?: string;
  }[] = [];

  for (const prod of zincProducts) {
    const prodId = extractSemanticIdentity({
      title: prod.title || '',
      brand: prod.brand || '',
      claims: prod.raw_data
    });

    const reasons: string[] = [];

    // ──────────────────────────────────────────────────────────
    // CONFLICTOS DUROS (HARD CONFLICTS) -> Inmediato NO_MATCH
    // ──────────────────────────────────────────────────────────

    // 1. Conflicto de Marca (Brand Conflict)
    if (candId.brand && prodId.brand) {
      const b1 = cleanText(candId.brand).toLowerCase();
      const b2 = cleanText(prodId.brand).toLowerCase();
      // Si ambas marcas están identificadas y son incompatibles (ej: Steiff vs Funko, Ty vs Kids Preferred, Kenner vs LEGO)
      if (b1 !== b2 && !b1.includes(b2) && !b2.includes(b1)) {
        scoredMatches.push({
          product: prod,
          score: 0,
          level: 'NO_MATCH',
          reasons: [`BRAND_CONFLICT:${candId.brand}_VS_${prodId.brand}`],
          hardConflict: true,
          conflictReason: `BRAND_CONFLICT: Candidate (${candId.brand}) vs Product (${prodId.brand})`
        });
        continue;
      }
    }

    // 2. Conflicto de Personaje (Character Conflict)
    if (candId.character && prodId.character) {
      const c1 = candId.character.toLowerCase();
      const c2 = prodId.character.toLowerCase();
      if (c1 !== c2 && !c1.includes(c2) && !c2.includes(c1)) {
        scoredMatches.push({
          product: prod,
          score: 0,
          level: 'NO_MATCH',
          reasons: [`CHARACTER_CONFLICT:${candId.character}_VS_${prodId.character}`],
          hardConflict: true,
          conflictReason: `CHARACTER_CONFLICT: Candidate (${candId.character}) vs Product (${prodId.character})`
        });
        continue;
      }
    }

    // 3. Conflicto de Tipo de Producto (Product Type Conflict)
    // Ej: Peluche (plush) vs Set de Bloques / Vehículo (building_or_vehicle)
    if (candId.productType && prodId.productType && candId.productType !== prodId.productType) {
      scoredMatches.push({
        product: prod,
        score: 0,
        level: 'NO_MATCH',
        reasons: [`PRODUCT_TYPE_CONFLICT:${candId.productType}_VS_${prodId.productType}`],
        hardConflict: true,
        conflictReason: `PRODUCT_TYPE_CONFLICT: Candidate is ${candId.productType}, product is ${prodId.productType}`
      });
      continue;
    }

    // 4. Conflicto de Tamaño Mayor (Major Size Conflict)
    // Ej: 8in vs 20in, 12in vs 7in
    if (candId.sizeInches && prodId.sizeInches && candId.sizeInches !== prodId.sizeInches) {
      scoredMatches.push({
        product: prod,
        score: 0,
        level: 'NO_MATCH',
        reasons: [`SIZE_MISMATCH:${candId.sizeInches}_VS_${prodId.sizeInches}`],
        hardConflict: true,
        conflictReason: `SIZE_MISMATCH: Candidate (${candId.sizeInches}) vs Product (${prodId.sizeInches})`
      });
      continue;
    }

    // ──────────────────────────────────────────────────────────
    // EVALUACIÓN DE SEÑALES POSITIVAS Y COMPONENTES
    // ──────────────────────────────────────────────────────────
    let componentScore = 0.0;

    // A. Concordancia de Marca (0.25)
    let brandMatched = false;
    if (candId.brand && prodId.brand) {
      const b1 = cleanText(candId.brand).toLowerCase();
      const b2 = cleanText(prodId.brand).toLowerCase();
      if (b1 === b2 || b1.includes(b2) || b2.includes(b1)) {
        componentScore += 0.25;
        brandMatched = true;
        reasons.push(`BRAND_MATCH:${candId.brand}`);
      }
    } else if (candId.brand && (prod.title || '').toLowerCase().includes(candId.brand.toLowerCase())) {
      componentScore += 0.20;
      brandMatched = true;
      reasons.push(`BRAND_IN_TITLE:${candId.brand}`);
    }

    // B. Concordancia de Personaje (0.25)
    let characterMatched = false;
    if (candId.character && prodId.character && candId.character.toLowerCase() === prodId.character.toLowerCase()) {
      componentScore += 0.25;
      characterMatched = true;
      reasons.push(`CHARACTER_MATCH:${candId.character}`);
    } else if (candId.character && (prod.title || '').toLowerCase().includes(candId.character.toLowerCase())) {
      componentScore += 0.20;
      characterMatched = true;
      reasons.push(`CHARACTER_IN_TITLE:${candId.character}`);
    }

    // C. Concordancia de Tipo de Producto (0.15)
    let typeMatched = false;
    if (candId.productType && prodId.productType && candId.productType === prodId.productType) {
      componentScore += 0.15;
      typeMatched = true;
      reasons.push(`TYPE_MATCH:${candId.productType}`);
    }

    // D. Concordancia de Tamaño/Escala (0.15)
    let sizeMatched = false;
    if (candId.sizeInches && prodId.sizeInches && candId.sizeInches === prodId.sizeInches) {
      componentScore += 0.15;
      sizeMatched = true;
      reasons.push(`SIZE_MATCH:${candId.sizeInches}`);
    }

    // E. Concordancia de Línea de Producto (0.10)
    let lineMatched = false;
    if (candId.productLine && prodId.productLine && candId.productLine.toLowerCase() === prodId.productLine.toLowerCase()) {
      componentScore += 0.10;
      lineMatched = true;
      reasons.push(`LINE_MATCH:${candId.productLine}`);
    } else if (candId.productLine && !prodId.productLine) {
      // Si el candidato requiere una línea específica (ej: HugMees) pero el producto no la tiene -> penalización
      componentScore -= 0.15;
      reasons.push(`LINE_MISSING_IN_PRODUCT:${candId.productLine}`);
    }

    // F. Concordancia de Edición / Variante Crítica (0.10 o AMBIGUOUS)
    let editionConfirmed = true;
    if (candId.edition) {
      if (prodId.edition && prodId.edition.toLowerCase() === candId.edition.toLowerCase()) {
        componentScore += 0.10;
        reasons.push(`EDITION_CORROBORATED:${candId.edition}`);
      } else {
        editionConfirmed = false;
        reasons.push(`EDITION_UNCONFIRMED:${candId.edition}`);
      }
    }

    let variantConfirmed = true;
    if (candId.variant) {
      if (prodId.variant && prodId.variant.toLowerCase() === candId.variant.toLowerCase()) {
        componentScore += 0.10;
        reasons.push(`VARIANT_CORROBORATED:${candId.variant}`);
      } else {
        variantConfirmed = false;
        reasons.push(`VARIANT_UNCONFIRMED:${candId.variant}`);
      }
    }

    // G. Similitud de Core Tokens (0.15 máximo)
    let coreJaccard = 0;
    if (candId.coreTokens.size > 0 && prodId.coreTokens.size > 0) {
      let intersection = 0;
      candId.coreTokens.forEach(t => {
        if (prodId.coreTokens.has(t)) intersection++;
      });
      const union = new Set([...candId.coreTokens, ...prodId.coreTokens]).size;
      coreJaccard = union > 0 ? intersection / union : 0;
      componentScore += Number((coreJaccard * 0.15).toFixed(2));
      reasons.push(`CORE_JACCARD:${(coreJaccard * 100).toFixed(0)}%`);
    }

    const finalScore = Math.min(1.0, Math.max(0, Number(componentScore.toFixed(2))));

    // Determinar nivel de coincidencia por reglas de identidad
    let matchLevel: ZincResolutionMatchLevel = 'NO_MATCH';

    // Regla de Protección Estricta: Si el candidato tiene una Variante o Edición explícita relevante no corroborada:
    // NO puede ser STRONG. Se clasifica como AMBIGUOUS si el resto coincide, o NO_MATCH si el score es bajo.
    if (!editionConfirmed || !variantConfirmed) {
      if (brandMatched && characterMatched && finalScore >= 0.55) {
        matchLevel = 'AMBIGUOUS';
        reasons.push('VARIANT_OR_EDITION_NOT_CORROBORATED_REQUIRES_CONFIRMATION');
      } else {
        matchLevel = 'NO_MATCH';
      }
    } else {
      // Si la identidad concordante es sólida:
      // (Marca + Personaje + Tipo + Tamaño/Línea sin conflictos)
      if (brandMatched && characterMatched && (typeMatched || lineMatched) && finalScore >= 0.70) {
        matchLevel = 'STRONG';
      } else if (brandMatched && characterMatched && finalScore >= 0.58) {
        matchLevel = 'AMBIGUOUS';
      } else if (finalScore >= 0.75) {
        matchLevel = 'STRONG';
      } else if (finalScore >= 0.55) {
        matchLevel = 'AMBIGUOUS';
      } else {
        matchLevel = 'NO_MATCH';
      }
    }

    scoredMatches.push({
      product: prod,
      score: finalScore,
      level: matchLevel,
      reasons,
      hardConflict: false
    });
  }

  // Filtrar candidatos sin conflictos duros y ordenar por score descendente
  const validMatches = scoredMatches.filter(m => !m.hardConflict).sort((a, b) => b.score - a.score);

  if (validMatches.length === 0) {
    const firstConflict = scoredMatches.find(m => m.hardConflict);
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

  // Comprobar ambigüedad competitiva: si hay dos productos muy parecidos en score (delta < 0.05) con ASINs diferentes
  if (validMatches.length > 1) {
    const runnerUp = validMatches[1];
    if (topMatch.score >= 0.65 && runnerUp.score >= 0.65 && (topMatch.score - runnerUp.score) < 0.05) {
      const topAsin = topMatch.product.asin || topMatch.product.external_product_id;
      const runnerAsin = runnerUp.product.asin || runnerUp.product.external_product_id;
      if (topAsin !== runnerAsin) {
        return {
          level: 'AMBIGUOUS',
          confidenceScore: topMatch.score,
          matchedProduct: null, // Ambigüedad competitiva nunca asigna imagen
          reasons: ['MULTIPLE_SIMILAR_ZINC_MATCHES_DETECTED', `DELTA:${(topMatch.score - runnerUp.score).toFixed(2)}`],
          variantConflictDetected: false
        };
      }
    }
  }

  if (topMatch.level === 'STRONG') {
    return {
      level: 'STRONG',
      confidenceScore: topMatch.score,
      matchedProduct: topMatch.product,
      reasons: topMatch.reasons,
      variantConflictDetected: false
    };
  }

  if (topMatch.level === 'AMBIGUOUS') {
    return {
      level: 'AMBIGUOUS',
      confidenceScore: topMatch.score,
      matchedProduct: null, // AMBIGUOUS no asigna imagen
      reasons: topMatch.reasons,
      variantConflictDetected: false
    };
  }

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
    query_dedupe_hits: 0,
    network_requests: 0,
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
      if (existing.length > 0) {
        telemetry.query_dedupe_hits++;
      }
      existing.push(idx);
      asinToCandidateIndices.set(asin, existing);
    } else {
      const q = buildZincResolutionQuery(c);
      if (q) {
        const existing = queryToCandidateIndices.get(q) || [];
        if (existing.length > 0) {
          telemetry.query_dedupe_hits++;
        }
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
    telemetry.network_requests++;
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

  // Resolve ASIN lookups sequentially
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

  // Resolve Text queries with controlled concurrency (chunks of 2)
  const textQueries = Array.from(queryToCandidateIndices.keys());
  for (let i = 0; i < textQueries.length; i += 2) {
    const batch = textQueries.slice(i, i + 2);
    await Promise.all(batch.map(async (q) => {
      const cached = queryCache.get(q);
      if (cached && cached.expiresAt > Date.now()) {
        telemetry.cache_hits++;
        queryResultsMap.set(q, cached.result);
        return;
      }

      const searchRes = await executeSearch(q);
      queryCache.set(q, { result: searchRes, expiresAt: Date.now() + ttlMs });
      queryResultsMap.set(q, searchRes);
    }));
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
      (clone as any).commercial_resolution_status = searchRes.status;
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

      (clone as any).commercial_resolution_status = 'SUCCESS';

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
      (clone as any).commercial_resolution_status = evaluation.level;
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
