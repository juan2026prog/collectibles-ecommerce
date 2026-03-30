import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function useReferralTracking() {
  const location = useLocation();

  useEffect(() => {
    const trackReferral = async () => {
      const searchParams = new URLSearchParams(location.search);
      const refCode = searchParams.get('ref');

      if (refCode) {
        // 1. Store locally for attribution on checkout
        localStorage.setItem('active_referral_code', refCode);

        try {
          // 2. Resolve affiliate_id from code
          const { data: affiliate } = await supabase
            .from('affiliates')
            .select('id')
            .eq('code', refCode)
            .single();

          if (affiliate?.id) {
            // 3. Register the click in standard traffic tracking
            const sessionId = localStorage.getItem('session_id') || crypto.randomUUID();
            localStorage.setItem('session_id', sessionId);

            await supabase.from('affiliate_clicks').insert({
              affiliate_id: affiliate.id,
              source: document.referrer || 'direct',
              session_id: sessionId,
              ip_address: 'client' // usually captured server-side via Edge Function or PostgREST headers
            });
            console.log('Referral tracked automatically.');
          }
        } catch (err) {
          console.error('Failed to track referral:', err);
        }
      }
    };

    trackReferral();
  }, [location.search]);
}
