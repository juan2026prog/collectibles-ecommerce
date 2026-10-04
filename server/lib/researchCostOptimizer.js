// ============================================================
// COLLECTIBLES 2026 — RESEARCH COST OPTIMIZER & PRICING ENGINE
// Central server-side logic for cheap-first model routing,
// token estimation, pre-flight analysis, and multi-tier cache.
// ZERO PAID OPENAI REQUESTS are executed in this module.
// ============================================================

import crypto from 'crypto';
import { getModelPricingRates, calculateOpenAICost, validateRequestedModel } from './openaiPricing.js';

export const RESEARCH_MODES = Object.freeze({
  ECONOMICO: {
    key: 'ECONOMICO',
    label: '⚡ Económico',
    model: 'gpt-4o-mini',
    fallbackModel: 'gpt-5.6-luna',
    maxCandidates: 15,
    maxOutputTokens: 2000,
    searchDepth: 'QUICK',
    expectedWebInputTokensMin: 16500,
    expectedWebInputTokensMax: 26000,
    expectedWebInputTokens: 21000,
    expectedWebOutputTokensMin: 400,
    expectedWebOutputTokensMax: 2000,
    expectedWebOutputTokens: 1000,
    noWebInputTokensMin: 300,
    noWebInputTokensMax: 1500,
    noWebInputTokens: 600,
    noWebOutputTokensMin: 200,
    noWebOutputTokensMax: 1000,
    noWebOutputTokens: 600,
    timeoutMs: 35000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.01
  },
  ESTANDAR: {
    key: 'ESTANDAR',
    label: '🔎 Estándar',
    model: 'gpt-5.6-terra',
    fallbackModel: 'gpt-4o',
    maxCandidates: 8,
    maxOutputTokens: 1200,
    searchDepth: 'STANDARD',
    expectedWebInputTokensMin: 22000,
    expectedWebInputTokensMax: 36000,
    expectedWebInputTokens: 28000,
    expectedWebOutputTokensMin: 350,
    expectedWebOutputTokensMax: 1200,
    expectedWebOutputTokens: 700,
    noWebInputTokensMin: 500,
    noWebInputTokensMax: 2500,
    noWebInputTokens: 1000,
    noWebOutputTokensMin: 300,
    noWebOutputTokensMax: 1000,
    noWebOutputTokens: 600,
    timeoutMs: 45000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.05
  },
  PROFUNDO: {
    key: 'PROFUNDO',
    label: '🧠 Profundo',
    model: 'gpt-5.6-terra',
    fallbackModel: 'gpt-5.6-sol',
    maxCandidates: 15,
    maxOutputTokens: 2000,
    searchDepth: 'DEEP',
    expectedWebInputTokensMin: 30000,
    expectedWebInputTokensMax: 58000,
    expectedWebInputTokens: 42000,
    expectedWebOutputTokensMin: 500,
    expectedWebOutputTokensMax: 2000,
    expectedWebOutputTokens: 1200,
    noWebInputTokensMin: 800,
    noWebInputTokensMax: 4000,
    noWebInputTokens: 1800,
    noWebOutputTokensMin: 400,
    noWebOutputTokensMax: 1500,
    noWebOutputTokens: 1000,
    timeoutMs: 60000,
    webSearchToolCostUsd: 0,
    targetCostMaxUsd: 0.10
  }
});

export const COST_THRESHOLDS = Object.freeze({
  LOW_MAX_USD: 0.01,
  NORMAL_MAX_USD: 0.02,
  CONFIRMATION_WARNING_USD: 0.02,
  HARD_LIMIT_USD: 0.15
});

/**
 * Deterministic Query Complexity Analyzer (Zero OpenAI calls)
 * Evaluates multi-entity keywords, scope modifiers, and length to adjust token ranges accurately.
 */
export function analyzeQueryComplexity(query) {
  if (!query || typeof query !== 'string') {
    return {
      factor: 1.0,
      confidence: 'HIGH',
      confidence_label: 'Alta precisión (calibrada con telemetría web)',
      reasons: []
    };
  }

  const norm = query.toLowerCase().trim();
  let factor = 1.0;
  const reasons = [];

  // Multi-entity separators & comparative intent
  if (/\b(vs|contra|y|o|,|\/)\b/i.test(norm)) {
    factor += 0.05;
    reasons.push('múltiples entidades o comparativas');
  }

  // Broad / aggregation terms
  if (/\b(todas?|todos|linea completa|completa|coleccion|resumen|catalogo|mejores|tendencias|mercado|diferencias)\b/i.test(norm)) {
    factor += 0.05;
    reasons.push('alcance de búsqueda amplio');
  }

  // Query length / detailed description
  const wordCount = norm.split(/\s+/).filter(Boolean).length;
  if (norm.length > 80 || wordCount > 10) {
    factor += 0.05;
    reasons.push('longitud de consulta detallada');
  }

  // Cap complexity factor between 1.0 and 1.25
  const finalFactor = Number(Math.min(1.25, Math.max(1.0, factor)).toFixed(2));

  let confidence = 'HIGH';
  let confidence_label = 'Alta precisión (calibrada con telemetría web)';
  if (finalFactor >= 1.15) {
    confidence = 'MEDIUM';
    confidence_label = 'Precisión moderada (consulta compleja / multi-entidad)';
  }

  return {
    factor: finalFactor,
    confidence,
    confidence_label,
    reasons
  };
}

/**
 * Normalizes query string for caching and deduplication
 */
export function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return '';
  return query
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const COLLECTIBLES_PRODUCT_FAMILIES = Object.freeze([
  { id: 'ALL', label: 'Todos' },
  { id: 'FIGURES', label: 'Figuras' },
  { id: 'STATUES_BUSTS', label: 'Estatuas y Bustos' },
  { id: 'PLUSH', label: 'Peluches' },
  { id: 'COMICS_MANGA', label: 'Cómics y Manga' },
  { id: 'TCG_CARDS', label: 'TCG y Cartas' },
  { id: 'APPAREL_ACCESSORIES', label: 'Ropa y Accesorios' },
  { id: 'BUILDING_SETS', label: 'Building Sets / LEGO' },
  { id: 'BOARD_GAMES', label: 'Board Games' },
  { id: 'PUZZLES', label: 'Puzzles' },
  { id: 'REPLICAS_PROPS', label: 'Réplicas y Props' },
  { id: 'VEHICLES', label: 'Vehículos' },
  { id: 'OTHER_COLLECTIBLES', label: 'Otros Coleccionables' }
]);

export function normalizeProductFamily(family) {
  if (!family || typeof family !== 'string') return 'ALL';
  const clean = family.trim().toUpperCase();
  const matched = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === clean || f.label.toUpperCase() === clean);
  return matched ? matched.id : 'ALL';
}

/**
 * Generates deterministic cache key for research queries
 * Global research cache is reusable across countries!
 */
export function normalizeResultLimit(limitInput) {
  if (limitInput === undefined || limitInput === null || limitInput === '' || limitInput === 'AUTO') {
    return 'AUTO';
  }
  const n = parseInt(String(limitInput), 10);
  if (n === 10) return 10;
  if (n === 25) return 25;
  if (n === 50) return 50;
  if (n === 100) return 100;
  return 'AUTO';
}

export function planDiscoveryBatches(resultLimit, modeConfig = RESEARCH_MODES.ECONOMICO) {
  const normLimit = normalizeResultLimit(resultLimit);
  if (normLimit === 'AUTO') {
    // AUTO(15): Target ideal up to 15, minimum useful target = 8.
    // At most 2 batches: batch 1 aims for 15. If batch 1 yields < 8, batch 2 executes aiming for remaining.
    return {
      resultLimit: 'AUTO',
      targetCount: 15,
      minimumUsefulTarget: 8,
      batchCount: 1,
      maxBatches: 2,
      batchSize: 15,
      batches: [
        { batchIndex: 1, targetCount: 15, maxOutputTokens: modeConfig.maxOutputTokens || 1200 },
        { batchIndex: 2, targetCount: 10, maxOutputTokens: 1000 }
      ]
    };
  }

  const targetCount = Number(normLimit);
  let maxBatches = 1;
  let minimumUsefulTarget = targetCount;
  let batches = [];

  if (targetCount === 10) {
    maxBatches = 1;
    minimumUsefulTarget = 6;
    batches = [{ batchIndex: 1, targetCount: 10, maxOutputTokens: 1200 }];
  } else if (targetCount === 25) {
    maxBatches = 2;
    minimumUsefulTarget = 15;
    batches = [
      { batchIndex: 1, targetCount: 15, maxOutputTokens: 1500 },
      { batchIndex: 2, targetCount: 10, maxOutputTokens: 1200 }
    ];
  } else if (targetCount === 50) {
    maxBatches = 3;
    minimumUsefulTarget = 30;
    batches = [
      { batchIndex: 1, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 2, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 3, targetCount: 15, maxOutputTokens: 1500 }
    ];
  } else if (targetCount === 100) {
    maxBatches = 5;
    minimumUsefulTarget = 60;
    batches = [
      { batchIndex: 1, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 2, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 3, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 4, targetCount: 20, maxOutputTokens: 1800 },
      { batchIndex: 5, targetCount: 20, maxOutputTokens: 1800 }
    ];
  } else {
    maxBatches = 1;
    minimumUsefulTarget = Math.max(1, Math.floor(targetCount * 0.6));
    batches = [{ batchIndex: 1, targetCount: targetCount, maxOutputTokens: 1500 }];
  }

  return {
    resultLimit: normLimit,
    targetCount,
    minimumUsefulTarget,
    batchCount: maxBatches,
    maxBatches,
    batchSize: batches[0]?.targetCount || 15,
    batches
  };
}

export function planResearchBatches(resultLimit, modeConfig = RESEARCH_MODES.ECONOMICO) {
  return planDiscoveryBatches(resultLimit, modeConfig);
}

export function planEnrichmentBatches(candidateCount, modeConfig = RESEARCH_MODES.ECONOMICO) {
  const count = Math.max(0, candidateCount || 0);
  if (count === 0) return { batchCount: 0, batchSize: 15, batches: [] };

  const batchSize = 15;
  const batchCount = Math.ceil(count / batchSize);
  const batches = [];

  for (let i = 0; i < batchCount; i++) {
    const startIdx = i * batchSize;
    const endIdx = Math.min(count, (i + 1) * batchSize);
    batches.push({
      batchIndex: i + 1,
      startIndex: startIdx,
      endIndex: endIdx,
      count: endIdx - startIdx,
      maxOutputTokens: modeConfig.maxOutputTokens || 2000
    });
  }

  return {
    batchCount,
    batchSize,
    totalCandidates: count,
    batches
  };
}

/**
 * Generates deterministic cache key for research queries
 * Global research cache is reusable across countries!
 */
export function generateResearchCacheKey(query, scope = 'GLOBAL', depth = 'ECONOMICO', model = 'AUTO', timeScope = 'ALL_TIME', productFamily = 'ALL', resultLimit = 'AUTO') {
  const normQuery = normalizeQuery(query);
  const normDepth = (depth || 'ECONOMICO').toUpperCase();
  const normModel = (model && model !== 'AUTO') ? String(model).toLowerCase().trim() : 'AUTO';
  const normTime = (timeScope || 'ALL_TIME').toUpperCase();
  const normFamily = normalizeProductFamily(productFamily);
  const normLimit = normalizeResultLimit(resultLimit);
  const rawKey = `${normQuery}|${scope}|${normDepth}|${normModel}|${normTime}|${normFamily}|${normLimit}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Resolves research mode configuration with safe fallback to ECONOMICO
 */
export function resolveResearchMode(modeInput) {
  if (!modeInput) return RESEARCH_MODES.ECONOMICO;
  const upper = String(modeInput).toUpperCase().trim();
  if (upper === 'ECONOMICO' || upper === 'QUICK' || upper === 'FAST') {
    return RESEARCH_MODES.ECONOMICO;
  }
  if (upper === 'ESTANDAR' || upper === 'STANDARD' || upper === 'BALANCED') {
    return RESEARCH_MODES.ESTANDAR;
  }
  if (upper === 'PROFUNDO' || upper === 'DEEP' || upper === 'REASONING') {
    return RESEARCH_MODES.PROFUNDO;
  }
  return RESEARCH_MODES.ECONOMICO;
}

/**
 * Local conservative token estimation (1 token ≈ 4 characters for Spanish/English + JSON overhead)
 * ZERO OpenAI calls.
 */
export function estimateTokensLocally(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / 3.8);
}

/**
 * Generates deterministic cache key for commercial enrichment per candidate identity
 */
export function generateEnrichmentCacheKey(candidateTitle, brand = '', franchise = '', scope = 'GLOBAL') {
  const normTitle = normalizeQuery(candidateTitle);
  const normBrand = normalizeQuery(brand);
  const normFranchise = normalizeQuery(franchise);
  const rawKey = `ENRICH|${normTitle}|${normBrand}|${normFranchise}|${scope}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generates Phase 1 Discovery prompt instructions
 */
export function buildDiscoveryPrompt(query, country = 'UY', modeConfig = RESEARCH_MODES.ECONOMICO, timeScope = 'ALL_TIME', productFamily = 'ALL', resultLimit = 'AUTO', batchContext = null) {
  const currentYear = new Date().getFullYear();
  const batchPlan = planDiscoveryBatches(resultLimit, modeConfig);
  const maxItems = batchContext?.targetCount || (resultLimit && resultLimit !== 'AUTO' ? Number(resultLimit) : batchPlan.targetCount);
  const normFamily = normalizeProductFamily(productFamily);
  const familyObj = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === normFamily);
  const familyLabel = familyObj ? familyObj.label : 'Todos';

  const timeLabel = timeScope === '24h' 
    ? 'Últimas 24 horas'
    : timeScope === '7d' 
    ? 'Últimos 7 días'
    : timeScope === '30d' 
      ? 'Últimos 30 días'
      : timeScope === '90d' 
        ? 'Últimos 90 días' 
        : 'Sin límite temporal (todo catálogo y lanzamientos activos)';

  const targetCountryLabel = (!country || country === 'ALL' || country === 'GLOBAL') 
    ? 'GLOBAL (Oportunidades internacionales sin restricción de país único)' 
    : country;

  const familyInstruction = normFamily !== 'ALL'
    ? `\nRestricción de familia de producto: Restringir resultados estrictamente a la familia ${familyLabel} (${normFamily}). Si la consulta busca una franquicia o personaje, listar coleccionables que pertenezcan a esta categoría.`
    : '';

  const batchInstruction = batchContext?.excludeTitles && batchContext.excludeTitles.length > 0
    ? `\nLote adicional (Búsqueda de productos complementarios): EXCLUIR los siguientes ${batchContext.excludeTitles.length} productos ya descubiertos para no duplicar resultados: ${batchContext.excludeTitles.slice(0, 20).join('; ')}.`
    : '';

  return `INVESTIGACIÓN COMERCIAL SOURCING — FASE 1: DESCUBRIMIENTO (MODO: ${modeConfig.key}):
Consulta: "${query}"
Año actual: ${currentYear}
Mercado objetivo comercial: ${targetCountryLabel}
Alcance de descubrimiento: GLOBAL (fabricantes oficiales, medios especializados, bases de datos de lanzamientos, blogs, retailers globales)
Ventana temporal: ${timeLabel}
Familia de producto: ${familyLabel}${familyInstruction}${batchInstruction}

Instrucciones de descubrimiento:
1. Resuelve alias multilingües si la consulta está en español (ej. "ositos cariñosos" -> "Care Bears", "caballeros del zodiaco" -> "Saint Seiya", "tortugas ninja" -> "TMNT / Teenage Mutant Ninja Turtles", "peluches de batman" -> "Batman plush toys", etc.) para descubrir coleccionables oficiales existentes en el mercado global.
2. Identifica hasta ${maxItems} coleccionables oficiales reales donde cada uno corresponda a un producto exacto. Puedes usar fuentes editoriales, blogs (Toyark, BleedingCool), Reddit, YouTube, foros, o anuncios de fabricantes para DESCUBRIR productos.
3. Extrae la información básica de identidad de cada producto: título, marca fabricante, franquicia, categoría, variante/edición, tamaño aproximado, si es preventa o novedad, fecha de lanzamiento y enlace de la fuente de descubrimiento (discovery_source).
4. Asigna a cada producto un candidate_id único incremental (ej. "c_1", "c_2", "c_3"...).
5. NUNCA inventes productos inexistentes ni datos ficticios. NUNCA inventes precios, costos, stock ni URLs de imagen ("image_url":string_or_null).
6. Devuelve ÚNICAMENTE un JSON compacto con la siguiente estructura:
{"summary":string,"confidence":number_0_to_1,"subtrends":string[],"items":[{"candidate_id":string,"title":string,"brand":string,"franchise":string,"category":string,"line":string_or_null,"character":string_or_null,"variant":string_or_null,"size":string_or_null,"image_url":string_or_null,"is_preorder":boolean,"is_new":boolean,"release_date":string_or_null,"evidence_snippet":string,"discovery_source":{"name":string,"url":string_or_null,"type":string}}]}`;
}

export function buildOptimizedResearchPrompt(query, country = 'UY', modeConfig = RESEARCH_MODES.ECONOMICO, timeScope = 'ALL_TIME', productFamily = 'ALL', resultLimit = 'AUTO', batchContext = null) {
  return buildDiscoveryPrompt(query, country, modeConfig, timeScope, productFamily, resultLimit, batchContext);
}

/**
 * Generates Phase 2 Grouped Commercial Enrichment prompt instructions
 */
export function buildCommercialEnrichmentPrompt(candidates = [], country = 'UY', modeConfig = RESEARCH_MODES.ECONOMICO) {
  const currentYear = new Date().getFullYear();
  const candidateSummaries = candidates.map((c, i) => {
    const id = c.candidate_id || `c_${i + 1}`;
    const brand = c.brand ? ` | Marca: ${c.brand}` : '';
    const franchise = c.franchise ? ` | Franquicia: ${c.franchise}` : '';
    const variant = c.variant ? ` | Variante: ${c.variant}` : '';
    const size = c.size ? ` | Tamaño: ${c.size}` : '';
    const disc = c.discovery_source?.name ? ` | Descubierto en: ${c.discovery_source.name}` : '';
    return `[${id}] "${c.title}"${brand}${franchise}${variant}${size}${disc}`;
  }).join('\n');

  return `INVESTIGACIÓN COMERCIAL SOURCING — FASE 2: ENRIQUECIMIENTO COMERCIAL (MODO: ${modeConfig.key}):
Año actual: ${currentYear}
Mercado objetivo: ${country || 'GLOBAL'}

Candidatos descubiertos a verificar en tiendas y retailers:
${candidateSummaries}

Instrucciones de enriquecimiento:
1. Para cada uno de los productos listados arriba (identificados con su [candidate_id]), realiza búsquedas web dirigidas exclusivamente a localizar la ficha comercial exacta de compra o preventa activa en:
   - Fabricante oficial / Licenciatario (Bandai, Hasbro Pulse, NECA, Funko, LEGO, McFarlane, Mattel, Steiff, Ty, Squishmallows, Kidrobot, Jakks, etc.)
   - Retailer especializado (BigBadToyStore, Entertainment Earth, Sideshow, etc.)
   - Marketplace / Retailer autorizado (Amazon con ASIN, Walmart, Target, Best Buy, etc.)
   Estrategia de búsqueda requerida: busca por el título exacto del producto combinando con el retailer o término de compra (ej. "<marca> <título exacto>" buy OR retailer OR site:amazon.com OR site:bigbadtoystore.com). NO busques resúmenes editoriales ni blogs de noticias.
2. NUNCA inventes precios, costos, stock ni URLs de imagen. NUNCA uses un precio de un blog como precio comercial a menos que esté en la ficha directa de tienda.
3. Si encuentras la ficha comercial exacta, devuelve:
   - retailer: nombre del retailer / dominio
   - product_url: URL directa de la ficha del producto
   - price: precio de origen en USD (numérico)
   - currency: "USD"
   - image_url: URL directa de la imagen oficial del producto en la tienda
   - identifier: ASIN de Amazon, UPC, EAN o SKU oficial si está disponible
   - identifier_type: "ASIN" | "UPC" | "EAN" | "SKU" | null
   - evidence: fragmento que sustenta el precio y disponibilidad
4. REGLA OBLIGATORIA DE CANDIDATOS: El array "enrichment" DEBE contener EXACTAMENTE UN OBJETO POR CADA CANDIDATO listado arriba (${candidates.length} elementos en total).
   - NUNCA omitas ningún candidate_id.
   - Si no encuentras ficha comercial verificable en tiendas oficiales o retailers permitidos para un candidato, incluye el candidato obligatoriamente con "commercial_sources": [].
5. Devuelve ÚNICAMENTE un JSON compacto con la siguiente estructura:
{"enrichment":[{"candidate_id":"c_1","title":"título exacto","commercial_sources":[{"retailer":string,"product_url":string,"price":number_or_null,"currency":"USD","image_url":string_or_null,"identifier":string_or_null,"identifier_type":string_or_null,"evidence":string}]}]}`;
}

export const COMMERCIAL_ENRICHMENT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    enrichment: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string' },
          title: { type: 'string' },
          commercial_sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                retailer: { type: ['string', 'null'] },
                product_url: { type: ['string', 'null'] },
                price: { type: ['number', 'null'] },
                currency: { type: ['string', 'null'] },
                image_url: { type: ['string', 'null'] },
                identifier: { type: ['string', 'null'] },
                identifier_type: { type: ['string', 'null'] },
                evidence: { type: ['string', 'null'] }
              },
              required: [
                'retailer',
                'product_url',
                'price',
                'currency',
                'image_url',
                'identifier',
                'identifier_type',
                'evidence'
              ],
              additionalProperties: false
            }
          }
        },
        required: ['candidate_id', 'title', 'commercial_sources'],
        additionalProperties: false
      }
    }
  },
  required: ['enrichment'],
  additionalProperties: false
});

export function parseCommercialEnrichmentItems(outputText, expectedCandidateIds = []) {
  const result = [];
  result.status = 'EMPTY_VALID_ENRICHMENT';
  result.rawOutputLength = typeof outputText === 'string' ? outputText.length : 0;
  result.expectedCount = Array.isArray(expectedCandidateIds) ? expectedCandidateIds.length : 0;
  result.returnedIds = [];
  result.missingIds = [];
  result.unexpectedIds = [];
  result.duplicateIds = [];
  result.native_schema_validated = false;

  if (!outputText || typeof outputText !== 'string' || !outputText.trim()) {
    result.status = 'EMPTY_INPUT';
    result.missingIds = [...expectedCandidateIds];
    return result;
  }

  let structured = null;
  const clean = outputText.trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
  try {
    structured = JSON.parse(clean);
  } catch {
    const match = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      try {
        structured = JSON.parse(match[1].trim());
      } catch {}
    }
  }

  if (!structured) {
    try {
      const enrichmentMatch = clean.match(/"enrichment"\s*:\s*\[([\s\S]*)/i);
      if (enrichmentMatch) {
        const rawBlock = enrichmentMatch[1];
        const lastClose = rawBlock.lastIndexOf(']');
        if (lastClose !== -1) {
          const validBlock = rawBlock.slice(0, lastClose + 1);
          structured = { enrichment: JSON.parse(`[${validBlock.replace(/,\s*$/, '')}]`) };
        }
      }
    } catch {}
  }

  // Fallback: If model returned an object with candidate_ids as keys e.g. {"c_1": {...}}
  if (!structured && clean.startsWith('{')) {
    try {
      const genericObj = JSON.parse(clean);
      if (genericObj && typeof genericObj === 'object' && !Array.isArray(genericObj)) {
        const keys = Object.keys(genericObj);
        if (keys.some(k => k.startsWith('c_'))) {
          structured = {
            enrichment: keys.filter(k => k.startsWith('c_')).map(k => ({
              candidate_id: k,
              ...(typeof genericObj[k] === 'object' ? genericObj[k] : {})
            }))
          };
        }
      }
    } catch {}
  }

  if (!structured) {
    result.status = 'INVALID_JSON';
    result.missingIds = [...expectedCandidateIds];
    return result;
  }

  let list = null;
  if (Array.isArray(structured)) {
    list = structured;
  } else if (Array.isArray(structured.enrichment)) {
    list = structured.enrichment;
  } else if (Array.isArray(structured.items)) {
    list = structured.items;
  } else {
    result.status = 'SCHEMA_MISMATCH';
    result.missingIds = [...expectedCandidateIds];
    return result;
  }

  const expectedSet = new Set((expectedCandidateIds || []).map(id => String(id).trim().toLowerCase()));
  const seenReturned = new Set();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const cid = item.candidate_id || item.id || null;
    const title = item.title || null;
    const sources = Array.isArray(item.commercial_sources) ? item.commercial_sources : (item.product_url ? [item] : []);

    if (cid || title) {
      if (cid) {
        const normCid = String(cid).trim().toLowerCase();
        if (seenReturned.has(normCid)) {
          if (!result.duplicateIds.includes(normCid)) {
            result.duplicateIds.push(normCid);
          }
        } else {
          seenReturned.add(normCid);
        }
        result.returnedIds.push(normCid);
        if (expectedSet.size > 0 && !expectedSet.has(normCid)) {
          if (!result.unexpectedIds.includes(normCid)) {
            result.unexpectedIds.push(normCid);
          }
        }
      }
      result.push({
        candidate_id: cid,
        title,
        commercial_sources: sources
      });
    }
  }

  // Detect missing candidate IDs
  if (Array.isArray(expectedCandidateIds) && expectedCandidateIds.length > 0) {
    result.missingIds = expectedCandidateIds.filter(expectedId => !seenReturned.has(String(expectedId).trim().toLowerCase()));
  }

  // Native schema contract is validated if output parsed as structured enrichment array
  result.native_schema_validated = Array.isArray(structured.enrichment) || Array.isArray(list);

  if (result.length > 0) {
    result.status = (result.missingIds.length > 0) ? 'PARTIAL_ENRICHMENT' : 'VALID_ENRICHMENT';
  } else {
    result.status = 'EMPTY_VALID_ENRICHMENT';
  }

  return result;
}

/**
 * Pre-Flight Cost & Token Estimator
 * Computes exact ranges locally without executing any paid OpenAI call.
 */
export function calculatePreFlightEstimate({
  query,
  country = 'UY',
  researchDepth = 'ECONOMICO',
  requestedModel = 'AUTO',
  isWebSearch = true,
  timeScope = 'ALL_TIME',
  productFamily = 'ALL',
  product_family,
  resultLimit = 'AUTO',
  cacheInfo = null
}) {
  const effectiveFamily = productFamily !== 'ALL' ? productFamily : (product_family || 'ALL');
  const mode = resolveResearchMode(researchDepth);
  const normLimit = normalizeResultLimit(resultLimit);
  const batchPlan = planDiscoveryBatches(normLimit, mode);

  const discoveryPrompt = buildDiscoveryPrompt(query, country, mode, timeScope, effectiveFamily, normLimit);
  const discoveryPromptTokens = estimateTokensLocally(discoveryPrompt);
  const complexity = analyzeQueryComplexity(query);

  // Validate manual model override
  const modelValidation = validateRequestedModel(requestedModel, {
    engine: 'RESEARCH_INTELLIGENCE',
    requiresWebSearch: isWebSearch
  });

  const isManualOverride = !modelValidation.isAuto && modelValidation.valid;
  const targetModel = isManualOverride ? modelValidation.model : mode.model;

  // Web search tool brings extra document tokens depending on research depth
  const rawInputMinPerBatch = isWebSearch ? mode.expectedWebInputTokensMin : (mode.noWebInputTokensMin || 300);
  const rawInputExpectedPerBatch = isWebSearch ? mode.expectedWebInputTokens : (mode.noWebInputTokens || 600);
  const rawInputMaxPerBatch = isWebSearch ? mode.expectedWebInputTokensMax : (mode.noWebInputTokensMax || 1500);

  // Output tokens per batch
  const singleBatchMaxOutput = isWebSearch ? (batchPlan.batches[0]?.maxOutputTokens || mode.maxOutputTokens) : (mode.noWebOutputTokensMax || 750);
  const rawOutputMinPerBatch = isWebSearch ? mode.expectedWebOutputTokensMin : (mode.noWebOutputTokensMin || 200);
  const rawOutputExpectedPerBatch = isWebSearch ? (mode.expectedWebOutputTokens || 600) : (mode.noWebOutputTokens || 300);

  // Phase 1 Discovery Token Calculations
  const discoveryInputMin = Math.round(discoveryPromptTokens + rawInputMinPerBatch);
  const discoveryInputExpected = Math.round((discoveryPromptTokens + rawInputExpectedPerBatch) * complexity.factor);
  const discoveryInputMax = Math.round((discoveryPromptTokens + rawInputMaxPerBatch) * complexity.factor);
  const discoveryOutputExpected = Math.round(rawOutputExpectedPerBatch * (complexity.factor > 1.1 ? 1.08 : 1.0));
  const discoveryOutputMax = singleBatchMaxOutput;

  // Phase 2 Commercial Enrichment Token Calculations
  const enrichmentMaxBatches = isWebSearch ? Math.ceil(batchPlan.targetCount / 15) : 0;
  const enrichmentExpectedBatches = isWebSearch ? 1 : 0;
  const estEnrichPromptTokens = 500;
  const enrichmentInputMin = isWebSearch ? Math.round(estEnrichPromptTokens + rawInputMinPerBatch) : 0;
  const enrichmentInputExpected = isWebSearch ? Math.round((estEnrichPromptTokens + rawInputExpectedPerBatch) * complexity.factor) : 0;
  const enrichmentInputMax = isWebSearch ? Math.round((estEnrichPromptTokens + rawInputMaxPerBatch) * complexity.factor) : 0;
  const enrichmentOutputExpected = isWebSearch ? Math.round(singleBatchMaxOutput * 0.55) : 0;
  const enrichmentOutputMax = isWebSearch ? singleBatchMaxOutput : 0;

  const numBatches = batchPlan.batchCount;
  const estimatedInputTokensMin = discoveryInputMin * numBatches;
  const estimatedInputTokensExpected = discoveryInputExpected * numBatches;
  const estimatedInputTokensMax = discoveryInputMax * numBatches;

  const estimatedOutputTokensMin = rawOutputMinPerBatch * numBatches;
  const estimatedOutputTokensExpected = discoveryOutputExpected * numBatches;
  const maxOutputTokens = discoveryOutputMax * numBatches;

  const rates = getModelPricingRates(targetModel);
  const inputRate = rates?.inputPer1M || 0.15;
  const outputRate = rates?.outputPer1M || 0.60;

  // Base token costs
  const minInputCostUsd = (estimatedInputTokensMin / 1_000_000) * inputRate;
  const expectedInputCostUsd = (estimatedInputTokensExpected / 1_000_000) * inputRate;
  const maxInputCostUsd = (estimatedInputTokensMax / 1_000_000) * inputRate;

  const minOutputCostUsd = (estimatedOutputTokensMin / 1_000_000) * outputRate;
  const expectedOutputCostUsd = (estimatedOutputTokensExpected / 1_000_000) * outputRate;
  const maxOutputCostUsd = (maxOutputTokens / 1_000_000) * outputRate;

  // Total ranges across all batches
  const minTotalUsd = Number((minInputCostUsd + minOutputCostUsd).toFixed(5));
  const expectedTotalUsd = Number((expectedInputCostUsd + expectedOutputCostUsd).toFixed(5));
  const maxTotalUsd = Number((maxInputCostUsd + maxOutputCostUsd).toFixed(5));

  const isCacheHit = Boolean(cacheInfo && (cacheInfo.status === 'HIT' || cacheInfo.status === 'HIT_DISCOVERIES'));
  const isBudgetWarning = !isCacheHit && (maxTotalUsd > (COST_THRESHOLDS.CONFIRMATION_WARNING_USD * numBatches) || (isManualOverride && maxTotalUsd > 0.015));
  const isHardLimit = !isCacheHit && maxTotalUsd > (COST_THRESHOLDS.HARD_LIMIT_USD * Math.max(1, numBatches * 0.7));

  // Compute cheaper alternative comparison against AUTO / ECONOMICO
  let cheaperAlternative = null;
  if (!isCacheHit) {
    if (isManualOverride) {
      const autoRates = getModelPricingRates(mode.model);
      const autoInputCost = (estimatedInputTokensMax / 1_000_000) * (autoRates?.inputPer1M || 0.15);
      const autoOutputCost = (mode.maxOutputTokens / 1_000_000) * (autoRates?.outputPer1M || 0.60);
      const autoMaxTotal = Number((autoInputCost + autoOutputCost).toFixed(5));
      const costMultiplier = autoMaxTotal > 0 ? Number((maxTotalUsd / autoMaxTotal).toFixed(1)) : 1;
      const savingsPercent = maxTotalUsd > autoMaxTotal 
        ? Math.round(((maxTotalUsd - autoMaxTotal) / maxTotalUsd) * 100)
        : 0;

      if (savingsPercent > 10 || costMultiplier > 1.2) {
        cheaperAlternative = {
          mode: mode.key,
          model: mode.model,
          label: `🤖 Automático (${mode.model})`,
          estimated_max_cost_usd: autoMaxTotal,
          cost_multiplier: costMultiplier,
          savings_percent: savingsPercent
        };
      }
    } else if (mode.key !== 'ECONOMICO') {
      const econMode = RESEARCH_MODES.ECONOMICO;
      const econRates = getModelPricingRates(econMode.model);
      const econInputCost = (estimatedInputTokensMax / 1_000_000) * (econRates?.inputPer1M || 0.15);
      const econOutputCost = (econMode.maxOutputTokens / 1_000_000) * (econRates?.outputPer1M || 0.60);
      const econMaxTotal = Number((econInputCost + econOutputCost).toFixed(5));
      const costMultiplier = econMaxTotal > 0 ? Number((maxTotalUsd / econMaxTotal).toFixed(1)) : 1;
      const savingsPercent = maxTotalUsd > econMaxTotal 
        ? Math.round(((maxTotalUsd - econMaxTotal) / maxTotalUsd) * 100)
        : 0;

      if (savingsPercent > 10 || costMultiplier > 1.2) {
        cheaperAlternative = {
          mode: 'ECONOMICO',
          model: econMode.model,
          label: '⚡ Modo Económico (gpt-4o-mini)',
          estimated_max_cost_usd: econMaxTotal,
          cost_multiplier: costMultiplier,
          savings_percent: savingsPercent
        };
      }
    }
  }

  const normFamily = normalizeProductFamily(effectiveFamily);
  const familyObj = COLLECTIBLES_PRODUCT_FAMILIES.find(f => f.id === normFamily);

  return {
    model: targetModel,
    display_name: modelValidation.display_name || targetModel,
    requested_model: requestedModel || 'AUTO',
    automatic_or_manual: isManualOverride ? 'MANUAL' : 'AUTO',
    is_manual_override: isManualOverride,
    model_validation: modelValidation,
    fallback_model: mode.fallbackModel,
    research_depth: mode.key,
    research_depth_label: mode.label,
    product_family: normFamily,
    product_family_label: familyObj ? familyObj.label : 'Todos',
    result_limit: normLimit,
    requested_result_limit: normLimit,
    max_candidates: batchPlan.targetCount,
    batches_planned: batchPlan.batchCount,
    expected_batches: numBatches,
    batch_plan: batchPlan,
    phases: {
      discovery: {
        expected_batches: 1,
        max_batches: batchPlan.maxBatches,
        target_count: batchPlan.targetCount
      },
      commercial_enrichment: {
        expected_batches: 1,
        max_batches: Math.ceil(batchPlan.targetCount / 15),
        batch_size: 15
      }
    },
    estimated_input_tokens: estimatedInputTokensExpected,
    estimated_input_tokens_min: estimatedInputTokensMin,
    estimated_input_tokens_expected: estimatedInputTokensExpected,
    estimated_input_tokens_max: estimatedInputTokensMax,
    estimated_output_tokens_min: estimatedOutputTokensMin,
    estimated_output_tokens_expected: estimatedOutputTokensExpected,
    max_output_tokens: maxOutputTokens,
    estimated_input_cost_usd: Number(expectedInputCostUsd.toFixed(6)),
    estimated_output_cost_usd: Number(expectedOutputCostUsd.toFixed(6)),
    estimated_cost_min_usd: isCacheHit ? 0 : minTotalUsd,
    estimated_cost_expected_usd: isCacheHit ? 0 : expectedTotalUsd,
    estimated_cost_max_usd: isCacheHit ? 0 : maxTotalUsd,
    estimated_total_min_usd: isCacheHit ? 0 : minTotalUsd,
    estimated_total_max_usd: isCacheHit ? 0 : maxTotalUsd,
    estimated_total_avg_usd: isCacheHit ? 0 : expectedTotalUsd,
    web_search_planned: isWebSearch,
    search_scope: 'GLOBAL',
    target_country: country,
    time_scope: timeScope,
    query_complexity: complexity,
    confidence: complexity.confidence,
    confidence_label: complexity.confidence_label,
    cache: cacheInfo || { status: 'MISS', age_seconds: null },
    requires_confirmation: isBudgetWarning,
    hard_limit_exceeded: isHardLimit,
    warning_threshold_usd: COST_THRESHOLDS.CONFIRMATION_WARNING_USD * numBatches,
    cheaper_alternative: cheaperAlternative,
    pricing_source: rates?.source || 'CENTRAL_REGISTRY',
    openai_calls_used: 0
  };
}

/**
 * Normalizes title for deduplication without losing legitimate variants
 * e.g., "Care Bears Cheer Bear 14 inch Plush" vs "Care Bears Grumpy Bear 14 inch Plush" are DISTINCT.
 */
export function normalizeTitleForDedupe(title) {
  if (!title || typeof title !== 'string') return '';
  const cleaned = title
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(inch|inches)\b/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Sort distinct word tokens to catch minor title rearrangements across retailers
  return cleaned.split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Global Deduplicator for Sourcing Candidates across batches
 * Deduplicates by exact ASIN/SKU, exact normalized title, or brand+character+scale combination.
 * Attaches multi-source evidence array when duplicates are merged!
 */
export function deduplicateResearchCandidates(existingList = [], incomingList = []) {
  const merged = [...existingList];
  const seenAsins = new Set();
  const seenTitles = new Set();
  const seenKeys = new Set();

  // Populate seen sets with existing items
  for (const item of merged) {
    if (item.asin && typeof item.asin === 'string') {
      seenAsins.add(item.asin.toUpperCase().trim());
    }
    const normT = normalizeTitleForDedupe(item.title);
    if (normT) seenTitles.add(normT);
    const key = `${(item.brand || '').toLowerCase().trim()}|${(item.franchise || '').toLowerCase().trim()}|${normT}`;
    seenKeys.add(key);
    if (!Array.isArray(item.evidence)) {
      item.evidence = [];
      if (item.evidence_snippet || item.url) {
        item.evidence.push({
          url: item.url || null,
          retailer: item.retailer || null,
          snippet: item.evidence_snippet || null,
          price_usd: item.origin_price_usd ?? null,
          observed_at: new Date().toISOString()
        });
      }
    }
  }

  for (const candidate of incomingList) {
    if (!candidate || !candidate.title) continue;
    const asin = (candidate.asin && typeof candidate.asin === 'string') ? candidate.asin.toUpperCase().trim() : null;
    const normT = normalizeTitleForDedupe(candidate.title);
    const key = `${(candidate.brand || '').toLowerCase().trim()}|${(candidate.franchise || '').toLowerCase().trim()}|${normT}`;

    let duplicateIndex = -1;
    if (asin && candidate.identifier_verification === 'SOURCE_VERIFIED' && seenAsins.has(asin)) {
      duplicateIndex = merged.findIndex(m => m.identifier_verification === 'SOURCE_VERIFIED' && m.asin && m.asin.toUpperCase().trim() === asin && normalizeTitleForDedupe(m.title) === normT);
    } else if (seenTitles.has(normT)) {
      duplicateIndex = merged.findIndex(m => normalizeTitleForDedupe(m.title) === normT);
    } else if (seenKeys.has(key)) {
      duplicateIndex = merged.findIndex(m => `${(m.brand || '').toLowerCase().trim()}|${(m.franchise || '').toLowerCase().trim()}|${normalizeTitleForDedupe(m.title)}` === key);
    }

    if (duplicateIndex >= 0) {
      const previous = merged[duplicateIndex];
      const variantFields = ['brand', 'character', 'size', 'edition', 'wave', 'color', 'sku', 'version', 'packaging', 'exclusive_retailer', 'release_date'];
      if (variantFields.some(f => previous[f] && candidate[f] && String(previous[f]).toLowerCase() !== String(candidate[f]).toLowerCase()) ||
        (previous.asin && candidate.asin && previous.asin !== candidate.asin)) duplicateIndex = -1;
    }

    if (duplicateIndex >= 0) {
      // Merge evidence into existing candidate without replacing authoritative fields if already set
      const existing = merged[duplicateIndex];
      if (!Array.isArray(existing.evidence)) {
        existing.evidence = [];
      }
      // Merge candidate evidence array if already present
      if (Array.isArray(candidate.evidence)) {
        for (const ev of candidate.evidence) {
          if (!existing.evidence.some(e => e.url && ev.url && e.url === ev.url)) {
            existing.evidence.push(ev);
          }
        }
      }
      if (candidate.url || candidate.evidence_snippet) {
        const alreadyHasSource = existing.evidence.some(e => e.url && candidate.url && e.url === candidate.url);
        if (!alreadyHasSource) {
          existing.evidence.push({
            url: candidate.url || null,
            retailer: candidate.retailer || null,
            snippet: candidate.evidence_snippet || null,
            price_usd: candidate.origin_price_usd ?? null,
            observed_at: new Date().toISOString()
          });
        }
      }
      // Fill missing fields if existing didn't have them
      if (!existing.origin_price_usd && candidate.origin_price_usd) {
        existing.origin_price_usd = candidate.origin_price_usd;
      }
      if (!existing.image_url && candidate.image_url) {
        existing.image_url = candidate.image_url;
      }
      if (!existing.asin && candidate.asin) {
        existing.asin = candidate.asin;
      }
      if (!existing.url && candidate.url) {
        existing.url = candidate.url;
      }
    } else {
      // New unique candidate!
      if (asin) seenAsins.add(asin);
      if (normT) seenTitles.add(normT);
      seenKeys.add(key);

      const normalizedCandidate = { ...candidate };
      if (!Array.isArray(normalizedCandidate.evidence)) {
        normalizedCandidate.evidence = [];
        if (candidate.evidence_snippet || candidate.url) {
          normalizedCandidate.evidence.push({
            url: candidate.url || null,
            retailer: candidate.retailer || null,
            snippet: candidate.evidence_snippet || null,
            price_usd: candidate.origin_price_usd ?? null,
            observed_at: new Date().toISOString()
          });
        }
      }
      merged.push(normalizedCandidate);
    }
  }

  return merged;
}

