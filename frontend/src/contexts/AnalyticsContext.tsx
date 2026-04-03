import React, { createContext, useContext, useEffect, useCallback } from 'react';

interface AnalyticsContextType {
  trackEvent: (eventName: string, params?: Record<string, any>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    console.warn('Analytics Context not found. Event tracking will be disabled.');
    return { trackEvent: () => {} };
  }
  return context;
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pixelId = import.meta.env.VITE_META_PIXEL_ID;

  useEffect(() => {
    if (!pixelId || (window as any).fbq) return;

    // 1. Initial Meta Pixel Code
    (function (f, b, e, v, n, t, s) {
      if ((f as any).fbq) return;
      n = (f as any).fbq = function () {
        (n as any).callMethod ? (n as any).callMethod.apply(n, arguments) : (n as any).queue.push(arguments);
      };
      if (!(f as any)._fbq) (f as any)._fbq = n;
      (n as any).push = n;
      (n as any).loaded = !0;
      (n as any).version = '2.0';
      (n as any).queue = [];
      t = b.createElement(e);
      (t as any).async = !0;
      (t as any).src = v;
      s = b.getElementsByTagName(e)[0];
      (s as any).parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    (window as any).fbq('init', pixelId);
    (window as any).fbq('track', 'PageView');

    console.log(`[Analytics] Meta Pixel Initialized: ${pixelId}`);
  }, [pixelId]);

  const trackEvent = useCallback((eventName: string, params?: Record<string, any>) => {
    if ((window as any).fbq) {
      (window as any).fbq('track', eventName, params);
      console.log(`[Analytics] Tracked Event: ${eventName}`, params);
    }
    
    // Fallback or additional trackers (e.g., GA4, Mixpanel) could be added here
  }, []);

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
