import { calculateInternationalPricing } from '../../lib/internationalPricing';

export type CandidateQuoteStatus = 'CONFIRMED' | 'ESTIMATED' | 'INCOMPLETE' | 'UNAVAILABLE';

export interface CandidateFinancialAnalysis {
  amazonPrice: number | null;
  realCost: number | null;
  markupPercent: number;
  finalPrice: number | null;
  estimatedProfit: number | null;
  marginPercent: number | null;
  quoteStatus: CandidateQuoteStatus;
  shippingUsd: number | null;
  customsUsd: number | null;
  feesUsd: number | null;
  statusExplanation: string;
}

export function calculateCandidateImportAnalysis(
  item: any,
  settings: any = {},
  markup = 3,
  targetCountry: string = 'UY'
): CandidateFinancialAnalysis {
  const price = item.price_usd != null && Number(item.price_usd) > 0 ? Number(item.price_usd) : null;
  
  if (price === null) {
    return {
      amazonPrice: null,
      realCost: null,
      markupPercent: markup,
      finalPrice: null,
      estimatedProfit: null,
      marginPercent: null,
      quoteStatus: 'UNAVAILABLE',
      shippingUsd: null,
      customsUsd: null,
      feesUsd: null,
      statusExplanation: 'Precio en USD no disponible desde Amazon'
    };
  }

  const sourcing = Boolean(item.raw_data?.validation_version);
  const quote = item.raw_data?.import_quote;

  // 1. Caso Sourcing con cotización completa y observada
  if (sourcing) {
    if (quote && ['shipping', 'customs', 'fees'].every(f => quote[f] != null && Number.isFinite(Number(quote[f])) && Number(quote[f]) >= 0)) {
      const isObserved = ['OBSERVED', 'CORROBORATED'].includes(item.raw_data?.provenance?.origin_price?.status);
      const pricing = calculateInternationalPricing(
        {
          amazonPrice: price,
          usaShipping: quote.shipping ?? 0,
          otherCosts: Number(quote.customs || 0) + Number(quote.fees || 0)
        },
        { ...settings, target_margin_percent: markup, percentage_markup: markup }
      );

      const sale = quote.sale_price != null && Number(quote.sale_price) > 0 ? Number(quote.sale_price) : null;
      const profit = sale === null ? null : Math.round((sale - pricing.realCost) * 100) / 100;

      return {
        amazonPrice: price,
        realCost: pricing.realCost,
        markupPercent: markup,
        finalPrice: sale,
        estimatedProfit: profit,
        marginPercent: sale === null ? null : Math.round(profit! / sale * 1000) / 10,
        quoteStatus: isObserved ? 'CONFIRMED' : 'ESTIMATED',
        shippingUsd: Number(quote.shipping || 0),
        customsUsd: Number(quote.customs || 0),
        feesUsd: Number(quote.fees || 0),
        statusExplanation: isObserved ? 'Cotización confirmada con flete e impuestos' : 'Cotización estimada de importación'
      };
    }

    return {
      amazonPrice: price,
      realCost: null,
      markupPercent: markup,
      finalPrice: null,
      estimatedProfit: null,
      marginPercent: null,
      quoteStatus: 'INCOMPLETE',
      shippingUsd: null,
      customsUsd: null,
      feesUsd: null,
      statusExplanation: 'Cotización de importación no completada para candidato de Sourcing'
    };
  }

  // 2. Caso Amazon directo sin cotización previa de Sourcing (o peso no informado)
  // No inventamos flete $0 como definitivo; reportamos INCOMPLETE para alertar al operador
  const pricing = calculateInternationalPricing(
    {
      amazonPrice: price,
      usaShipping: 0
    },
    { ...settings, target_margin_percent: markup, percentage_markup: markup }
  );

  const profit = Math.round((pricing.finalPrice - pricing.realCost) * 100) / 100;

  return {
    amazonPrice: price,
    realCost: pricing.realCost,
    markupPercent: markup,
    finalPrice: pricing.finalPrice,
    estimatedProfit: profit,
    marginPercent: Math.round(profit / pricing.finalPrice * 1000) / 10,
    quoteStatus: 'INCOMPLETE',
    shippingUsd: 0,
    customsUsd: 0,
    feesUsd: 0,
    statusExplanation: 'Costo de flete internacional pendiente de confirmación de peso/dimensiones'
  };
}
