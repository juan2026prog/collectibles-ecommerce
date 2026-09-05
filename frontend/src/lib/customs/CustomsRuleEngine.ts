/**
 * Core Rule Engine for Uruguay 2026 Customs Regime
 * 
 * Rules:
 * - 3 shipments per calendar year.
 * - USD 800 annual quota.
 * - Max weight: 20 kg per shipment (strict disqualifier if > 20 kg).
 * - NEVER use volumetric weight (L * W * H / divisor). Strictly actual physical weight.
 * - Under franchise: 0% customs tax.
 * - Under simplified regime (exceeded franchise shipments, or non-franchise import): 60% tax on CIF / product price, minimum USD 20.
 */

export interface CustomsRuleConfig {
  countryCode: 'UY';
  year: number;
  annualQuotaUsd: number;
  maxShipments: number;
  maxWeightKg: number;
  simplifiedTaxRate: number; // 0.60
  minTaxUsd: number; // 20.00
}

export const DEFAULT_UY_2026_RULES: CustomsRuleConfig = {
  countryCode: 'UY',
  year: 2026,
  annualQuotaUsd: 800.00,
  maxShipments: 3,
  maxWeightKg: 20.00,
  simplifiedTaxRate: 0.60,
  minTaxUsd: 20.00,
};

export interface UserCustomsUsage {
  usedShipments: number;
  usedAmountUsd: number;
  preferredCourier?: string;
}

export type CustomsRegimeEvaluation = 
  | {
      status: 'FRANCHISE_APPLIED';
      taxUsd: 0;
      reason: string;
      remainingShipmentsAfter: number;
      remainingQuotaAfter: number;
    }
  | {
      status: 'SIMPLIFIED_REGIME';
      taxUsd: number;
      taxRate: number;
      reason: string;
      remainingShipmentsAfter: number;
      remainingQuotaAfter: number;
    }
  | {
      status: 'DISQUALIFIED_WEIGHT';
      taxUsd: null;
      reason: string;
      maxAllowedKg: number;
    }
  | {
      status: 'DISQUALIFIED_EXCEEDS_SINGLE_LIMIT';
      taxUsd: number;
      reason: string;
    };

export class CustomsRuleEngine {
  private rules: CustomsRuleConfig;

  constructor(rules: CustomsRuleConfig = DEFAULT_UY_2026_RULES) {
    this.rules = rules;
  }

  /**
   * Evaluate a prospective shipment against Uruguay 2026 customs rules.
   * @param productPriceUsd Product value in USD
   * @param actualWeightKg Physical weight in kg (NEVER volumetric)
   * @param usage User's current year usage
   */
  public evaluateShipment({
    productPriceUsd,
    actualWeightKg,
    usage,
    forceSimplifiedRegime = false
  }: {
    productPriceUsd: number;
    actualWeightKg: number;
    usage: UserCustomsUsage;
    forceSimplifiedRegime?: boolean;
  }): CustomsRegimeEvaluation {
    // 1. Strict weight limit: max 20 kg
    if (actualWeightKg > this.rules.maxWeightKg) {
      return {
        status: 'DISQUALIFIED_WEIGHT',
        taxUsd: null,
        maxAllowedKg: this.rules.maxWeightKg,
        reason: `El peso real (${actualWeightKg.toFixed(1)} kg) supera el límite máximo permitido de ${this.rules.maxWeightKg} kg para envíos personales.`
      };
    }

    const shipmentsLeft = Math.max(0, this.rules.maxShipments - usage.usedShipments);
    const quotaLeft = Math.max(0, this.rules.annualQuotaUsd - usage.usedAmountUsd);

    // 2. Can it use Franchise?
    // Must not be forced to simplified, must have at least 1 shipment remaining, and product must fit in quota
    const fitsInFranchise = !forceSimplifiedRegime && 
                            shipmentsLeft > 0 && 
                            productPriceUsd <= quotaLeft;

    if (fitsInFranchise) {
      return {
        status: 'FRANCHISE_APPLIED',
        taxUsd: 0,
        reason: `Aplica a Franquicia 2026 (0% de impuestos aduaneros). Tienes ${shipmentsLeft} envío(s) disponible(s).`,
        remainingShipmentsAfter: shipmentsLeft - 1,
        remainingQuotaAfter: Number((quotaLeft - productPriceUsd).toFixed(2))
      };
    }

    // 3. Fallback to Régimen Simplificado (60%, min USD 20)
    const calculatedTax = Math.max(this.rules.minTaxUsd, productPriceUsd * this.rules.simplifiedTaxRate);
    const roundedTax = Number(calculatedTax.toFixed(2));

    let reason = 'Régimen simplificado (60% de impuestos aduaneros, mín. USD 20).';
    if (forceSimplifiedRegime) {
      reason = 'Se aplicó régimen simplificado a solicitud del usuario.';
    } else if (shipmentsLeft <= 0) {
      reason = 'Agotaste los 3 envíos anuales de franquicia. Aplica régimen simplificado (60%).';
    } else if (productPriceUsd > quotaLeft) {
      reason = `El valor (USD ${productPriceUsd.toFixed(2)}) supera tu cupo restante de franquicia (USD ${quotaLeft.toFixed(2)}). Aplica régimen simplificado (60%).`;
    }

    return {
      status: 'SIMPLIFIED_REGIME',
      taxUsd: roundedTax,
      taxRate: this.rules.simplifiedTaxRate,
      reason,
      remainingShipmentsAfter: shipmentsLeft,
      remainingQuotaAfter: quotaLeft
    };
  }

  public getSummary(usage: UserCustomsUsage) {
    const remainingShipments = Math.max(0, this.rules.maxShipments - usage.usedShipments);
    const remainingQuotaUsd = Math.max(0, this.rules.annualQuotaUsd - usage.usedAmountUsd);

    return {
      year: this.rules.year,
      maxShipments: this.rules.maxShipments,
      usedShipments: usage.usedShipments,
      remainingShipments,
      annualQuotaUsd: this.rules.annualQuotaUsd,
      usedAmountUsd: usage.usedAmountUsd,
      remainingQuotaUsd: Number(remainingQuotaUsd.toFixed(2)),
      hasAvailableFranchise: remainingShipments > 0 && remainingQuotaUsd > 0
    };
  }
}
