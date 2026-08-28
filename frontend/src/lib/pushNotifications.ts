import { supabase } from './supabase';

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'not_supported' | 'unconfigured';

export interface DeviceSubscriptionRecord {
  id?: string;
  provider_subscription_id: string;
  device_name: string;
  active: boolean;
  created_at?: string;
}

/**
 * Helper to get user agent / device name
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android Chrome';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS Safari';
  if (/windows/i.test(ua)) return 'Windows Desktop';
  if (/macintosh/i.test(ua)) return 'Mac Desktop';
  if (/linux/i.test(ua)) return 'Linux Desktop';
  return 'Navegador Web';
}

/**
 * Check if Push Notifications are supported by current browser
 */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Get current browser notification permission
 */
export function getBrowserPermission(): PushPermissionState {
  if (!isPushSupported()) return 'not_supported';
  return Notification.permission as PushPermissionState;
}

/**
 * Dynamically load OneSignal SDK script
 */
export async function loadOneSignalSDK(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) {
    console.warn("[Push] VITE_ONESIGNAL_APP_ID missing.");
    return false;
  }

  if (window.OneSignal) return true;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    
    const existingScript = document.getElementById('onesignal-sdk');
    if (existingScript) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'onesignal-sdk';
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.async = true;
    script.onload = () => {
      window.OneSignalDeferred?.push(async (OneSignal: any) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
          });
          resolve(true);
        } catch (err) {
          console.error("[OneSignal Init Error]", err);
          resolve(false);
        }
      });
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Request permission & register device subscription in database
 */
export async function requestAndRegisterDevice(userId: string, vendorId: string | null = null): Promise<{
  success: boolean;
  permission: PushPermissionState;
  subscriptionId?: string;
  error?: string;
}> {
  if (!isPushSupported()) {
    return { success: false, permission: 'not_supported', error: 'Navegador no compatible con notificaciones Push' };
  }

  // Request browser permission directly on user gesture
  const permissionResult = await Notification.requestPermission();
  if (permissionResult !== 'granted') {
    return { success: false, permission: permissionResult as PushPermissionState, error: 'Permiso denegado por el navegador' };
  }

  // Load OneSignal SDK if APP_ID configured
  let subscriptionId: string | null = null;
  if (ONESIGNAL_APP_ID) {
    await loadOneSignalSDK();
    if (window.OneSignal) {
      try {
        await window.OneSignal.login(userId);
        subscriptionId = window.OneSignal.User?.PushSubscription?.id || null;
      } catch (err) {
        console.error("[OneSignal User Login Error]", err);
      }
    }
  }

  // Fallback unique device subscription token if OneSignal SDK in test/mock mode
  if (!subscriptionId) {
    subscriptionId = `dev_${userId.slice(0, 8)}_${getDeviceName().toLowerCase().replace(/\s+/g, '_')}`;
  }

  // Save device subscription to database
  const deviceName = getDeviceName();
  const { error: dbErr } = await supabase
    .from('user_notification_devices')
    .upsert({
      user_id: userId,
      vendor_id: vendorId,
      provider: ONESIGNAL_APP_ID ? 'onesignal' : 'mock_push',
      provider_subscription_id: subscriptionId,
      device_name: deviceName,
      user_agent: navigator.userAgent,
      active: true,
      last_seen_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,provider_subscription_id'
    });

  if (dbErr) {
    console.error("[Register Device DB Error]", dbErr.message);
    return { success: false, permission: 'granted', error: dbErr.message };
  }

  return {
    success: true,
    permission: 'granted',
    subscriptionId
  };
}

/**
 * Unregister/deactivate device subscription
 */
export async function unregisterDevice(userId: string, subscriptionId?: string): Promise<boolean> {
  try {
    let query = supabase
      .from('user_notification_devices')
      .update({ active: false })
      .eq('user_id', userId);

    if (subscriptionId) {
      query = query.eq('provider_subscription_id', subscriptionId);
    }

    const { error } = await query;
    if (error) throw error;

    if (window.OneSignal) {
      try {
        await window.OneSignal.User?.PushSubscription?.optOut();
      } catch (e) {
        // ignore optOut errors
      }
    }

    return true;
  } catch (err) {
    console.error("[Unregister Device Error]", err);
    return false;
  }
}

/**
 * Load active devices for a user
 */
export async function getUserDevices(userId: string): Promise<DeviceSubscriptionRecord[]> {
  const { data, error } = await supabase
    .from('user_notification_devices')
    .select('id, provider_subscription_id, device_name, active, created_at')
    .eq('user_id', userId)
    .eq('active', true);

  if (error || !data) return [];
  return data;
}
