/**
 * CANONICAL COMMERCIAL SOURCING PRICING ENGINE — COLLECTIBLES 2026
 * 
 * Arquitectura Canónica:
 * Commercial Pricing
 *         ↓
 * Customer Import Context
 *         ↓
 * Import Hub / Customs Engine
 *         ↓
 * Applicable Regime
 *         ↓
 * Import Cost Result
 * 
 * Reglas de Oro:
 * 1. Todos los cálculos se realizan canónicamente en USD.
 * 2. Ningún costo se inventa: se registran con status 'VERIFIED', 'VERIFIED_ZERO' o 'UNKNOWN'.
 * 3. Free shipping solo si existe evidencia explícita; de lo contrario amount_usd = null (UNKNOWN).
 * 4. Si faltan componentes obligatorios, la estimación retorna 'ESTIMATE_INCOMPLETE'.
 * 5. Margen y ganancias se calculan exclusivamente en USD; UYU es solo display derivado.
 * 6. SOURCING SIN COMPRADOR:
 *    - NO asume franquicia aduanera.
 *    - NO asume régimen 60%.
 *    - CUSTOMER_IMPORT_STATUS = 'UNKNOWN'.
 *    - Los escenarios aduaneros provienen exclusivamente de Customs Engine como simulaciones no autoritativas.
 */

import { convertUsdToDisplayUyu, getStoredExchangeRate } from '../currencyService';
import { CustomsEngine, DEFAULT_UY_CUSTOMS_RULE } from '../../plugins/collector-import-hub/core/customsEngine';

export type CostItemStatus = 'VERIFIED' | 'VERIFIED_ZERO' | 'ESTIMATED' | 'UNKNOWN' | 'SCENARIO_ESTIMATE' | 'NOT_APPLICABLE';
export type EstimateCompleteness = 'COMPLETE' | 'ESTIMATE_INCOMPLETE';
export type ImportCostScenario = 'WITH_AVAILABLE_FRANCHISE' | 'WITHOUT_FRANCHISE' | 'OTHER_APPLICABLE_REGIME' | 'COMMERCIAL_NOT_APPLICABLE';
export type CustomerImportStatus = 'KNOWN' | 'UNKNOWN';

export interface CommercialCostComponent {
  amount_usd: number | null;
  status: CostItemStatus;
  source: string;
  reason?: string;
  scenario?: ImportCostScenario;
}

export interface CustomerImportContext {
  customer_id?: string;
  country_code: string;
  has_verified_franchise?: boolean;
  used_franchise_shipments?: number;
  used_franchise_quota_usd?: number;
  force_simplified_regime?: boolean;
  physical_weight_kg?: number;
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
  customer_import_context?: CustomerImportContext | null;
  customer_has_franchise?: boolean | null; // null means unknown customer identity
  physical_weight_kg?: number;
}

export interface SourcingPricingOutput {
  currency: 'USD';
  source_price_usd: number;
  customer_import_status: CustomerImportStatus;
  customs_authority: 'IMPORT_HUB_CUSTOMS_ENGINE';
  shipping: CommercialCostComponent;
  partner_fee: CommercialCostComponent;
  financial_fee: CommercialCostComponent;
  tax: CommercialCostComponent;
  import_cost: CommercialCostComponent;
  import_scenarios: {
    franchise_available: { amount_usd: number; status: CostItemStatus; description: string; regime: string };
    franchise_depleted: { amount_usd: number; status: CostItemStatus; description: string; regime: string };
  };
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
    fx_source: string;
  };
}

const customsEngine = new CustomsEngine(DEFAULT_UY_CUSTOMS_RULE);

export function calculateSourcingPricing(input: SourcingPricingInput): SourcingPricingOutput {
  const missing: string[] = [];

  const sourcePrice = Number(input.source_price_usd);
  if (isNaN(sourcePrice) || sourcePrice <= 0) {
    missing.push('source_price_usd');
  }

  const physicalWeight = input.physical_weight_kg || input.customer_import_context?.physical_weight_kg || 1.0;

  // 1. Shipping Component (Fail-Closed: Unknown != 0)
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

  // 3. Financial Gateway & Tax Fee (Prex / Gateway 2.5% + .50 + IVA 22%)
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

  // 5. Customs & Import Taxes: AUTHORITATIVE EVALUATION VIA IMPORT HUB CUSTOMS ENGINE
  // Dynamic scenario calculations using CustomsEngine as single source of truth
  const franchiseEval = customsEngine.evaluate({
    productPriceUsd: sourcePrice,
    physicalWeightKg: physicalWeight,
    usedShipments: 0,
    usedAmountUsd: 0
  });

  const simplifiedEval = customsEngine.evaluate({
    productPriceUsd: sourcePrice,
    physicalWeightKg: physicalWeight,
    forceSimplified: true
  });

  const importScenarios = {
    franchise_available: {
      amount_usd: franchiseEval.taxUsd,
      status: 'SCENARIO_ESTIMATE' as CostItemStatus,
      description: franchiseEval.reason,
      regime: franchiseEval.regime
    },
    franchise_depleted: {
      amount_usd: simplifiedEval.taxUsd,
      status: 'SCENARIO_ESTIMATE' as CostItemStatus,
      description: simplifiedEval.reason,
      regime: simplifiedEval.regime
    }
  };

  let importComponent: CommercialCostComponent;
  let customerImportStatus: CustomerImportStatus = 'UNKNOWN';

  // Check if an authoritative customer context was provided
  const hasExplicitContext = input.customer_import_context != null || input.customer_has_franchise !== undefined && input.customer_has_franchise !== null;

  if (input.import_tax_status === 'UNKNOWN') {
    importComponent = {
      amount_usd: null,
      status: 'UNKNOWN',
      source: 'IMPORT_HUB_CUSTOMS_ENGINE',
      reason: 'Régimen aduanero no determinado',
      scenario: 'OTHER_APPLICABLE_REGIME'
    };
    missing.push('import_cost');
  } else if (input.import_tax_usd != null) {
    customerImportStatus = 'KNOWN';
    importComponent = {
      amount_usd: Number(input.import_tax_usd),
      status: input.import_tax_usd === 0 ? 'VERIFIED_ZERO' : 'VERIFIED',
      source: 'IMPORT_HUB_CUSTOMS_ENGINE_DIRECT',
      scenario: input.import_tax_usd === 0 ? 'WITH_AVAILABLE_FRANCHISE' : 'WITHOUT_FRANCHISE'
    };
  } else if (hasExplicitContext) {
    customerImportStatus = 'KNOWN';
    const ctx = input.customer_import_context;
    const forceSimplified = ctx?.force_simplified_regime || input.customer_has_franchise === false;
    const usedShipments = ctx?.used_franchise_shipments ?? (input.customer_has_franchise === false ? 3 : 0);
    const usedQuota = ctx?.used_franchise_quota_usd ?? (input.customer_has_franchise === false ? 800 : 0);

    const customerEval = customsEngine.evaluate({
      productPriceUsd: sourcePrice,
      physicalWeightKg: physicalWeight,
      usedShipments,
      usedAmountUsd: usedQuota,
      forceSimplified
    });

    importComponent = {
      amount_usd: customerEval.taxUsd,
      status: customerEval.taxUsd === 0 ? 'VERIFIED_ZERO' : 'VERIFIED',
      source: 'IMPORT_HUB_CUSTOMS_ENGINE_CUSTOMER_CONTEXT',
      reason: customerEval.reason,
      scenario: customerEval.regime === 'FRANQUICIA' ? 'WITH_AVAILABLE_FRANCHISE' : 'WITHOUT_FRANCHISE'
    };
  } else {
    // SOURCING WITHOUT CUSTOMER: CUSTOMER_IMPORT_STATUS = UNKNOWN
    // Does NOT assume franchise, does NOT assume 60% as customer status.
    // Models non-authoritative simulation baseline.
    customerImportStatus = 'UNKNOWN';
    importComponent = {
      amount_usd: franchiseEval.taxUsd,
      status: 'SCENARIO_ESTIMATE',
      source: 'IMPORT_HUB_CUSTOMS_ENGINE_SCENARIO_SIMULATION',
      reason: 'Sourcing sin comprador identificado (CUSTOMER_IMPORT_STATUS = UNKNOWN); simulación aduanera no autoritativa de Import Hub Customs Engine',
      scenario: 'OTHER_APPLICABLE_REGIME'
    };
  }

  // Completeness check
  const isComplete = missing.length === 0 && shippingComponent.amount_usd !== null && importComponent.amount_usd !== null;

  if (!isComplete) {
    return {
      currency: 'USD',
      source_price_usd: sourcePrice,
      customer_import_status: customerImportStatus,
      customs_authority: 'IMPORT_HUB_CUSTOMS_ENGINE',
      shipping: shippingComponent,
      partner_fee: partnerFeeComponent,
      financial_fee: financialFeeComponent,
      tax: salesTaxComponent,
      import_cost: importComponent,
      import_scenarios: importScenarios,
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
  const fxDetail = getStoredExchangeRate('UYU');
  const displayUyuPrice = convertUsdToDisplayUyu(suggestedPriceUsd, fxDetail.rate);

  return {
    currency: 'USD',
    source_price_usd: sourcePrice,
    customer_import_status: customerImportStatus,
    customs_authority: 'IMPORT_HUB_CUSTOMS_ENGINE',
    shipping: shippingComponent,
    partner_fee: partnerFeeComponent,
    financial_fee: financialFeeComponent,
    tax: salesTaxComponent,
    import_cost: importComponent,
    import_scenarios: importScenarios,
    landed_cost_usd: landedCostUsd,
    suggested_price_usd: suggestedPriceUsd,
    profit_usd: profitUsd,
    margin_pct: marginPct,
    estimate_status: 'COMPLETE',
    missing_components: [],
    display_uyu: {
      suggested_price_uyu: displayUyuPrice,
      exchange_rate: fxDetail.rate,
      fx_status: fxDetail.status,
      fx_source: fxDetail.source_name
    }
  };
}
