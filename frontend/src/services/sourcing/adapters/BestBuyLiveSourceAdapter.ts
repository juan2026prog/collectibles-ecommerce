import type { SourceOffer } from '../../../types/sourcing';
import { supabase } from '../../../lib/supabase';

export interface BestBuyLiveLookupParams {
  sku: string;
  forceRefresh?: boolean;
}

export interface BestBuyLiveProductDetails {
  sku: string;
  title: string;
  regular_price: number;
  sale_price: number;
  currency: string;
  availability: 'in_stock' | 'preorder' | 'limited' | 'out_of_stock';
  stock_status: string;
  domestic_shipping: number;
  brand?: string;
  model?: string;
  upc?: string;
  image_url?: string;
  product_url: string;
  checked_at: string;
  status: 'LIVE' | 'CACHE' | 'PENDING_CREDENTIAL' | 'ERROR';
  error_message?: string;
}

/**
 * BestBuyLiveSourceAdapter
 * Resolución oficial de Best Buy mediante Edge Functions server-side y Zinc Managed Accounts.
 */
export class BestBuyLiveSourceAdapter {
  source = 'bestbuy' as const;

  async resolveLiveItem(params: BestBuyLiveLookupParams): Promise<BestBuyLiveProductDetails> {
    const checkedAt = new Date().toISOString();

    try {
      // 1. Invocar Edge Function de Live Check directamente
      const { data, error } = await supabase.functions.invoke('sourcing-retailer-live-check', {
        body: { 
          product_id: params.sku, 
          retailer: 'bestbuy',
          force_refresh: params.forceRefresh ?? true 
        }
      });

      if (!error && data && (data.data_source === 'LIVE' || data.title)) {
        return {
          sku: data.source_product_id || params.sku,
          title: data.title || `Best Buy Item ${params.sku}`,
          regular_price: data.price_usd || 0,
          sale_price: data.price_usd || 0,
          currency: data.currency || 'USD',
          availability: data.availability_normalized === 'IN_STOCK' ? 'in_stock' : 'out_of_stock',
          stock_status: data.availability_normalized === 'IN_STOCK' ? 'available' : 'unavailable',
          domestic_shipping: data.usa_shipping_usd ?? 0,
          brand: data.brand,
          model: data.mpn,
          upc: data.upc,
          image_url: data.image_url,
          product_url: data.product_url || `https://www.bestbuy.com/site/${params.sku}.p?skuId=${params.sku}`,
          checked_at: data.last_checked_at || checkedAt,
          status: 'LIVE',
          error_message: undefined
        };
      }
    } catch {
      // Fallback transparente
    }

    return this.createFallbackItem(params.sku);
  }

  createFallbackItem(sku: string): BestBuyLiveProductDetails {
    return {
      sku,
      title: `Best Buy Item ${sku}`,
      regular_price: 0,
      sale_price: 0,
      currency: 'USD',
      availability: 'out_of_stock',
      stock_status: 'unavailable',
      domestic_shipping: 0,
      product_url: `https://www.bestbuy.com/site/${sku}.p?skuId=${sku}`,
      checked_at: new Date().toISOString(),
      status: 'ERROR',
      error_message: 'Consulta en vivo de Best Buy no disponible o sin credenciales de Zinc API.'
    };
  }

  toLiveSourceOffer(details: BestBuyLiveProductDetails): SourceOffer {
    const effectivePrice = details.sale_price > 0 ? details.sale_price : details.regular_price;
    return {
      id: 'offer-bestbuy-' + details.sku,
      source: 'bestbuy',
      source_product_id: details.sku,
      url: details.product_url,
      seller: 'Best Buy (Zinc)',
      price: effectivePrice,
      currency: details.currency,
      domestic_shipping: details.domestic_shipping,
      availability: details.availability,
      stock: details.availability === 'in_stock' ? 10 : 0,
      condition: 'new',
      status: details.status,
      estimated_delivery: '3-5 días (USA)',
      is_zinc_compatible: true, // Native Zinc multi-retailer support
      reliability_score: details.status === 'LIVE' ? 95 : 85,
      last_checked_at: details.checked_at,
      metadata: {
        model: details.model,
        upc: details.upc,
        brand: details.brand,
        error_message: details.error_message
      }
    };
  }
}

export const bestBuyLiveSourceAdapter = new BestBuyLiveSourceAdapter();

