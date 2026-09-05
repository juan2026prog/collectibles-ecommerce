import { LandedCostEngine, simulateLandedCost } from './landedCostEngine';
import { CourierEngine, DEFAULT_COURIERS } from './courierEngine';
import { DEFAULT_UY_CUSTOMS_RULE } from './customsEngine';
import type { ScenarioComparison, ImportCourier, CustomsRule } from '../types';

export class ScenarioComparator {
  public static generateScenarios({
    productPriceUsd,
    weightKg,
    isWeightEstimated = false,
    usedShipments = 0,
    usedAmountUsd = 0,
    exchangeRate = 42.50
  }: {
    productPriceUsd: number;
    weightKg: number;
    isWeightEstimated?: boolean;
    usedShipments?: number;
    usedAmountUsd?: number;
    exchangeRate?: number;
  }): ScenarioComparison[] {
    const engine = new LandedCostEngine(DEFAULT_UY_CUSTOMS_RULE, DEFAULT_COURIERS);
    const couriers = DEFAULT_COURIERS.filter(c => c.is_active);

    const results: ScenarioComparison[] = [];

    // Scenario A & B: Each Courier under available Franchise
    couriers.forEach((courier, index) => {
      const simFranchise = engine.simulate({
        productPriceUsd,
        weightKg,
        isWeightEstimated,
        courierCode: courier.code,
        usedShipments,
        usedAmountUsd,
        forceSimplified: false,
        exchangeRate
      });

      results.push({
        id: `franchise_${courier.code}`,
        label: `Escenario ${String.fromCharCode(65 + index)}: ${courier.name} + Franquicia`,
        description: simFranchise.customs.regime === 'FRANQUICIA' ? '0% aranceles usando cupo de franquicia' : '60% aranceles por franquicia no aplicable',
        courierName: courier.name,
        regimeLabel: simFranchise.customs.regime === 'FRANQUICIA' ? 'Franquicia 2026' : 'Régimen Simplificado',
        totalCostUsd: simFranchise.totalLandedCostUsd,
        effectiveCostPerKgUsd: simFranchise.courier.effectiveCostPerKgUsd,
        isRecommended: false,
        simulation: simFranchise
      });
    });

    // Scenario Alternative: Without Franchise (Simplified) with best courier
    const simNoFranchise = engine.simulate({
      productPriceUsd,
      weightKg,
      isWeightEstimated,
      courierCode: couriers[0]?.code || 'puntomio',
      usedShipments,
      usedAmountUsd,
      forceSimplified: true,
      exchangeRate
    });

    results.push({
      id: 'simplified_alternative',
      label: `Alternativa: Sin Franquicia + ${couriers[0]?.name || 'Courier'}`,
      description: 'Preserva tus 3 franquicias pagando 60% de impuestos simplificados.',
      courierName: couriers[0]?.name || 'PuntoMio',
      regimeLabel: 'Régimen Simplificado',
      totalCostUsd: simNoFranchise.totalLandedCostUsd,
      effectiveCostPerKgUsd: simNoFranchise.courier.effectiveCostPerKgUsd,
      isRecommended: false,
      simulation: simNoFranchise
    });

    // Rank by lowest cost
    if (results.length > 0) {
      let lowestIdx = 0;
      let lowestVal = results[0].totalCostUsd;
      results.forEach((r, idx) => {
        if (r.totalCostUsd < lowestVal) {
          lowestVal = r.totalCostUsd;
          lowestIdx = idx;
        }
      });
      results[lowestIdx].isRecommended = true;
      results[lowestIdx].badgeText = 'Menor costo total';
    }

    return results;
  }
}

export function compareScenarios(
  productPriceUsd: number,
  weightKg: number,
  couriers: ImportCourier[],
  customsRule: CustomsRule,
  options: {
    userFranchisesUsed?: number;
    userQuotaUsedUsd?: number;
    isWeightEstimated?: boolean;
    hasUrsecPermit?: boolean;
  }
): ScenarioComparison[] {
  return ScenarioComparator.generateScenarios({
    productPriceUsd,
    weightKg,
    isWeightEstimated: options.isWeightEstimated,
    usedShipments: options.userFranchisesUsed || 0,
    usedAmountUsd: options.userQuotaUsedUsd || 0
  });
}
