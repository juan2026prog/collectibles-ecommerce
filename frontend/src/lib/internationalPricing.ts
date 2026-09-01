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

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateInternationalPricingConfig(config?: any): ConfigValidationResult {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: true, errors: [] }; // Defaults will be used safely
  }

  const targetMargin = config.targetMarginPercent ?? config.target_margin_percent;
  if (targetMargin !== undefined && targetMargin !== null) {
    const num = Number(targetMargin);
    if (isNaN(num) || !isFinite(num) || num < 0 || num >= 100) {
      errors.push(`El margen objetivo debe ser un número entre 0% y 99.99% (recibido: ${targetMargin})`);
    }
  }

  const minProfit = config.minAbsoluteProfit ?? config.min_absolute_profit_usd ?? config.min_profit_usd ?? config.targetProfit;
  if (minProfit !== undefined && minProfit !== null) {
    const num = Number(minProfit);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      errors.push(`La ganancia mínima no puede ser negativa (recibido: ${minProfit})`);
    }
  }

  const zincFee = config.zincFee ?? config.zinc_fee_usd;
  if (zincFee !== undefined && zincFee !== null) {
    const num = Number(zincFee);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      errors.push(`El costo de Zinc no puede ser negativo (recibido: ${zincFee})`);
    }
  }

  const financialFeePct = config.financialFeePercent ?? config.financial_fee_percent;
  if (financialFeePct !== undefined && financialFeePct !== null) {
    const num = Number(financialFeePct);
    if (isNaN(num) || !isFinite(num) || num < 0 || num >= 100) {
      errors.push(`El porcentaje de comisión financiera debe estar entre 0% y 99.99% (recibido: ${financialFeePct})`);
    }
  }

  const financialFeeFixed = config.financialFeeFixedUsd ?? config.financial_fee_fixed_usd;
  if (financialFeeFixed !== undefined && financialFeeFixed !== null) {
    const num = Number(financialFeeFixed);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      errors.push(`El fee fijo financiero no puede ser negativo (recibido: ${financialFeeFixed})`);
    }
  }

  const financialTaxRate = config.financialFeeTaxRate ?? config.financial_fee_tax_rate;
  if (financialTaxRate !== undefined && financialTaxRate !== null) {
    const num = Number(financialTaxRate);
    if (isNaN(num) || !isFinite(num) || num < 0 || num >= 1) {
      errors.push(`La tasa de impuesto financiero debe ser decimal entre 0 y 0.999 (recibido: ${financialTaxRate})`);
    }
  }

  const floridaSalesTax = config.floridaSalesTaxPercent ?? config.florida_sales_tax_percent;
  if (floridaSalesTax !== undefined && floridaSalesTax !== null) {
    const num = Number(floridaSalesTax);
    if (isNaN(num) || !isFinite(num) || num < 0 || num >= 100) {
      errors.push(`El sales tax estimado debe estar entre 0% y 99.99% (recibido: ${floridaSalesTax})`);
    }
  }

  const fixedMarkup = config.fixedMarkupUsd ?? config.fixed_markup_usd ?? config.minimumCommercialFee;
  if (fixedMarkup !== undefined && fixedMarkup !== null) {
    const num = Number(fixedMarkup);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      errors.push(`El markup comercial no puede ser negativo (recibido: ${fixedMarkup})`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function assertValidInternationalPricingConfig(config?: any): void {
  const result = validateInternationalPricingConfig(config);
  if (!result.valid) {
    throw new Error(`INTERNATIONAL_PRICING_CONFIG_INVALID: ${result.errors.join('; ')}`);
  }
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
  const marginDecimal = marginPercent > 0 ? marginPercent / 100 : 0;
  const marginProfit = marginDecimal > 0 && marginDecimal < 1 
    ? (acquisitionCostUsd / (1 - marginDecimal)) - acquisitionCostUsd
    : 0;
  return Number(Math.max(marginProfit, minAbsoluteProfit).toFixed(2));
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
  if (targetMarginDecimal > 0 && targetMarginDecimal < 1 && finalPrice > 0 && ((finalPrice - realCost) / finalPrice) < (targetMarginDecimal - 0.0001)) {
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
