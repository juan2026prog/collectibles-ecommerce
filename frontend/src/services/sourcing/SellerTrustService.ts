import type { 
  RetailerSource, 
  SellerTrustStatus, 
  SellerTrustEvaluation 
} from '../../types/sourcing';

export interface SellerInputMetrics {
  source: RetailerSource;
  sellerName: string;
  externalSellerId?: string;
  rating?: number; // 0-100 o 0-5
  ratingCount?: number;
  positivePercentage?: number;
  soldByRetailerDirectly?: boolean;
  fulfilledByRetailerDirectly?: boolean;
}

export class SellerTrustService {
  /**
   * Evalúa objetivamente la reputación de un vendedor usando criterios determinísticos configurables.
   * Devuelve estado TRUSTED, ACCEPTABLE, RISKY o UNKNOWN junto con score y razones.
   */
  static evaluateSellerTrust(input: SellerInputMetrics): SellerTrustEvaluation {
    const reasons: string[] = [];
    let score = 50; // Puntuación base neutral
    let fieldsPresent = 0;
    const totalFields = 4; // sellerName, rating, ratingCount, positivePercentage

    if (input.sellerName) fieldsPresent++;
    if (input.rating !== undefined && input.rating !== null) fieldsPresent++;
    if (input.ratingCount !== undefined && input.ratingCount !== null) fieldsPresent++;
    if (input.positivePercentage !== undefined && input.positivePercentage !== null) fieldsPresent++;

    const dataCompleteness = Number((fieldsPresent / totalFields).toFixed(2));

    const nameLower = (input.sellerName || '').toLowerCase().trim();

    // 1. Criterio de Retailer Oficial Vendido/Enviado directamente
    const isOfficialRetailerDirect = 
      input.soldByRetailerDirectly ||
      input.fulfilledByRetailerDirectly ||
      nameLower === 'amazon.com' ||
      nameLower === 'amazon' ||
      nameLower === 'best buy' ||
      nameLower === 'bestbuy' ||
      nameLower === 'entertainment earth' ||
      nameLower === 'bigbadtoystore' ||
      nameLower === 'bbts';

    if (isOfficialRetailerDirect) {
      score += 45;
      reasons.push('OFFICIAL_RETAILER_DIRECT');
    }

    // 2. Normalización de rating (si viene en escala 0-5 se escala a 0-100)
    let ratingNorm = input.rating;
    if (ratingNorm !== undefined && ratingNorm <= 5.0) {
      ratingNorm = ratingNorm * 20;
    }

    // Porcentaje positivo
    const positivePct = input.positivePercentage ?? ratingNorm;

    if (positivePct !== undefined) {
      if (positivePct >= 98) {
        score += 25;
        reasons.push(`HIGH_POSITIVE_PERCENTAGE:${positivePct}%`);
      } else if (positivePct >= 92) {
        score += 15;
        reasons.push(`GOOD_POSITIVE_PERCENTAGE:${positivePct}%`);
      } else if (positivePct < 85) {
        score -= 30;
        reasons.push(`LOW_POSITIVE_PERCENTAGE:${positivePct}%`);
      }
    }

    // 3. Cantidad de opiniones / reviews
    if (input.ratingCount !== undefined) {
      if (input.ratingCount >= 500) {
        score += 15;
        reasons.push(`HIGH_FEEDBACK_VOLUME:${input.ratingCount}`);
      } else if (input.ratingCount >= 50) {
        score += 5;
        reasons.push(`MODERATE_FEEDBACK_VOLUME:${input.ratingCount}`);
      } else if (input.ratingCount < 10) {
        score -= 20;
        reasons.push(`VERY_LOW_FEEDBACK_VOLUME:${input.ratingCount}`);
      }
    }

    // Limitar score entre 0 y 100
    const finalScore = Math.min(100, Math.max(0, score));

    // Determinar Estado
    let status: SellerTrustStatus = 'UNKNOWN';

    if (isOfficialRetailerDirect || finalScore >= 85) {
      status = 'TRUSTED';
    } else if (finalScore >= 65) {
      status = 'ACCEPTABLE';
    } else if (dataCompleteness < 0.25 && !isOfficialRetailerDirect) {
      status = 'UNKNOWN';
      reasons.push('INSUFFICIENT_SELLER_DATA');
    } else {
      status = 'RISKY';
    }

    return {
      status,
      score: finalScore,
      reasons,
      dataCompleteness
    };
  }
}
