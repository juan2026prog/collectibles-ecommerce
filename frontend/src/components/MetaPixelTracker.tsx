import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, generateMetaEventId, initPixel } from '../lib/meta/metaPixel';
import { sendMetaCapiEvent } from '../lib/meta/metaCapi';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function MetaPixelTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const lastPathname = useRef('');

  useEffect(() => {
    const fetchAndInit = async () => {
      let userData = {};
      if (user?.email) {
        userData = { em: user.email.toLowerCase() };
        try {
          const { data } = await supabase.from('profiles').select('phone, first_name, last_name').eq('id', user.id).single();
          if (data) {
            if (data.phone) (userData as any).ph = data.phone.replace(/\D/g, '');
            if (data.first_name) (userData as any).fn = data.first_name.toLowerCase();
            if (data.last_name) (userData as any).ln = data.last_name.toLowerCase();
          }
        } catch (e) {
          // ignore
        }
      }
      (window as any)._metaUserData = userData;
      initPixel(userData);

      const currentPath = location.pathname + location.search;
      
      // Primera carga: El browser ya mandó el evento vía index.html, solo disparamos CAPI
      if ((window as any)._metaInitialEventId) {
        const initialId = (window as any)._metaInitialEventId;
        delete (window as any)._metaInitialEventId;
        lastPathname.current = currentPath;
        sendMetaCapiEvent(initialId, 'PageView', undefined, userData);
        return;
      }

      // Evitar disparar dos veces si solo cambia el usuario
      if (lastPathname.current === currentPath) return;
      lastPathname.current = currentPath;
      
      const eventId = generateMetaEventId('pageview');
      trackPageView(eventId, userData);
    };

    fetchAndInit();
  }, [location.pathname, location.search, user]);

  return null;
}
