// supabase/functions/_shared/skypostal/skypostal-pricing-pipeline.ts

import { calculateBillableWeight, PackageDimensions, WeightSource } from './skypostal-package-engine.ts';
import { evaluateProductCompliance, ProductComplianceInput, ComplianceEvaluationResult } from './skypostal-compliance-engine.ts';
import { calculateTransportationCharge, RateCalculationResult } from './skypostal-rate-engine.ts';
import { calculateFuelSurcharge, FuelCalculationResult } from './skypostal-fuel-engine.ts';

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

export const DEFAULT_MARKUP_PERCENT = 35.0;
export const DEFAULT_QUOTE_TTL_SECONDS = 86400; // 24 hours

/**
 * Executes the full authoritative SkyPostal pricing pipeline.
 */
export function executeSkyPostalPricingPipeline(input: PricingQuoteInput): QuoteSnapshotData {
  const country = input.countryCode.toUpperCase().trim();
  const product = input.product;
  const quoteTtl = input.options?.quoteTtlSeconds || DEFAULT_QUOTE_TTL_SECONDS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + quoteTtl * 1000);
  const quoteId = `SPQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // 1. Package Engine: Weight calculation
  const weightResult = calculateBillableWeight({
    actualWeightKg: product.actualWeightKg,
    dimensions: product.dimensions,
    weightSource: product.weightSource
  });

  // 2. Compliance Engine: Customs & regulatory validation
  const complianceInput: ProductComplianceInput = {
    productId: product.productId,
    title: product.title,
    category: product.category,
    logisticsClassification: product.logisticsClassification,
    hsCode: product.hsCode,
    fobValueUsd: product.fobValueUsd,
    quantity: product.quantity,
    weightKg: weightResult.billableWeightKg,
    hasBattery: product.hasBattery,
    hasLiquid: product.hasLiquid,
    hasMagnet: product.hasMagnet,
    isUsed: product.isUsed,
    isFood: product.isFood,
    isCosmetic: product.isCosmetic,
    isSupplement: product.isSupplement,
    isFineJewelry: product.isFineJewelry,
    isWeaponOrReplica: product.isWeaponOrReplica,
    isCounterfeitOrReplicaBrand: product.isCounterfeitOrReplicaBrand
  };

  const compliance = evaluateProductCompliance(complianceInput, country);

  // If prohibited or manual review, fail-closed block
  const isEligible = compliance.status === 'ALLOWED' || compliance.status === 'REGULATED';
  const blockReason = !isEligible ? (compliance.reason || `Shipment status is ${compliance.status}`) : undefined;

  // 3. Rate Engine: Transportation Charge
  const rateResult = calculateTransportationCharge(country, weightResult.billableWeightKg, {
    tariffCategory: compliance.specialTariffCategory
  });

  // 4. Fuel Engine: Kerosene spot index adjustment
  const fuelResult = calculateFuelSurcharge(rateResult.transportationChargeUsd, {
    spotPriceUsd: input.options?.spotPriceUsd
  });

  // 5. Cost Breakdown
  const providerCostUsd = Number((rateResult.transportationChargeUsd + fuelResult.fuelAmountUsd).toFixed(2));

  // 6. Commercial Markup on Cost
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
