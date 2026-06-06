import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react';

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

    if (import.meta.env.DEV) console.log(`[Analytics] Meta tracking managed by MetaPixelTracker`);
  }, [pixelId]);

  const trackEvent = useCallback((eventName: string, params?: Record<string, any>) => {
    if ((window as any).fbq) {
      (window as any).fbq('track', eventName, params);
      if (import.meta.env.DEV) console.log(`[Analytics] Tracked Event: ${eventName}`, params);
    }
    
    // Fallback or additional trackers (e.g., GA4, Mixpanel) could be added here
  }, []);

  const value = useMemo(() => ({ trackEvent }), [trackEvent]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}
