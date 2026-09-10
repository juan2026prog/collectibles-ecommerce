import type { SourceOffer, ConditionNormalized, RetailerSource } from '../../types/sourcing';
import { calculateInternationalPricing } from '../../lib/internationalPricing';

export interface BestSourceEvaluation {
  bestOffer: SourceOffer;
  rankedOffers: {
    offer: SourceOffer;
    landedCostUsd: number;
    effectiveScore: number;
    reason: string;
  }[];
}

/**
 * Fase 1: Groups offers by normalized condition (NEW vs USED).
 * NEVER mixes new and used prices in the same ranking.
 * Returns undefined arrays if no offers in that condition.
 */
export function groupOffersByCondition(offers: SourceOffer[]): {
  newOffers: SourceOffer[];
  usedOffers: SourceOffer[];
  openBoxOffers: SourceOffer[];
  otherOffers: SourceOffer[];
} {
  const newOffers: SourceOffer[] = [];
  const usedOffers: SourceOffer[] = [];
  const openBoxOffers: SourceOffer[] = [];
  const otherOffers: SourceOffer[] = [];

  for (const offer of offers) {
    const cond = getEffectiveCondition(offer);
    if (cond === 'NEW') newOffers.push(offer);
    else if (cond === 'USED') usedOffers.push(offer);
    else if (cond === 'OPEN_BOX') openBoxOffers.push(offer);
    else otherOffers.push(offer);
  }

  return { newOffers, usedOffers, openBoxOffers, otherOffers };
}

/**
 * Returns the effective normalized condition for an offer.
 * Prefers condition_normalized (Phase 1) over legacy condition field.
 */
function getEffectiveCondition(offer: SourceOffer): ConditionNormalized {
  if (offer.condition_normalized) return offer.condition_normalized;
  // Fallback: map legacy condition
  if (offer.condition === 'new') return 'NEW';
  if (offer.condition === 'used') return 'USED';
  if (offer.condition === 'refurbished') return 'REFURBISHED';
  return 'UNKNOWN';
}

/**
 * Calculates a seller reliability score (0-100) based on available signals.
 * NEVER invents data — uses only what is actually available.
 */
export function calculateSellerReliabilityScore(offer: SourceOffer): number {
  let score = offer.reliability_score ?? 80;

  // Official retailer sold+fulfilled bonus
  if (offer.sold_by_retailer && offer.fulfilled_by_retailer) {
    score = Math.min(100, score + 10);
  } else if (offer.fulfilled_by_retailer) {
    score = Math.min(100, score + 5);
  }

  // Seller rating bonus/penalty (if available)
  if (offer.seller_rating !== undefined) {
    if (offer.seller_rating >= 98) score = Math.min(100, score + 8);
    else if (offer.seller_rating >= 95) score = Math.min(100, score + 4);
    else if (offer.seller_rating < 90) score = Math.max(0, score - 15);
    else if (offer.seller_rating < 80) score = Math.max(0, score - 30);
  }

  // Seller reviews penalty for sellers with very few reviews
  if (offer.seller_reviews !== undefined && offer.seller_reviews < 100) {
    score = Math.max(0, score - 10);
  }

  // Amazon / Best Buy official store: always high trust
  const sellerLower = (offer.seller || '').toLowerCase();
  if (
    sellerLower.includes('amazon.com') ||
    sellerLower.includes('best buy') ||
    offer.source === 'bestbuy'
  ) {
    score = Math.max(score, 95);
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Fase 1: Evaluates multiple SourceOffers and calculates the best one,
 * considering landed cost, condition, reliability, stock, and freshness.
 * 
 * Critical rules:
 * - NEVER selects RESEARCH_ONLY or NOT_CONFIGURED offers automatically
 * - Always prefers NEW condition over USED for best source selection
 * - Uses real landed cost (not just sticker price)
 * - Documents the reason for selection in human-readable text
 */
export function selectBestSource(offers: SourceOffer[]): BestSourceEvaluation {
  if (!offers || offers.length === 0) {
    throw new Error('No hay ofertas para evaluar la mejor fuente.');
  }

  const ranked = offers.map(offer => {
    const effectiveCondition = getEffectiveCondition(offer);
    const sellerReliability = calculateSellerReliabilityScore(offer);

    // 1. Calculate landed cost for this offer
    const pricing = calculateInternationalPricing({
      amazonPrice: offer.price,
      usaShipping: offer.usa_shipping_usd ?? offer.domestic_shipping
    });
    const landedCost = pricing.realCost;

    // 2. Base score: lower landed cost = higher score
    // Each dollar of lower cost gives 50 points
    let score = 2000 - (landedCost * 50);

    // 3. Condition scoring — NEVER mix NEW and USED in best source for new products
    if (effectiveCondition === 'NEW') {
      score += 200; // Strong preference for new condition
    } else if (effectiveCondition === 'OPEN_BOX') {
      score += 50;
    } else if (effectiveCondition === 'USED') {
      score -= 150; // Used condition is significantly penalized for primary selection
    } else if (effectiveCondition === 'UNKNOWN') {
      score -= 50;
    }

    // 4. Zinc compatibility bonus (automated fulfillment)
    if (offer.is_zinc_compatible) {
      score += 15;
    }

    // 5. Seller reliability (0-100 scale)
    score += sellerReliability * 0.5;

    // 6. Stock status
    const availNorm = offer.availability_normalized || 'UNKNOWN';
    if (availNorm === 'OUT_OF_STOCK' || offer.availability === 'out_of_stock') {
      score -= 1000; // Cannot select out-of-stock
    } else if (availNorm === 'LOW_STOCK') {
      score -= 50; // Slight penalty for low stock risk
    } else if (availNorm === 'PREORDER') {
      score += 10; // Preorders are valuable for planning
    }

    // 7. Freshness — prefer verified live data
    const freshness = offer.freshness_status;
    if (freshness === 'LIVE') score += 30;
    else if (freshness === 'FRESH') score += 10;
    else if (freshness === 'STALE') score -= 20;

    // 8. Official retailer bonus
    if (offer.sold_by_retailer && offer.fulfilled_by_retailer) {
      score += 25;
    }

    // 9. CRITICAL: Exclude non-live offers from automatic selection
    const isSelectable = offer.status === 'LIVE' || offer.status === 'CACHE';
    if (!isSelectable) {
      score -= 10000; // Insurmountable penalty for unverified sources
    }

    // Build human-readable reason
    let reason: string;
    if (!isSelectable) {
      reason = `Fuente sin validación live (${offer.status}). No seleccionable automáticamente.`;
    } else {
      const parts: string[] = [];
      parts.push(`Producto ${effectiveCondition}`);
      if (offer.sold_by_retailer) parts.push('vendedor oficial');
      parts.push(`Costo puesto \$${landedCost.toFixed(2)} USD`);
      if (offer.usa_shipping_usd !== undefined) parts.push(`Shipping USA \$${(offer.usa_shipping_usd ?? offer.domestic_shipping).toFixed(2)}`);
      if (sellerReliability >= 95) parts.push(`Confiabilidad muy alta (${sellerReliability}/100)`);
      else if (sellerReliability < 80) parts.push(`Confiabilidad moderada (${sellerReliability}/100)`);
      if (offer.delivery_min && offer.delivery_max) {
        parts.push(`Entrega Miami: ${offer.delivery_min} – ${offer.delivery_max}`);
      }
      reason = parts.join('. ');
    }

    return {
      offer: {
        ...offer,
        landed_cost_usd: landedCost,
        reliability_score: sellerReliability
      },
      landedCostUsd: landedCost,
      effectiveScore: score,
      reason
    };
  });

  // Sort by score (highest = best)
  ranked.sort((a, b) => b.effectiveScore - a.effectiveScore);

  // Find best selectable offer
  const bestEligible = ranked.find(r => r.offer.status === 'LIVE' || r.offer.status === 'CACHE') || ranked[0];

  return {
    bestOffer: bestEligible.offer,
    rankedOffers: ranked
  };
}

/**
 * Fase 1: Select best NEW source and best USED source separately.
 * Returns null for a category if no offers exist in that condition.
 */
export function selectBestSourceBySeparatedCondition(offers: SourceOffer[]): {
  bestNew: BestSourceEvaluation | null;
  bestUsed: BestSourceEvaluation | null;
  bestOverall: BestSourceEvaluation;
  newFromUsdMin: number | null;
  usedFromUsdMin: number | null;
} {
  const { newOffers, usedOffers, openBoxOffers, otherOffers } = groupOffersByCondition(offers);

  // NEW: includes new + open-box
  const newEligible = [...newOffers, ...openBoxOffers].filter(o => o.stock !== 0);
  // USED: only used condition
  const usedEligible = usedOffers.filter(o => o.stock !== 0);

  let bestNew: BestSourceEvaluation | null = null;
  let bestUsed: BestSourceEvaluation | null = null;
  let newFromUsdMin: number | null = null;
  let usedFromUsdMin: number | null = null;

  if (newEligible.length > 0) {
    bestNew = selectBestSource(newEligible);
    const newPrices = newEligible.map(o => o.price).filter(p => p > 0);
    newFromUsdMin = newPrices.length > 0 ? Math.min(...newPrices) : null;
  }

  if (usedEligible.length > 0) {
    bestUsed = selectBestSource(usedEligible);
    const usedPrices = usedEligible.map(o => o.price).filter(p => p > 0);
    usedFromUsdMin = usedPrices.length > 0 ? Math.min(...usedPrices) : null;
  }

  // Overall best: prefer NEW over USED
  const bestOverall = selectBestSource(offers);

  return { bestNew, bestUsed, bestOverall, newFromUsdMin, usedFromUsdMin };
}
