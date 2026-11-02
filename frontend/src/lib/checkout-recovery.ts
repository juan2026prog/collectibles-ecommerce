import { supabase } from './supabase';
import { isOrderPaymentApproved } from './payments';

const STORAGE_KEY = 'mp_checkout_recovery_v1';
const ATTEMPT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos de validez técnica de intento

export type CheckoutAttempt = {
  attemptId: string;
  fingerprint: string;
  requestKey: string;
  orderId?: string;
  orderToken?: string;
  createdAt: number;
};

let inFlight: Promise<any> | undefined;
let inFlightFingerprint: string | undefined;

export async function checkoutFingerprint(params: any): Promise<string> {
  const { terms_accepted_at: _termsAt, reservation_id: _reservation, ...stable } = params;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable)));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  const str = JSON.stringify(stable);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Checks whether an existing saved order in the recovery slot was already paid/confirmed.
 * Strictly queries the read-only get-order-status endpoint to guarantee zero side effects
 * (no payment finalization, no stock changes, no mutations).
 */
async function checkOrderPaymentStatus(orderId: string, orderToken?: string): Promise<{ isPaid: boolean; order?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('get-order-status', {
      body: {
        order_id: orderId,
        order_token: orderToken,
      }
    });

    if (error || !data?.order) {
      return { isPaid: false };
    }

    const isPaid = Boolean(data.order.is_paid || isOrderPaymentApproved(data.order));
    return { isPaid, order: data.order };
  } catch {
    return { isPaid: false };
  }
}

/**
 * Executes a checkout order creation with:
 * - Double-click and concurrent tap deduplication (in-flight collapse)
 * - Multi-tab serialization via Web Locks
 * - Technical retry recovery if the previous response was lost or interrupted
 * - Fresh key generation for new purchases once previous order is completed or expired
 */
export async function withRecoverableCheckout(
  params: any,
  create: (requestKey: string) => Promise<{ order: any; order_token?: string }>
) {
  const fingerprint = await checkoutFingerprint(params);

  // 1. In-flight deduplication: Double click within the same tab
  if (inFlight) {
    if (inFlightFingerprint === fingerprint) {
      return inFlight;
    }
    throw new Error('Hay otra solicitud de checkout en curso. Esperá a que finalice.');
  }

  const run = async () => {
    let saved: CheckoutAttempt | undefined;
    try {
      if (typeof localStorage !== 'undefined') {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || undefined;
      }
    } catch {
      // Storage unavailable
    }

    const isRecent = saved && (Date.now() - saved.createdAt) < ATTEMPT_TIMEOUT_MS;
    const isMatchingAttempt = isRecent && saved?.fingerprint === fingerprint;

    // If an unresolved attempt exists with an associated order ID, verify its real status in Supabase
    if (isMatchingAttempt && saved?.orderId) {
      const { isPaid } = await checkOrderPaymentStatus(saved.orderId, saved.orderToken);
      if (isPaid) {
        // Previous order was already paid! Clear slot so this purchase starts as a fresh order.
        clearRecoveredCheckout(saved.orderId);
        saved = undefined;
      }
    }

    // Reuse existing requestKey ONLY if it is an active, interrupted technical retry for the exact same attempt
    let currentAttempt: CheckoutAttempt;
    if (isMatchingAttempt && saved?.requestKey) {
      currentAttempt = saved;
    } else {
      // Fresh new purchase or expired previous attempt
      const attemptId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const requestKey = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      currentAttempt = {
        attemptId,
        fingerprint,
        requestKey,
        createdAt: Date.now()
      };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(currentAttempt));
        }
      } catch {}
    }

    const result = await create(currentAttempt.requestKey);

    try {
      if (typeof localStorage !== 'undefined' && result?.order?.id) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...currentAttempt,
          orderId: result.order.id,
          orderToken: result.order_token
        }));
      }
    } catch {}

    return result.order;
  };

  inFlightFingerprint = fingerprint;

  // Use Web Locks when available to serialize concurrent tab actions
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    inFlight = navigator.locks.request('mp-checkout-order', run);
  } else {
    inFlight = run();
  }

  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
    inFlightFingerprint = undefined;
  }
}

/**
 * Removes transient checkout recovery state once an order is verified, paid or reset.
 */
export function clearRecoveredCheckout(orderId?: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!orderId) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const val = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!val || val.orderId === orderId) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}
