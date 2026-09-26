// supabase/functions/_shared/skypostal/skypostal-rate-engine.ts

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

/**
 * Resolves the appropriate rate card for a given country and optional tariff category.
 */
export function resolveRateCardCode(countryCode: string, tariffCategory?: string): string {
  const country = countryCode.toUpperCase().trim();
  if (country === 'MX' && tariffCategory === 'REGULATED') {
    return 'MX-340-R';
  }
  return `${country}-340`;
}

/**
 * Calculates the exact transportation charge for a billable weight.
 */
export function calculateTransportationCharge(
  countryCode: string,
  billableWeightKg: number,
  options?: {
    rateCardCode?: string;
    tariffCategory?: string;
    customRateCard?: RateCardDefinition;
  }
): RateCalculationResult {
  const code = options?.rateCardCode || resolveRateCardCode(countryCode, options?.tariffCategory);
  const card = options?.customRateCard || CONTRACTUAL_RATE_CARDS[code];

  if (!card) {
    throw new Error(`No SkyPostal rate card available for code: ${code}`);
  }

  const weight = Math.max(0.1, Number(billableWeightKg) || 0.1);
  const brackets = [...card.brackets].sort((a, b) => a.weight_kg - b.weight_kg);
  const maxBracket = brackets[brackets.length - 1];

  // Within bracket table (0.1kg - 10.0kg)
  if (weight <= maxBracket.weight_kg) {
    const matchedBracket = brackets.find(b => b.weight_kg >= weight) || maxBracket;
    return {
      rateCardCode: card.rateCardCode,
      serviceName: card.serviceName,
      serviceCode: card.serviceCode,
      gateway: card.gateway,
      clearanceType: card.clearanceType,
      deliveryType: card.deliveryType,
      version: card.version,
      billableWeightKg: weight,
      transportationChargeUsd: matchedBracket.price_usd,
      isExtrapolated: false,
      additionalUnitsCount: 0,
      additional500gPriceUsd: card.additional500gPrice
    };
  }

  // Weight exceeds 10.0 kg: extrapolate with additional 500g units
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
