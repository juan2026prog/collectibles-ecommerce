import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView, generateMetaEventId, initPixel } from '../lib/meta/metaPixel';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function MetaPixelTracker() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // If we have a user, fetch their profile to send enhanced matching data
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
      
      const eventId = generateMetaEventId('pageview');
      trackPageView(eventId, userData);
    };

    fetchAndInit();
  }, [location.pathname, location.search, user]);

  return null;
}
