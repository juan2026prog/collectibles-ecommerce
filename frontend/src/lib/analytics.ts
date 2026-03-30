import { supabase } from './supabase';

// Helper to hash data using SHA-256 (required by Meta CAPI)
async function hashData(data?: string): Promise<string | undefined> {
  if (!data) return undefined;
  const msgUint8 = new TextEncoder().encode(data.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface AnalyticsEvent {
  eventName: string;
  eventData?: Record<string, any>;
  user?: {
    email?: string;
    phone?: string;
  };
}

export const analytics = {
  /**
   * Track Event (Hybrid approach: Pixel + CAPI)
   */
  async track(event: AnalyticsEvent) {
    const eventId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pixelId = import.meta.env.VITE_META_PIXEL_ID;
    const capiEnabled = import.meta.env.VITE_META_CAPI_ENABLED === 'true';

    // 1. Client-Side: Meta Pixel (FBQ)
    if (pixelId && (window as any).fbq) {
      (window as any).fbq('track', event.eventName, event.eventData || {}, { eventID: eventId });
      console.log(`[Analytics] Pixel Track: ${event.eventName}`, event.eventData);
    }

    // 2. Server-Side: Meta CAPI (via Supabase Edge Function)
    if (capiEnabled) {
      try {
        const hashedEmail = await hashData(event.user?.email);
        const hashedPhone = await hashData(event.user?.phone);

        // Call our meta-capi edge function
        const { data, error } = await supabase.functions.invoke('meta-capi', {
          body: {
            eventName: event.eventName,
            eventId: eventId,
            eventData: event.eventData,
            userData: {
              em: hashedEmail,
              ph: hashedPhone,
              client_user_agent: navigator.userAgent,
            }
          }
        });

        if (error) throw error;
        console.log(`[Analytics] CAPI Track: ${event.eventName}`, data);
      } catch (err) {
        console.error(`[Analytics] CAPI Error for ${event.eventName}:`, err);
      }
    }
  }
};
