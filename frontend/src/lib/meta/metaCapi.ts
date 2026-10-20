import { supabase } from '../supabase';

const IS_DEBUG = import.meta.env.VITE_META_DEBUG === 'true' || (window as any).metaDebug === true;

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
}

export async function sendMetaCapiEvent(
  eventId: string,
  eventName: string,
  customData: any = {},
  userData: any = {}
) {
  try {
    if (typeof navigator === 'undefined') return;
    const client_user_agent = navigator.userAgent || '';
    if (/(meta-externalagent|facebookexternalhit|facebot|Googlebot|AdsBot-Google|Mediapartners-Google|bingbot|Applebot|Linespider|ByteSpider|PetalBot|SemrushBot|AhrefsBot|MJ12bot|YandexBot|DuckDuckBot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|HeadlessChrome|PhantomJS|Prerender)/i.test(client_user_agent)) {
      return;
    }
    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');
    const event_source_url = window.location.href;

    const payload = {
      event_name: eventName,
      event_id: eventId,
      event_source_url,
      action_source: 'website',
      user_data: {
        ...((window as any)._metaUserData || {}),
        ...userData,
        fbp,
        fbc,
        client_user_agent
      },
      custom_data: customData
    };

    if (IS_DEBUG) {
      console.log(`[Meta CAPI Debug] Sending payload for ${eventName}:`, payload);
    }

    const { data, error } = await supabase.functions.invoke('meta-capi', {
      body: payload
    });

    if (error) {
      if (IS_DEBUG) console.error(`[Meta CAPI Debug] Edge Function Error for ${eventName}:`, error);
      return;
    }

    if (IS_DEBUG) {
      console.log(`[Meta CAPI Debug] Response for ${eventName} (ID: ${eventId}):`, data);
    }
  } catch (err) {
    if (IS_DEBUG) console.error(`[Meta CAPI Debug] Exception sending event ${eventName}:`, err);
  }
}
