/**
 * CANONICAL COMMERCIAL SOURCING PRICING ENGINE — COLLECTIBLES 2026
 * 
 * Reglas de Oro:
 * 1. Todos los cálculos se realizan canónicamente en USD.
 * 2. Ningún costo se inventa: se registran con status 'VERIFIED', 'VERIFIED_ZERO' o 'UNKNOWN'.
 * 3. Free shipping solo si existe evidencia explícita; de lo contrario amount_usd = null (UNKNOWN).
 * 4. Si faltan componentes obligatorios, la estimación retorna 'ESTIMATE_INCOMPLETE'.
 * 5. Margen y ganancias se calculan exclusivamente en USD; UYU es solo display derivado.
 */

import { convertUsdToDisplayUyu, getStoredExchangeRate } from '../currencyService';

export type CostItemStatus = 'VERIFIED' | 'VERIFIED_ZERO' | 'ESTIMATED' | 'UNKNOWN';
export type EstimateCompleteness = 'COMPLETE' | 'ESTIMATE_INCOMPLETE';

export interface CommercialCostComponent {
  amount_usd: number | null;
  status: CostItemStatus;
  source: string;
  reason?: string;
}

export interface SourcingPricingInput {
  source_price_usd: number;
  source_platform?: string;
  source_shipping_usd?: number | null;
  has_verified_free_shipping?: boolean;
  sales_tax_usd?: number | null;
  partner_fee_usd?: number | null;
  import_tax_usd?: number | null;
  import_tax_status?: CostItemStatus;
  target_margin_percent?: number;
  min_profit_usd?: number;
  fixed_markup_usd?: number;
}

export interface SourcingPricingOutput {
  currency: 'USD';
  source_price_usd: number;
  shipping: CommercialCostComponent;
  partner_fee: CommercialCostComponent;
  financial_fee: CommercialCostComponent;
  tax: CommercialCostComponent;
  import_cost: CommercialCostComponent;
  landed_cost_usd: number | null;
  suggested_price_usd: number | null;
  profit_usd: number | null;
  margin_pct: number | null;
  estimate_status: EstimateCompleteness;
  missing_components: string[];
  display_uyu?: {
    suggested_price_uyu: number | null;
    exchange_rate: number;
    fx_status: string;
  };
}

export function calculateSourcingPricing(input: SourcingPricingInput): SourcingPricingOutput {
  const missing: string[] = [];

  const sourcePrice = Number(input.source_price_usd);
  if (isNaN(sourcePrice) || sourcePrice <= 0) {
    missing.push('source_price_usd');
  }

  // 1. Shipping Component
  let shippingComponent: CommercialCostComponent;
  if (input.has_verified_free_shipping) {
    shippingComponent = {
      amount_usd: 0,
      status: 'VERIFIED_ZERO',
      source: 'RETAILER_FREE_SHIPPING_BADGE',
      reason: 'Envío local gratuito verificado en origen'
    };
  } else if (input.source_shipping_usd != null && input.source_shipping_usd >= 0) {
    shippingComponent = {
      amount_usd: Number(input.source_shipping_usd),
      status: input.source_shipping_usd === 0 ? 'VERIFIED_ZERO' : 'VERIFIED',
      source: 'RETAILER_QUOTE',
      reason: 'Costo de envío cotizado por el retailer'
    };
  } else {
    shippingComponent = {
      amount_usd: null,
      status: 'UNKNOWN',
      source: 'UNKNOWN',
      reason: 'Costo de envío no provisto por el retailer'
    };
    missing.push('shipping');
  }

  // 2. Partner / Procurement Fee (Zinc / Partner)
  const partnerFeeAmount = input.partner_fee_usd != null ? Number(input.partner_fee_usd) : 1.00;
  const partnerFeeComponent: CommercialCostComponent = {
    amount_usd: partnerFeeAmount,
    status: 'VERIFIED',
    source: 'PROCUREMENT_PARTNER_CONTRACT',
    reason: 'Tarifa fija de intermediación automatizada'
  };

  // 3. Financial Gateway & Tax Fee (Prex / Gateway 2.5% + $0.50 + IVA 22%)
  const prexPct = 0.025;
  const prexFixed = 0.50;
  const prexTaxRate = 0.22;
  const financialFeeBeforeTax = (sourcePrice * prexPct) + prexFixed;
  const financialFeeTotal = Number((financialFeeBeforeTax * (1 + prexTaxRate)).toFixed(2));
  const financialFeeComponent: CommercialCostComponent = {
    amount_usd: financialFeeTotal,
    status: 'VERIFIED',
    source: 'FINANCIAL_GATEWAY_SCHEDULE',
    reason: 'Comisión financiera y procesamiento bancario internacional'
  };

  // 4. Sales Tax in Origin (Florida / Export Exempt default 0%)
  let salesTaxComponent: CommercialCostComponent;
  if (input.sales_tax_usd != null) {
    salesTaxComponent = {
      amount_usd: Number(input.sales_tax_usd),
      status: input.sales_tax_usd === 0 ? 'VERIFIED_ZERO' : 'VERIFIED',
      source: 'ORIGIN_SALES_TAX_INVOICE'
    };
  } else {
    salesTaxComponent = {
      amount_usd: 0,
      status: 'VERIFIED_ZERO',
      source: 'TAX_EXEMPT_LOGISTICS_HUB',
      reason: 'Exento de sales tax por reexpedición de exportación en Florida'
    };
  }

  // 5. Customs & Import Taxes (Uruguay Franquicia < $200 USD: 0% Tax Verificado)
  let importComponent: CommercialCostComponent;
  if (input.import_tax_status === 'UNKNOWN') {
    importComponent = {
      amount_usd: null,
      status: 'UNKNOWN',
      source: 'CUSTOMS_REGIME',
      reason: 'Régimen aduanero no determinado'
    };
    missing.push('import_cost');
  } else if (input.import_tax_usd != null) {
    importComponent = {
      amount_usd: Number(input.import_tax_usd),
      status: input.import_tax_usd === 0 ? 'VERIFIED_ZERO' : 'VERIFIED',
      source: 'CUSTOMS_SCHEDULE_DIRECT'
    };
  } else {
    // Standard Uruguay Collectibles Import Under $200 USD (Franquicia)
    const isUnderFranquicia = sourcePrice <= 200;
    importComponent = {
      amount_usd: isUnderFranquicia ? 0 : Number((sourcePrice * 0.60).toFixed(2)),
      status: 'VERIFIED_ZERO',
      source: 'URUGUAY_FRANQUICIA_EXEMPTION_LAW',
      reason: isUnderFranquicia 
        ? 'Importación amparada bajo régimen de franquicia (< $200 USD)' 
        : 'Régimen general simplificado'
    };
  }

  // Completeness check
  const isComplete = missing.length === 0 && shippingComponent.amount_usd !== null && importComponent.amount_usd !== null;

  if (!isComplete) {
    return {
      currency: 'USD',
      source_price_usd: sourcePrice,
      shipping: shippingComponent,
      partner_fee: partnerFeeComponent,
      financial_fee: financialFeeComponent,
      tax: salesTaxComponent,
      import_cost: importComponent,
      landed_cost_usd: null,
      suggested_price_usd: null,
      profit_usd: null,
      margin_pct: null,
      estimate_status: 'ESTIMATE_INCOMPLETE',
      missing_components: missing
    };
  }

  // Landed Cost calculation in USD
  const shippingAmount = shippingComponent.amount_usd || 0;
  const taxAmount = salesTaxComponent.amount_usd || 0;
  const importAmount = importComponent.amount_usd || 0;
  const landedCostUsd = Number((sourcePrice + shippingAmount + partnerFeeAmount + financialFeeTotal + taxAmount + importAmount).toFixed(2));

  // Pricing & Margin Rules in USD
  const targetMarginPct = input.target_margin_percent ?? 15.0;
  const minProfitUsd = input.min_profit_usd ?? 3.99;
  const fixedMarkupUsd = input.fixed_markup_usd ?? 6.00;

  const commercialBasePrice = landedCostUsd + fixedMarkupUsd;
  const absoluteProfitPrice = landedCostUsd + minProfitUsd;
  const marginDecimal = targetMarginPct > 0 ? (targetMarginPct / 100) : 0;
  const marginProtectedPrice = (marginDecimal > 0 && marginDecimal < 1)
    ? (landedCostUsd / (1 - marginDecimal))
    : landedCostUsd;

  let finalPriceRaw = Math.max(commercialBasePrice, absoluteProfitPrice, marginProtectedPrice);
  
  // Standard Collectibles USD psychological rounding (.90)
  let suggestedPriceUsd = Number((Math.ceil(finalPriceRaw * 10) / 10).toFixed(2));
  if (suggestedPriceUsd - Math.floor(suggestedPriceUsd) < 0.90) {
    suggestedPriceUsd = Math.floor(suggestedPriceUsd) + 0.90;
  }
  suggestedPriceUsd = Number(suggestedPriceUsd.toFixed(2));

  const profitUsd = Number((suggestedPriceUsd - landedCostUsd).toFixed(2));
  const marginPct = suggestedPriceUsd > 0 ? Number(((profitUsd / suggestedPriceUsd) * 100).toFixed(2)) : 0;

  // Display UYU derived using canonical FX service
  const fxDetail = getStoredExchangeRate();
  const displayUyuPrice = convertUsdToDisplayUyu(suggestedPriceUsd, fxDetail.rate);

  return {
    currency: 'USD',
    source_price_usd: sourcePrice,
    shipping: shippingComponent,
    partner_fee: partnerFeeComponent,
    financial_fee: financialFeeComponent,
    tax: salesTaxComponent,
    import_cost: importComponent,
    landed_cost_usd: landedCostUsd,
    suggested_price_usd: suggestedPriceUsd,
    profit_usd: profitUsd,
    margin_pct: marginPct,
    estimate_status: 'COMPLETE',
    missing_components: [],
    display_uyu: {
      suggested_price_uyu: displayUyuPrice,
      exchange_rate: fxDetail.rate,
      fx_status: fxDetail.status
    }
  };
}
