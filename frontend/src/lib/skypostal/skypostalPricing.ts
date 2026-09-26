// frontend/src/lib/skypostal/skypostalPricing.ts

export type ComplianceStatus = 'ALLOWED' | 'RESTRICTED' | 'REGULATED' | 'PROHIBITED' | 'MANUAL_REVIEW';
export type WeightSource = 'CATALOG' | 'ESTIMATED' | 'MEASURED' | 'PROVIDER';

export interface PackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface WeightCalculationResult {
  actualWeightKg: number;
  dimensionalWeightKg: number;
  billableWeightKg: number;
  weightSource: WeightSource;
  isDimensional: boolean;
  dimDivisorUsed: number;
}

export interface ProductComplianceInput {
  productId?: string;
  title: string;
  category?: string;
  logisticsClassification?: string;
  hsCode?: string;
  fobValueUsd: number;
  quantity: number;
  weightKg?: number;
  hasBattery?: boolean;
  hasLiquid?: boolean;
  hasMagnet?: boolean;
  isUsed?: boolean;
  isFood?: boolean;
  isCosmetic?: boolean;
  isSupplement?: boolean;
  isFineJewelry?: boolean;
  isWeaponOrReplica?: boolean;
  isCounterfeitOrReplicaBrand?: boolean;
}

export interface ComplianceEvaluationResult {
  status: ComplianceStatus;
  countryCode: string;
  reason: string;
  matchedRule?: string;
  warnings: string[];
  requiredDocuments: string[];
  serviceCode: number;
  customsClassification: string;
  sourceReference: string;
  ruleVersion: string;
  specialTariffCategory?: 'CATEGORY_B' | 'CATEGORY_C' | 'STANDARD' | 'REGULATED';
}

export interface WeightBracket {
  weight_kg: number;
  price_usd: number;
}

export interface RateCardDefinition {
  countryCode: string;
  rateCardCode: string;
  serviceName: string;
  serviceCode: number;
  gateway: string;
  clearanceType: string;
  deliveryType: string;
  version: string;
  additional500gPrice: number;
  brackets: WeightBracket[];
}

export interface RateCalculationResult {
  rateCardCode: string;
  serviceName: string;
  serviceCode: number;
  gateway: string;
  clearanceType: string;
  deliveryType: string;
  version: string;
  billableWeightKg: number;
  transportationChargeUsd: number;
  isExtrapolated: boolean;
  additionalUnitsCount: number;
  base10kgPriceUsd?: number;
  additional500gPriceUsd: number;
}

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

export interface PricingQuoteInput {
  countryCode: string;
  product: {
    productId?: string;
    title: string;
    category?: string;
    logisticsClassification?: string;
    hsCode?: string;
    fobValueUsd: number;
    quantity: number;
    actualWeightKg?: number;
    dimensions?: PackageDimensions;
    weightSource?: WeightSource;
    hasBattery?: boolean;
    hasLiquid?: boolean;
    hasMagnet?: boolean;
    isUsed?: boolean;
    isFood?: boolean;
    isCosmetic?: boolean;
    isSupplement?: boolean;
    isFineJewelry?: boolean;
    isWeaponOrReplica?: boolean;
    isCounterfeitOrReplicaBrand?: boolean;
  };
  options?: {
    orderId?: string;
    suborderId?: string;
    spotPriceUsd?: number;
    markupPercentOverride?: number;
    quoteTtlSeconds?: number;
    marketEnvironment?: 'test' | 'live';
  };
}

export interface QuoteSnapshotData {
  quoteId: string;
  orderId?: string;
  suborderId?: string;
  countryCode: string;
  currency: string;
  provider: 'skypostal';
  serviceName: string;
  serviceCode: number;
  rateCardCode: string;
  rateVersion: string;
  packageDetails: {
    actualWeightKg: number;
    dimensionalWeightKg: number;
    billableWeightKg: number;
    weightSource: WeightSource;
    isDimensional: boolean;
    dimDivisorUsed: number;
  };
  pricingBreakdown: {
    transportationChargeUsd: number;
    fuelAdjustmentPercent: number;
    fuelAmountUsd: number;
    fuelStatus: 'ESTIMATED' | 'FINAL';
    providerCostUsd: number;
    markupPercent: number;
    markupAmountUsd: number;
    customerShippingPriceUsd: number;
  };
  compliance: ComplianceEvaluationResult;
  isEligible: boolean;
  blockReason?: string;
  expiresAt: string;
  createdAt: string;
  marketEnvironment: 'test' | 'live';
}

// ------------------------------------------------------------------------------------------------
// CONTRACTUAL DATA (Rate Cards, Fuel Bands, Country Rules)
// ------------------------------------------------------------------------------------------------

export const CONTRACTUAL_RATE_CARDS: Record<string, RateCardDefinition> = {
  'CL-340': {
    countryCode: 'CL',
    rateCardCode: 'CL-340',
    serviceName: 'SkyPostal Chile Custom Courier',
    serviceCode: 1,
    gateway: 'SCL',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 2.42,
    brackets: [
      { weight_kg: 0.1, price_usd: 8.59 },
      { weight_kg: 0.2, price_usd: 9.08 },
      { weight_kg: 0.3, price_usd: 9.56 },
      { weight_kg: 0.4, price_usd: 10.05 },
      { weight_kg: 0.5, price_usd: 10.53 },
      { weight_kg: 0.6, price_usd: 12.79 },
      { weight_kg: 0.7, price_usd: 13.28 },
      { weight_kg: 0.8, price_usd: 13.76 },
      { weight_kg: 0.9, price_usd: 14.25 },
      { weight_kg: 1.0, price_usd: 14.73 },
      { weight_kg: 1.5, price_usd: 17.25 },
      { weight_kg: 2.0, price_usd: 19.67 },
      { weight_kg: 2.5, price_usd: 22.10 },
      { weight_kg: 3.0, price_usd: 24.52 },
      { weight_kg: 3.5, price_usd: 28.85 },
      { weight_kg: 4.0, price_usd: 31.27 },
      { weight_kg: 4.5, price_usd: 33.70 },
      { weight_kg: 5.0, price_usd: 36.12 },
      { weight_kg: 5.5, price_usd: 40.45 },
      { weight_kg: 6.0, price_usd: 42.87 },
      { weight_kg: 6.5, price_usd: 45.30 },
      { weight_kg: 7.0, price_usd: 47.72 },
      { weight_kg: 7.5, price_usd: 52.05 },
      { weight_kg: 8.0, price_usd: 54.47 },
      { weight_kg: 8.5, price_usd: 56.90 },
      { weight_kg: 9.0, price_usd: 59.32 },
      { weight_kg: 9.5, price_usd: 63.65 },
      { weight_kg: 10.0, price_usd: 66.07 }
    ]
  },
  'PE-340': {
    countryCode: 'PE',
    rateCardCode: 'PE-340',
    serviceName: 'SkyPostal Peru Custom Courier',
    serviceCode: 1,
    gateway: 'LIM',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 2.13,
    brackets: [
      { weight_kg: 0.1, price_usd: 11.11 },
      { weight_kg: 0.2, price_usd: 11.41 },
      { weight_kg: 0.3, price_usd: 11.71 },
      { weight_kg: 0.4, price_usd: 12.01 },
      { weight_kg: 0.5, price_usd: 12.31 },
      { weight_kg: 0.6, price_usd: 12.61 },
      { weight_kg: 0.7, price_usd: 12.91 },
      { weight_kg: 0.8, price_usd: 13.21 },
      { weight_kg: 0.9, price_usd: 13.51 },
      { weight_kg: 1.0, price_usd: 13.81 },
      { weight_kg: 1.5, price_usd: 15.32 },
      { weight_kg: 2.0, price_usd: 16.82 },
      { weight_kg: 2.5, price_usd: 19.11 },
      { weight_kg: 3.0, price_usd: 20.61 },
      { weight_kg: 3.5, price_usd: 22.89 },
      { weight_kg: 4.0, price_usd: 24.40 },
      { weight_kg: 4.5, price_usd: 26.68 },
      { weight_kg: 5.0, price_usd: 28.18 },
      { weight_kg: 5.5, price_usd: 30.47 },
      { weight_kg: 6.0, price_usd: 31.97 },
      { weight_kg: 6.5, price_usd: 34.26 },
      { weight_kg: 7.0, price_usd: 35.76 },
      { weight_kg: 7.5, price_usd: 38.04 },
      { weight_kg: 8.0, price_usd: 39.55 },
      { weight_kg: 8.5, price_usd: 41.83 },
      { weight_kg: 9.0, price_usd: 43.34 },
      { weight_kg: 9.5, price_usd: 45.62 },
      { weight_kg: 10.0, price_usd: 47.13 }
    ]
  },
  'BR-340': {
    countryCode: 'BR',
    rateCardCode: 'BR-340',
    serviceName: 'SkyPostal Brazil Custom Courier',
    serviceCode: 1,
    gateway: 'GRU',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 3.43,
    brackets: [
      { weight_kg: 0.1, price_usd: 7.97 },
      { weight_kg: 0.2, price_usd: 8.63 },
      { weight_kg: 0.3, price_usd: 9.33 },
      { weight_kg: 0.4, price_usd: 9.93 },
      { weight_kg: 0.5, price_usd: 10.53 },
      { weight_kg: 0.6, price_usd: 11.35 },
      { weight_kg: 0.7, price_usd: 11.95 },
      { weight_kg: 0.8, price_usd: 12.72 },
      { weight_kg: 0.9, price_usd: 13.32 },
      { weight_kg: 1.0, price_usd: 13.92 },
      { weight_kg: 1.5, price_usd: 17.28 },
      { weight_kg: 2.0, price_usd: 20.40 },
      { weight_kg: 2.5, price_usd: 23.83 },
      { weight_kg: 3.0, price_usd: 26.84 },
      { weight_kg: 3.5, price_usd: 30.27 },
      { weight_kg: 4.0, price_usd: 33.28 },
      { weight_kg: 4.5, price_usd: 36.71 },
      { weight_kg: 5.0, price_usd: 39.72 },
      { weight_kg: 5.5, price_usd: 43.15 },
      { weight_kg: 6.0, price_usd: 46.16 },
      { weight_kg: 6.5, price_usd: 49.59 },
      { weight_kg: 7.0, price_usd: 52.60 },
      { weight_kg: 7.5, price_usd: 56.03 },
      { weight_kg: 8.0, price_usd: 59.04 },
      { weight_kg: 8.5, price_usd: 62.47 },
      { weight_kg: 9.0, price_usd: 65.48 },
      { weight_kg: 9.5, price_usd: 68.91 },
      { weight_kg: 10.0, price_usd: 71.92 }
    ]
  },
  'CO-340': {
    countryCode: 'CO',
    rateCardCode: 'CO-340',
    serviceName: 'SkyPostal Colombia Custom Courier',
    serviceCode: 1,
    gateway: 'BOG',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 2.93,
    brackets: [
      { weight_kg: 0.1, price_usd: 8.21 },
      { weight_kg: 0.2, price_usd: 8.42 },
      { weight_kg: 0.3, price_usd: 8.64 },
      { weight_kg: 0.4, price_usd: 8.85 },
      { weight_kg: 0.5, price_usd: 9.07 },
      { weight_kg: 0.6, price_usd: 9.88 },
      { weight_kg: 0.7, price_usd: 10.09 },
      { weight_kg: 0.8, price_usd: 10.31 },
      { weight_kg: 0.9, price_usd: 10.52 },
      { weight_kg: 1.0, price_usd: 10.74 },
      { weight_kg: 1.5, price_usd: 13.36 },
      { weight_kg: 2.0, price_usd: 14.83 },
      { weight_kg: 2.5, price_usd: 17.76 },
      { weight_kg: 3.0, price_usd: 18.83 },
      { weight_kg: 3.5, price_usd: 21.76 },
      { weight_kg: 4.0, price_usd: 22.84 },
      { weight_kg: 4.5, price_usd: 25.77 },
      { weight_kg: 5.0, price_usd: 26.85 },
      { weight_kg: 5.5, price_usd: 29.78 },
      { weight_kg: 6.0, price_usd: 30.86 },
      { weight_kg: 6.5, price_usd: 33.79 },
      { weight_kg: 7.0, price_usd: 34.87 },
      { weight_kg: 7.5, price_usd: 37.80 },
      { weight_kg: 8.0, price_usd: 38.87 },
      { weight_kg: 8.5, price_usd: 41.80 },
      { weight_kg: 9.0, price_usd: 42.88 },
      { weight_kg: 9.5, price_usd: 45.81 },
      { weight_kg: 10.0, price_usd: 46.89 }
    ]
  },
  'EC-340': {
    countryCode: 'EC',
    rateCardCode: 'EC-340',
    serviceName: 'SkyPostal Ecuador Custom Postal',
    serviceCode: 4,
    gateway: 'UIO',
    clearanceType: 'POSTAL',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 2.66,
    brackets: [
      { weight_kg: 0.1, price_usd: 9.54 },
      { weight_kg: 0.2, price_usd: 9.93 },
      { weight_kg: 0.3, price_usd: 10.32 },
      { weight_kg: 0.4, price_usd: 10.72 },
      { weight_kg: 0.5, price_usd: 11.11 },
      { weight_kg: 0.6, price_usd: 11.50 },
      { weight_kg: 0.7, price_usd: 11.89 },
      { weight_kg: 0.8, price_usd: 12.28 },
      { weight_kg: 0.9, price_usd: 12.67 },
      { weight_kg: 1.0, price_usd: 13.07 },
      { weight_kg: 1.5, price_usd: 15.02 },
      { weight_kg: 2.0, price_usd: 16.98 },
      { weight_kg: 2.5, price_usd: 19.64 },
      { weight_kg: 3.0, price_usd: 21.60 },
      { weight_kg: 3.5, price_usd: 24.25 },
      { weight_kg: 4.0, price_usd: 26.21 },
      { weight_kg: 4.5, price_usd: 28.86 },
      { weight_kg: 5.0, price_usd: 30.82 },
      { weight_kg: 5.5, price_usd: 33.47 },
      { weight_kg: 6.0, price_usd: 35.43 },
      { weight_kg: 6.5, price_usd: 38.09 },
      { weight_kg: 7.0, price_usd: 40.05 },
      { weight_kg: 7.5, price_usd: 42.70 },
      { weight_kg: 8.0, price_usd: 44.66 },
      { weight_kg: 8.5, price_usd: 47.31 },
      { weight_kg: 9.0, price_usd: 49.27 },
      { weight_kg: 9.5, price_usd: 51.92 },
      { weight_kg: 10.0, price_usd: 53.88 }
    ]
  },
  'MX-340': {
    countryCode: 'MX',
    rateCardCode: 'MX-340',
    serviceName: 'SkyPostal Mexico Custom Courier',
    serviceCode: 1,
    gateway: 'GDL',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 2.25,
    brackets: [
      { weight_kg: 0.1, price_usd: 7.84 },
      { weight_kg: 0.2, price_usd: 8.20 },
      { weight_kg: 0.3, price_usd: 8.56 },
      { weight_kg: 0.4, price_usd: 8.92 },
      { weight_kg: 0.5, price_usd: 9.28 },
      { weight_kg: 0.6, price_usd: 9.65 },
      { weight_kg: 0.7, price_usd: 10.01 },
      { weight_kg: 0.8, price_usd: 10.37 },
      { weight_kg: 0.9, price_usd: 10.73 },
      { weight_kg: 1.0, price_usd: 11.09 },
      { weight_kg: 1.5, price_usd: 13.09 },
      { weight_kg: 2.0, price_usd: 14.90 },
      { weight_kg: 2.5, price_usd: 16.98 },
      { weight_kg: 3.0, price_usd: 18.79 },
      { weight_kg: 3.5, price_usd: 20.97 },
      { weight_kg: 4.0, price_usd: 22.78 },
      { weight_kg: 4.5, price_usd: 24.97 },
      { weight_kg: 5.0, price_usd: 26.78 },
      { weight_kg: 5.5, price_usd: 29.02 },
      { weight_kg: 6.0, price_usd: 30.83 },
      { weight_kg: 6.5, price_usd: 33.08 },
      { weight_kg: 7.0, price_usd: 34.89 },
      { weight_kg: 7.5, price_usd: 37.14 },
      { weight_kg: 8.0, price_usd: 38.95 },
      { weight_kg: 8.5, price_usd: 41.20 },
      { weight_kg: 9.0, price_usd: 43.01 },
      { weight_kg: 9.5, price_usd: 45.25 },
      { weight_kg: 10.0, price_usd: 47.06 }
    ]
  },
  'MX-340-R': {
    countryCode: 'MX',
    rateCardCode: 'MX-340-R',
    serviceName: 'SkyPostal Mexico Regulated Custom Courier',
    serviceCode: 502,
    gateway: 'LRD',
    clearanceType: 'COURIER',
    deliveryType: 'STANDARD',
    version: '2026.1',
    additional500gPrice: 1.83,
    brackets: [
      { weight_kg: 0.1, price_usd: 10.51 },
      { weight_kg: 0.2, price_usd: 10.87 },
      { weight_kg: 0.3, price_usd: 11.24 },
      { weight_kg: 0.4, price_usd: 11.60 },
      { weight_kg: 0.5, price_usd: 11.97 },
      { weight_kg: 0.6, price_usd: 13.49 },
      { weight_kg: 0.7, price_usd: 13.85 },
      { weight_kg: 0.8, price_usd: 14.22 },
      { weight_kg: 0.9, price_usd: 14.58 },
      { weight_kg: 1.0, price_usd: 14.95 },
      { weight_kg: 1.5, price_usd: 18.56 },
      { weight_kg: 2.0, price_usd: 20.39 },
      { weight_kg: 2.5, price_usd: 23.91 },
      { weight_kg: 3.0, price_usd: 25.74 },
      { weight_kg: 3.5, price_usd: 28.06 },
      { weight_kg: 4.0, price_usd: 29.89 },
      { weight_kg: 4.5, price_usd: 32.47 },
      { weight_kg: 5.0, price_usd: 34.30 },
      { weight_kg: 5.5, price_usd: 38.38 },
      { weight_kg: 6.0, price_usd: 40.20 },
      { weight_kg: 6.5, price_usd: 44.28 },
      { weight_kg: 7.0, price_usd: 46.11 },
      { weight_kg: 7.5, price_usd: 50.19 },
      { weight_kg: 8.0, price_usd: 52.02 },
      { weight_kg: 8.5, price_usd: 56.10 },
      { weight_kg: 9.0, price_usd: 57.92 },
      { weight_kg: 9.5, price_usd: 62.00 },
      { weight_kg: 10.0, price_usd: 63.83 }
    ]
  }
};

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

export const DEFAULT_SPOT_PRICE = 2.4500;
export const DEFAULT_MARKUP_PERCENT = 35.0;
export const DEFAULT_QUOTE_TTL_SECONDS = 86400;

// ------------------------------------------------------------------------------------------------
// PACKAGE ENGINE
// ------------------------------------------------------------------------------------------------

export function calculateDimensionalWeight(
  dimensions?: PackageDimensions,
  dimDivisor: number = 5000
): number {
  if (!dimensions) return 0;
  const length = Math.max(0, Number(dimensions.lengthCm) || 0);
  const width = Math.max(0, Number(dimensions.widthCm) || 0);
  const height = Math.max(0, Number(dimensions.heightCm) || 0);

  if (length <= 0 || width <= 0 || height <= 0 || dimDivisor <= 0) return 0;
  return Number(((length * width * height) / dimDivisor).toFixed(3));
}

export function calculateBillableWeight(input: {
  actualWeightKg?: number;
  dimensions?: PackageDimensions;
  weightSource?: WeightSource;
  dimDivisor?: number;
}): WeightCalculationResult {
  const dimDivisor = input.dimDivisor && input.dimDivisor > 0 ? input.dimDivisor : 5000;
  const actualWeight = Math.max(0, Number(input.actualWeightKg) || 0);
  const dimensionalWeight = calculateDimensionalWeight(input.dimensions, dimDivisor);
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

// ------------------------------------------------------------------------------------------------
// COMPLIANCE ENGINE
// ------------------------------------------------------------------------------------------------

export function evaluateProductCompliance(
  product: ProductComplianceInput,
  countryCode: string = 'CL'
): ComplianceEvaluationResult {
  const country = countryCode.toUpperCase().trim();
  const warnings: string[] = [];
  const requiredDocuments: string[] = [];
  const sourceRef = 'CR SkyPostal Restrictions by Country 2026';
  const ruleVer = '2026.1';

  // Universal Prohibitions
  if (product.isCounterfeitOrReplicaBrand) {
    return {
      status: 'PROHIBITED',
      countryCode: country,
      reason: 'Mercancía falsificada o réplicas de marcas prohibidas por aduanas internacionales.',
      matchedRule: 'UNIVERSAL_PROHIBITION_COUNTERFEIT',
      warnings: ['Shipment will be confiscated by customs'],
      requiredDocuments: [],
      serviceCode: 1,
      customsClassification: 'PROHIBITED_GOODS',
      sourceReference: sourceRef,
      ruleVersion: ruleVer
    };
  }

  if (product.isWeaponOrReplica) {
    return {
      status: 'PROHIBITED',
      countryCode: country,
      reason: 'Armas de fuego, municiones o réplicas bélicas prohibidas.',
      matchedRule: 'UNIVERSAL_PROHIBITION_WEAPONS',
      warnings: ['Prohibited by international air transport and customs regulations'],
      requiredDocuments: [],
      serviceCode: 1,
      customsClassification: 'PROHIBITED_GOODS',
      sourceReference: sourceRef,
      ruleVersion: ruleVer
    };
  }

  // Country-Specific Rules
  if (country === 'CL') {
    requiredDocuments.push('RUT_BENEFICIARIO');
    if (product.fobValueUsd > 3000) {
      return {
        status: 'PROHIBITED',
        countryCode: 'CL',
        reason: 'El valor FOB excede el límite máximo de importación por courier simplificado en Chile (US$ 3000).',
        matchedRule: 'CL_MAX_VALUE_EXCEEDED',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'FORMAL_IMPORT_REQUIRED',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    if (product.isCosmetic || product.isSupplement) {
      return {
        status: 'PROHIBITED',
        countryCode: 'CL',
        reason: 'Medicamentos, cosméticos y suplementos dietéticos prohibidos por courier en Chile.',
        matchedRule: 'CL_PROHIBITED_COSMETICS_MEDS',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'COSMETICS_MEDICINES',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    if (product.hasBattery) {
      warnings.push('Batería de litio: Debe cumplir con la normativa IATA PI967 (batería contenida en equipo).');
    }
    return {
      status: 'ALLOWED',
      countryCode: 'CL',
      reason: 'Producto coleccionable permitido bajo régimen Courier Standard Chile.',
      matchedRule: 'CL_COURIER_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  if (country === 'PE') {
    requiredDocuments.push('DNI_OR_RUC');
    if (product.fobValueUsd > 2000) {
      return {
        status: 'RESTRICTED',
        countryCode: 'PE',
        reason: 'Envíos FOB mayores a US$ 2000 requieren agente de aduanas en Perú.',
        matchedRule: 'PE_MAX_SIMPLIFIED_VALUE',
        warnings: ['Requiere despachador oficial de aduanas'],
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'FORMAL_DESPACHO',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    if (product.quantity > 10) {
      return {
        status: 'RESTRICTED',
        countryCode: 'PE',
        reason: 'Máximo 10 unidades de juguetes/figuras coleccionables por envío para personas naturales en Perú.',
        matchedRule: 'PE_MAX_TOYS_PER_SHIPMENT',
        warnings: ['Riesgo de presunción comercial por Aduana SUNAT'],
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'COMMERCIAL_QUANTITY_RISK',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    if (product.isSupplement) {
      return {
        status: 'PROHIBITED',
        countryCode: 'PE',
        reason: 'Suplementos nutricionales y vitaminas no permitidos para personas naturales por courier en Perú.',
        matchedRule: 'PE_PROHIBITED_SUPPLEMENTS',
        warnings,
        requiredDocuments,
        serviceCode: 1,
        customsClassification: 'SUPPLEMENTS_NOT_ALLOWED',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    if (product.fobValueUsd <= 200) {
      warnings.push('Exento de impuestos y aranceles (De minimis <= US$ 200 FOB en Perú).');
    } else {
      warnings.push('Aplica Arancel 4% + IGV 16% + IPM 2% sobre base CIF.');
    }
    return {
      status: 'ALLOWED',
      countryCode: 'PE',
      reason: 'Producto permitido bajo régimen Courier Standard Perú.',
      matchedRule: 'PE_COURIER_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  if (country === 'EC') {
    requiredDocuments.push('CEDULA_BENEFICIARIO');
    if (product.isFineJewelry) {
      return {
        status: 'PROHIBITED',
        countryCode: 'EC',
        reason: 'Joyería fina en metales preciosos prohibida en Ecuador por courier.',
        matchedRule: 'EC_PROHIBITED_FINE_JEWELRY',
        warnings,
        requiredDocuments,
        serviceCode: 4,
        customsClassification: 'FINE_JEWELRY',
        sourceReference: sourceRef,
        ruleVersion: ruleVer
      };
    }
    const weight = product.weightKg || 0.5;
    const isCatB = weight <= 4.0 && product.fobValueUsd <= 400.0;
    if (isCatB) {
      warnings.push('Califica como Categoría B (4x4): Peso <= 4kg y FOB <= $400 USD.');
    } else {
      warnings.push('Califica como Categoría C: Aplica arancel 30% CIF + FODINFA 0.5% + IVA 15% y tasa aduanera $5.00.');
    }
    return {
      status: 'ALLOWED',
      countryCode: 'EC',
      reason: `Producto permitido en Ecuador bajo ${isCatB ? 'Categoría B (Courier Simplificado 4x4)' : 'Categoría C'}.`,
      matchedRule: isCatB ? 'EC_CATEGORY_B_ALLOWED' : 'EC_CATEGORY_C_ALLOWED',
      warnings,
      requiredDocuments,
      serviceCode: 4,
      customsClassification: isCatB ? 'CATEGORY_B_4X4' : 'CATEGORY_C_GENERAL',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: isCatB ? 'CATEGORY_B' : 'CATEGORY_C'
    };
  }

  if (country === 'MX') {
    requiredDocuments.push('RFC_OR_CURP', 'DESTINATARIO_EMAIL');
    const isRegulated = product.isCosmetic || product.isSupplement;
    const serviceCode = isRegulated ? 502 : 1;
    if (isRegulated) {
      warnings.push('Mercancía regulada: Requiere servicio MX-340-R (LRD) e impuesto 20% FOB.');
    } else if (product.fobValueUsd <= 50) {
      warnings.push('De minimis <= $50 USD: Exento de aranceles e impuestos en México.');
    }
    return {
      status: isRegulated ? 'REGULATED' : 'ALLOWED',
      countryCode: 'MX',
      reason: isRegulated ? 'Mercancía regulada en México.' : 'Coleccionable estándar permitido en México.',
      matchedRule: isRegulated ? 'MX_REGULATED_502' : 'MX_STANDARD_1',
      warnings,
      requiredDocuments,
      serviceCode,
      customsClassification: isRegulated ? 'REGULATED_COSMETIC_SUPPLEMENT' : 'STANDARD_COLLECTIBLE',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: isRegulated ? 'REGULATED' : 'STANDARD'
    };
  }

  if (country === 'BR') {
    requiredDocuments.push('CPF_OR_CNPJ');
    return {
      status: 'ALLOWED',
      countryCode: 'BR',
      reason: 'Coleccionable permitido en Brasil bajo régimen Courier Standard.',
      matchedRule: 'BR_COURIER_ALLOWED',
      warnings: ['Requiere CPF para despacho aduanero Receita Federal'],
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  if (country === 'CO') {
    requiredDocuments.push('CEDULA_CIUDADANIA');
    return {
      status: 'ALLOWED',
      countryCode: 'CO',
      reason: 'Coleccionable permitido en Colombia bajo régimen Courier Standard.',
      matchedRule: 'CO_COURIER_ALLOWED',
      warnings: product.fobValueUsd <= 200 ? ['Exento de aranceles (De minimis <= $200 USD)'] : [],
      requiredDocuments,
      serviceCode: 1,
      customsClassification: 'COLLECTIBLE_TOY',
      sourceReference: sourceRef,
      ruleVersion: ruleVer,
      specialTariffCategory: 'STANDARD'
    };
  }

  return {
    status: 'MANUAL_REVIEW',
    countryCode: country,
    reason: `Mercado ${country} no cuenta con matriz de reglas aduaneras certificadas.`,
    matchedRule: 'UNCONFIGURED_COUNTRY',
    warnings: ['Requiere revisión manual antes de cotizar envío'],
    requiredDocuments: [],
    serviceCode: 1,
    customsClassification: 'UNKNOWN',
    sourceReference: sourceRef,
    ruleVersion: ruleVer
  };
}

// ------------------------------------------------------------------------------------------------
// RATE ENGINE
// ------------------------------------------------------------------------------------------------

export function calculateTransportationCharge(
  countryCode: string,
  billableWeightKg: number,
  options?: { rateCardCode?: string; tariffCategory?: string }
): RateCalculationResult {
  const country = countryCode.toUpperCase().trim();
  let code = options?.rateCardCode;
  if (!code) {
    if (country === 'MX' && options?.tariffCategory === 'REGULATED') {
      code = 'MX-340-R';
    } else {
      code = `${country}-340`;
    }
  }

  const card = CONTRACTUAL_RATE_CARDS[code];
  if (!card) {
    throw new Error(`No SkyPostal rate card available for code: ${code}`);
  }

  const weight = Math.max(0.1, Number(billableWeightKg) || 0.1);
  const brackets = [...card.brackets].sort((a, b) => a.weight_kg - b.weight_kg);
  const maxBracket = brackets[brackets.length - 1];

  if (weight <= maxBracket.weight_kg) {
    const matched = brackets.find(b => b.weight_kg >= weight) || maxBracket;
    return {
      rateCardCode: card.rateCardCode,
      serviceName: card.serviceName,
      serviceCode: card.serviceCode,
      gateway: card.gateway,
      clearanceType: card.clearanceType,
      deliveryType: card.deliveryType,
      version: card.version,
      billableWeightKg: weight,
      transportationChargeUsd: matched.price_usd,
      isExtrapolated: false,
      additionalUnitsCount: 0,
      additional500gPriceUsd: card.additional500gPrice
    };
  }

  const excessWeight = weight - maxBracket.weight_kg;
  const additionalUnitsCount = Math.ceil(excessWeight / 0.5);
  const additionalCost = additionalUnitsCount * card.additional500gPrice;
  const totalPrice = Number((maxBracket.price_usd + additionalCost).toFixed(2));

  return {
    rateCardCode: card.rateCardCode,
    serviceName: card.serviceName,
    serviceCode: card.serviceCode,
    gateway: card.gateway,
    clearanceType: card.clearanceType,
    deliveryType: card.deliveryType,
    version: card.version,
    billableWeightKg: weight,
    transportationChargeUsd: totalPrice,
    isExtrapolated: true,
    additionalUnitsCount,
    base10kgPriceUsd: maxBracket.price_usd,
    additional500gPriceUsd: card.additional500gPrice
  };
}

// ------------------------------------------------------------------------------------------------
// FUEL ENGINE
// ------------------------------------------------------------------------------------------------

export function calculateFuelSurcharge(
  transportationChargeUsd: number,
  spotPriceUsd: number = DEFAULT_SPOT_PRICE
): FuelCalculationResult {
  const baseCharge = Math.max(0, Number(transportationChargeUsd) || 0);
  const price = Number(spotPriceUsd);

  let adjustmentPercent = 0.0;
  let matchedBandDescription = 'Default baseline neutral band (0.0%)';

  if (price >= 3.90) {
    adjustmentPercent = 4.0;
    matchedBandDescription = '>= $3.90 USD/gal (+4.0% cap)';
  } else if (price < 0.40) {
    adjustmentPercent = -4.0;
    matchedBandDescription = '< $0.40 USD/gal (-4.0% floor)';
  } else {
    for (const band of CONTRACTUAL_FUEL_BANDS) {
      if (price >= band.min_price && price < band.max_price) {
        adjustmentPercent = band.adjustment_percent;
        matchedBandDescription = `$${band.min_price.toFixed(2)} - $${band.max_price.toFixed(2)} USD/gal (${band.adjustment_percent > 0 ? '+' : ''}${band.adjustment_percent.toFixed(1)}%)`;
        break;
      }
    }
  }

  const fuelAmountUsd = Number(((baseCharge * adjustmentPercent) / 100).toFixed(2));

  return {
    indexName: 'US Gulf Coast Kerosene Spot Price',
    ruleVersion: '2026.1',
    spotPriceUsd: price,
    adjustmentPercent,
    fuelAmountUsd,
    isNegative: fuelAmountUsd < 0,
    status: 'ESTIMATED',
    matchedBandDescription
  };
}

// ------------------------------------------------------------------------------------------------
// PRICING PIPELINE
// ------------------------------------------------------------------------------------------------

export function calculateSkyPostalQuote(input: PricingQuoteInput): QuoteSnapshotData {
  const country = input.countryCode.toUpperCase().trim();
  const product = input.product;
  const quoteTtl = input.options?.quoteTtlSeconds || DEFAULT_QUOTE_TTL_SECONDS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + quoteTtl * 1000);
  const quoteId = `SPQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const weightResult = calculateBillableWeight({
    actualWeightKg: product.actualWeightKg,
    dimensions: product.dimensions,
    weightSource: product.weightSource
  });

  const compliance = evaluateProductCompliance({
    ...product,
    weightKg: weightResult.billableWeightKg
  }, country);

  const isEligible = compliance.status === 'ALLOWED' || compliance.status === 'REGULATED';
  const blockReason = !isEligible ? (compliance.reason || `Shipment status is ${compliance.status}`) : undefined;

  const rateResult = calculateTransportationCharge(country, weightResult.billableWeightKg, {
    tariffCategory: compliance.specialTariffCategory
  });

  const fuelResult = calculateFuelSurcharge(rateResult.transportationChargeUsd, input.options?.spotPriceUsd);
  const providerCostUsd = Number((rateResult.transportationChargeUsd + fuelResult.fuelAmountUsd).toFixed(2));

  const markupPercent = input.options?.markupPercentOverride !== undefined
    ? Number(input.options.markupPercentOverride)
    : DEFAULT_MARKUP_PERCENT;

  const markupAmountUsd = Number(((providerCostUsd * markupPercent) / 100).toFixed(2));
  const customerShippingPriceUsd = Number((providerCostUsd + markupAmountUsd).toFixed(2));

  return {
    quoteId,
    orderId: input.options?.orderId,
    suborderId: input.options?.suborderId,
    countryCode: country,
    currency: 'USD',
    provider: 'skypostal',
    serviceName: rateResult.serviceName,
    serviceCode: rateResult.serviceCode,
    rateCardCode: rateResult.rateCardCode,
    rateVersion: rateResult.version,
    packageDetails: {
      actualWeightKg: weightResult.actualWeightKg,
      dimensionalWeightKg: weightResult.dimensionalWeightKg,
      billableWeightKg: weightResult.billableWeightKg,
      weightSource: weightResult.weightSource,
      isDimensional: weightResult.isDimensional,
      dimDivisorUsed: weightResult.dimDivisorUsed
    },
    pricingBreakdown: {
      transportationChargeUsd: rateResult.transportationChargeUsd,
      fuelAdjustmentPercent: fuelResult.adjustmentPercent,
      fuelAmountUsd: fuelResult.fuelAmountUsd,
      fuelStatus: fuelResult.status,
      providerCostUsd,
      markupPercent,
      markupAmountUsd,
      customerShippingPriceUsd: isEligible ? customerShippingPriceUsd : 0
    },
    compliance,
    isEligible,
    blockReason,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    marketEnvironment: input.options?.marketEnvironment || 'test'
  };
}

// ------------------------------------------------------------------------------------------------
// PHASE 3 HELPERS: QUOTE VALIDATION, TWO-LEG TRACKING & RECIPIENT DOCUMENTS
// ------------------------------------------------------------------------------------------------

/**
 * Validates whether a quote snapshot is valid and unexpired before accepting it in Checkout.
 */
export function validateQuoteSnapshot(
  snapshot: QuoteSnapshotData,
  options?: {
    expectedCountryCode?: string;
    maxAgeSeconds?: number;
  }
): { isValid: boolean; reason?: string } {
  if (!snapshot || !snapshot.quoteId) {
    return { isValid: false, reason: 'Snapshot de cotización inexistente' };
  }

  // Expiration check
  const now = new Date();
  const expiresAt = new Date(snapshot.expiresAt);
  if (now > expiresAt) {
    return { isValid: false, reason: 'La cotización de envío ha expirado. Por favor recotizá el pedido.' };
  }

  // Country match check
  if (options?.expectedCountryCode) {
    const expected = options.expectedCountryCode.toUpperCase().trim();
    if (snapshot.countryCode.toUpperCase() !== expected) {
      return { isValid: false, reason: `El país de la cotización (${snapshot.countryCode}) no coincide con el destino (${expected}).` };
    }
  }

  // Compliance check
  if (!snapshot.isEligible || snapshot.compliance.status === 'PROHIBITED') {
    return { isValid: false, reason: snapshot.blockReason || 'Producto no elegible para importación bajo reglas aduaneras.' };
  }

  // Positive price check
  if (snapshot.pricingBreakdown.customerShippingPriceUsd <= 0) {
    return { isValid: false, reason: 'Importe de envío inválido.' };
  }

  return { isValid: true };
}

/**
 * Returns document requirements and placeholder per destination country.
 */
export function getRecipientDocumentPrompt(countryCode: string = 'CL'): {
  docName: string;
  fieldKey: 'rut' | 'dni' | 'cpf' | 'rfc' | 'ci';
  placeholder: string;
  required: boolean;
  helperText: string;
} {
  const code = countryCode.toUpperCase().trim();

  switch (code) {
    case 'CL':
      return {
        docName: 'RUT',
        fieldKey: 'rut',
        placeholder: 'Ej: 12.345.678-9',
        required: true,
        helperText: 'Obligatorio por Servicio Nacional de Aduanas de Chile para desaduanamiento courier.'
      };
    case 'PE':
      return {
        docName: 'DNI / RUC',
        fieldKey: 'dni',
        placeholder: 'Ej: 12345678',
        required: true,
        helperText: 'Obligatorio por SUNAT Perú para importaciones personales.'
      };
    case 'BR':
      return {
        docName: 'CPF / CNPJ',
        fieldKey: 'cpf',
        placeholder: 'Ej: 123.456.789-00',
        required: true,
        helperText: 'Obligatorio por Receita Federal do Brasil.'
      };
    case 'MX':
      return {
        docName: 'RFC / CURP',
        fieldKey: 'rfc',
        placeholder: 'Ej: ABCD123456XYZ',
        required: true,
        helperText: 'Obligatorio por SAT México para despacho courier.'
      };
    case 'CO':
    case 'EC':
    case 'UY':
    default:
      return {
        docName: 'Cédula de Identidad',
        fieldKey: 'ci',
        placeholder: 'Ej: 1.234.567-8',
        required: true,
        helperText: 'Requerido para el despacho aduanero y entrega de última milla.'
      };
  }
}

/**
 * Normalizes SkyPostal tracking event code into standardized lifecycle status.
 */
export function normalizeSkyPostalTrackingStatus(statusOrCode: string): {
  normalizedStatus: 'PENDING' | 'READY_FOR_SHIPMENT' | 'SHIPMENT_CREATED' | 'LABEL_CREATED' | 'MANIFESTED' | 'IN_TRANSIT' | 'CUSTOMS' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION';
  actionRequired: 'NONE' | 'DOCUMENT_REQUIRED' | 'CUSTOMS_INFORMATION_REQUIRED' | 'PAYMENT_REQUIRED' | 'ADDRESS_CORRECTION_REQUIRED' | 'MANUAL_REVIEW';
  description: string;
} {
  const code = (statusOrCode || '').toUpperCase().trim();

  switch (code) {
    case 'CREATED':
    case 'LABEL_CREATED':
    case 'REGISTERED':
      return {
        normalizedStatus: 'SHIPMENT_CREATED',
        actionRequired: 'NONE',
        description: 'Envío internacional registrado en SkyPostal.'
      };
    case 'MANIFESTED':
    case 'MANIFEST_DISPATCHED':
      return {
        normalizedStatus: 'MANIFESTED',
        actionRequired: 'NONE',
        description: 'Paquete manifestado y despachado desde Miami Hub.'
      };
    case 'RECEIVED_MIAMI':
    case 'DEPARTED_MIAMI':
    case 'IN_TRANSIT':
    case 'TRANSIT':
      return {
        normalizedStatus: 'IN_TRANSIT',
        actionRequired: 'NONE',
        description: 'En tránsito aéreo internacional hacia país de destino.'
      };
    case 'CUSTOMS_RECEIVED':
    case 'CUSTOMS_PROCESSING':
    case 'IN_CUSTOMS':
      return {
        normalizedStatus: 'CUSTOMS',
        actionRequired: 'NONE',
        description: 'En proceso de desaduanamiento en aduana de destino.'
      };
    case 'OUT_FOR_DELIVERY':
    case 'EN_REPARTO':
      return {
        normalizedStatus: 'OUT_FOR_DELIVERY',
        actionRequired: 'NONE',
        description: 'En reparto de última milla al domicilio.'
      };
    case 'DELIVERED':
    case 'ENTREGADO':
      return {
        normalizedStatus: 'DELIVERED',
        actionRequired: 'NONE',
        description: 'Entregado al destinatario.'
      };
    case 'MISSING_DOCUMENT':
    case 'RUT_REQUIRED':
    case 'DNI_REQUIRED':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'DOCUMENT_REQUIRED',
        description: 'Documento de identidad requerido para liberación aduanera.'
      };
    case 'CUSTOMS_HOLD':
    case 'CUSTOMS_INFO_REQUIRED':
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'CUSTOMS_INFORMATION_REQUIRED',
        description: 'Información comercial adicional solicitada por la aduana.'
      };
    default:
      return {
        normalizedStatus: 'EXCEPTION',
        actionRequired: 'MANUAL_REVIEW',
        description: 'En revisión operativa o aduanera.'
      };
  }
}

// ------------------------------------------------------------------------------------------------
// PHASE 4 HELPERS: FINANCIAL CONTROL, MARGIN ANALYTICS & VARIANCE
// ------------------------------------------------------------------------------------------------

export interface FinancialMetricsInput {
  customerShippingCharged: number;
  providerCostReal: number;
  providerCostEstimated?: number;
}

export interface FinancialMetricsResult {
  customerShippingChargedUsd: number;
  providerCostEstimatedUsd: number;
  providerCostRealUsd: number;
  grossProfitEstimatedUsd: number;
  grossProfitRealUsd: number;
  effectiveMarkupPercent: number; // (Profit / Cost) * 100
  effectiveMarginPercent: number; // (Profit / Revenue) * 100
  costVarianceUsd: number; // Real Cost - Estimated Cost
  profitVarianceUsd: number; // Real Profit - Estimated Profit
  isNegativeProfit: boolean;
  alertReason?: string;
}

/**
 * Calculates authoritative financial KPIs distinguishing Markup from Margin.
 */
export function calculateFinancialMetrics(input: FinancialMetricsInput): FinancialMetricsResult {
  const charged = Math.max(0, Number(input.customerShippingCharged) || 0);
  const costReal = Math.max(0, Number(input.providerCostReal) || 0);
  const costEst = input.providerCostEstimated !== undefined ? Math.max(0, Number(input.providerCostEstimated) || 0) : costReal;

  const profitReal = Number((charged - costReal).toFixed(2));
  const profitEst = Number((charged - costEst).toFixed(2));
  const costVariance = Number((costReal - costEst).toFixed(2));
  const profitVariance = Number((profitReal - profitEst).toFixed(2));

  // Effective Markup on Cost: (Profit / Cost) * 100
  const effectiveMarkup = costReal > 0 ? Number(((profitReal / costReal) * 100).toFixed(2)) : 0;

  // Effective Margin on Revenue: (Profit / Revenue) * 100
  const effectiveMargin = charged > 0 ? Number(((profitReal / charged) * 100).toFixed(2)) : 0;

  const isNegativeProfit = profitReal < 0;
  const alertReason = isNegativeProfit
    ? `Alerta Financiera: Margen negativo de US$ ${Math.abs(profitReal).toFixed(2)} (Costo Real US$ ${costReal.toFixed(2)} > Cobrado US$ ${charged.toFixed(2)}).`
    : undefined;

  return {
    customerShippingChargedUsd: charged,
    providerCostEstimatedUsd: costEst,
    providerCostRealUsd: costReal,
    grossProfitEstimatedUsd: profitEst,
    grossProfitRealUsd: profitReal,
    effectiveMarkupPercent: effectiveMarkup,
    effectiveMarginPercent: effectiveMargin,
    costVarianceUsd: costVariance,
    profitVarianceUsd: profitVariance,
    isNegativeProfit,
    alertReason
  };
}


