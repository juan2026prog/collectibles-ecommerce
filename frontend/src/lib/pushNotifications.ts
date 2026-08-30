import { supabase } from './supabase';
import { ONESIGNAL_APP_ID } from '../config/onesignal';

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

export type PushPermissionState =
  | 'granted'         // Activas en este dispositivo
  | 'default'         // Permiso pendiente
  | 'denied'          // Bloqueadas por navegador
  | 'not_supported'   // Navegador no compatible
  | 'unconfigured'    // OneSignal no configurado
  | 'error';          // Error de registro

export interface DeviceSubscriptionRecord {
  id?: string;
  user_id?: string;
  vendor_id?: string | null;
  provider: string;
  provider_subscription_id: string;
  device_name: string;
  user_agent?: string;
  active: boolean;
  created_at?: string;
  last_seen_at?: string;
}

export interface PushStatusInfo {
  state: PushPermissionState;
  isIOSNonStandalone: boolean;
  subscriptionId: string | null;
  optedIn: boolean;
  appIdConfigured: boolean;
}

let sdkInitPromise: Promise<boolean> | null = null;
let listenersInitialized = false;

/**
 * Check if running on local environment (localhost / 127.0.0.1)
 */
export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Helper to get device name / user agent descriptor
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Navegador Web';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android Chrome';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS Safari';
  if (/windows/i.test(ua)) return 'Windows Desktop';
  if (/macintosh/i.test(ua)) return 'Mac Desktop';
  if (/linux/i.test(ua)) return 'Linux Desktop';
  return 'Navegador Web';
}

export type MobilePlatform = 'android' | 'ios' | 'desktop' | 'other_mobile';

/**
 * Detect current platform combining navigator.userAgent, userAgentData, maxTouchPoints & display-mode standalone
 */
export function getMobilePlatform(): MobilePlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent || '';
  const lowerUA = ua.toLowerCase();

  // 1. Android check
  if (/android/i.test(ua)) {
    return 'android';
  }

  // 2. iOS (iPhone, iPad, iPod) check
  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'ios';
  }

  // iPad OS 13+ desktop mode sends 'Macintosh' user agent but has touch points
  if (/macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return 'ios';
  }

  // 3. UserAgentData Client Hints check if supported
  const uaData = (navigator as any).userAgentData;
  if (uaData) {
    if (uaData.mobile) {
      const platform = (uaData.platform || '').toLowerCase();
      if (platform.includes('android')) return 'android';
      if (platform.includes('ios') || platform.includes('iphone') || platform.includes('ipad')) return 'ios';
      return 'other_mobile';
    }
  }

  // 4. Other mobile device check
  if (/mobile|tablet|ipod|blackberry|opera mini|iemobile|silk|kindle/i.test(lowerUA)) {
    return 'other_mobile';
  }

  return 'desktop';
}

/**
 * Check if device is iOS (iPhone/iPad)
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = getMobilePlatform();
  return platform === 'ios';
}

/**
 * Check if web app is running in Standalone PWA mode (Required for Web Push in iOS 16.4+)
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMatchMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = (navigator as any).standalone === true;
  return isStandaloneMatchMedia || isNavigatorStandalone;
}

/**
 * Check if Push Notifications are supported by current browser
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasNotification = 'Notification' in window;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  
  if (!hasNotification || !hasServiceWorker || !hasPushManager) {
    return false;
  }

  // On iOS, Web Push is only supported on iOS 16.4+ when added to Home Screen (standalone)
  if (isIOSDevice() && !isStandaloneMode()) {
    return false;
  }

  return true;
}

/**
 * Get current browser notification permission
 */
export function getRawBrowserPermission(): NotificationPermission | 'not_supported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'not_supported';
  return Notification.permission;
}

/**
 * Dynamically load & initialize OneSignal Web SDK v16
 */
export async function initOneSignalSDK(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) {
    return false;
  }

  if (sdkInitPromise) {
    return sdkInitPromise;
  }

  sdkInitPromise = new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    // Inject SDK script if missing
    let script = document.getElementById('onesignal-sdk-v16') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'onesignal-sdk-v16';
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);
    }

    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: isLocalhost(),
          serviceWorkerPath: 'OneSignalSDKWorker.js',
          notifyButton: {
            enable: false,
          },
        });

        setupOneSignalListeners(OneSignal);
        resolve(true);
      } catch (err) {
        console.error('[OneSignal SDK v16 Init Error]:', err);
        resolve(false);
      }
    });
  });

  return sdkInitPromise;
}

/**
 * Setup SDK event listeners to sync state automatically when permission or subscription changes
 */
function setupOneSignalListeners(OneSignal: any) {
  if (listenersInitialized || !OneSignal) return;
  listenersInitialized = true;

  try {
    // Listen to permission changes
    OneSignal.Notifications?.addEventListener('permissionChange', (permission: boolean) => {
      console.log('[OneSignal] Permission changed:', permission);
    });

    // Listen to push subscription changes
    OneSignal.User?.PushSubscription?.addEventListener('change', async (event: any) => {
      console.log('[OneSignal] Push subscription changed:', event);
      const currentSubId = event?.current?.id;
      const optedIn = event?.current?.optedIn;

      if (currentSubId && optedIn) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await syncDeviceToDatabase(session.user.id, currentSubId, true);
        }
      }
    });
  } catch (err) {
    console.error('[OneSignal] Error setting up listeners:', err);
  }
}

/**
 * Sync device record to database (user_notification_devices)
 */
export async function syncDeviceToDatabase(
  userId: string,
  subscriptionId: string,
  active: boolean = true,
  vendorId: string | null = null
): Promise<boolean> {
  if (!userId || !subscriptionId) return false;

  try {
    const { error } = await supabase
      .from('user_notification_devices')
      .upsert({
        user_id: userId,
        vendor_id: vendorId,
        provider: 'onesignal',
        provider_subscription_id: subscriptionId,
        device_name: getDeviceName(),
        user_agent: navigator.userAgent,
        active,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider_subscription_id'
      });

    if (error) {
      console.error('[OneSignal DB Sync Error]:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[OneSignal DB Sync Exception]:', err.message);
    return false;
  }
}

/**
 * Login user to OneSignal using Supabase auth.uid() as External ID
 */
export async function loginOneSignalUser(userId: string): Promise<boolean> {
  if (!ONESIGNAL_APP_ID || !userId) return false;
  try {
    await initOneSignalSDK();
    if (window.OneSignal) {
      await window.OneSignal.login(userId);
      return true;
    }
  } catch (err) {
    console.error('[OneSignal Login Error]:', err);
  }
  return false;
}

/**
 * Logout user from OneSignal to dissociate current browser from previous user
 */
export async function logoutOneSignalUser(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  try {
    if (window.OneSignal) {
      await window.OneSignal.logout();
      return true;
    }
  } catch (err) {
    console.error('[OneSignal Logout Error]:', err);
  }
  return false;
}

/**
 * Get comprehensive push status for UI rendering
 */
export async function getPushStatus(): Promise<PushStatusInfo> {
  const isIOSNonStandalone = isIOSDevice() && !isStandaloneMode();

  if (!ONESIGNAL_APP_ID) {
    return {
      state: 'unconfigured',
      isIOSNonStandalone,
      subscriptionId: null,
      optedIn: false,
      appIdConfigured: false,
    };
  }

  if (!isPushSupported()) {
    return {
      state: 'not_supported',
      isIOSNonStandalone,
      subscriptionId: null,
      optedIn: false,
      appIdConfigured: true,
    };
  }

  const browserPerm = getRawBrowserPermission();

  if (browserPerm === 'denied') {
    return {
      state: 'denied',
      isIOSNonStandalone,
      subscriptionId: null,
      optedIn: false,
      appIdConfigured: true,
    };
  }

  // Attempt SDK initialization to check detailed subscription state
  const initialized = await initOneSignalSDK();
  if (!initialized || !window.OneSignal) {
    if (browserPerm === 'granted') return { state: 'error', isIOSNonStandalone, subscriptionId: null, optedIn: false, appIdConfigured: true };
    return { state: 'default', isIOSNonStandalone, subscriptionId: null, optedIn: false, appIdConfigured: true };
  }

  try {
    const hasPermission = window.OneSignal.Notifications?.permission ?? (browserPerm === 'granted');
    const subscriptionId = window.OneSignal.User?.PushSubscription?.id || null;
    const optedIn = window.OneSignal.User?.PushSubscription?.optedIn ?? false;

    if (hasPermission && optedIn && subscriptionId) {
      return {
        state: 'granted',
        isIOSNonStandalone,
        subscriptionId,
        optedIn: true,
        appIdConfigured: true,
      };
    }

    if (browserPerm === 'denied') {
      return { state: 'denied', isIOSNonStandalone, subscriptionId, optedIn, appIdConfigured: true };
    }

    return {
      state: 'default',
      isIOSNonStandalone,
      subscriptionId,
      optedIn,
      appIdConfigured: true,
    };
  } catch (err) {
    console.error('[getPushStatus Error]:', err);
    return {
      state: 'error',
      isIOSNonStandalone,
      subscriptionId: null,
      optedIn: false,
      appIdConfigured: true,
    };
  }
}

/**
 * Request notification permission & register user device in OneSignal & Supabase DB
 * MUST BE CALLED EXCLUSIVELY ON USER GESTURE ("Activar notificaciones en este dispositivo")
 */
export async function requestAndRegisterPush(
  userId: string,
  vendorId: string | null = null
): Promise<{
  success: boolean;
  state: PushPermissionState;
  subscriptionId?: string;
  error?: string;
}> {
  if (!ONESIGNAL_APP_ID) {
    return { success: false, state: 'unconfigured', error: 'OneSignal App ID no está configurado.' };
  }

  if (!isPushSupported()) {
    const isIOSNonStandalone = isIOSDevice() && !isStandaloneMode();
    const msg = isIOSNonStandalone
      ? 'En iOS/iPhone se requiere agregar la web a la Pantalla de Inicio (PWA) para activar notificaciones.'
      : 'Tu navegador o dispositivo no admite notificaciones Push.';
    return { success: false, state: 'not_supported', error: msg };
  }

  const initialized = await initOneSignalSDK();
  if (!initialized || !window.OneSignal) {
    return { success: false, state: 'error', error: 'No se pudo inicializar OneSignal SDK v16.' };
  }

  try {
    // 1. Request permission explicitly using OneSignal SDK v16 API
    let permissionGranted = false;
    if (window.OneSignal.Notifications?.requestPermission) {
      permissionGranted = await window.OneSignal.Notifications.requestPermission();
    } else {
      const rawPerm = await Notification.requestPermission();
      permissionGranted = rawPerm === 'granted';
    }

    if (!permissionGranted) {
      const currentPerm = getRawBrowserPermission();
      const state: PushPermissionState = currentPerm === 'denied' ? 'denied' : 'default';
      return {
        success: false,
        state,
        error: state === 'denied' ? 'Las notificaciones fueron bloqueadas en la configuración del navegador.' : 'El permiso de notificaciones no fue otorgado.'
      };
    }

    // 2. Login user to link External ID (auth.uid())
    await window.OneSignal.login(userId);

    // 3. Opt in if subscription is opted out
    if (window.OneSignal.User?.PushSubscription?.optIn) {
      await window.OneSignal.User.PushSubscription.optIn();
    }

    // 4. Retrieve Subscription ID
    const subscriptionId = window.OneSignal.User?.PushSubscription?.id;

    if (!subscriptionId) {
      // Small wait loop for SDK subscription ID assignment if pending
      let retries = 0;
      let delayedSubId: string | null = null;
      while (retries < 6) {
        await new Promise((res) => setTimeout(res, 500));
        delayedSubId = window.OneSignal.User?.PushSubscription?.id || null;
        if (delayedSubId) break;
        retries++;
      }

      if (!delayedSubId) {
        return {
          success: false,
          state: 'error',
          error: 'No se pudo obtener el ID de suscripción de OneSignal. Intenta nuevamente.'
        };
      }

      await syncDeviceToDatabase(userId, delayedSubId, true, vendorId);
      return { success: true, state: 'granted', subscriptionId: delayedSubId };
    }

    // 5. Sync device record to user_notification_devices table
    await syncDeviceToDatabase(userId, subscriptionId, true, vendorId);

    return {
      success: true,
      state: 'granted',
      subscriptionId,
    };
  } catch (err: any) {
    console.error('[requestAndRegisterPush Error]:', err);
    return {
      success: false,
      state: 'error',
      error: err.message || 'Ocurrió un error al solicitar permiso o registrar el dispositivo.'
    };
  }
}

/**
 * Unregister / Opt Out CURRENT device ONLY
 */
export async function unregisterCurrentDevice(userId: string): Promise<boolean> {
  try {
    let currentSubscriptionId: string | null = null;

    if (window.OneSignal) {
      currentSubscriptionId = window.OneSignal.User?.PushSubscription?.id || null;
      try {
        await window.OneSignal.User?.PushSubscription?.optOut();
      } catch (optErr) {
        console.warn('[OneSignal optOut Warning]:', optErr);
      }
    }

    if (currentSubscriptionId && userId) {
      // Deactivate only current subscription record
      const { error } = await supabase
        .from('user_notification_devices')
        .update({ active: false, last_seen_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider_subscription_id', currentSubscriptionId);

      if (error) {
        console.error('[Deactivate Current Device DB Error]:', error.message);
      }
    }

    return true;
  } catch (err) {
    console.error('[unregisterCurrentDevice Error]:', err);
    return false;
  }
}

/**
 * Fetch active devices registered for user
 */
export async function getUserDevices(userId: string): Promise<DeviceSubscriptionRecord[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_notification_devices')
    .select('id, user_id, vendor_id, provider, provider_subscription_id, device_name, active, created_at, last_seen_at')
    .eq('user_id', userId)
    .eq('active', true);

  if (error || !data) return [];
  return data as DeviceSubscriptionRecord[];
}

/**
 * Backward compatibility export aliases
 */
export const requestAndRegisterDevice = async (userId: string, vendorId: string | null = null) => {
  const res = await requestAndRegisterPush(userId, vendorId);
  return {
    success: res.success,
    permission: (res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : res.state === 'not_supported' ? 'not_supported' : 'default') as PushPermissionState,
    subscriptionId: res.subscriptionId,
    error: res.error,
  };
};

export const unregisterDevice = unregisterCurrentDevice;
export const getBrowserPermission = getRawBrowserPermission;
