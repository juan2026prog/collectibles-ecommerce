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
  const floridaSalesTax = (amazonPrice + usaShipping) * 0.07;
  return amazonPrice + usaShipping + floridaSalesTax + settings.zinc_fee_usd + costPrex;
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

export function getEstimatedWeightKg(categoryName?: string | null): number {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('funko')) return 0.4;
  if (cat.includes('marvel legends') || cat.includes('marvel legend') || cat.includes('hasbro')) return 0.7;
  if (cat.includes('neca')) return 1.0;
  if (cat.includes('hot toys')) return 3.0;
  if (cat.includes('lego')) return 2.0;
  if (cat.includes('libro') || cat.includes('book') || cat.includes('artbook')) return 1.0;
  return 1.0; // default weight is 1.0 kg according to prompt 8
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
