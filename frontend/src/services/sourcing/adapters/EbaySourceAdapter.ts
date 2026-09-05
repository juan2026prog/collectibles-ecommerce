import type { ISourceAdapter, RawProductExtraction } from './SourceAdapter';
import type { SourceOffer } from '../../../types/sourcing';

export class EbaySourceAdapter implements ISourceAdapter {
  source = 'ebay' as const;

  matchesUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('ebay.com') || lower.includes('ebay.to');
  }

  extractProductId(url: string): string | null {
    if (!url) return null;
    // Standard eBay item id: e.g. /itm/123456789012 or itm/item-title/123456789012
    const itemMatch = url.match(/\/itm\/(?:[^\/]+\/)?(\d{9,14})/i);
    if (itemMatch && itemMatch[1]) {
      return itemMatch[1];
    }
    const queryMatch = url.match(/[?&]item=(\d{9,14})/i);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }
    return null;
  }

  parseOfferFromInput(input: {
    url: string;
    title?: string;
    price?: number;
    shipping?: number;
    seller?: string;
    brand?: string;
    upc?: string;
    raw?: any;
  }): RawProductExtraction {
    const itemId = this.extractProductId(input.url) || input.raw?.item_id || 'EBAY-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const price = Number(input.price ?? input.raw?.price ?? 19.99);
    // eBay frequently charges domestic shipping (e.g. $5 - $12)
    const domesticShipping = Number(input.shipping ?? input.raw?.shipping ?? 5.99);

    return {
      source: 'ebay',
      source_product_id: itemId,
      url: input.url,
      title: input.title || input.raw?.title || `eBay Item ${itemId}`,
      brand: input.brand || input.raw?.brand,
      upc: input.upc || input.raw?.upc,
      price,
      currency: 'USD',
      domestic_shipping: domesticShipping,
      seller: input.seller || input.raw?.seller || 'Top Rated eBay Seller',
      availability: (input.raw?.availability || 'in_stock') as any,
      condition: (input.raw?.condition || 'new') as any,
      image_url: input.raw?.image_url || input.raw?.images?.[0] || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop',
      gallery_images: input.raw?.images || [],
      estimated_delivery: '4-7 días (USA)',
      raw_metadata: input.raw
    };
  }

  toSourceOffer(raw: RawProductExtraction): SourceOffer {
    return {
      id: `offer-ebay-${raw.source_product_id}`,
      source: 'ebay',
      source_product_id: raw.source_product_id,
      url: raw.url,
      seller: raw.seller || 'Top Rated eBay Seller',
      price: raw.price,
      currency: raw.currency || 'USD',
      domestic_shipping: raw.domestic_shipping,
      availability: raw.availability,
      stock: 5,
      condition: raw.condition,
      status: 'RESEARCH_ONLY', // Requires Live Check via Zinc before import
      estimated_delivery: raw.estimated_delivery || '4-7 días (USA)',
      is_zinc_compatible: true, // Native Zinc multi-retailer support
      reliability_score: 85,
      last_checked_at: new Date().toISOString(),
      metadata: raw.raw_metadata
    };
  }
}

export const ebaySourceAdapter = new EbaySourceAdapter();
