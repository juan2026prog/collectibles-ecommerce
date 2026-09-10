/**
 * SOURCING INTELLIGENCE — FASE 4 — OPPORTUNITY SCORING ENGINE
 * Collectibles 2026
 * 
 * Algoritmo explicable para el cálculo del Opportunity Score (0–100)
 * combinando Demanda, Confiabilidad del Vendedor, Margen Comercial, Stock y Autenticidad.
 */

import type { OpportunityReasonCode, ProfitabilityStatus } from '../../types/sourcingAdaptiveTypes';

export interface OpportunityEvaluationInput {
  demandScore: number; // 0 - 100
  sellerTrustScore?: number; // 0 - 100
  marginPercent: number; // e.g. 25.5
  profitUsd: number; // e.g. 15.00
  matchConfidence: number; // 0.00 - 1.00
  inStock: boolean;
  isOfficialVerified: boolean;
  priceVolatilityScore?: number; // 0 - 100
  retailerTrustScore?: number; // 0 - 100
  zeroResultCount?: number;
  wishlistInterest?: number;
  radarInterest?: number;
  trendVelocity?: number;
}

export interface OpportunityScoreResult {
  opportunityScore: number; // 0 - 100
  profitabilityStatus: ProfitabilityStatus;
  reasonCodes: OpportunityReasonCode[];
  breakdown: {
    demandContribution: number;
    sellerTrustContribution: number;
    marginContribution: number;
    stockContribution: number;
    matchContribution: number;
  };
}

/**
 * Evalúa una Oportunidad de Sourcing y retorna un scoring explicable con reason codes.
 */
export function evaluateOpportunityScore(input: OpportunityEvaluationInput): OpportunityScoreResult {
  const reasonCodes: OpportunityReasonCode[] = [];

  const demandScore = Math.min(100, Math.max(0, input.demandScore));
  const sellerTrust = Math.min(100, Math.max(0, input.sellerTrustScore ?? input.retailerTrustScore ?? 85));
  const matchConf = Math.min(1.0, Math.max(0, input.matchConfidence));
  const marginPct = input.marginPercent;
  const profitUsd = input.profitUsd;

  // 1. Profitability Gate Evaluation
  let profitabilityStatus: ProfitabilityStatus = 'VIABLE';
  if (profitUsd <= 0 || marginPct < 5) {
    profitabilityStatus = 'NOT_VIABLE';
    reasonCodes.push({
      code: 'LOW_MARGIN',
      label: 'Margen comercial bajo o pérdida en importación',
      type: 'negative',
      weight: -25
    });
  } else if (marginPct < 15) {
    profitabilityStatus = 'MARGINAL';
    reasonCodes.push({
      code: 'LOW_MARGIN',
      label: 'Margen ajustado (< 15%)',
      type: 'negative',
      weight: -10
    });
  } else {
    reasonCodes.push({
      code: 'STRONG_MARGIN',
      label: `Margen positivo estimado (${marginPct.toFixed(1)}%)`,
      type: 'positive',
      weight: 15
    });
  }

  // 2. Authenticity & Seller Evaluation
  if (!input.isOfficialVerified) {
    reasonCodes.push({
      code: 'AUTHENTICITY_RISK',
      label: 'Licencia o fabricante requiere verificación editorial',
      type: 'negative',
      weight: -15
    });
  }

  if (sellerTrust < 80) {
    reasonCodes.push({
      code: 'UNRELIABLE_SELLER',
      label: `Reputación de vendedor inferior al umbral recomendado (${sellerTrust}%)`,
      type: 'negative',
      weight: -20
    });
  }

  if (!input.inStock) {
    reasonCodes.push({
      code: 'NO_STOCK',
      label: 'Sin stock inmediato confirmado en el proveedor',
      type: 'negative',
      weight: -20
    });
  }

  // 3. Positive Demand Reason Attribution
  if ((input.zeroResultCount ?? 0) > 0) {
    reasonCodes.push({
      code: 'HIGH_ZERO_RESULT_SEARCH',
      label: `${input.zeroResultCount} búsquedas sin resultados registrados`,
      type: 'positive',
      weight: 15
    });
  }

  if ((input.trendVelocity ?? 0) > 20) {
    reasonCodes.push({
      code: 'RAPID_DEMAND_GROWTH',
      label: `Crecimiento acelerado de demanda (+${Math.round(input.trendVelocity!)}%)`,
      type: 'positive',
      weight: 10
    });
  }

  if ((input.wishlistInterest ?? 0) > 0) {
    reasonCodes.push({
      code: 'HIGH_WISHLIST_INTEREST',
      label: `Solicitado en wishlist / vitrina por usuarios`,
      type: 'positive',
      weight: 10
    });
  }

  if ((input.radarInterest ?? 0) > 0) {
    reasonCodes.push({
      code: 'RADAR_TRAFFIC',
      label: 'Impulsado por tráfico e interés en Radar',
      type: 'positive',
      weight: 10
    });
  }

  reasonCodes.push({
    code: 'CATALOG_GAP',
    label: 'Producto no presente en el catálogo local de Uruguay',
    type: 'positive',
    weight: 10
  });

  // 4. Mathematical Opportunity Score Computation (0-100)
  const demandContrib = demandScore * 0.35;
  const sellerContrib = sellerTrust * 0.20;
  const marginContrib = Math.min(25, Math.max(0, marginPct * 0.8)) * (20 / 25);
  const stockContrib = input.inStock ? 15 : 0;
  const matchContrib = matchConf * 10;

  const rawScore = demandContrib + sellerContrib + marginContrib + stockContrib + matchContrib;

  // Apply negative penalties
  let penaltySum = 0;
  reasonCodes.filter(r => r.type === 'negative').forEach(r => {
    penaltySum += Math.abs(r.weight || 0);
  });

  const finalScore = Math.min(100, Math.max(0, Math.round(rawScore - penaltySum)));

  return {
    opportunityScore: finalScore,
    profitabilityStatus,
    reasonCodes,
    breakdown: {
      demandContribution: Number(demandContrib.toFixed(1)),
      sellerTrustContribution: Number(sellerContrib.toFixed(1)),
      marginContribution: Number(marginContrib.toFixed(1)),
      stockContribution: Number(stockContrib.toFixed(1)),
      matchContribution: Number(matchContrib.toFixed(1))
    }
  };
}
