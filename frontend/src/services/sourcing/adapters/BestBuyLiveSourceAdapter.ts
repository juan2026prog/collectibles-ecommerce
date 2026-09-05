import type { SourceOffer } from '../../../types/sourcing';

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
 * Resolución oficial de Best Buy API (Developer API).
 * Si falta la credencial BESTBUY_API_KEY en el servidor,
 * retorna formalmente PENDING_CREDENTIAL sin inventar datos en producción.
 */
export class BestBuyLiveSourceAdapter {
  source = 'bestbuy' as const;

  async resolveLiveItem(params: BestBuyLiveLookupParams): Promise<BestBuyLiveProductDetails> {
    const checkedAt = new Date().toISOString();

    try {
      const response = await fetch('/api/sourcing/bestbuy-live-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: params.sku, force_refresh: params.forceRefresh })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ...data,
          status: 'LIVE',
          checked_at: checkedAt
        };
      } else if (response.status === 501 || response.status === 401 || response.status === 404) {
        return this.createPendingCredentialFallback(params.sku, 'Credencial de Best Buy API no configurada (BESTBUY_API_KEY).');
      }
    } catch {
      // Fallback transparente por falta de endpoint / credencial local
    }

    return this.createPendingCredentialFallback(params.sku, 'Conector Best Buy Live esperando configuración de API Key.');
  }

  createPendingCredentialFallback(sku: string, message: string): BestBuyLiveProductDetails {
    return {
      sku,
      title: `Best Buy Item ${sku}`,
      regular_price: 0,
      sale_price: 0,
      currency: 'USD',
      availability: 'out_of_stock',
      stock_status: 'unknown',
      domestic_shipping: 0,
      product_url: `https://www.bestbuy.com/site/${sku}.p?skuId=${sku}`,
      checked_at: new Date().toISOString(),
      status: 'PENDING_CREDENTIAL',
      error_message: message
    };
  }

  toLiveSourceOffer(details: BestBuyLiveProductDetails): SourceOffer {
    const effectivePrice = details.sale_price > 0 ? details.sale_price : details.regular_price;
    return {
      id: 'offer-bestbuy-' + details.sku,
      source: 'bestbuy',
      source_product_id: details.sku,
      url: details.product_url,
      seller: 'Best Buy Official Store',
      price: effectivePrice,
      currency: details.currency,
      domestic_shipping: details.domestic_shipping,
      availability: details.availability,
      stock: details.availability === 'in_stock' ? 10 : 0,
      condition: 'new',
      status: details.status,
      estimated_delivery: '3-5 días (USA)',
      is_zinc_compatible: false,
      reliability_score: details.status === 'LIVE' ? 95 : 40,
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

