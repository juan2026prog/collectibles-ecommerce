import type { BestMarketSelection, CountryCode, DecisionCode } from '../../types/sourcingLatam';
import type { SourceOffer, UruguayMarketSummary } from '../../types/sourcing';
import { 
  calculateCountryOpportunityScore, 
  SourcingRiskEngine 
} from './latamOpportunityEngine';
import { countryEngine } from './countryEngine';

export interface SelectBestMarketInput {
  canonicalId: string;
  title: string;
  brand?: string;
  character?: string;
  category?: string;
  bestOffer: SourceOffer | null;
  uruguayMarket?: UruguayMarketSummary;
  trendScore?: number;
}

/**
 * BestMarketSelector Engine
 * Evaluates candidate canonical product & best source offer across all enabled LATAM markets,
 * selecting the optimal commercial market with structured explainability and decision codes.
 */
export function selectBestMarket(input: SelectBestMarketInput): BestMarketSelection {
  const allCountries = countryEngine.getAllCountries();
  const evaluations = allCountries.map(c => {
    const score = calculateCountryOpportunityScore(c.country_code, input);
    const risk = SourcingRiskEngine.evaluateRisk(
      c.country_code,
      input.bestOffer,
      score.landed_cost_usd,
      score.suggested_price_usd
    );
    return { score, risk, country: c };
  });

  // Sort by opportunity score descending
  evaluations.sort((a, b) => b.score.opportunity_score - a.score.opportunity_score);

  const bestEval = evaluations[0];
  const bestCountry: CountryCode = bestEval ? bestEval.country.country_code : 'UY';
  const bestScore = bestEval ? bestEval.score : {
    opportunity_score: 0,
    confidence_score: 0,
    landed_cost_usd: 0,
    suggested_price_usd: 0,
    estimated_margin_percent: 0,
    market_gap_score: 0,
    reasons: [],
  };

  const riskLevel = bestEval ? bestEval.risk.riskLevel : 'BLOCKED';
  const reasonCodes = bestEval ? bestEval.risk.reasonCodes : ['NO_DATA'];

  // Determine commercial decision code deterministically (0 AI guessing)
  let decision: DecisionCode = 'WATCH';
  if (riskLevel === 'BLOCKED') {
    decision = 'BLOCKED';
  } else if (bestScore.opportunity_score >= 80 && bestScore.confidence_score >= 70 && riskLevel === 'LOW') {
    decision = 'PUBLISH';
  } else if (bestScore.opportunity_score >= 60) {
    decision = 'REVIEW';
  } else {
    decision = 'REJECT';
  }

  const explanation: string[] = [
    `Mercado recomendado: ${bestCountry}`,
    `Opportunity Score: ${bestScore.opportunity_score}/100`,
    `Confianza de datos: ${bestScore.confidence_score}/100`,
    `Costo estimado puesto: $${bestScore.landed_cost_usd} USD`,
    `Precio sugerido de venta: $${bestScore.suggested_price_usd} USD`,
    `Margen comercial proyectado: ${bestScore.estimated_margin_percent}%`,
    `Market Gap Score: ${bestScore.market_gap_score}/100`,
  ];

  if (bestScore.reasons.length > 0) {
    explanation.push(...bestScore.reasons);
  }

  return {
    best_country: bestCountry,
    opportunity_score: bestScore.opportunity_score,
    confidence_score: bestScore.confidence_score,
    estimated_landed_cost_usd: bestScore.landed_cost_usd,
    suggested_price_usd: bestScore.suggested_price_usd,
    estimated_margin_percent: bestScore.estimated_margin_percent,
    market_gap_score: bestScore.market_gap_score,
    estimated_delivery_range: '5-12 días',
    decision,
    reason_codes: reasonCodes,
    explanation,
  };
}
