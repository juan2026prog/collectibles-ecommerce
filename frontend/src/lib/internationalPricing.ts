/**
 * CANONICAL DYNAMIC PRICING ENGINE (Frontend Library)
 * Single source of truth for international product pricing and profit protection.
 *
 * Collectibles.uy / Collectibles2026
 */

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
  zincFee: number;
  financialFeeBeforeTax: number;
  financialTax: number;
  financialFeeTotal: number;
  otherCosts: number;
  realCost: number;
  targetProfit: number;
  minimumCommercialFee: number;
  requiredFee: number;
  appliedFee: number;
  commercialPrice: number;
  profitProtectedPrice: number;
  finalPrice: number;
  estimatedProfit: number;
  netMarginPercentage: number;
  profitProtectionTriggered: boolean;
  // Aliases for full backward compatibility
  acquisition_cost_usd: number;
  expected_profit_usd: number;
  minimum_safe_price_usd: number;
  commercial_price_usd: number;
  final_price_usd: number;
  collectibles_fee_usd: number;
  is_loss_adjusted: boolean;
  profit_usd: number;
}

export function calculateFee(
  basePriceUsd: number,
  mode: string,
  fixedMarkupUsd: number,
  percentageMarkup: number,
  tieredRules: { max_price: number | null; markup_usd?: number; markup_percent?: number }[] = []
): number {
  if (mode === 'fixed_markup') {
    return Number((basePriceUsd * (percentageMarkup / 100)).toFixed(2));
  }
  
  if (mode === 'tiered_markup' && tieredRules && tieredRules.length > 0) {
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

  return Number(fixedMarkupUsd.toFixed(2));
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

export function calculateExpectedProfit(
  acquisitionCostUsd: number, 
  settings?: InternationalPricingConfig
): number {
  const marginPercent = Number(settings?.targetMarginPercent ?? settings?.target_margin_percent ?? 15.0);
  const minAbsoluteProfit = Number(
    settings?.targetProfit ?? settings?.min_absolute_profit_usd ?? settings?.min_profit_usd ?? 3.99
  );
  const percentageProfit = acquisitionCostUsd * (marginPercent / 100);
  return Number(Math.max(percentageProfit, minAbsoluteProfit).toFixed(2));
}

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
  
  const targetProfitCfg = Number(config?.targetProfit ?? config?.min_profit_usd ?? config?.min_absolute_profit_usd ?? 3.99);
  const targetMarginPct = Number(config?.targetMarginPercent ?? config?.target_margin_percent ?? 15.0);
  const minCommercialFee = Number(config?.minimumCommercialFee ?? config?.fixed_markup_usd ?? 6.00);
  const pricingMode = config?.pricingMode || config?.pricing_mode || 'amazon_price_plus_fee';

  // 1. Financial Fees
  const financialFeeBeforeTax = Number(((amazonPrice * prexPct) + prexFixed).toFixed(6));
  const financialTax = Number((financialFeeBeforeTax * prexTax).toFixed(6));
  const financialFeeTotal = Number((financialFeeBeforeTax * (1 + prexTax)).toFixed(6));
  const flTax = Number(((amazonPrice + usaShipping) * flSalesTaxPct).toFixed(6));

  // 2. Real Cost (Acquisition Cost)
  const realCostRaw = amazonPrice + usaShipping + zincFee + financialFeeTotal + flTax + otherCosts;
  const realCost = Number(realCostRaw.toFixed(2));

  // 3. Target Profit
  let targetProfit = 3.99;
  if (config?.targetProfit != null) {
    targetProfit = Number(config.targetProfit);
  } else {
    const floor = Number(config?.min_profit_usd ?? config?.min_absolute_profit_usd ?? 3.99);
    const marginPct = Number(config?.targetMarginPercent ?? config?.target_margin_percent ?? 0);
    if (marginPct > 0 && (pricingMode === 'fixed_markup' || pricingMode === 'tiered_markup')) {
      targetProfit = Number(Math.max(realCost * (marginPct / 100), floor).toFixed(2));
    } else {
      targetProfit = floor;
    }
  }
  targetProfit = Number(targetProfit.toFixed(2));

  // 4. Commercial Price
  const commercialFee = calculateFee(
    amazonPrice,
    pricingMode,
    minCommercialFee,
    config?.percentageMarkup ?? config?.percentage_markup ?? 15,
    config?.tieredRules || config?.tiered_markup_rules || []
  );
  const commercialPrice = Number((amazonPrice + usaShipping + commercialFee).toFixed(2));

  // 5. Profit Protected Price
  const profitProtectedPrice = Number((realCost + targetProfit).toFixed(2));

  // 6. Final Price & Protection Trigger
  const profitProtectionTriggered = commercialPrice < profitProtectedPrice;
  let finalPrice = Math.max(commercialPrice, profitProtectedPrice);

  // Rounding safety check: guarantee finalPrice - realCost >= targetProfit
  if (Number((finalPrice - realCost).toFixed(2)) < targetProfit) {
    finalPrice = Number((realCost + targetProfit).toFixed(2));
  }
  finalPrice = Number(finalPrice.toFixed(2));

  // 7. Results
  const appliedFee = Number((finalPrice - amazonPrice - usaShipping).toFixed(2));
  const requiredFee = Number((profitProtectedPrice - amazonPrice - usaShipping).toFixed(2));
  const estimatedProfit = Number((finalPrice - realCost).toFixed(2));
  const netMarginPercentage = finalPrice > 0 ? Number(((estimatedProfit / finalPrice) * 100).toFixed(2)) : 0;

  return {
    amazonPrice,
    usaShipping,
    zincFee,
    financialFeeBeforeTax: Number(financialFeeBeforeTax.toFixed(2)),
    financialTax: Number(financialTax.toFixed(2)),
    financialFeeTotal: Number(financialFeeTotal.toFixed(2)),
    otherCosts,
    realCost,
    targetProfit,
    minimumCommercialFee: minCommercialFee,
    requiredFee,
    appliedFee,
    commercialPrice,
    profitProtectedPrice,
    finalPrice,
    estimatedProfit,
    netMarginPercentage,
    profitProtectionTriggered,
    // Aliases
    acquisition_cost_usd: realCost,
    expected_profit_usd: targetProfit,
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
