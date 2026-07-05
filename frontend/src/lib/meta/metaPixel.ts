/**
 * Meta Pixel & Conversions API Utilities
 * 
 * Centralized library for all Meta Tracking in Collectibles.
 */

// Debug flag from env or window
const IS_DEBUG = import.meta.env.VITE_META_DEBUG === 'true' || (window as any).metaDebug === true;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '1623445247816011';
import { sendMetaCapiEvent } from './metaCapi';

// Define custom window properties
declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    metaDebug?: boolean;
    _metaPageViewTracked?: boolean;
    _metaPixelInitialized?: boolean;
    _metaPixelLastUserData?: string;
  }
}

/**
 * Validates if Meta Tracking is allowed.
 * We are enabling tracking by default as per user request for Meta Events.
 */
export function canTrackMeta(): boolean {
  if (!PIXEL_ID) return false;
  // If explicitly rejected, we could block it, but for now we force track
  // to ensure Facebook Events Manager registers the events correctly.
  return true;
}

/**
 * Initializes the Meta Pixel script
 */
export function initPixel(userData?: any) {
  if (!canTrackMeta()) return;
  if (!window.fbq) return;

  const userDataString = userData ? JSON.stringify(userData) : '{}';

  // Evitar inicialización redundante si ya fue inicializado con la misma información de usuario
  if (window._metaPixelInitialized && window._metaPixelLastUserData === userDataString) {
    return;
  }

  if (IS_DEBUG) console.log(`[Meta] Initializing Pixel ID: ${PIXEL_ID} with EMQ`, userData);
  window.fbq('init', PIXEL_ID, userData);

  window._metaPixelInitialized = true;
  window._metaPixelLastUserData = userDataString;
}

/**
 * Normalizes any event ID parameter to guarantee it is a valid string,
 * avoiding object/array serialization and providing a solid fallback
 * if the ID is missing or invalid.
 */
export function normalizeEventId(eventId?: unknown, fallbackPrefix?: string): string {
  if (eventId !== undefined && eventId !== null && eventId !== '') {
    if (typeof eventId === 'string' || typeof eventId === 'number') {
      return String(eventId).trim();
    }
  }

  const prefix = fallbackPrefix ? `meta_${fallbackPrefix.toLowerCase()}` : 'meta_evt';
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${timestamp}_${randomStr}`;
}

/**
 * Generates a unique Meta event ID for deduplication
 */
export function generateMetaEventId(eventName?: string, entityId?: string): string {
  const name = eventName || 'event';
  const prefix = `meta_${name.toLowerCase()}`;
  if (entityId) {
    if (name === 'Purchase') return `${prefix}_${entityId}`;
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
  
  const cleanEventId = normalizeEventId(eventId, eventName);
  const options = { eventID: cleanEventId };
  window.fbq('track', eventName, data, options);
  
  if (IS_DEBUG) {
    console.log(`[Meta] Track: ${eventName} | ID: ${cleanEventId}`, data);
  }
}

/**
 * Dispara el evento PageView (Evita doble disparo por montaje)
 */
export function trackPageView(eventId?: string, userData?: any) {
  if (window._metaPageViewTracked) return; // Basic dedup for strict mode / re-renders
  window._metaPageViewTracked = true;
  
  const cleanEventId = normalizeEventId(eventId, 'PageView');
  trackEvent('PageView', undefined, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'PageView', undefined, userData);
  
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
  const cleanEventId = normalizeEventId(eventId, 'ViewContent');
  const customData = {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  };
  trackEvent('ViewContent', customData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'ViewContent', customData);
}

export function trackSearch(eventId: string, search_string: string) {
  const cleanEventId = normalizeEventId(eventId, 'Search');
  trackEvent('Search', { search_string }, cleanEventId);
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
  const cleanEventId = normalizeEventId(eventId, 'AddToCart');
  const customData = {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  };
  trackEvent('AddToCart', customData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'AddToCart', customData);
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
  const cleanEventId = normalizeEventId(eventId, 'AddToWishlist');
  trackEvent('AddToWishlist', {
    ...data,
    currency: data.currency || 'UYU'
  }, cleanEventId);
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
  const cleanEventId = normalizeEventId(eventId, 'InitiateCheckout');
  const customData = {
    ...data,
    currency: data.currency || 'UYU'
  };
  trackEvent('InitiateCheckout', customData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'InitiateCheckout', customData);
}

export function trackAddPaymentInfo(
  eventId: string,
  data: {
    value: number;
    payment_method?: string;
    currency?: string;
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'AddPaymentInfo');
  const customData = {
    ...data,
    currency: data.currency || 'UYU'
  };
  trackEvent('AddPaymentInfo', customData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'AddPaymentInfo', customData);
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
    user_email?: string;
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'Purchase');
  const customData = {
    ...data,
    currency: data.currency || 'UYU',
    content_type: 'product'
  };
  
  // Remove user_email from customData to keep it clean, but pass it to CAPI user_data
  const { user_email, ...pixelData } = customData;
  
  trackEvent('Purchase', pixelData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'Purchase', pixelData, { email: user_email });
}

export function trackCompleteRegistration(
  eventId: string,
  data: {
    status?: boolean;
    user_email?: string;
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'CompleteRegistration');
  const { user_email, ...pixelData } = data;
  trackEvent('CompleteRegistration', pixelData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'CompleteRegistration', pixelData, { email: user_email });
}

export function trackLead(
  eventId: string,
  data: {
    content_name?: string;
    content_category?: string;
    user_email?: string;
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'Lead');
  const { user_email, ...pixelData } = data;
  trackEvent('Lead', pixelData, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'Lead', pixelData, { email: user_email });
}

export function trackContact(
  eventId: string,
  data: {
    contact_method?: string; // e.g. whatsapp, email, instagram
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'Contact');
  trackEvent('Contact', data, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'Contact', data);
}

export function trackFindLocation(
  eventId: string,
  data: {
    content_name?: string; // e.g. 'Dirección Local'
    location?: string;
  }
) {
  const cleanEventId = normalizeEventId(eventId, 'FindLocation');
  trackEvent('FindLocation', data, cleanEventId);
  sendMetaCapiEvent(cleanEventId, 'FindLocation', data);
}
