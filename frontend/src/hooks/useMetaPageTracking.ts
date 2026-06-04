import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, initPixel, generateMetaEventId } from '../lib/meta/metaPixel';

export function useMetaPageTracking() {
  const location = useLocation();

  useEffect(() => {
    // Inicializar pixel en el primer montaje o cuando cambie el location
    initPixel();

    // Disparar PageView
    const eventId = generateMetaEventId('pageview');
    trackPageView(eventId);
  }, [location.pathname, location.search]); 
}
