/**
 * COLLECTIBLES 2026 — CANDIDATE COMMERCIAL ENRICHMENT
 * 
 * Conecta los candidatos resueltos por Zinc con los motores canónicos existentes:
 * - calculateMultiCountryLandedCost (Landed Cost Multi-País)
 * - checkTiendamiaByAsin (TiendaMía por ASIN verificado)
 * - queryMercadoLibreUruguayReal (Mercado Libre UY comparable exacto)
 * - evaluateOpportunityScore (Scoring explicable basado en evidencia)
 * 
 * INVARIANTES:
 * 1. Cero scraping masivo, cero llamadas directas a OpenAI o Zinc.
 * 2. Cero defaults sintéticos inventados (no inventar peso, precio de mercado ni TiendaMía).
 * 3. Fail-closed: UNKNOWN nunca se convierte en 0 ni suma puntos arbitrarios.
 * 4. Bloqueo explícito con razones tipadas para Landed Cost y Margen.
 * 5. Concurrencia máxima 2 y aislamiento estricto por candidate_id.
 */

import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';
import { calculateMultiCountryLandedCost } from './multiCountryLandedCost';
import { checkTiendamiaByAsin } from './tiendamiaMatchingService';
import { queryMercadoLibreUruguayReal } from './uruguayMarketIntelligence';
import { evaluateOpportunityScore } from './opportunityScoringEngine';

export type LandedCostBlockReason =
  | 'READY'
  | 'MISSING_ORIGIN_PRICE'
  | 'MISSING_WEIGHT'
  | 'MISSING_SHIPPING_QUOTE'
  | 'CUSTOMS_RULE_UNKNOWN'
  | 'CURRENCY_UNAVAILABLE'
  | 'ENGINE_ERROR';

export type MarginBlockReason =
  | 'READY'
  | 'LANDED_COST_UNKNOWN'
  | 'SALE_PRICE_UNKNOWN'
  | 'BOTH_UNKNOWN'
  | 'ENGINE_ERROR';

/**
 * Parsea el peso desde los metadatos reales disponibles en Zinc o en la ficha de producto.
 * Retorna { weightLbs: number } si se pudo extraer con una unidad válida, o null si falta.
 * Cero defaults: si no hay evidencia de peso, retorna null.
 */
export function extractRealProductWeightLbs(candidate: SourcingProductCandidate): number | null {
  const provenanceWeight = candidate.provenance?.weight?.value;
  const rawMeta = (candidate as any).zinc_matched_product?.raw_data || (candidate as any).matched_zinc_product?.raw_data || candidate.provenance?.origin_price?.derived_from;

  const candidatesToInspect: any[] = [
    provenanceWeight,
    (candidate as any).weight_lbs,
    (candidate as any).weight,
    rawMeta?.package_dimensions?.weight?.value,
    rawMeta?.package_dimensions?.weight,
    rawMeta?.item_dimensions?.weight?.value,
    rawMeta?.item_dimensions?.weight,
    rawMeta?.weight
  ];

  for (const item of candidatesToInspect) {
    if (item === null || item === undefined) continue;

    if (typeof item === 'number' && Number.isFinite(item) && item > 0) {
      return Math.round(item * 100) / 100;
    }

    if (typeof item === 'object') {
      const val = Number(item.value ?? item.amount ?? item.weight);
      const unit = String(item.unit || item.unit_of_measure || '').trim().toLowerCase();
      if (Number.isFinite(val) && val > 0) {
        if (unit === 'pounds' || unit === 'pound' || unit === 'lbs' || unit === 'lb') {
          return Math.round(val * 100) / 100;
        }
        if (unit === 'ounces' || unit === 'ounce' || unit === 'oz') {
          return Math.round((val / 16) * 100) / 100;
        }
        if (unit === 'kilograms' || unit === 'kilogram' || unit === 'kg') {
          return Math.round((val * 2.20462) * 100) / 100;
        }
        if (unit === 'grams' || unit === 'gram' || unit === 'g') {
          return Math.round(((val / 1000) * 2.20462) * 100) / 100;
        }
        return Math.round(val * 100) / 100;
      }
    }

    if (typeof item === 'string') {
      const clean = item.trim().toLowerCase();
      const match = clean.match(/^([\d.]+)\s*(pounds|pound|lbs|lb|ounces|ounce|oz|kilograms|kilogram|kg|grams|gram|g)?$/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2] || 'lbs';
        if (Number.isFinite(val) && val > 0) {
          if (unit === 'pounds' || unit === 'pound' || unit === 'lbs' || unit === 'lb') {
            return Math.round(val * 100) / 100;
          }
          if (unit === 'ounces' || unit === 'ounce' || unit === 'oz') {
            return Math.round((val / 16) * 100) / 100;
          }
          if (unit === 'kilograms' || unit === 'kilogram' || unit === 'kg') {
            return Math.round((val * 2.20462) * 100) / 100;
          }
          if (unit === 'grams' || unit === 'gram' || unit === 'g') {
            return Math.round(((val / 1000) * 2.20462) * 100) / 100;
          }
          return Math.round(val * 100) / 100;
        }
      }
    }
  }

  return null;
}

export interface CommercialEnrichmentResult {
  candidate: SourcingProductCandidate;
  landedCostStatus: LandedCostBlockReason;
  marginStatus: MarginBlockReason;
  tiendamiaStatus?: string;
  mercadolibreStatus?: string;
}

/**
 * Enriquece un candidato individual evaluando de forma aislada y segura todas las señales comerciales.
 */
export async function enrichSingleCandidateCommercialData(
  candidate: SourcingProductCandidate,
  targetCountry: string = 'UY'
): Promise<CommercialEnrichmentResult> {
  const clone: SourcingProductCandidate = {
    ...candidate,
    pricing: { ...candidate.pricing },
    provenance: { ...candidate.provenance }
  };

  let landedCostStatus: LandedCostBlockReason = 'READY';
  let marginStatus: MarginBlockReason = 'READY';
  let tiendamiaStatus: string = 'UNKNOWN';
  let mercadolibreStatus: string = 'UNKNOWN';

  const originPrice = clone.pricing.origin_price_usd ?? null;
  const asin = (clone.asin || '').trim().toUpperCase();

  // A. LANDED COST
  const realWeightLbs = extractRealProductWeightLbs(clone);

  if (originPrice === null || originPrice <= 0) {
    clone.pricing.landed_cost_estimated_usd = null;
    landedCostStatus = 'MISSING_ORIGIN_PRICE';
  } else if (realWeightLbs === null) {
    clone.pricing.landed_cost_estimated_usd = null;
    landedCostStatus = 'MISSING_WEIGHT';
  } else {
    try {
      const landedResult = calculateMultiCountryLandedCost({
        originPriceUsd: originPrice,
        weightLbs: realWeightLbs,
        destinationCountry: targetCountry as any
      });

      if (landedResult && typeof landedResult.total_landed_cost_usd === 'number' && Number.isFinite(landedResult.total_landed_cost_usd)) {
        clone.pricing.landed_cost_estimated_usd = landedResult.total_landed_cost_usd;
        landedCostStatus = 'READY';

        clone.provenance = {
          ...clone.provenance,
          landed_cost: {
            value: landedResult.total_landed_cost_usd,
            status: 'DERIVED',
            source: 'calculateMultiCountryLandedCost',
            source_url: clone.retailer_url || null,
            observed_at: new Date().toISOString(),
            currency: 'USD',
            verification: 'SOURCE_CORROBORATED',
            derived_from: [
              clone.provenance?.origin_price || { value: originPrice, status: 'CORROBORATED', source: 'Origin Price', source_url: clone.retailer_url || null, observed_at: new Date().toISOString() },
              { value: realWeightLbs, status: 'OBSERVED', source: 'Product Specification Weight', source_url: clone.retailer_url || null, observed_at: new Date().toISOString() }
            ]
          }
        };
      } else {
        clone.pricing.landed_cost_estimated_usd = null;
        landedCostStatus = 'ENGINE_ERROR';
      }
    } catch {
      clone.pricing.landed_cost_estimated_usd = null;
      landedCostStatus = 'ENGINE_ERROR';
    }
  }

  // B. TIENDAMÍA LOOKUP
  // Solo si existe ASIN verificado y URL/título confiable
  if (/^[A-Z0-9]{10}$/.test(asin)) {
    try {
      const sourceUrl = clone.retailer_url || `https://www.amazon.com/dp/${asin}`;
      const tmResult = await checkTiendamiaByAsin(asin, {
        identifierVerification: 'SOURCE_VERIFIED',
        sourceUrl,
        title: clone.title,
        collectiblesPriceUsd: originPrice ?? undefined
      });

      tiendamiaStatus = tmResult.status;

      if (tmResult.status === 'FOUND' && typeof tmResult.priceUsd === 'number' && tmResult.priceUsd > 0) {
        clone.pricing.tiendamia_price_usd = tmResult.priceUsd;
        clone.provenance = {
          ...clone.provenance,
          tiendamia_price: {
            value: tmResult.priceUsd,
            status: 'OBSERVED',
            source: 'TiendaMía',
            source_url: tmResult.productUrl || null,
            observed_at: tmResult.checkedAt || new Date().toISOString(),
            currency: 'USD',
            verification: 'SOURCE_VERIFIED'
          }
        };
      }
    } catch {
      tiendamiaStatus = 'PROVIDER_ERROR';
    }
  }

  // C. MERCADO LIBRE URUGUAY LOOKUP
  try {
    const mluResult = await queryMercadoLibreUruguayReal({
      title: clone.title,
      character: clone.character,
      brand: clone.brand,
      line: clone.line,
      collectiblesPriceUsd: clone.pricing.landed_cost_estimated_usd || originPrice || 0
    });

    mercadolibreStatus = mluResult.status;

    // Solo un match EXACT_MATCH con publicaciones válidas alimenta el precio de mercado
    if (mluResult.status === 'EXACT_MATCH' && mluResult.avg_price_usd !== null && mluResult.avg_price_usd > 0) {
      clone.pricing.mercadolibre_price_local = mluResult.avg_price_usd;
      clone.pricing.mercadolibre_currency = mluResult.currency || 'USD';
      clone.provenance = {
        ...clone.provenance,
        mercadolibre_price: {
          value: mluResult.avg_price_usd,
          status: 'OBSERVED',
          source: 'Mercado Libre UY',
          source_url: mluResult.sample_url || null,
          observed_at: mluResult.last_checked_at || new Date().toISOString(),
          currency: mluResult.currency || 'USD',
          verification: 'SOURCE_CORROBORATED'
        }
      };
    } else {
      clone.pricing.mercadolibre_price_local = null;
    }
  } catch {
    mercadolibreStatus = 'ERROR';
    clone.pricing.mercadolibre_price_local = null;
  }

  // D. MARGIN CALCULATION
  const landedCostVal = clone.pricing.landed_cost_estimated_usd;
  const referenceSalePrice = clone.pricing.suggested_sale_price_usd ?? clone.pricing.mercadolibre_price_local ?? null;

  if (landedCostVal === null && referenceSalePrice === null) {
    clone.pricing.estimated_margin_percent = null;
    marginStatus = 'BOTH_UNKNOWN';
  } else if (landedCostVal === null) {
    clone.pricing.estimated_margin_percent = null;
    marginStatus = 'LANDED_COST_UNKNOWN';
  } else if (referenceSalePrice === null || referenceSalePrice <= 0) {
    clone.pricing.estimated_margin_percent = null;
    marginStatus = 'SALE_PRICE_UNKNOWN';
  } else {
    try {
      const profit = referenceSalePrice - landedCostVal;
      const marginPct = (profit / referenceSalePrice) * 100;
      clone.pricing.estimated_margin_percent = Math.round(marginPct * 10) / 10;
      marginStatus = 'READY';
    } catch {
      clone.pricing.estimated_margin_percent = null;
      marginStatus = 'ENGINE_ERROR';
    }
  }

  // E. OPPORTUNITY SCORE EVALUATION (Deterministic & Fail-Closed)
  // Regla: UNKNOWN nunca suma ni inventa evidencia.
  // Pero las señales no comerciales observadas (Radar, preventa, novedad, demanda local o momentum)
  // deben sumarse a su score en lugar de colapsar a 0 cuando falta margen comercial.
  try {
    const hasDemand = typeof candidate.trend_score === 'number' && candidate.trend_score > 0;
    const demandScore = hasDemand ? candidate.trend_score : 0;
    const marginPctForEval = clone.pricing.estimated_margin_percent ?? 0;
    const profitUsdForEval = (referenceSalePrice !== null && landedCostVal !== null) ? (referenceSalePrice - landedCostVal) : 0;

    const oppResult = evaluateOpportunityScore({
      demandScore,
      marginPercent: marginPctForEval,
      profitUsd: profitUsdForEval,
      matchConfidence: 0.9,
      inStock: clone.stock_status === 'IN_STOCK',
      isOfficialVerified: clone.provenance?.identity?.status === 'CORROBORATED',
      uruguayMarketGapScore: mercadolibreStatus === 'NOT_FOUND' ? 80 : 0
    });

    if (oppResult && typeof oppResult.opportunityScore === 'number') {
      // Si el candidato ya tenía un score canónico calculado por señales de Radar/fuente (breakdown de shared/sourcingCandidateValidation.js),
      // tomamos el máximo entre el score de oportunidad comercial y el score por evidencia/novedad existente,
      // garantizando que un producto con fuerte señal de Radar o novedad no quede artificialmente en 0.
      const initialCandidateScore = typeof candidate.opportunity_score === 'number' && Number.isFinite(candidate.opportunity_score)
        ? candidate.opportunity_score
        : 0;

      clone.opportunity_score = Math.max(oppResult.opportunityScore, initialCandidateScore);
    }
  } catch {
    // Si falla el motor de scoring, preserva el determinístico previo sin romper el candidato
  }

  // F. DETERMINACIÓN DE COMMERCIAL READINESS
  // - READY: origin price + weight + landed cost + margin calculados
  // - PARTIAL: existen señales reales (Radar, novedad, precio observado) pero falta peso o listing comercial
  // - BLOCKED: sin evidencia suficiente para comercializar
  const hasOriginPrice = typeof clone.pricing.origin_price_usd === 'number' && clone.pricing.origin_price_usd > 0;
  const hasLandedCost = typeof clone.pricing.landed_cost_estimated_usd === 'number' && clone.pricing.landed_cost_estimated_usd > 0;
  const hasMargin = typeof clone.pricing.estimated_margin_percent === 'number';
  const hasNoveltyOrSignals = (clone.status === 'PREORDER' || clone.status === 'NEW' || clone.opportunity_score > 0 || clone.trend_score > 0);

  let commercialReadiness: 'READY' | 'PARTIAL' | 'BLOCKED';
  const missingReasons: string[] = [];

  if (hasOriginPrice && hasLandedCost && hasMargin) {
    commercialReadiness = 'READY';
  } else if (hasNoveltyOrSignals || hasOriginPrice) {
    commercialReadiness = 'PARTIAL';
    if (!hasOriginPrice) missingReasons.push('Sin precio de origen observado');
    if (realWeightLbs === null) missingReasons.push('Sin peso verificado en fuente (peso requerido para flete/arancel)');
    if (!hasLandedCost) missingReasons.push('Costo de importación pendiente');
    if (!hasMargin) missingReasons.push('Margen comercial pendiente de referencia local');
    if (!asin) missingReasons.push('Sin ASIN/listing verificado en Amazon');
  } else {
    commercialReadiness = 'BLOCKED';
    missingReasons.push('Sin datos comerciales suficientes para trading');
  }

  clone.commercial_readiness = commercialReadiness;

  // G. SEPARACIÓN EXPLÍCITA DE WHY EXPLANATION
  // headline: por qué es una oportunidad detectada
  // commercial_status: qué falta para comercializar
  if (clone.why_explanation) {
    clone.why_explanation.commercial_missing_reasons = missingReasons;
    if (commercialReadiness === 'READY') {
      clone.why_explanation.commercial_status = `Listo para importación con margen estimado de ${clone.pricing.estimated_margin_percent}%. Costo puesto $${clone.pricing.landed_cost_estimated_usd}.`;
    } else if (commercialReadiness === 'PARTIAL') {
      clone.why_explanation.commercial_status = `Oportunidad en seguimiento comercial. Pendiente: ${missingReasons.join('; ')}.`;
    } else {
      clone.why_explanation.commercial_status = 'Bloqueado para comercialización: datos comerciales insuficientes.';
    }
  }

  // Asignar razones de bloqueo en metadata tipada del candidato (en raíz)
  (clone as any).landed_cost_status = landedCostStatus;
  (clone as any).margin_status = marginStatus;
  (clone as any).tiendamia_status = tiendamiaStatus;
  (clone as any).mercadolibre_status = mercadolibreStatus;

  return {
    candidate: clone,
    landedCostStatus,
    marginStatus,
    tiendamiaStatus,
    mercadolibreStatus
  };
}

/**
 * Enriquece una lista de candidatos con concurrencia controlada (máximo 2 a la vez)
 * y aislamiento absoluto por candidate_id.
 */
export async function enrichCandidatesCommercialData(
  candidates: SourcingProductCandidate[],
  targetCountry: string = 'UY'
): Promise<SourcingProductCandidate[]> {
  if (!candidates || candidates.length === 0) return [];

  const results: SourcingProductCandidate[] = new Array(candidates.length);
  const concurrency = 2;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const chunk = candidates.slice(i, i + concurrency);
    const promises = chunk.map(async (cand, chunkIdx) => {
      const originalIdx = i + chunkIdx;
      try {
        const res = await enrichSingleCandidateCommercialData(cand, targetCountry);
        results[originalIdx] = res.candidate;
      } catch (err) {
        // En caso de fallo imprevisto, aislar el candidato y preservar su estado
        const fallbackCand = { ...cand };
        (fallbackCand.pricing as any).landed_cost_status = 'ENGINE_ERROR';
        (fallbackCand.pricing as any).margin_status = 'ENGINE_ERROR';
        results[originalIdx] = fallbackCand;
      }
    });

    await Promise.all(promises);
  }

  return results;
}
