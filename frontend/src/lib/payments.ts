import { supabase } from './supabase';

interface CreateOrderParams {
  items: Array<{
    product_id: string;
    variant_id?: string;
    quantity: number;
    price: number;
    title?: string;
  }>;
  coupon_code?: string;
  affiliate_code?: string;
  payment_method: 'dlocalgo' | 'paypal' | 'mercadopago';
  currency: string;
  shipping_method: 'delivery' | 'pickup';
  shipping_address: {
    first_name: string;
    last_name: string;
    street?: string;
    apartment?: string;
    city?: string;
    department?: string;
    postal_code?: string;
    country: string;
  };
  customer_email: string;
  customer_phone?: string;
  bank_promo?: {
    promo_id: string;
  };
}

interface StartPaymentParams {
  provider: 'dlocal' | 'paypal' | 'mercadopago';
  order_id: string;
  customer_email: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const CREATE_ORDER_URL = `${SUPABASE_URL}/functions/v1/create-order`;
const CREATE_PAYMENT_URL = `${SUPABASE_URL}/functions/v1/create-payment`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token || ANON_KEY;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'apikey': ANON_KEY,
  };
}

export async function createCheckoutOrder(params: CreateOrderParams) {
  const response = await fetch(CREATE_ORDER_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error del servidor (${response.status}): ${JSON.stringify(data)}`);
  }
  if (!data.success || !data.order?.id) {
    throw new Error(data.error || 'No se pudo crear la orden');
  }

  try {
    sessionStorage.setItem('pending_checkout_order', JSON.stringify(data.order));
  } catch {
    // Ignore storage failures; the payment flow can continue without local cache.
  }

  return data.order;
}

export async function startCheckoutPayment(params: StartPaymentParams) {
  const response = await fetch(CREATE_PAYMENT_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error del servidor (${response.status}): ${JSON.stringify(data)}`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (!data.checkout_url) {
    throw new Error('URL de checkout no recibida del servidor');
  }

  window.location.href = data.checkout_url;
}
