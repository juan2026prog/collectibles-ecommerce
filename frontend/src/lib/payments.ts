import { supabase } from './supabase';

interface CreatePaymentParams {
  provider: 'dlocal' | 'paypal' | 'mercadopago';
  amount: number;
  currency: string;
  order_id?: string;
  customer: {
    name: string;
    email: string;
    address?: string;
    phone?: string;
  };
  items: any[];
  bank_promo?: {
    promo_id: string;
    bank_name: string;
    discount_value: number;
    discount_amount: number;
  };
}

// Derive from environment variables instead of hardcoding
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-payment`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export async function createCheckoutSession(params: CreatePaymentParams) {
  console.log('[Payments] Calling Edge Function directly via fetch...');
  
  // Get the user's JWT token if logged in — this allows the backend to set customer_id
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token || ANON_KEY;
  
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  console.log('[Payments] Response status:', response.status, 'Body:', data);

  if (!response.ok) {
    throw new Error(`Error del servidor (${response.status}): ${JSON.stringify(data)}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.checkout_url) {
    window.location.href = data.checkout_url;
  } else {
    throw new Error('URL de checkout no recibida del servidor');
  }
}
