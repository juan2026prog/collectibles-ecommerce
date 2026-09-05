import type { ISourceAdapter, RawProductExtraction } from './SourceAdapter';
import type { SourceOffer } from '../../../types/sourcing';

export class AmazonSourceAdapter implements ISourceAdapter {
  source = 'amazon' as const;

  matchesUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('amazon.com') || lower.includes('a.co') || lower.includes('amzn.to');
  }

  extractProductId(url: string): string | null {
    if (!url) return null;
    // Standard ASIN regex: 10 alphanumeric uppercase characters
    const asinMatch = url.match(/(?:\/dp\/|\/gp\/product\/|\/ASIN\/)([A-Z0-9]{10})/i);
    if (asinMatch && asinMatch[1]) {
      return asinMatch[1].toUpperCase();
    }
    // Alternative parameter asin=...
    const paramMatch = url.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (paramMatch && paramMatch[1]) {
      return paramMatch[1].toUpperCase();
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
    const asin = this.extractProductId(input.url) || input.raw?.asin || 'AMZ-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const price = Number(input.price ?? input.raw?.price ?? 24.99);
    const domesticShipping = Number(input.shipping ?? input.raw?.shipping ?? 0); // Amazon Prime default $0

    return {
      source: 'amazon',
      source_product_id: asin,
      url: input.url,
      title: input.title || input.raw?.title || `Amazon Item ${asin}`,
      brand: input.brand || input.raw?.brand,
      upc: input.upc || input.raw?.upc,
      price,
      currency: 'USD',
      domestic_shipping: domesticShipping,
      seller: input.seller || input.raw?.seller || 'Amazon.com / Shipped by Amazon',
      availability: (input.raw?.availability || 'in_stock') as any,
      condition: 'new',
      image_url: input.raw?.image_url || input.raw?.images?.[0] || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop',
      gallery_images: input.raw?.images || [],
      estimated_delivery: '2-4 días (USA)',
      raw_metadata: input.raw
    };
  }

  toSourceOffer(raw: RawProductExtraction): SourceOffer {
    return {
      id: `offer-amazon-${raw.source_product_id}`,
      source: 'amazon',
      source_product_id: raw.source_product_id,
      url: raw.url,
      seller: raw.seller || 'Amazon.com',
      price: raw.price,
      currency: raw.currency || 'USD',
      domestic_shipping: raw.domestic_shipping,
      availability: raw.availability,
      stock: 10,
      condition: raw.condition,
      status: 'LIVE',
      estimated_delivery: raw.estimated_delivery || '2-4 días (USA)',
      is_zinc_compatible: true, // Native 100% Zinc compatibility
      reliability_score: 98,
      last_checked_at: new Date().toISOString(),
      metadata: raw.raw_metadata
    };
  }
}

export const amazonSourceAdapter = new AmazonSourceAdapter();
