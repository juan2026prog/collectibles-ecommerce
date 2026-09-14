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
  uruguayMarketGapScore?: number; // 0 - 100
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
    demand: number;        // 0 - 25
    margin: number;        // 0 - 20
    market_gap: number;    // 0 - 15
    seller: number;        // 0 - 10
    availability: number;  // 0 - 10
    authenticity: number;  // 0 - 10
    trend: number;         // 0 - 10
  };
}

/**
 * Evalúa una Oportunidad de Sourcing y retorna un scoring explicable con reason codes y breakdown oficial de 7 componentes.
 */
export function evaluateOpportunityScore(input: OpportunityEvaluationInput): OpportunityScoreResult {
  const reasonCodes: OpportunityReasonCode[] = [];

  const demandRaw = Math.min(100, Math.max(0, input.demandScore));
  const sellerTrust = Math.min(100, Math.max(0, input.sellerTrustScore ?? input.retailerTrustScore ?? 85));
  const marginPct = Math.max(0, input.marginPercent);
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

  // Reason code for catalog gap
  const gapRaw = input.uruguayMarketGapScore ?? 80;
  if (gapRaw >= 70 || (input.zeroResultCount ?? 0) > 0) {
    reasonCodes.push({
      code: 'CATALOG_GAP',
      label: 'Demanda insatisfecha o gap de catálogo detectado en Uruguay',
      type: 'positive',
      weight: 10
    });
  }

  // 2. Componentes Oficiales (0 - 100 Total)
  // Componente 1: Demand (0 - 25)
  const demandComponent = Number(((demandRaw / 100) * 25).toFixed(1));

  // Componente 2: Margin / Profitability (0 - 20)
  // 30% margin or higher gets max 20 pts
  const marginComponent = Number((Math.min(20, (marginPct / 30) * 20)).toFixed(1));

  // Componente 3: Uruguay Market Gap (0 - 15)
  const marketGapComponent = Number(((gapRaw / 100) * 15).toFixed(1));

  // Componente 4: Seller Confidence (0 - 10)
  const sellerComponent = Number(((sellerTrust / 100) * 10).toFixed(1));
  let sellerPenalty = 0;
  if (sellerTrust < 60) {
    sellerPenalty = 15;
    reasonCodes.push({
      code: 'UNRELIABLE_SELLER',
      label: `Vendedor con confiabilidad baja o dudosa (${sellerTrust}%)`,
      type: 'negative',
      weight: -20
    });
  }

  // Componente 5: Availability / Stock (0 - 10)
  const availabilityComponent = input.inStock ? 10 : 0;

  // Componente 6: Authenticity (0 - 10)
  const authenticityComponent = input.isOfficialVerified ? 10 : 4;

  // Componente 7: Radar / Trend (0 - 10)
  let trendPoints = 0;
  if ((input.radarInterest ?? 0) > 0 || (input.wishlistInterest ?? 0) > 0) trendPoints += 5;
  if ((input.zeroResultCount ?? 0) > 0 || (input.trendVelocity ?? 0) > 10) trendPoints += 5;
  const trendComponent = Math.min(10, trendPoints);

  const rawSum = demandComponent + marginComponent + marketGapComponent + sellerComponent + availabilityComponent + authenticityComponent + trendComponent - sellerPenalty;
  const finalScore = Math.min(100, Math.max(0, Math.round(rawSum)));

  return {
    opportunityScore: finalScore,
    profitabilityStatus,
    reasonCodes,
    breakdown: {
      demand: demandComponent,
      margin: marginComponent,
      market_gap: marketGapComponent,
      seller: sellerComponent,
      availability: availabilityComponent,
      authenticity: authenticityComponent,
      trend: trendComponent
    }
  };
}
