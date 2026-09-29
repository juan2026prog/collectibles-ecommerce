import type { RawProductExtraction } from './SourceAdapter';
import type { SourceOffer } from '../../../types/sourcing';
import { supabase } from '../../../lib/supabase';

export interface EbayLiveLookupParams {
  itemId: string;
  forceRefresh?: boolean;
}

export interface EbayLiveProductDetails {
  item_id: string;
  title: string;
  price: number;
  currency: string;
  seller: string;
  seller_feedback?: string;
  condition: 'new' | 'refurbished' | 'used';
  availability: 'in_stock' | 'preorder' | 'limited' | 'out_of_stock';
  quantity?: number;
  domestic_shipping: number;
  image_url?: string;
  brand?: string;
  gtin?: string;
  upc?: string;
  mpn?: string;
  estimated_delivery?: string;
  item_url: string;
  checked_at: string;
  status: 'LIVE' | 'CACHE' | 'PENDING_CREDENTIAL' | 'ERROR';
  error_message?: string;
}

/**
 * EbayLiveSourceAdapter
 * Resolución server-side de eBay utilizando Zinc API (retailer: ebay) o Edge Function.
 */
export class EbayLiveSourceAdapter {
  source = 'ebay' as const;

  /**
   * Resuelve los datos en vivo de un Item de eBay a través de Edge Function sourcing-retailer-live-check.
   */
  async resolveLiveItem(params: EbayLiveLookupParams): Promise<EbayLiveProductDetails> {
    const checkedAt = new Date().toISOString();

    try {
      const { data, error } = await supabase.functions.invoke('sourcing-retailer-live-check', {
        body: { 
          product_id: params.itemId, 
          retailer: 'ebay',
          force_refresh: params.forceRefresh ?? true 
        }
      });

      if (!error && data && (data.data_source === 'LIVE' || data.title)) {
        return {
          item_id: data.source_product_id || params.itemId,
          title: data.title || `eBay Item ${params.itemId}`,
          price: data.price_usd || 0,
          currency: data.currency || 'USD',
          seller: data.seller || 'eBay Seller',
          seller_feedback: data.seller_rating ? `${data.seller_rating}%` : undefined,
          condition: data.condition_normalized === 'NEW' ? 'new' : 'used',
          availability: data.availability_normalized === 'IN_STOCK' ? 'in_stock' : 'out_of_stock',
          quantity: data.availability_normalized === 'IN_STOCK' ? 5 : 0,
          domestic_shipping: data.usa_shipping_usd ?? 0,
          image_url: data.image_url,
          brand: data.brand,
          gtin: data.upc,
          upc: data.upc,
          mpn: data.mpn,
          estimated_delivery: data.delivery_min ? `${data.delivery_min} - ${data.delivery_max}` : '4-7 días (USA)',
          item_url: data.product_url || `https://www.ebay.com/itm/${params.itemId}`,
          checked_at: data.last_checked_at || checkedAt,
          status: 'LIVE',
          error_message: undefined
        };
      }
    } catch {
      // Fallback transparente a fallback
    }

    return this.createFallbackItem(params.itemId);
  }

  createFallbackItem(itemId: string): EbayLiveProductDetails {
    return {
      item_id: itemId,
      title: `eBay Item ${itemId}`,
      price: 0,
      currency: 'USD',
      seller: 'Top Rated eBay Seller (Zinc)',
      condition: 'new',
      availability: 'out_of_stock',
      domestic_shipping: 0,
      item_url: `https://www.ebay.com/itm/${itemId}`,
      checked_at: new Date().toISOString(),
      status: 'ERROR',
      error_message: 'Consulta en vivo de eBay no disponible o sin credenciales de Zinc API.'
    };
  }

  toLiveSourceOffer(details: EbayLiveProductDetails): SourceOffer {
    return {
      id: 'offer-ebay-' + details.item_id,
      source: 'ebay',
      source_product_id: details.item_id,
      url: details.item_url,
      seller: details.seller,
      price: details.price,
      currency: details.currency,
      domestic_shipping: details.domestic_shipping,
      availability: details.availability,
      stock: details.quantity ?? 10,
      condition: details.condition,
      status: details.status,
      estimated_delivery: details.estimated_delivery || '4-7 días (USA)',
      is_zinc_compatible: true, // Native Zinc multi-retailer support
      reliability_score: details.status === 'LIVE' ? 90 : 80,
      last_checked_at: details.checked_at,
      metadata: {
        gtin: details.gtin,
        upc: details.upc,
        mpn: details.mpn,
        brand: details.brand,
        error_message: details.error_message
      }
    };
  }
}

export const ebayLiveSourceAdapter = new EbayLiveSourceAdapter();
