/**
 * Meta Pixel & Conversions API Utilities
 * 
 * Centralized library for all Meta Tracking in Collectibles.
 */

// Debug flag from env or window
const IS_DEBUG = import.meta.env.VITE_META_DEBUG === 'true' || (window as any).metaDebug === true;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;
import { sendMetaCapiEvent } from './metaCapi';

// Define custom window properties
declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    metaDebug?: boolean;
    _metaPageViewTracked?: boolean;
  }
}

/**
 * Validates if Meta Tracking is allowed.
 * Currently checks if cookieSettings is 'accepted' in localStorage.
 */
export function canTrackMeta(): boolean {
  if (!PIXEL_ID) return false;
  const cookieSettings = localStorage.getItem('cookieSettings');
  // Based on StorefrontLayout, it checks `cookieSettings === 'accepted'`.
  // If banner hasn't been shown, we should respect it. For now, following user instructions.
  return cookieSettings === 'accepted';
}

/**
 * Initializes the Meta Pixel script
 */
export function initPixel() {
  if (!canTrackMeta()) return;
  if (window.fbq) return; // Already initialized

  if (IS_DEBUG) console.log(`[Meta] Initializing Pixel ID: ${PIXEL_ID}`);

  (function (f: any, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    if (s && s.parentNode) {
      s.parentNode.insertBefore(t, s);
    }
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
}

/**
 * Generates a unique Meta event ID for deduplication
 */
export function generateMetaEventId(eventName: string, entityId?: string): string {
  const prefix = `meta_${eventName.toLowerCase()}`;
  if (entityId) {
    return `${prefix}_${entityId}_${Math.random().toString(36).slice(2, 7)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Core track function that sends the event to the pixel.
 * Note: CAPI calls are handled separately in a unified track utility,
 * but this file handles the Pixel part and the IDs.
 */
function trackEvent(eventName: string, data: any = {}, eventId?: string) {
  if (!canTrackMeta() || !window.fbq) return;
  
  const options = eventId ? { eventID: eventId } : undefined;
  window.fbq('track', eventName, data, options);
  
  if (IS_DEBUG) {
    console.log(`[Meta] Track: ${eventName} | ID: ${eventId}`, data);
  }
}

/**
 * Dispara el evento PageView (Evita doble disparo por montaje)
 */
export function trackPageView(eventId?: string) {
  if (window._metaPageViewTracked) return; // Basic dedup for strict mode / re-renders
  window._metaPageViewTracked = true;
  
  trackEvent('PageView', undefined, eventId);
  
  // Reset after a short delay in case we navigated (SPA)
  setTimeout(() => {
    window._metaPageViewTracked = false;
  }, 100);
}

export function trackViewContent(
  eventId: string,
  data: {
    content_ids: string[];
    content_name: string;
    category?: string;
    brand?: string;
    value: number;
    currency?: string;
  }
) {
  const customData = {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  };
  trackEvent('ViewContent', customData, eventId);
  sendMetaCapiEvent(eventId, 'ViewContent', customData);
}

export function trackSearch(eventId: string, search_string: string) {
  trackEvent('Search', { search_string }, eventId);
}

export function trackAddToCart(
  eventId: string,
  data: {
    content_ids: string[];
    contents: any[];
    value: number;
    currency?: string;
  }
) {
  const customData = {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  };
  trackEvent('AddToCart', customData, eventId);
  sendMetaCapiEvent(eventId, 'AddToCart', customData);
}

export function trackAddToWishlist(
  eventId: string,
  data: {
    content_ids: string[];
    content_name: string;
    value: number;
    currency?: string;
  }
) {
  trackEvent('AddToWishlist', {
    ...data,
    currency: data.currency || 'UYU'
  }, eventId);
}

export function trackInitiateCheckout(
  eventId: string,
  data: {
    value: number;
    contents: any[];
    num_items: number;
    currency?: string;
  }
) {
  const customData = {
    ...data,
    currency: data.currency || 'UYU'
  };
  trackEvent('InitiateCheckout', customData, eventId);
  sendMetaCapiEvent(eventId, 'InitiateCheckout', customData);
}

export function trackAddPaymentInfo(
  eventId: string,
  data: {
    value: number;
    payment_method?: string;
    currency?: string;
  }
) {
  const customData = {
    ...data,
    currency: data.currency || 'UYU'
  };
  trackEvent('AddPaymentInfo', customData, eventId);
  sendMetaCapiEvent(eventId, 'AddPaymentInfo', customData);
}

export function trackPurchase(
  eventId: string,
  data: {
    value: number;
    currency?: string;
    contents: any[];
    content_ids: string[];
    num_items: number;
    order_id: string; // Crucial for deduplication
  }
) {
  trackEvent('Purchase', {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  }, eventId);
}
