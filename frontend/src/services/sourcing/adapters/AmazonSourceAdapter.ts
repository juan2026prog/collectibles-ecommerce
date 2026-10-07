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
    const asin = this.extractProductId(input.url) || input.raw?.asin || ('AMZ-UNKNOWN-' + (input.url ? Math.abs(input.url.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)).toString(36).toUpperCase() : 'NOID'));
    const price = Number(input.price ?? input.raw?.price ?? 0);
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
      seller: input.seller || input.raw?.seller || 'Amazon.com',
      availability: (input.raw?.availability || (price > 0 ? 'in_stock' : 'out_of_stock')) as any,
      condition: 'new',
      image_url: input.raw?.image_url || input.raw?.images?.[0] || '',
      gallery_images: input.raw?.images || [],
      estimated_delivery: input.raw?.delivery_message || input.raw?.delivery_text || (input.raw?.prime ? 'Envío Prime USA a Miami' : 'Plazo doméstico USA pendiente de confirmación'),
      raw_metadata: input.raw
    };
  }

  toSourceOffer(raw: RawProductExtraction): SourceOffer {
    // Resolver stock confirmado o disponibilidad honesta sin inventar cantidades
    let confirmedStock: number | null = null;
    if (typeof raw.raw_metadata?.stock === 'number' && raw.raw_metadata.stock >= 0) {
      confirmedStock = raw.raw_metadata.stock;
    } else if (typeof raw.raw_metadata?.inventory_level === 'number' && raw.raw_metadata.inventory_level >= 0) {
      confirmedStock = raw.raw_metadata.inventory_level;
    }

    const deliveryText = raw.raw_metadata?.delivery_message || raw.raw_metadata?.delivery_text || (raw.raw_metadata?.prime ? 'Envío Prime USA a Miami' : 'Plazo doméstico USA pendiente de confirmación');

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
      stock: confirmedStock,
      condition: raw.condition,
      status: 'LIVE',
      estimated_delivery: deliveryText,
      is_zinc_compatible: true, // Native 100% Zinc compatibility
      reliability_score: 98,
      last_checked_at: new Date().toISOString(),
      metadata: raw.raw_metadata
    };
  }
}

export const amazonSourceAdapter = new AmazonSourceAdapter();
