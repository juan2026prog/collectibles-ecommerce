import { useEffect } from 'react';

/**
 * Injects Meta Pixel script into the head if VITE_META_PIXEL_ID is present.
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pixelId = import.meta.env.VITE_META_PIXEL_ID;

  useEffect(() => {
    if (!pixelId || (window as any).fbq) return;

    // 1. Initial Meta Pixel Code
    !(function (f, b, e, v, n, t, s) {
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
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    (window as any).fbq('init', pixelId);
    (window as any).fbq('track', 'PageView');

    console.log(`[Analytics] Pixel Initialized: ${pixelId}`);
  }, [pixelId]);

  return <>{children}</>;
}
