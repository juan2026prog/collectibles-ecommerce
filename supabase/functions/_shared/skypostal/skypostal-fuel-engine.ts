// supabase/functions/_shared/skypostal/skypostal-fuel-engine.ts

export interface FuelBand {
  min_price: number;
  max_price: number;
  adjustment_percent: number;
}

export interface FuelCalculationResult {
  indexName: string;
  ruleVersion: string;
  spotPriceUsd: number;
  adjustmentPercent: number;
  fuelAmountUsd: number;
  isNegative: boolean;
  status: 'ESTIMATED' | 'FINAL';
  matchedBandDescription: string;
}

export const CONTRACTUAL_FUEL_BANDS: FuelBand[] = [
  { min_price: 3.55, max_price: 3.90, adjustment_percent: 4.0 },
  { min_price: 3.20, max_price: 3.55, adjustment_percent: 3.0 },
  { min_price: 2.85, max_price: 3.20, adjustment_percent: 2.0 },
  { min_price: 2.50, max_price: 2.85, adjustment_percent: 1.0 },
  { min_price: 2.15, max_price: 2.50, adjustment_percent: 0.0 },
  { min_price: 1.80, max_price: 2.15, adjustment_percent: 0.0 },
  { min_price: 1.45, max_price: 1.80, adjustment_percent: -1.0 },
  { min_price: 1.10, max_price: 1.45, adjustment_percent: -2.0 },
  { min_price: 0.75, max_price: 1.10, adjustment_percent: -3.0 },
  { min_price: 0.40, max_price: 0.75, adjustment_percent: -4.0 }
];

export const DEFAULT_SPOT_PRICE = 2.4500; // Baseline neutral spot price in USD/gal

/**
 * Resolves adjustment percentage for a given EIA kerosene spot price.
 */
export function resolveFuelAdjustmentPercent(
  spotPriceUsd: number = DEFAULT_SPOT_PRICE,
  bands: FuelBand[] = CONTRACTUAL_FUEL_BANDS
): { adjustmentPercent: number; matchedBandDescription: string } {
  const price = Number(spotPriceUsd);

  // Upper boundary check (>= 3.90)
  if (price >= 3.90) {
    return {
      adjustmentPercent: 4.0,
      matchedBandDescription: '>= $3.90 USD/gal (+4.0% cap)'
    };
  }

  // Lower boundary check (< 0.40)
  if (price < 0.40) {
    return {
      adjustmentPercent: -4.0,
      matchedBandDescription: '< $0.40 USD/gal (-4.0% floor)'
    };
  }

  for (const band of bands) {
    if (price >= band.min_price && price < band.max_price) {
      return {
        adjustmentPercent: band.adjustment_percent,
        matchedBandDescription: `$${band.min_price.toFixed(2)} - $${band.max_price.toFixed(2)} USD/gal (${band.adjustment_percent > 0 ? '+' : ''}${band.adjustment_percent.toFixed(1)}%)`
      };
    }
  }

  return {
    adjustmentPercent: 0.0,
    matchedBandDescription: 'Default baseline neutral band (0.0%)'
  };
}

/**
 * Calculates the fuel surcharge amount on top of the base transportation charge.
 */
export function calculateFuelSurcharge(
  transportationChargeUsd: number,
  options?: {
    spotPriceUsd?: number;
    bands?: FuelBand[];
    isFinal?: boolean;
    ruleVersion?: string;
  }
): FuelCalculationResult {
  const baseCharge = Math.max(0, Number(transportationChargeUsd) || 0);
  const spotPrice = options?.spotPriceUsd !== undefined ? Number(options.spotPriceUsd) : DEFAULT_SPOT_PRICE;
  const bands = options?.bands || CONTRACTUAL_FUEL_BANDS;
  const ruleVersion = options?.ruleVersion || '2026.1';
  const status = options?.isFinal ? 'FINAL' : 'ESTIMATED';

  const { adjustmentPercent, matchedBandDescription } = resolveFuelAdjustmentPercent(spotPrice, bands);
  const fuelAmountUsd = Number(((baseCharge * adjustmentPercent) / 100).toFixed(2));

  return {
    indexName: 'US Gulf Coast Kerosene Spot Price',
    ruleVersion,
    spotPriceUsd: spotPrice,
    adjustmentPercent,
    fuelAmountUsd,
    isNegative: fuelAmountUsd < 0,
    status,
    matchedBandDescription
  };
}
