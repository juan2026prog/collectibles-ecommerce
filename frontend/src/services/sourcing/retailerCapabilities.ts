/**
 * RETAILER CAPABILITIES SERVICE — Fase 1 Sourcing Intelligence
 * Declares and checks the real integration status of each retailer source.
 * Honest, no false greens. Never claims a capability that doesn't exist.
 */

import type { RetailerCapabilities, RetailerCapabilityStatus, RetailerSource } from '../../types/sourcing';
import { supabase } from '../../lib/supabase';

const SOURCING_LIVE_CHECK_ENDPOINT = '/api/sourcing/retailer-live-check';

// ── Static baseline capabilities (code-level truth) ──────────────────────────

/**
 * Returns the static baseline capabilities for each retailer based on what
 * is actually implemented in code. These reflect ADAPTER_READY status for
 * eBay/Best Buy (code exists, live check requires Zinc multi-retailer config)
 * and LIVE for Amazon (fully integrated via Zinc).
 *
 * These are overridden by the DB sourcing_retailer_capabilities table when available.
 */
export const STATIC_RETAILER_CAPABILITIES: Record<RetailerSource, RetailerCapabilities> = {
  amazon: {
    retailer: 'amazon',
    search_status: 'LIVE',
    product_status: 'LIVE',
    price_status: 'LIVE',
    stock_status: 'LIVE',
    seller_status: 'LIVE',
    delivery_status: 'LIVE',
    live_check_available: true,
    live_check_endpoint: 'zinc-live-check',
    notes: 'Amazon via Zinc API. Full integration active (search, product, price, stock, fulfillment).'
  },
  ebay: {
    retailer: 'ebay',
    search_status: 'ADAPTER_READY',
    product_status: 'ADAPTER_READY',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    live_check_endpoint: 'sourcing-retailer-live-check',
    notes: 'eBay adapter code ready. Live check requires Zinc multi-retailer (retailer=ebay) to be enabled on account. Contact Zinc to enable.'
  },
  bestbuy: {
    retailer: 'bestbuy',
    search_status: 'ADAPTER_READY',
    product_status: 'ADAPTER_READY',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    live_check_endpoint: 'sourcing-retailer-live-check',
    notes: 'Best Buy adapter code ready. Live check requires Zinc multi-retailer (retailer=bestbuy) to be enabled on account.'
  },
  walmart: {
    retailer: 'walmart',
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Walmart not planned for Fase 1.'
  },
  target: {
    retailer: 'target',
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Target not planned for Fase 1.'
  },
  entertainmentearth: {
    retailer: 'entertainmentearth',
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Entertainment Earth not planned for Fase 1.'
  },
  bbts: {
    retailer: 'bbts',
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Big Bad Toy Store not planned for Fase 1.'
  },
  custom: {
    retailer: 'custom',
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Custom source — requires manual configuration.'
  }
};

// ── Fetch live capabilities from DB ──────────────────────────────────────────

/**
 * Fetches live retailer capabilities from Supabase.
 * Falls back to static baseline if DB is not available.
 * Always returns a valid capabilities object — never throws.
 */
export async function getRetailerCapabilities(
  retailer: RetailerSource
): Promise<RetailerCapabilities> {
  try {
    const { data, error } = await supabase
      .from('sourcing_retailer_capabilities')
      .select('*')
      .eq('retailer', retailer)
      .single();

    if (!error && data) {
      return data as RetailerCapabilities;
    }
  } catch { /* DB not available — use static baseline */ }

  return STATIC_RETAILER_CAPABILITIES[retailer] || {
    retailer,
    search_status: 'NOT_CONFIGURED',
    product_status: 'NOT_CONFIGURED',
    price_status: 'NOT_CONFIGURED',
    stock_status: 'NOT_CONFIGURED',
    seller_status: 'NOT_CONFIGURED',
    delivery_status: 'NOT_CONFIGURED',
    live_check_available: false,
    notes: 'Unknown retailer — no capabilities configured.'
  };
}

/**
 * Fetches capabilities for all Fase 1 retailers (Amazon, eBay, Best Buy).
 */
export async function getAllFase1Capabilities(): Promise<{
  amazon: RetailerCapabilities;
  ebay: RetailerCapabilities;
  bestbuy: RetailerCapabilities;
}> {
  const [amazon, ebay, bestbuy] = await Promise.all([
    getRetailerCapabilities('amazon'),
    getRetailerCapabilities('ebay'),
    getRetailerCapabilities('bestbuy')
  ]);

  return { amazon, ebay, bestbuy };
}

/**
 * Returns a human-readable status badge for display in UI.
 */
export function getCapabilityStatusBadge(status: RetailerCapabilityStatus): {
  label: string;
  color: 'green' | 'yellow' | 'gray' | 'red';
  description: string;
} {
  switch (status) {
    case 'LIVE':
      return { label: 'LIVE', color: 'green', description: 'Integración activa y verificada' };
    case 'ADAPTER_READY':
      return { label: 'ADAPTER READY', color: 'yellow', description: 'Adaptador listo, pendiente de credenciales/configuración' };
    case 'NOT_CONFIGURED':
      return { label: 'NOT CONFIGURED', color: 'gray', description: 'Sin configuración activa para esta fuente' };
    case 'ERROR':
      return { label: 'ERROR', color: 'red', description: 'Integración activa pero con errores recientes' };
    default:
      return { label: 'UNKNOWN', color: 'gray', description: 'Estado desconocido' };
  }
}

/**
 * Returns the overall integration status for a retailer
 * (worst status across all capabilities).
 */
export function getOverallRetailerStatus(caps: RetailerCapabilities): RetailerCapabilityStatus {
  const statuses: RetailerCapabilityStatus[] = [
    caps.search_status,
    caps.product_status,
    caps.price_status,
    caps.stock_status
  ];

  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.every(s => s === 'LIVE')) return 'LIVE';
  if (statuses.some(s => s === 'LIVE' || s === 'ADAPTER_READY')) return 'ADAPTER_READY';
  return 'NOT_CONFIGURED';
}

/**
 * Returns true if this retailer can be used for live price/stock checking.
 */
export function canDoLiveCheck(caps: RetailerCapabilities): boolean {
  return caps.live_check_available === true &&
    caps.price_status === 'LIVE' &&
    caps.stock_status === 'LIVE';
}

/**
 * Calls the sourcing-retailer-live-check edge function.
 * Returns structured response with data_source: LIVE | NOT_CONFIGURED | ERROR
 */
export async function executeLiveCheck(
  productId: string,
  retailer: 'amazon' | 'ebay' | 'bestbuy',
  forceRefresh = false
): Promise<{
  data_source: 'LIVE' | 'NOT_CONFIGURED' | 'ERROR';
  price_usd?: number;
  availability_normalized?: string;
  condition_normalized?: string;
  seller?: string;
  error_message?: string;
  elapsed_ms?: number;
  capabilities?: RetailerCapabilities;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('sourcing-retailer-live-check', {
      body: {
        product_id: productId,
        retailer,
        force_refresh: forceRefresh
      }
    });

    if (error) {
      return { data_source: 'ERROR', error_message: error.message };
    }

    return data;
  } catch (err: any) {
    return { data_source: 'ERROR', error_message: err.message };
  }
}
