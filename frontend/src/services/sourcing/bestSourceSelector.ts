import type { SourceOffer } from '../../types/sourcing';
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
 * Evalúa múltiples SourceOffers y calcula cuál ofrece el costo real más conveniente,
 * considerando precio base, shipping local USA, compatibilidad con Zinc y confiabilidad.
 */
export function selectBestSource(offers: SourceOffer[]): BestSourceEvaluation {
  if (!offers || offers.length === 0) {
    throw new Error('No hay ofertas para evaluar la mejor fuente.');
  }

  const ranked = offers.map(offer => {
    // 1. Calcular costo puesto para esta oferta específica
    const pricing = calculateInternationalPricing({
      amazonPrice: offer.price,
      usaShipping: offer.domestic_shipping
    });

    const landedCost = pricing.realCost;

    // 2. Score de conveniencia: menor landedCost es el factor dominante
    // Cada dólar de menor costo otorga 50 puntos
    let score = 2000 - (landedCost * 50);

    // Zinc compatibility bonus (operación automatizada)
    if (offer.is_zinc_compatible) {
      score += 15;
    }

    // Reliability score (0-100)
    score += (offer.reliability_score || 80) * 0.1;

    // Stock penalty
    if (offer.availability === 'out_of_stock') {
      score -= 500;
    } else if (offer.availability === 'preorder') {
      score += 10; // Preorders son valiosas
    }

    // Excluir de la selección automática a ofertas que no sean LIVE o CACHE
    // (RESEARCH_ONLY, PENDING_CREDENTIAL, PENDING_API, ERROR)
    const isImportable = offer.status === 'LIVE' || offer.status === 'CACHE';
    if (!isImportable) {
      score -= 10000; // Penalización insalvable para selección automática, pero permanece en ranking visible
    }

    const reason = !isImportable
      ? `Fuente no validada live (${offer.status}). No seleccionable automáticamente.`
      : (offer.is_zinc_compatible 
          ? `Costo Puesto $${landedCost.toFixed(2)} USD (Auto-Fulfill Zinc + Shipping $${offer.domestic_shipping.toFixed(2)})`
          : `Costo Puesto $${landedCost.toFixed(2)} USD (Fulfill $${offer.domestic_shipping.toFixed(2)} Shipping)`);

    return {
      offer: {
        ...offer,
        landed_cost_usd: landedCost
      },
      landedCostUsd: landedCost,
      effectiveScore: score,
      reason
    };
  });

  // Ordenar por mayor score efectivo (mejor combinación costo/fiabilidad)
  ranked.sort((a, b) => b.effectiveScore - a.effectiveScore);

  // Buscar la mejor oferta elegible (LIVE / CACHE). Si ninguna está verificada, queda la primera para referencia
  const bestEligible = ranked.find(r => r.offer.status === 'LIVE' || r.offer.status === 'CACHE') || ranked[0];

  return {
    bestOffer: bestEligible.offer,
    rankedOffers: ranked
  };
}
