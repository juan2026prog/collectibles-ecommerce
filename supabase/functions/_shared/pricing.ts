export function calculateFee(
  basePriceUsd: number,
  mode: string,
  fixedMarkupUsd: number,
  percentageMarkup: number,
  tieredRules: { max_price: number | null, markup_usd?: number, markup_percent?: number }[]
): number {
  if (mode === 'fixed_markup') {
    return Number((basePriceUsd * (percentageMarkup / 100)).toFixed(2));
  }
  
  if (mode === 'tiered_markup' && tieredRules && tieredRules.length > 0) {
    // Sort rules by max_price ascending, nulls last
    const sortedRules = [...tieredRules].sort((a, b) => {
      if (a.max_price === null) return 1;
      if (b.max_price === null) return -1;
      return a.max_price - b.max_price;
    });

    for (const rule of sortedRules) {
      if (rule.max_price === null || basePriceUsd <= rule.max_price) {
        if (rule.markup_percent != null) {
          return Number((basePriceUsd * (rule.markup_percent / 100)).toFixed(2));
        } else if (rule.markup_usd != null) {
          return Number(rule.markup_usd.toFixed(2));
        }
      }
    }
  }

  // Default to amazon_price_plus_fee / standard fee
  return Number(fixedMarkupUsd.toFixed(2));
}

export function calculateDiscount(currentPrice: number, listPrice: number | null): number {
  if (!listPrice || listPrice <= currentPrice) return 0;
  return Math.round(((listPrice - currentPrice) / listPrice) * 100);
}

export interface ProfitSettings {
  target_margin_percent?: number;
  min_profit_usd?: number;
  min_absolute_profit_usd?: number;
  never_sell_at_loss?: boolean;
  zinc_fee_usd?: number;
  urubox_price_per_kg?: number;
  urubox_handling_fee?: number;
  financial_fee_percent?: number;
  financial_fee_fixed_usd?: number;
  financial_fee_tax_rate?: number;
  florida_sales_tax_percent?: number;
}

export interface InternationalPricingInput {
  amazonPrice: number;
  usaShipping?: number;
  salesTax?: number;
  otherCosts?: number;
}

export interface InternationalPricingConfig {
  zincFee?: number;
  zinc_fee_usd?: number;
  financialFeePercent?: number;
  financial_fee_percent?: number;
  financialFeeFixedUsd?: number;
  financial_fee_fixed_usd?: number;
  financialFeeTaxRate?: number;
  financial_fee_tax_rate?: number;
  floridaSalesTaxPercent?: number;
  florida_sales_tax_percent?: number;
  targetProfit?: number;
  min_profit_usd?: number;
  min_absolute_profit_usd?: number;
  targetMarginPercent?: number;
  target_margin_percent?: number;
  minimumCommercialFee?: number;
  fixed_markup_usd?: number;
  pricingMode?: string;
  pricing_mode?: string;
  percentageMarkup?: number;
  percentage_markup?: number;
  tieredRules?: { max_price: number | null; markup_usd?: number; markup_percent?: number }[];
  tiered_markup_rules?: { max_price: number | null; markup_usd?: number; markup_percent?: number }[];
  never_sell_at_loss?: boolean;
  otherCosts?: number;
}

export interface InternationalPricingOutput {
  amazonPrice: number;
  usaShipping: number;
  salesTax: number;
  zincFee: number;
  financialFeeBeforeTax: number;
  financialTax: number;
  financialFeeTotal: number;
  otherCosts: number;
  realCost: number;
  targetProfit: number;
  minAbsoluteProfit: number;
  targetMarginPercent: number;
  minimumCommercialFee: number;
  requiredFee: number;
  appliedFee: number;
  commercialPrice: number;
  absoluteProtectedPrice: number;
  marginProtectedPrice: number;
  profitProtectedPrice: number;
  finalPrice: number;
  estimatedProfit: number;
  netMarginPercentage: number;
  profitProtectionTriggered: boolean;
  pricingProtectionReason: 'commercial_fee' | 'absolute_profit' | 'target_margin';
  // Aliases for complete backward compatibility
  acquisition_cost_usd: number;
  expected_profit_usd: number;
  minimum_safe_price_usd: number;
  commercial_price_usd: number;
  final_price_usd: number;
  collectibles_fee_usd: number;
  is_loss_adjusted: boolean;
  profit_usd: number;
}

export function calculatePurchasePaymentFee(
  productCostUsd: number,
  config?: InternationalPricingConfig
): number {
  const prexPct = Number(config?.financialFeePercent ?? config?.financial_fee_percent ?? 2.50) / 100;
  const prexFixed = Number(config?.financialFeeFixedUsd ?? config?.financial_fee_fixed_usd ?? 0.50);
  const prexTax = Number(config?.financialFeeTaxRate ?? config?.financial_fee_tax_rate ?? 0.22);
  const beforeTax = (productCostUsd * prexPct) + prexFixed;
  return Number((beforeTax * (1 + prexTax)).toFixed(2));
}

// Backward-compatible alias
export function calculateFinancialCostPrex(amazonPrice: number, config?: InternationalPricingConfig): number {
  return calculatePurchasePaymentFee(amazonPrice, config);
}

export function calculateAcquisitionCost(
  productCostUsd: number, 
  usaShippingUsd: number = 0, 
  settings?: InternationalPricingConfig
): number {
  const zincFee = Number(settings?.zincFee ?? settings?.zinc_fee_usd ?? 1.00);
  const prexPct = Number(settings?.financialFeePercent ?? settings?.financial_fee_percent ?? 2.50) / 100;
  const prexFixed = Number(settings?.financialFeeFixedUsd ?? settings?.financial_fee_fixed_usd ?? 0.50);
  const prexTax = Number(settings?.financialFeeTaxRate ?? settings?.financial_fee_tax_rate ?? 0.22);
  const flSalesTaxPct = Number(settings?.floridaSalesTaxPercent ?? settings?.florida_sales_tax_percent ?? 0.0) / 100;
  
  const flTax = (productCostUsd + usaShippingUsd) * flSalesTaxPct;
  const financialFeeBeforeTax = (productCostUsd * prexPct) + prexFixed;
  const financialFeeTotal = financialFeeBeforeTax * (1 + prexTax);

  return Number((productCostUsd + usaShippingUsd + zincFee + financialFeeTotal + flTax).toFixed(2));
}

// Backward-compatible alias
export function calculateRealCost(amazonPrice: number, usaShipping: number = 0, settings?: InternationalPricingConfig): number {
  return calculateAcquisitionCost(amazonPrice, usaShipping, settings);
}

export function calculateExpectedProfit(
  acquisitionCostUsd: number, 
  settings?: InternationalPricingConfig
): number {
  const marginPercent = Number(settings?.targetMarginPercent ?? settings?.target_margin_percent ?? 15.0);
  const minAbsoluteProfit = Number(
    settings?.targetProfit ?? settings?.min_absolute_profit_usd ?? settings?.min_profit_usd ?? 3.99
  );
  const marginDecimal = marginPercent > 0 ? marginPercent / 100 : 0;
  const marginProfit = marginDecimal > 0 && marginDecimal < 1 
    ? (acquisitionCostUsd / (1 - marginDecimal)) - acquisitionCostUsd
    : 0;
  return Number(Math.max(marginProfit, minAbsoluteProfit).toFixed(2));
}

// Backward-compatible alias
export function calculateProfitEngine(realCost: number, settings?: InternationalPricingConfig): number {
  return calculateExpectedProfit(realCost, settings);
}

export type CanonicalPricingResult = InternationalPricingOutput;

/**
 * CANONICAL DYNAMIC PRICING ENGINE
 * Single source of truth for international product pricing and profit protection.
 *
 * REAL_COST = amazon_price + usa_shipping + sales_tax + zinc_fee + financial_fee_total + other_costs
 * ABSOLUTE_PROTECTED_PRICE = REAL_COST + min_absolute_profit
 * MARGIN_PROTECTED_PRICE = REAL_COST / (1 - target_margin_percent / 100)
 * COMMERCIAL_PRICE = amazon_price + usa_shipping + commercial_fee
 * FINAL_PRICE = max(COMMERCIAL_PRICE, ABSOLUTE_PROTECTED_PRICE, MARGIN_PROTECTED_PRICE)
 * APPLIED_FEE = final_price - amazon_price - usa_shipping
 */
export function calculateInternationalPricing(
  input: InternationalPricingInput,
  config?: InternationalPricingConfig
): InternationalPricingOutput {
  const amazonPrice = Math.max(0, Number(input.amazonPrice || 0));
  const usaShipping = Math.max(0, Number(input.usaShipping || 0));
  const otherCosts = Math.max(0, Number(input.otherCosts || 0));

  const zincFee = Number(config?.zincFee ?? config?.zinc_fee_usd ?? 1.00);
  const prexPct = Number(config?.financialFeePercent ?? config?.financial_fee_percent ?? 2.50) / 100;
  const prexFixed = Number(config?.financialFeeFixedUsd ?? config?.financial_fee_fixed_usd ?? 0.50);
  const prexTax = Number(config?.financialFeeTaxRate ?? config?.financial_fee_tax_rate ?? 0.22);
  const flSalesTaxPct = Number(config?.floridaSalesTaxPercent ?? config?.florida_sales_tax_percent ?? 0.0) / 100;
  
  // Real sales tax passed in input takes priority over estimated config percentage
  const salesTax = input.salesTax != null
    ? Number(input.salesTax)
    : Number(((amazonPrice + usaShipping) * flSalesTaxPct).toFixed(6));

  const minAbsoluteProfit = Number(config?.targetProfit ?? config?.min_profit_usd ?? config?.min_absolute_profit_usd ?? 3.99);
  const targetMarginPercent = Number(config?.targetMarginPercent ?? config?.target_margin_percent ?? 15.0);
  const targetMarginDecimal = targetMarginPercent > 0 ? (targetMarginPercent / 100) : 0;
  const minCommercialFee = Number(config?.minimumCommercialFee ?? config?.fixed_markup_usd ?? 6.00);
  const pricingMode = config?.pricingMode || config?.pricing_mode || 'amazon_price_plus_fee';

  // 1. Financial Fees
  const financialFeeBeforeTax = Number(((amazonPrice * prexPct) + prexFixed).toFixed(6));
  const financialTax = Number((financialFeeBeforeTax * prexTax).toFixed(6));
  const financialFeeTotal = Number((financialFeeBeforeTax * (1 + prexTax)).toFixed(6));

  // 2. Real Cost (Acquisition Cost)
  const realCostRaw = amazonPrice + usaShipping + salesTax + zincFee + financialFeeTotal + otherCosts;
  const realCost = Number(realCostRaw.toFixed(2));

  // 3. Commercial Base Price
  const commercialFee = calculateFee(
    amazonPrice,
    pricingMode,
    minCommercialFee,
    config?.percentageMarkup ?? config?.percentage_markup ?? 15,
    config?.tieredRules || config?.tiered_markup_rules || []
  );
  const commercialPrice = Number((amazonPrice + usaShipping + commercialFee).toFixed(2));

  // 4. Absolute Protected Price
  const absoluteProtectedPrice = Number((realCost + minAbsoluteProfit).toFixed(2));

  // 5. Margin Protected Price (Margin on Final Price: realCost / (1 - marginDecimal))
  const marginProtectedPrice = (targetMarginDecimal > 0 && targetMarginDecimal < 1)
    ? Number((realCost / (1 - targetMarginDecimal)).toFixed(2))
    : realCost;

  // 6. Combined Protected Price & Winner Rule Selection
  const profitProtectedPrice = Number(Math.max(absoluteProtectedPrice, marginProtectedPrice).toFixed(2));
  const finalPriceRaw = Math.max(commercialPrice, absoluteProtectedPrice, marginProtectedPrice);

  let pricingProtectionReason: 'commercial_fee' | 'absolute_profit' | 'target_margin' = 'commercial_fee';
  let profitProtectionTriggered = false;

  if (marginProtectedPrice > commercialPrice && marginProtectedPrice >= absoluteProtectedPrice) {
    pricingProtectionReason = 'target_margin';
    profitProtectionTriggered = true;
  } else if (absoluteProtectedPrice > commercialPrice) {
    pricingProtectionReason = 'absolute_profit';
    profitProtectionTriggered = true;
  } else {
    pricingProtectionReason = 'commercial_fee';
    profitProtectionTriggered = false;
  }

  // 7. Rounding safety check: guarantee profit >= minAbsoluteProfit AND margin >= targetMarginDecimal
  let finalPrice = Number(finalPriceRaw.toFixed(2));
  if (Number((finalPrice - realCost).toFixed(2)) < minAbsoluteProfit) {
    finalPrice = Number((realCost + minAbsoluteProfit).toFixed(2));
  }
  if (targetMarginDecimal > 0 && finalPrice > 0 && ((finalPrice - realCost) / finalPrice) < (targetMarginDecimal - 0.0001)) {
    finalPrice = Number((realCost / (1 - targetMarginDecimal)).toFixed(2));
  }
  finalPrice = Number(finalPrice.toFixed(2));

  // 8. Results Output
  const appliedFee = Number((finalPrice - amazonPrice - usaShipping).toFixed(2));
  const requiredFee = Number((profitProtectedPrice - amazonPrice - usaShipping).toFixed(2));
  const estimatedProfit = Number((finalPrice - realCost).toFixed(2));
  const netMarginPercentage = finalPrice > 0 ? Number(((estimatedProfit / finalPrice) * 100).toFixed(2)) : 0;
  const effectiveTargetProfit = Number(Math.max(minAbsoluteProfit, finalPrice - marginProtectedPrice + (marginProtectedPrice - realCost)).toFixed(2));

  return {
    amazonPrice,
    usaShipping,
    salesTax: Number(salesTax.toFixed(2)),
    zincFee,
    financialFeeBeforeTax: Number(financialFeeBeforeTax.toFixed(2)),
    financialTax: Number(financialTax.toFixed(2)),
    financialFeeTotal: Number(financialFeeTotal.toFixed(2)),
    otherCosts,
    realCost,
    targetProfit: effectiveTargetProfit > minAbsoluteProfit ? Number((marginProtectedPrice - realCost).toFixed(2)) : minAbsoluteProfit,
    minAbsoluteProfit,
    targetMarginPercent,
    minimumCommercialFee: minCommercialFee,
    requiredFee,
    appliedFee,
    commercialPrice,
    absoluteProtectedPrice,
    marginProtectedPrice,
    profitProtectedPrice,
    finalPrice,
    estimatedProfit,
    netMarginPercentage,
    profitProtectionTriggered,
    pricingProtectionReason,
    // Aliases
    acquisition_cost_usd: realCost,
    expected_profit_usd: effectiveTargetProfit > minAbsoluteProfit ? Number((marginProtectedPrice - realCost).toFixed(2)) : minAbsoluteProfit,
    minimum_safe_price_usd: profitProtectedPrice,
    commercial_price_usd: commercialPrice,
    final_price_usd: finalPrice,
    collectibles_fee_usd: appliedFee,
    is_loss_adjusted: profitProtectionTriggered,
    profit_usd: estimatedProfit
  };
}

export function calculateCanonicalPricing(
  productCostUsd: number,
  usaShippingUsd: number = 0,
  commercialFeeUsd: number = 0,
  settings?: ProfitSettings & InternationalPricingConfig
): InternationalPricingOutput {
  return calculateInternationalPricing(
    {
      amazonPrice: productCostUsd,
      usaShipping: usaShippingUsd
    },
    {
      ...settings,
      minimumCommercialFee: commercialFeeUsd !== 0 ? commercialFeeUsd : (settings?.fixed_markup_usd ?? 0)
    }
  );
}

/**
 * Backward-compatible wrapper for applyProfitProtection
 */
export function applyProfitProtection(
  currentBasePrice: number, 
  currentFee: number, 
  realCost: number, 
  expectedProfit: number, 
  settings?: ProfitSettings & InternationalPricingConfig,
  usaShipping: number = 0
): { finalPrice: number, finalFee: number, isLoss: boolean } {
  const result = calculateCanonicalPricing(currentBasePrice, usaShipping, currentFee, settings);
  return {
    finalPrice: result.final_price_usd,
    finalFee: result.collectibles_fee_usd,
    isLoss: result.profitProtectionTriggered
  };
}

export function getEstimatedWeightKg(categoryName?: string | null): number {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('funko')) return 0.4;
  if (cat.includes('marvel legends') || cat.includes('marvel legend') || cat.includes('hasbro')) return 0.7;
  if (cat.includes('neca')) return 1.0;
  if (cat.includes('hot toys')) return 3.0;
  if (cat.includes('lego')) return 2.0;
  if (cat.includes('libro') || cat.includes('book') || cat.includes('artbook')) return 1.0;
  return 1.0; // default weight is 1.0 kg
}

export interface UruboxEstimateResult {
  base_freight_usd: number;
  handling_usd: number;
  ursec_usd: number;
  local_delivery_usd: number;
  total_urubox_usd: number;
  rate_label: string;
  is_quote_required: boolean;
}

export function calculateUruboxEstimateNew({
  weight_kg,
  category,
  destination_type
}: {
  weight_kg: number | null;
  category?: string | null;
  destination_type?: 'montevideo' | 'interior_agency' | 'no_local_delivery' | string | null;
}): UruboxEstimateResult {
  let weight = weight_kg;
  if (weight === null || weight === undefined || weight <= 0) {
    weight = getEstimatedWeightKg(category);
  }

  let base_freight_usd = 0;
  let rate_label = '';
  let is_quote_required = false;

  if (weight >= 40) {
    is_quote_required = true;
    return {
      base_freight_usd: 0,
      handling_usd: 0,
      ursec_usd: 0,
      local_delivery_usd: 0,
      total_urubox_usd: 0,
      rate_label: 'Cotización requerida',
      is_quote_required: true
    };
  }

  const catLower = (category || '').toLowerCase();
  const isBookOrMedia = catLower.includes('libro') || 
                        catLower.includes('book') || 
                        catLower.includes('cd') || 
                        catLower.includes('vinilo') || 
                        catLower.includes('vinyl') || 
                        catLower.includes('dvd') || 
                        catLower.includes('artbook');

  if (isBookOrMedia) {
    base_freight_usd = weight * 11.90;
    rate_label = 'Libros/CD/Vinilos/DVD (USD 11.90/kg)';
  } else {
    if (weight < 0.200) {
      base_freight_usd = 10.90;
      rate_label = 'Rango 0 - 199g (USD 10.90)';
    } else if (weight < 0.500) {
      base_freight_usd = 15.90;
      rate_label = 'Rango 200 - 499g (USD 15.90)';
    } else if (weight < 0.700) {
      base_freight_usd = 18.90;
      rate_label = 'Rango 500 - 699g (USD 18.90)';
    } else if (weight < 1.000) {
      base_freight_usd = 20.90;
      rate_label = 'Rango 700 - 999g (USD 20.90)';
    } else if (weight < 5.0) {
      base_freight_usd = weight * 19.90;
      rate_label = 'Rango 1 - 4.99kg (USD 19.90/kg)';
    } else if (weight < 10.0) {
      base_freight_usd = weight * 17.90;
      rate_label = 'Rango 5 - 9.99kg (USD 17.90/kg)';
    } else if (weight < 20.0) {
      base_freight_usd = weight * 16.50;
      rate_label = 'Rango 10 - 19.99kg (USD 16.50/kg)';
    } else {
      base_freight_usd = weight * 15.90;
      rate_label = 'Rango 20 - 40kg (USD 15.90/kg)';
    }
  }

  const handling_usd = 5.00; // Handling: USD 5 per package
  const ursec_usd = base_freight_usd * 0.10; // URSEC: 10% of flete value

  let local_delivery_usd = 0;
  if (destination_type === 'montevideo' || destination_type === 'interior_agency') {
    local_delivery_usd = 5.00 * 1.22; // USD 5 + IVA (22%)
  }

  const total_urubox_usd = base_freight_usd + handling_usd + ursec_usd + local_delivery_usd;

  return {
    base_freight_usd: Number(base_freight_usd.toFixed(2)),
    handling_usd: Number(handling_usd.toFixed(2)),
    ursec_usd: Number(ursec_usd.toFixed(2)),
    local_delivery_usd: Number(local_delivery_usd.toFixed(2)),
    total_urubox_usd: Number(total_urubox_usd.toFixed(2)),
    rate_label,
    is_quote_required: false
  };
}

// Polymorphic function for both new object signature and legacy positional signature
export function calculateUruboxEstimate(
  arg1: any,
  arg2?: any,
  arg3?: any
): any {
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    return calculateUruboxEstimateNew(arg1);
  } else {
    const weight_kg = arg1 ? arg1 / 1000 : null;
    const res = calculateUruboxEstimateNew({
      weight_kg,
      category: arg2,
      destination_type: 'no_local_delivery'
    });
    return res.total_urubox_usd;
  }
}
