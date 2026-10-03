import { calculateInternationalPricing } from '../../lib/internationalPricing';

export function calculateCandidateImportAnalysis(item: any, settings: any = {}, markup = 3) {
  const price = item.price_usd != null && Number(item.price_usd) > 0 ? Number(item.price_usd) : null;
  const empty = { amazonPrice: price, realCost: null, markupPercent: markup, marginPercent: null, estimatedProfit: null, finalPrice: null };
  const sourcing = Boolean(item.raw_data?.validation_version);
  const quote = item.raw_data?.import_quote;
  if (price === null) return empty;
  if (sourcing && (!['OBSERVED', 'CORROBORATED'].includes(item.raw_data?.provenance?.origin_price?.status) || !quote ||
    ['shipping', 'customs', 'fees'].some(f => quote[f] == null || !Number.isFinite(Number(quote[f])) || Number(quote[f]) < 0))) return empty;
  const pricing = calculateInternationalPricing({ amazonPrice: price, usaShipping: quote?.shipping ?? 0,
    otherCosts: sourcing ? Number(quote.customs) + Number(quote.fees) : undefined }, { ...settings, target_margin_percent: markup, percentage_markup: markup });
  const sale = sourcing ? (quote.sale_price != null && Number(quote.sale_price) > 0 ? Number(quote.sale_price) : null) : pricing.finalPrice;
  const profit = sale === null ? null : Math.round((sale - pricing.realCost) * 100) / 100;
  return { amazonPrice: price, realCost: pricing.realCost, markupPercent: markup, finalPrice: sale,
    estimatedProfit: profit, marginPercent: sale === null ? null : Math.round(profit! / sale * 1000) / 10 };
}
