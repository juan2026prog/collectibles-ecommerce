import type { 
  CountryCode, 
  CountryOpportunityScore, 
  GlobalOpportunityScore, 
  RiskLevel 
} from '../../types/sourcingLatam';
import type { SourceOffer, UruguayMarketSummary } from '../../types/sourcing';
import { calculateMultiCountryLandedCost } from './multiCountryLandedCost';
import { countryEngine } from './countryEngine';

export interface EvaluateProductCountryInput {
  canonicalId: string;
  title: string;
  brand?: string;
  character?: string;
  category?: string;
  bestOffer: SourceOffer | null;
  uruguayMarket?: UruguayMarketSummary;
  trendScore?: number; // 0 - 100 from Radar
}

/**
 * Calculates Market Gap Score (0 - 100):
 * High trend/demand combined with low local seller competition yields high market gap score.
 */
export function calculateMarketGapScore(
  trendScore: number = 50,
  localSellersCount: number = 0,
  exactMatchFound: boolean = false
): number {
  let score = trendScore * 0.6; // 60% weight on trend/demand

  if (!exactMatchFound || localSellersCount === 0) {
    score += 40; // Max market gap: high demand, 0 local sellers
  } else if (localSellersCount === 1) {
    score += 25;
  } else if (localSellersCount <= 3) {
    score += 15;
  } else if (localSellersCount > 5) {
    score += 5; // Saturated market
  }

  return Math.min(100, Math.round(score));
}

/**
 * Calculates Country Opportunity Score & Confidence Score per market
 */
export function calculateCountryOpportunityScore(
  countryCode: CountryCode,
  input: EvaluateProductCountryInput
): CountryOpportunityScore {
  const config = countryEngine.getCountryConfig(countryCode);
  const rules = countryEngine.getImportRules(countryCode);
  const reasons: string[] = [];

  if (!input.bestOffer) {
    return {
      country_code: countryCode,
      opportunity_score: 0,
      confidence_score: 0,
      demand_signal: 'UNKNOWN',
      competition_density: 'NONE',
      landed_cost_usd: 0,
      suggested_price_usd: 0,
      estimated_margin_percent: 0,
      market_gap_score: 0,
      status: 'NO_CONFIGURADO',
      reasons: ['Sin oferta de origen válida disponible'],
    };
  }

  // 1. Calculate Landed Cost
  const landedCost = calculateMultiCountryLandedCost({
    originPriceUsd: input.bestOffer.price,
    usaShippingUsd: input.bestOffer.usa_shipping_usd ?? input.bestOffer.domestic_shipping,
    weightLbs: input.bestOffer.estimated_weight_lbs ?? 1.5,
    destinationCountry: countryCode,
    category: input.category,
  });

  // 2. Pricing & Margin Calculation
  const targetMarginPercent = rules.min_target_margin_percent || 15;
  const suggestedPriceUsd = Math.round((landedCost.total_landed_cost_usd / (1 - targetMarginPercent / 100)) * 100) / 100;
  const estimatedMarginPercent = targetMarginPercent;

  // 3. Local Market Competition Analysis
  const localMarket = countryCode === 'UY' ? input.uruguayMarket : undefined;
  const localSellers = localMarket?.sellers_count ?? 0;
  const exactMatch = localMarket?.exact_match_found ?? false;

  const marketGap = calculateMarketGapScore(input.trendScore ?? 60, localSellers, exactMatch);

  // 4. Compute Opportunity Score (0 - 100)
  let opportunity = 50; // Baseline score
  opportunity += (input.trendScore ?? 50) * 0.25;
  opportunity += marketGap * 0.25;

  if (input.bestOffer.seller_verified || input.bestOffer.sold_by_retailer) {
    opportunity += 10;
    reasons.push('Vendedor de origen verificado / oficial');
  }

  if (landedCost.is_franchise_eligible) {
    opportunity += 10;
    reasons.push('Elegible para franquicia sin aranceles extra');
  }

  if (estimatedMarginPercent >= 20) {
    opportunity += 10;
    reasons.push(`Excelente margen comercial proyectado (${estimatedMarginPercent}%)`);
  }

  // 5. Compute Confidence Score (0 - 100)
  let confidence = landedCost.calculation_confidence;
  if (input.bestOffer.data_source === 'LIVE') confidence += 10;
  if (localMarket && localMarket.data_origin === 'LIVE') confidence += 10;
  if (countryCode !== 'UY' && !config.enabled) confidence -= 25;

  const finalOpportunity = Math.min(100, Math.max(0, Math.round(opportunity)));
  const finalConfidence = Math.min(100, Math.max(0, Math.round(confidence)));

  let status = config.enabled ? ('OPERATIVO' as const) : ('CONFIGURADO' as const);
  if (finalConfidence < 40) status = 'NO_VERIFICADO';

  return {
    country_code: countryCode,
    opportunity_score: finalOpportunity,
    confidence_score: finalConfidence,
    demand_signal: (input.trendScore ?? 50) > 70 ? 'HIGH' : 'MEDIUM',
    competition_density: localSellers > 3 ? 'SATURATED' : localSellers > 0 ? 'BALANCED' : 'LOW',
    landed_cost_usd: landedCost.total_landed_cost_usd,
    suggested_price_usd: suggestedPriceUsd,
    estimated_margin_percent: estimatedMarginPercent,
    market_gap_score: marketGap,
    status,
    reasons,
  };
}

/**
 * Calculates Global Opportunity Score across all active/configured LATAM markets
 */
export function calculateGlobalOpportunityScore(
  canonicalId: string,
  input: EvaluateProductCountryInput
): GlobalOpportunityScore {
  const enabledCountries = countryEngine.getAllCountries();
  const scores: CountryOpportunityScore[] = [];

  enabledCountries.forEach(config => {
    const score = calculateCountryOpportunityScore(config.country_code, input);
    scores.push(score);
  });

  scores.sort((a, b) => b.opportunity_score - a.opportunity_score);

  const best = scores.length > 0 ? scores[0] : null;
  const topScores = scores.slice(0, 4);

  // Global score = weighted average of top markets
  const avgTopScore = topScores.reduce((acc, curr) => acc + curr.opportunity_score, 0) / (topScores.length || 1);
  const globalScore = Math.round(avgTopScore);

  const crossMarketCount = scores.filter(s => s.opportunity_score >= 70).length;
  const crossMarketAppeal = crossMarketCount >= 2;

  const reasonsSummary: string[] = [];
  if (best) {
    reasonsSummary.push(`Mejor oportunidad en ${best.country_code} (Score: ${best.opportunity_score}/100)`);
  }
  if (crossMarketAppeal) {
    reasonsSummary.push(`Atractivo cross-market detectado en ${crossMarketCount} países LATAM`);
  }

  return {
    canonical_id: canonicalId,
    global_opportunity_score: globalScore,
    confidence_score: best ? best.confidence_score : 0,
    best_country: best ? best.country_code : null,
    top_countries: scores,
    cross_market_appeal: crossMarketAppeal,
    reasons_summary: reasonsSummary,
  };
}

/**
 * Sourcing Risk Engine
 */
export class SourcingRiskEngine {
  public static evaluateRisk(
    countryCode: CountryCode,
    offer: SourceOffer | null,
    landedCostUsd: number,
    suggestedPriceUsd: number
  ): { riskLevel: RiskLevel; reasonCodes: string[] } {
    const reasonCodes: string[] = [];

    if (!offer) {
      return { riskLevel: 'BLOCKED', reasonCodes: ['NO_SOURCE_OFFER'] };
    }

    if (offer.data_source === 'ERROR') {
      reasonCodes.push('SOURCE_OFFER_ERROR');
    }

    if (offer.freshness_status === 'STALE') {
      reasonCodes.push('STALE_DATA');
    }

    if (offer.reliability_score < 70) {
      reasonCodes.push('RISKY_SELLER');
    }

    const marginUsd = suggestedPriceUsd - landedCostUsd;
    if (marginUsd < 2.0) {
      reasonCodes.push('INSUFFICIENT_MARGIN');
    }

    const readiness = countryEngine.getCountryReadiness(countryCode);
    if (readiness.readiness_score < 40) {
      reasonCodes.push('COUNTRY_NOT_READY');
    }

    let riskLevel: RiskLevel = 'LOW';
    if (reasonCodes.includes('NO_SOURCE_OFFER') || reasonCodes.includes('INSUFFICIENT_MARGIN')) {
      riskLevel = 'BLOCKED';
    } else if (reasonCodes.length >= 2) {
      riskLevel = 'HIGH';
    } else if (reasonCodes.length === 1) {
      riskLevel = 'MEDIUM';
    }

    return { riskLevel, reasonCodes };
  }
}
