import { finiteNumber, provenance } from './sourcingCandidateValidation.js';

export function parseTiendamiaResponse(html, asin, statusCode = 200) {
  const id = String(asin || '').trim().toUpperCase();
  const now = new Date().toISOString();
  const sourceUrl = `https://tiendamia.com.uy/p/amz/${id.toLowerCase()}`;
  const result = { asin: id, found: false, exactMatch: false, priceUsd: null, productUrl: sourceUrl,
    status: 'NOT_CHECKED', presence: 'UNKNOWN', checkedAt: now, checked_at: now, source_url: sourceUrl,
    price: provenance(), method: 'EXACT_ASIN_MATCH', statusMessage: 'No verificado' };
  if (!/^[A-Z0-9]{10}$/.test(id) || statusCode !== 200 || /captcha|access denied|cloudflare|robot check/i.test(html)) {
    return { ...result, status: 'UNAVAILABLE', statusMessage: 'Consulta no disponible; no demuestra ausencia' };
  }
  const sku = `AMZ-${id}`;
  const hasExactSku = [`data-product-sku="${sku}"`, `"item_id":"${sku}"`, `"productCurrentSku": "${sku}"`, `SKU/Artículo: ${sku}`, `"productCurrentSku":"${sku}"`].some(v => html.includes(v));
  if (!hasExactSku) {
    // Only an explicit successful search result for this exact ID can prove absence.
    const searchEmpty = html.includes(`data-search-query="${id}"`) && html.includes('No encontramos resultados para tu búsqueda');
    return searchEmpty ? { ...result, status: 'NOT_FOUND', presence: 'VERIFIED_ABSENT', statusMessage: 'Ausencia comprobada en consulta exacta' } : result;
  }
  const amount = finiteNumber(html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([0-9.]+)["']/i)?.[1]);
  const currency = html.match(/<meta[^>]*property=["']product:price:currency["'][^>]*content=["']([A-Z]{3})["']/i)?.[1];
  const price = amount > 0 && currency ? provenance(amount, 'OBSERVED', 'TiendaMía', sourceUrl, now, { currency }) : provenance();
  return { ...result, found: true, exactMatch: true, status: 'FOUND', presence: 'PRESENT', price, priceUsd: currency === 'USD' ? price.value : null, statusMessage: 'Producto exacto encontrado' };
}
