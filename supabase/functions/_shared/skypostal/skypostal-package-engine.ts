// supabase/functions/_shared/skypostal/skypostal-package-engine.ts

export type WeightSource = 'CATALOG' | 'ESTIMATED' | 'MEASURED' | 'PROVIDER';

export interface PackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface WeightCalculationInput {
  actualWeightKg?: number;
  dimensions?: PackageDimensions;
  weightSource?: WeightSource;
  dimDivisor?: number; // SkyPostal standard divisor: 5000
}

export interface WeightCalculationResult {
  actualWeightKg: number;
  dimensionalWeightKg: number;
  billableWeightKg: number;
  weightSource: WeightSource;
  isDimensional: boolean;
  dimDivisorUsed: number;
}

/**
 * Calculates dimensional weight using SkyPostal's confirmed formula:
 * [L (cm) x W (cm) x H (cm)] / 5000 = dim wt in kg
 */
export function calculateDimensionalWeight(
  dimensions?: PackageDimensions,
  dimDivisor: number = 5000
): number {
  if (!dimensions) return 0;

  const length = Math.max(0, Number(dimensions.lengthCm) || 0);
  const width = Math.max(0, Number(dimensions.widthCm) || 0);
  const height = Math.max(0, Number(dimensions.heightCm) || 0);

  if (length <= 0 || width <= 0 || height <= 0 || dimDivisor <= 0) {
    return 0;
  }

  const dimWeight = (length * width * height) / dimDivisor;
  return Number(dimWeight.toFixed(3));
}

/**
 * Resolves billable weight = MAX(actual_weight, dimensional_weight)
 */
export function calculateBillableWeight(input: WeightCalculationInput): WeightCalculationResult {
  const dimDivisor = input.dimDivisor && input.dimDivisor > 0 ? input.dimDivisor : 5000;
  const actualWeight = Math.max(0, Number(input.actualWeightKg) || 0);
  const dimensionalWeight = calculateDimensionalWeight(input.dimensions, dimDivisor);

  // If no weight provided at all, fallback to safe minimum 0.500 kg (estimated)
  const effectiveActual = actualWeight > 0 ? actualWeight : (dimensionalWeight > 0 ? 0 : 0.500);
  const billable = Math.max(0.100, Math.max(effectiveActual, dimensionalWeight));

  const source = input.weightSource || (actualWeight > 0 ? 'CATALOG' : 'ESTIMATED');

  return {
    actualWeightKg: Number(effectiveActual.toFixed(3)),
    dimensionalWeightKg: Number(dimensionalWeight.toFixed(3)),
    billableWeightKg: Number(billable.toFixed(3)),
    weightSource: source,
    isDimensional: dimensionalWeight > effectiveActual,
    dimDivisorUsed: dimDivisor
  };
}
