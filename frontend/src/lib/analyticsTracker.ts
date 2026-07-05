/**
 * Collectibles.uy Centralized Analytics & E-commerce Funnel Instrumentation
 * Covers GA4 standard e-commerce events, Clarity custom events, and internal traffic detection.
 */

// Helper to determine if the user is internal (developers, QA, admins, vendors)
export function checkIsInternalUser(): boolean {
  // 1. Path-based check
  const path = window.location.pathname;
  if (path.startsWith('/admin') || path.startsWith('/vendor')) {
    return true;
  }

  // 2. Domain-based check
  const host = window.location.hostname;
  if (
    host.includes('localhost') || 
    host.includes('127.0.0.1') || 
    host.endsWith('.vercel.app')
  ) {
    return true;
  }

  // 3. LocalStorage flags
  if (localStorage.getItem('traffic_type') === 'internal' || localStorage.getItem('is_qa') === 'true') {
    return true;
  }

  // 4. Authenticated Supabase session metadata check (checks roles securely)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
    if (projectRef) {
      const storageKey = `sb-${projectRef}-auth-token`;
      const sbSessionStr = localStorage.getItem(storageKey);
      if (sbSessionStr) {
        const sbSession = JSON.parse(sbSessionStr);
        const user = sbSession?.user;
        const role = user?.user_metadata?.role || user?.role;
        
        if (role === 'admin' || role === 'vendor') {
          return true;
        }
      }
    }
  } catch {
    // Fail-safe: ignore JSON parse or key lookup errors
  }

  return false;
}

// Map cart/product items into GA4 e-commerce format
export function mapCartItemsToGA4(items: any[]): any[] {
  return items.map((item, idx) => ({
    item_id: String(item.product_id || item.id || ''),
    item_name: String(item.product_name || item.title || ''),
    index: idx,
    item_brand: item.brand_name || item.brand || undefined,
    item_category: item.category_name || item.category || undefined,
    item_category2: item.subcategory_name || item.subcategory || undefined,
    item_variant: item.variant_title || item.variant_name || item.variant || undefined,
    price: Number(item.price || item.unit_price || 0),
    quantity: Number(item.quantity || 1)
  }));
}

// Dispatch GA4 standard or custom events
export function trackGA4Event(eventName: string, params: Record<string, any> = {}) {
  try {
    const isInternal = checkIsInternalUser();
    const eventParams = {
      ...params,
      traffic_type: isInternal ? 'internal' : 'commercial'
    };

    // Configure user properties globally in GA4 first
    if ((window as any).gtag) {
      (window as any).gtag('set', 'user_properties', {
        traffic_type: isInternal ? 'internal' : 'commercial'
      });
      
      if (import.meta.env.DEV) {
        console.log(`[GA4 Track] ${eventName}:`, eventParams);
      }
      (window as any).gtag('event', eventName, eventParams);
    }
  } catch (error) {
    console.warn('[Analytics Tracker] GA4 dispatch failed (silently caught):', error);
  }
}

// Safe wrappers for Microsoft Clarity to prevent runtime crashes
export function safeClaritySet(key: string, value: string) {
  try {
    if (!key || typeof key !== 'string' || key.trim() === '') return;
    if (!value || typeof value !== 'string' || value.trim() === '') return;

    const clarityFn = (window as any).clarity;
    if (typeof clarityFn === 'function') {
      clarityFn('set', key.trim(), value.trim());
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[safeClaritySet] Failed:', error);
    }
  }
}

export function safeClarityEvent(name: string) {
  try {
    if (!name || typeof name !== 'string' || name.trim() === '') return;

    const clarityFn = (window as any).clarity;
    if (typeof clarityFn === 'function') {
      clarityFn('event', name.trim());
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[safeClarityEvent] Failed:', error);
    }
  }
}

// Dispatch Clarity custom events
export function trackClarityEvent(eventName: string) {
  const isInternal = checkIsInternalUser();
  safeClaritySet('traffic_type', isInternal ? 'internal' : 'commercial');

  if (import.meta.env.DEV) {
    console.log(`[Clarity Event] ${eventName}`);
  }
  safeClarityEvent(eventName);
}

// Check if a purchase has already been tracked (read-only)
export function hasPurchaseBeenTracked(orderId: string): boolean {
  if (!orderId) return false;
  try {
    const key = 'tracked_purchase_ids';
    const trackedStr = localStorage.getItem(key);
    const trackedList: string[] = trackedStr ? JSON.parse(trackedStr) : [];
    return trackedList.includes(orderId);
  } catch {
    return false;
  }
}

// Mark a purchase as tracked (write-only)
export function markPurchaseAsTracked(orderId: string): void {
  if (!orderId) return;
  try {
    const key = 'tracked_purchase_ids';
    const trackedStr = localStorage.getItem(key);
    const trackedList: string[] = trackedStr ? JSON.parse(trackedStr) : [];
    if (!trackedList.includes(orderId)) {
      trackedList.push(orderId);
      if (trackedList.length > 100) {
        trackedList.shift();
      }
      localStorage.setItem(key, JSON.stringify(trackedList));
    }
  } catch {
    // Fail-safe
  }
}
