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
    
    // NUNCA inventar precios: usar exclusivamente valores reales provistos
    const price = input.price !== undefined ? Number(input.price) : (input.raw?.price !== undefined ? Number(input.raw.price) : 0);
    const domesticShipping = input.shipping !== undefined ? Number(input.shipping) : (input.raw?.shipping !== undefined ? Number(input.raw.shipping) : 0);

    const title = input.title || input.raw?.title || `eBay Item ${itemId}`;

    // Detección estricta de Lotes y Colecciones
    const isLot = /(lot\s+of|bundle|pack\s+de|bulk|lote\s+de|\bcollection\b|mixed\s+figures)/i.test(title) || Boolean(input.raw?.is_lot);

    // Detección de Subastas vs Precio Fijo (Buy It Now)
    const isAuction = input.raw?.listing_type === 'Auction' || 
                      Boolean(input.raw?.is_auction) || 
                      Boolean(input.raw?.bid_count !== undefined && input.raw?.bid_count > 0);

    const sellerName = input.seller || input.raw?.seller || input.raw?.seller_name || 'eBay Seller';
    const sellerPositivePercent = input.raw?.seller_positive_percent ?? input.raw?.feedback_percentage;
    const sellerFeedbackScore = input.raw?.seller_feedback_score ?? input.raw?.feedback_score;

    return {
      source: 'ebay',
      source_product_id: itemId,
      url: input.url,
      title,
      brand: input.brand || input.raw?.brand,
      upc: input.upc || input.raw?.upc,
      price,
      currency: 'USD',
      domestic_shipping: domesticShipping,
      seller: sellerName,
      availability: (input.raw?.availability || (price > 0 ? 'in_stock' : 'unknown')) as any,
      condition: (input.raw?.condition || 'new') as any,
      image_url: input.raw?.image_url || input.raw?.images?.[0] || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop',
      gallery_images: input.raw?.images || [],
      estimated_delivery: input.raw?.estimated_delivery || '4-7 días (USA)',
      raw_metadata: {
        ...input.raw,
        is_lot: isLot,
        is_auction: isAuction,
        listing_type: isAuction ? 'Auction' : 'FixedPriceItem',
        seller_feedback_score: sellerFeedbackScore,
        seller_positive_percent: sellerPositivePercent
      }
    };
  }

  toSourceOffer(raw: RawProductExtraction): SourceOffer {
    const isLot = Boolean(raw.raw_metadata?.is_lot);
    const isAuction = Boolean(raw.raw_metadata?.is_auction);
    const sellerRating = raw.raw_metadata?.seller_positive_percent ? Number(raw.raw_metadata.seller_positive_percent) : undefined;
    const sellerReviews = raw.raw_metadata?.seller_feedback_score ? Number(raw.raw_metadata.seller_feedback_score) : undefined;

    return {
      id: `offer-ebay-${raw.source_product_id}`,
      source: 'ebay',
      source_product_id: raw.source_product_id,
      url: raw.url,
      seller: raw.seller || 'eBay Seller',
      seller_rating: sellerRating,
      seller_reviews: sellerReviews,
      price: raw.price,
      currency: raw.currency || 'USD',
      domestic_shipping: raw.domestic_shipping,
      availability: raw.availability,
      stock: isLot ? 1 : (raw.raw_metadata?.quantity ?? 5),
      condition: raw.condition,
      status: 'RESEARCH_ONLY', // Requires Live Check via Zinc before import
      estimated_delivery: raw.estimated_delivery || '4-7 días (USA)',
      is_zinc_compatible: true, // Native Zinc multi-retailer support
      reliability_score: sellerRating ? Math.round(sellerRating * 0.9) : 80,
      last_checked_at: new Date().toISOString(),
      metadata: {
        ...raw.raw_metadata,
        is_lot: isLot,
        is_auction: isAuction,
        listing_type: isAuction ? 'Auction' : 'FixedPriceItem'
      }
    };
  }
}

export const ebaySourceAdapter = new EbaySourceAdapter();
