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

  // Default to amazon_price_plus_fee
  return Number(fixedMarkupUsd.toFixed(2));
}

export function calculateDiscount(currentPrice: number, listPrice: number | null): number {
  if (!listPrice || listPrice <= currentPrice) return 0;
  return Math.round(((listPrice - currentPrice) / listPrice) * 100);
}

export interface ProfitSettings {
  target_margin_percent: number;
  min_profit_usd: number;
  min_absolute_profit_usd: number;
  never_sell_at_loss: boolean;
  zinc_fee_usd: number;
  urubox_price_per_kg: number;
  urubox_handling_fee: number;
}

export function calculateFinancialCostPrex(amazonPrice: number): number {
  // Costo Financiero Prex = ((amazon_price * 0.025) + 0.50) * 1.22
  return ((amazonPrice * 0.025) + 0.50) * 1.22;
}

export function calculateRealCost(amazonPrice: number, usaShipping: number, settings: ProfitSettings): number {
  const costPrex = calculateFinancialCostPrex(amazonPrice);
  return amazonPrice + usaShipping + settings.zinc_fee_usd + costPrex;
}

export function calculateProfitEngine(realCost: number, settings: ProfitSettings): number {
  const profit = Math.max(realCost * (settings.target_margin_percent / 100), settings.min_profit_usd);
  return profit;
}

export function applyProfitProtection(
  currentBasePrice: number, 
  currentFee: number, 
  realCost: number, 
  expectedProfit: number, 
  settings: ProfitSettings
): { finalPrice: number, finalFee: number, isLoss: boolean } {
  // Final price chosen by config (Fee mode)
  let proposedFinalPrice = currentBasePrice + currentFee;
  let proposedProfit = proposedFinalPrice - realCost;
  let isLoss = false;

  if (proposedProfit < settings.min_absolute_profit_usd) {
    if (settings.never_sell_at_loss) {
      // Force minimum profit
      proposedFinalPrice = realCost + expectedProfit;
      isLoss = true; // Still marked as loss to allow blocking or review depending on config
    }
  }

  return {
    finalPrice: Number(proposedFinalPrice.toFixed(2)),
    finalFee: Number((proposedFinalPrice - currentBasePrice).toFixed(2)),
    isLoss: proposedProfit < settings.min_absolute_profit_usd
  };
}

export function calculateUruboxEstimate(weightGrams: number | null, categoryName: string | null, settings: ProfitSettings): number {
  let estimatedWeightKg = 0.5; // default
  
  if (weightGrams && weightGrams > 0) {
    estimatedWeightKg = weightGrams / 1000;
  } else if (categoryName) {
    const cat = categoryName.toLowerCase();
    if (cat.includes('funko')) estimatedWeightKg = 0.4;
    else if (cat.includes('marvel legends')) estimatedWeightKg = 0.7;
    else if (cat.includes('neca')) estimatedWeightKg = 1.0;
    else if (cat.includes('hot toys')) estimatedWeightKg = 3.0;
    else if (cat.includes('lego')) estimatedWeightKg = 2.0;
  }
  
  const fleteUsaUy = estimatedWeightKg * settings.urubox_price_per_kg;
  const handling = settings.urubox_handling_fee;
  
  // Retención URSEC 10%
  return Number(((fleteUsaUy + handling) * 1.10).toFixed(2)); 
}
