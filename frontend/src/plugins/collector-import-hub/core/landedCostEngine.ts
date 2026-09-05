import { CustomsEngine, DEFAULT_UY_CUSTOMS_RULE } from './customsEngine';
import { CourierEngine, DEFAULT_COURIERS } from './courierEngine';
import type { LandedCostSimulation, CustomsRule, ImportCourier, CustomsRegimeType } from '../types';

export class LandedCostEngine {
  private customsEngine: CustomsEngine;
  private courierEngine: CourierEngine;

  constructor(customsRule: CustomsRule = DEFAULT_UY_CUSTOMS_RULE, couriers: ImportCourier[] = DEFAULT_COURIERS) {
    this.customsEngine = new CustomsEngine(customsRule);
    this.courierEngine = new CourierEngine(couriers);
  }

  public simulate({
    productPriceUsd,
    weightKg,
    isWeightEstimated = false,
    productCategory,
    courierCode = 'puntomio',
    usedShipments = 0,
    usedAmountUsd = 0,
    forceSimplified = false,
    exchangeRate = 42.50
  }: {
    productPriceUsd: number;
    weightKg: number;
    isWeightEstimated?: boolean;
    productCategory?: string;
    courierCode?: string;
    usedShipments?: number;
    usedAmountUsd?: number;
    forceSimplified?: boolean;
    exchangeRate?: number;
  }): LandedCostSimulation {
    const courierObj = this.courierEngine.getCourierByCode(courierCode) || DEFAULT_COURIERS[0];
    const courierBreakdown = this.courierEngine.calculateSingle(courierObj, weightKg, isWeightEstimated);

    const customsResult = this.customsEngine.evaluate({
      productPriceUsd,
      physicalWeightKg: weightKg,
      usedShipments,
      usedAmountUsd,
      forceSimplified
    });

    const taxUsd = customsResult.taxUsd || 0;
    const totalUsd = Number((productPriceUsd + courierBreakdown.totalCourierUsd + taxUsd).toFixed(2));
    const totalUyu = Math.round(totalUsd * exchangeRate);

    return {
      productPriceUsd,
      productWeightKg: courierBreakdown.physicalWeightKg,
      isWeightEstimated,
      productCategory,
      courier: courierBreakdown,
      customs: customsResult,
      totalLandedCostUsd: totalUsd,
      totalLandedCostUyu: totalUyu,
      exchangeRate
    };
  }
}

export function simulateLandedCost(
  productPriceUsd: number,
  productWeightKg: number,
  courier: ImportCourier,
  customsRule: CustomsRule,
  options: {
    userFranchisesUsed?: number;
    userQuotaUsedUsd?: number;
    isWeightEstimated?: boolean;
    hasUrsecPermit?: boolean;
    preferredRegime?: CustomsRegimeType;
  }
): LandedCostSimulation {
  const engine = new LandedCostEngine(customsRule, [courier]);
  return engine.simulate({
    productPriceUsd,
    weightKg: productWeightKg,
    isWeightEstimated: options.isWeightEstimated,
    courierCode: courier.code,
    usedShipments: options.userFranchisesUsed || 0,
    usedAmountUsd: options.userQuotaUsedUsd || 0,
    forceSimplified: options.preferredRegime === 'SIMPLIFICADO'
  });
}
