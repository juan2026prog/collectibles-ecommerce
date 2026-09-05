/**
 * Import Cost Engine
 * 
 * Orchestrates product price, courier shipping and handling, and customs tax
 * into a single unified landed estimate in Uruguay (USD & UYU).
 */

import { CustomsRuleEngine } from './CustomsRuleEngine';
import type { CustomsRegimeEvaluation, UserCustomsUsage } from './CustomsRuleEngine';
import { CourierPricingEngine } from './CourierPricingEngine';
import type { CourierCalculationResult } from './CourierPricingEngine';

export interface LandedCostCalculationParams {
  productPriceUsd: number;
  weightKg: number;
  courierCode?: string;
  usage?: UserCustomsUsage;
  exchangeRateUsdToUyu?: number;
  forceSimplifiedRegime?: boolean;
}

export interface LandedCostEstimate {
  productPriceUsd: number;
  weightKg: number;
  courier: CourierCalculationResult;
  customsEvaluation: CustomsRegimeEvaluation;
  totalCostUsd: number;
  totalCostUyu: number;
  exchangeRateUsed: number;
  isEligibleForImport: boolean;
  ineligibilityReason?: string;
}

export class ImportCostEngine {
  private static DEFAULT_EXCHANGE_RATE = 42.50;

  public static calculateLandedCost({
    productPriceUsd,
    weightKg,
    courierCode = 'puntomio',
    usage = { usedShipments: 0, usedAmountUsd: 0 },
    exchangeRateUsdToUyu = 42.50,
    forceSimplifiedRegime = false
  }: LandedCostCalculationParams): LandedCostEstimate {
    const rate = exchangeRateUsdToUyu > 0 ? exchangeRateUsdToUyu : this.DEFAULT_EXCHANGE_RATE;
    const ruleEngine = new CustomsRuleEngine();

    // 1. Calculate courier
    const courierResult = CourierPricingEngine.calculate({
      courierCode,
      weightKg
    });

    // 2. Evaluate customs regime
    const customsEvaluation = ruleEngine.evaluateShipment({
      productPriceUsd,
      actualWeightKg: weightKg,
      usage,
      forceSimplifiedRegime
    });

    // 3. Check for disqualifications
    if (customsEvaluation.status === 'DISQUALIFIED_WEIGHT' || courierResult.isOverweight) {
      return {
        productPriceUsd,
        weightKg,
        courier: courierResult,
        customsEvaluation,
        totalCostUsd: 0,
        totalCostUyu: 0,
        exchangeRateUsed: rate,
        isEligibleForImport: false,
        ineligibilityReason: 'El paquete excede el límite máximo de 20 kg permitido para importación por franquicia o courier personal.'
      };
    }

    const customsTax = customsEvaluation.taxUsd || 0;
    const totalUsd = Number((productPriceUsd + courierResult.totalCourierUsd + customsTax).toFixed(2));
    const totalUyu = Math.round(totalUsd * rate);

    return {
      productPriceUsd,
      weightKg,
      courier: courierResult,
      customsEvaluation,
      totalCostUsd: totalUsd,
      totalCostUyu: totalUyu,
      exchangeRateUsed: rate,
      isEligibleForImport: true
    };
  }
}
