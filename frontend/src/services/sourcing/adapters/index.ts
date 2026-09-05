import type { ISourceAdapter } from './SourceAdapter';
import { amazonSourceAdapter } from './AmazonSourceAdapter';
import { ebaySourceAdapter } from './EbaySourceAdapter';
import { bestBuySourceAdapter } from './BestBuySourceAdapter';
import type { RetailerSource } from '../../../types/sourcing';

const registeredAdapters: ISourceAdapter[] = [
  amazonSourceAdapter,
  ebaySourceAdapter,
  bestBuySourceAdapter
];

export function resolveAdapterForUrl(url: string): ISourceAdapter {
  if (!url) return amazonSourceAdapter;
  for (const adapter of registeredAdapters) {
    if (adapter.matchesUrl(url)) {
      return adapter;
    }
  }
  return amazonSourceAdapter; // default fallback
}

export function getAdapterBySource(source: RetailerSource): ISourceAdapter {
  const found = registeredAdapters.find(a => a.source === source);
  return found || amazonSourceAdapter;
}

export {
  registeredAdapters,
  amazonSourceAdapter,
  ebaySourceAdapter,
  bestBuySourceAdapter
};

export { ebayLiveSourceAdapter } from './EbayLiveSourceAdapter';
export { bestBuyLiveSourceAdapter } from './BestBuyLiveSourceAdapter';
export { OFFICIAL_URUGUAY_LOCAL_STORES } from './LocalMarketSourceAdapter';
