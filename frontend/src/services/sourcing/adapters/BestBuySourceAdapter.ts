import type { ISourceAdapter, RawProductExtraction } from './SourceAdapter';
import type { SourceOffer } from '../../../types/sourcing';

export class BestBuySourceAdapter implements ISourceAdapter {
  source = 'bestbuy' as const;

  matchesUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('bestbuy.com') || lower.includes('bby.me');
  }

  extractProductId(url: string): string | null {
    if (!url) return null;
    // Best Buy SKU regex: e.g. /site/.../6512345.p?skuId=6512345 or skuId=6512345
    const skuParam = url.match(/[?&]skuId=(\d{6,8})/i);
    if (skuParam && skuParam[1]) {
      return skuParam[1];
    }
    const skuPath = url.match(/\/(\d{6,8})\.p/i);
    if (skuPath && skuPath[1]) {
      return skuPath[1];
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
    const sku = this.extractProductId(input.url) || input.raw?.sku || 'BBY-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const price = Number(input.price ?? input.raw?.price ?? 29.99);
    // Best Buy free shipping threshold often $35+, or $0 for My Best Buy members
    const domesticShipping = Number(input.shipping ?? input.raw?.shipping ?? 0);

    return {
      source: 'bestbuy',
      source_product_id: sku,
      url: input.url,
      title: input.title || input.raw?.title || `Best Buy Item ${sku}`,
      brand: input.brand || input.raw?.brand,
      upc: input.upc || input.raw?.upc,
      price,
      currency: 'USD',
      domestic_shipping: domesticShipping,
      seller: input.seller || input.raw?.seller || 'Best Buy Official Store',
      availability: (input.raw?.availability || 'in_stock') as any,
      condition: 'new',
      image_url: input.raw?.image_url || input.raw?.images?.[0] || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop',
      gallery_images: input.raw?.images || [],
      estimated_delivery: '3-5 días (USA)',
      raw_metadata: input.raw
    };
  }

  toSourceOffer(raw: RawProductExtraction): SourceOffer {
    return {
      id: `offer-bestbuy-${raw.source_product_id}`,
      source: 'bestbuy',
      source_product_id: raw.source_product_id,
      url: raw.url,
      seller: raw.seller || 'Best Buy',
      price: raw.price,
      currency: raw.currency || 'USD',
      domestic_shipping: raw.domestic_shipping,
      availability: raw.availability,
      stock: 8,
      condition: raw.condition,
      status: 'RESEARCH_ONLY', // Requires BestBuyLiveSourceAdapter or Live Check before import
      estimated_delivery: raw.estimated_delivery || '3-5 días (USA)',
      is_zinc_compatible: false,
      reliability_score: 95,
      last_checked_at: new Date().toISOString(),
      metadata: raw.raw_metadata
    };
  }
}

export const bestBuySourceAdapter = new BestBuySourceAdapter();
