interface CreatePaymentParams {
  provider: 'dlocal' | 'paypal';
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

const EDGE_FUNCTION_URL = 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/create-payment';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

export async function createCheckoutSession(params: CreatePaymentParams) {
  console.log('[Payments] Calling Edge Function directly via fetch...');
  
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
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

