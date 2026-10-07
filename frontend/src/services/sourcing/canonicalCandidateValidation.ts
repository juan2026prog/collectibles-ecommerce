import { validateCandidate, validateStoredCandidate, deduplicateCanonicalCandidates, provenance } from '../../../../shared/sourcingCandidateValidation.js';
import type { SourcingProductCandidate } from '../../types/sourcingIntelligence';

function retailerObservations(item: any) {
  const retailer = String(item?.retailer || item?.source_retailer || '').toLowerCase();
  const sourceUrl = item?.url || item?.source_url || item?.retailer_url || null;
  if (!sourceUrl || !['amazon', 'ebay', 'bestbuy'].some(r => retailer.includes(r))) return [];

  const observedAt = item?.observed_at || new Date().toISOString();
  const sourceName = retailer.includes('amazon') ? 'Amazon' : retailer.includes('ebay') ? 'eBay' : 'Best Buy';
  const observations: any[] = [];

  if (item?.title) observations.push({ field: 'identity', ...provenance(item.title, 'OBSERVED', sourceName, sourceUrl, observedAt), source_type: 'RETAILER' });
  if (item?.image_url) observations.push({ field: 'image', ...provenance(item.image_url, 'OBSERVED', sourceName, sourceUrl, observedAt), source_type: 'RETAILER' });

  const price = item?.origin_price_usd ?? item?.price_usd ?? item?.price;
  if (price !== null && price !== undefined && Number.isFinite(Number(price))) {
    observations.push({ field: 'origin_price', ...provenance(Number(price), 'OBSERVED', sourceName, sourceUrl, observedAt, { currency: 'USD' }), source_type: 'RETAILER' });
  }

  if (item?.asin && /^[A-Z0-9]{10}$/i.test(String(item.asin))) {
    observations.push({ field: 'asin', ...provenance(String(item.asin).toUpperCase(), 'OBSERVED', sourceName, sourceUrl, observedAt, { verification: 'SOURCE_VERIFIED' }), source_type: 'RETAILER' });
  }

  const availability = String(item?.availability || item?.metadata?.availability || '').toLowerCase();
  const stock = availability.includes('preorder') ? 'PREORDER'
    : availability.includes('out') ? 'OUT_OF_STOCK'
    : availability.includes('low') ? 'LOW_STOCK'
    : ['in_stock', 'instock', 'available'].includes(availability) ? 'IN_STOCK'
    : null;
  if (stock) observations.push({ field: 'availability', ...provenance(stock, 'OBSERVED', sourceName, sourceUrl, observedAt), source_type: 'RETAILER' });

  const observedFields = [
    ['brand', item?.brand],
    ['rating', item?.rating ?? item?.metadata?.rating],
    ['review_count', item?.review_count ?? item?.metadata?.review_count],
    ['seller', item?.seller ?? item?.metadata?.seller],
    ['prime', item?.prime ?? item?.metadata?.prime],
    ['category', item?.category ?? item?.metadata?.category]
  ] as const;
  for (const [field, value] of observedFields) {
    if (value !== null && value !== undefined && value !== '') {
      observations.push({ field, ...provenance(value, 'OBSERVED', sourceName, sourceUrl, observedAt), source_type: 'RETAILER' });
    }
  }

  return observations;
}

export function manualCandidates(items: any[], country: string): SourcingProductCandidate[] {
  return deduplicateCanonicalCandidates(items.map((item, index) => validateCandidate(item, {
    country,
    origin: item?.discovered_from || 'MANUAL_RESEARCH',
    index,
    observations: retailerObservations(item)
  })));
}

export function storedCandidates(rows: any[]): SourcingProductCandidate[] {
  return deduplicateCanonicalCandidates(rows.map(validateStoredCandidate));
}
