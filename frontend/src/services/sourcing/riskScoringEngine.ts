/**
 * SOURCING INTELLIGENCE — RISK SCORING ENGINE (BLOQUE 25)
 * Collectibles 2026
 * 
 * Motor oficial y determinístico de evaluación de Riesgo (0–100 clamped)
 * con desglose de componentes y reason codes estructurados.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export interface RiskEvaluationInput {
  authenticityStatus?: 'LIKELY_OFFICIAL' | 'VERIFIED_OFFICIAL' | 'UNKNOWN' | 'SUSPICIOUS' | 'NEEDS_VERIFICATION' | 'BOOTLEG_SUSPECT';
  sellerTrustScore?: number; // 0 - 100
  matchingConfidence?: number; // 0.00 - 1.00
  isPriceMissing?: boolean;
  isStockMissing?: boolean;
  isShippingMissing?: boolean;
  isWeightMissing?: boolean;
  isLot?: boolean;
  isAuction?: boolean;
  condition?: string; // 'new' | 'used' | 'open_box' | 'refurbished' | 'unknown'
  landedCostIncomplete?: boolean;
  retailerHealth?: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  isPriceStale?: boolean;
  marginPercent?: number;
  profitUsd?: number;
}

export interface RiskScoreResult {
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  isBlocked: boolean;
  reasonCodes: string[];
  breakdown: {
    authenticityRisk: number; // 0 - 30
    sellerRisk: number;       // 0 - 20
    dataMissingRisk: number;  // 0 - 20
    matchingRisk: number;     // 0 - 15
    lotConditionRisk: number; // 0 - 15
  };
}

export class SourcingRiskEngine {
  /**
   * Calcula el Risk Score oficial de una oferta o producto.
   */
  static evaluateRisk(input: RiskEvaluationInput): RiskScoreResult {
    const reasonCodes: string[] = [];
    let isBlocked = false;

    // 1. Authenticity Risk (0 - 30)
    let authenticityRisk = 0;
    const authStatus = input.authenticityStatus || 'UNKNOWN';
    if (authStatus === 'BOOTLEG_SUSPECT' || authStatus === 'SUSPICIOUS') {
      authenticityRisk = 30;
      isBlocked = true;
      reasonCodes.push('AUTH_SUSPICIOUS_OR_BOOTLEG');
    } else if (authStatus === 'UNKNOWN' || authStatus === 'NEEDS_VERIFICATION') {
      authenticityRisk = 18;
      reasonCodes.push('AUTH_UNVERIFIED');
    } else if (authStatus === 'LIKELY_OFFICIAL') {
      authenticityRisk = 5;
    } else if (authStatus === 'VERIFIED_OFFICIAL') {
      authenticityRisk = 0;
    }

    // 2. Seller Trust Risk (0 - 20)
    let sellerRisk = 0;
    const trust = input.sellerTrustScore;
    if (trust === undefined || trust === null) {
      sellerRisk = 12;
      reasonCodes.push('SELLER_TRUST_UNKNOWN');
    } else if (trust < 70) {
      sellerRisk = 20;
      reasonCodes.push('SELLER_LOW_TRUST');
    } else if (trust < 85) {
      sellerRisk = 10;
      reasonCodes.push('SELLER_MODERATE_TRUST');
    } else {
      sellerRisk = 0;
    }

    // 3. Data Completeness Risk (0 - 20)
    let dataMissingRisk = 0;
    if (input.isPriceMissing) {
      dataMissingRisk += 10;
      isBlocked = true;
      reasonCodes.push('MISSING_PRICE');
    }
    if (input.isStockMissing) {
      dataMissingRisk += 5;
      reasonCodes.push('UNCERTAIN_STOCK');
    }
    if (input.isShippingMissing) {
      dataMissingRisk += 3;
      reasonCodes.push('MISSING_SHIPPING');
    }
    if (input.isWeightMissing || input.landedCostIncomplete) {
      dataMissingRisk += 2;
      reasonCodes.push('LANDED_COST_INCOMPLETE');
    }
    dataMissingRisk = Math.min(20, dataMissingRisk);

    // 4. Matching & Variant Confidence Risk (0 - 15)
    let matchingRisk = 0;
    const matchConf = input.matchingConfidence ?? 1.0;
    if (matchConf < 0.70) {
      matchingRisk = 15;
      reasonCodes.push('LOW_MATCH_CONFIDENCE');
    } else if (matchConf < 0.85) {
      matchingRisk = 8;
      reasonCodes.push('MEDIUM_MATCH_CONFIDENCE');
    } else {
      matchingRisk = 0;
    }

    // 5. Lot, Auction & Condition Risk (0 - 15)
    let lotConditionRisk = 0;
    if (input.isLot) {
      lotConditionRisk += 8;
      reasonCodes.push('LOT_PACK_RISK');
    }
    if (input.isAuction) {
      lotConditionRisk += 5;
      reasonCodes.push('AUCTION_PRICE_VOLATILITY');
    }
    const cond = (input.condition || 'new').toLowerCase();
    if (cond === 'used' || cond === 'open_box' || cond === 'refurbished') {
      lotConditionRisk += 4;
      reasonCodes.push(`CONDITION_${cond.toUpperCase()}`);
    }
    lotConditionRisk = Math.min(15, lotConditionRisk);

    // Additional hard block checks
    if (input.profitUsd !== undefined && input.profitUsd <= 0) {
      isBlocked = true;
      reasonCodes.push('NEGATIVE_PROFIT');
    }
    if (input.retailerHealth === 'UNAVAILABLE' || input.retailerHealth === 'NOT_CONFIGURED') {
      reasonCodes.push(`RETAILER_${input.retailerHealth}`);
    }

    // Calculate clamped raw sum (0 - 100)
    const rawSum = authenticityRisk + sellerRisk + dataMissingRisk + matchingRisk + lotConditionRisk;
    const finalScore = Math.min(100, Math.max(0, Math.round(rawSum)));

    // Categorize Risk Level
    let riskLevel: RiskLevel = 'LOW';
    if (isBlocked || finalScore >= 70) {
      riskLevel = isBlocked ? 'BLOCKED' : 'HIGH';
    } else if (finalScore >= 40) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return {
      riskScore: finalScore,
      riskLevel,
      isBlocked,
      reasonCodes,
      breakdown: {
        authenticityRisk,
        sellerRisk,
        dataMissingRisk,
        matchingRisk,
        lotConditionRisk
      }
    };
  }
}
