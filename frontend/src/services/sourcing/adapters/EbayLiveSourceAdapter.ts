import type { RawProductExtraction } from './SourceAdapter';
import type { SourceOffer } from '../../../types/sourcing';

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
 * Resolución server-side de eBay utilizando la API oficial (Browse API).
 * Si faltan las credenciales EBAY_APP_ID / EBAY_CERT_ID en el servidor,
 * retorna formalmente PENDING_CREDENTIAL sin inventar datos en producción.
 */
export class EbayLiveSourceAdapter {
  source = 'ebay' as const;

  /**
   * Resuelve los datos en vivo de un Item de eBay.
   */
  async resolveLiveItem(params: EbayLiveLookupParams): Promise<EbayLiveProductDetails> {
    const checkedAt = new Date().toISOString();

    // Intentar invocar la Edge function de backend
    try {
      const response = await fetch('/api/sourcing/ebay-live-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: params.itemId, force_refresh: params.forceRefresh })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ...data,
          status: 'LIVE',
          checked_at: checkedAt
        };
      } else if (response.status === 501 || response.status === 401 || response.status === 404) {
        // Edge function o credenciales no configuradas todavía en Supabase Secrets
        return this.createPendingCredentialFallback(params.itemId, 'Credenciales de eBay API no configuradas (EBAY_APP_ID).');
      }
    } catch {
      // Fallback transparente por falta de endpoint / credencial local
    }

    return this.createPendingCredentialFallback(params.itemId, 'Conector eBay Live esperando configuración de credenciales de desarrollador.');
  }

  createPendingCredentialFallback(itemId: string, message: string): EbayLiveProductDetails {
    return {
      item_id: itemId,
      title: `eBay Item ${itemId}`,
      price: 0,
      currency: 'USD',
      seller: 'Pending eBay Seller Verification',
      condition: 'new',
      availability: 'out_of_stock',
      domestic_shipping: 0,
      item_url: `https://www.ebay.com/itm/${itemId}`,
      checked_at: new Date().toISOString(),
      status: 'PENDING_CREDENTIAL',
      error_message: message
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
      stock: details.quantity ?? null,
      condition: details.condition,
      status: details.status,
      estimated_delivery: details.estimated_delivery || '4-7 días (USA)',
      is_zinc_compatible: false,
      reliability_score: details.status === 'LIVE' ? 88 : 40,
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
