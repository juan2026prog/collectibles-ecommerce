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
  payment_method: 'dlocalgo' | 'paypal' | 'mercadopago' | 'handy';
  currency: string;
  shipping_method: 'delivery' | 'pickup' | 'dac' | 'dac_home' | 'dac_agency';
  shipping_address: {
    first_name: string;
    last_name: string;
    street?: string;
    apartment?: string;
    city?: string;
    department?: string;
    postal_code?: string;
    country: string;
    barrio?: string;
    reference?: string;
    ci?: string;
  };
  customer_email: string;
  customer_phone?: string;
  bank_promo?: {
    promo_id: string;
  };
  terms_accepted: boolean;
  terms_accepted_at: string;
  accepted_terms_version: string;
}

interface StartPaymentParams {
  provider: 'dlocal' | 'dlocalgo' | 'paypal' | 'mercadopago' | 'handy';
  order_id: string;
  customer_email: string;
}

interface StartPaymentResult {
  redirectUrl?: string;
  data: any;
}

export interface PublicPaymentProvider {
  provider_key: string;
  name: string;
  is_active: boolean;
  status: string;
  environment: string;
  checkout_text: string;
  default_image_url: string;
  currency: number;
  response_type: string;
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
  console.log("createCheckoutOrder initiating with fetch...");
  try {
    const response = await fetch(CREATE_ORDER_URL, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(params),
    });

    const text = await response.text();
    console.log("create-order raw response:", response.status, text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse create-order JSON response:", e);
      throw new Error(`Respuesta no válida del servidor (${response.status}): ${text}`);
    }

    if (!response.ok) {
      console.error("create-order server error:", response.status, data);
      throw new Error(data?.error || `Error del servidor (${response.status}): ${text}`);
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
  } catch (error: any) {
    console.error("create-order error full:", error);
    console.error("create-order error context:", {
      name: error?.name,
      message: error?.message,
      status: error?.status || error?.context?.status,
      body: error?.body || error?.context?.body,
    });
    throw error;
  }
}

export async function startCheckoutPayment(params: StartPaymentParams): Promise<StartPaymentResult> {
  if (params.provider === 'handy') {
    console.log("calling create-handy-payment with order_id:", params.order_id);
    const { data, error } = await supabase.functions.invoke("create-handy-payment", {
      body: {
        order_id: params.order_id,
        customer_email: params.customer_email,
      },
    });

    console.log("payment provider response:", data);

    if (error) {
      console.error("Error Edge Function:", error);
      throw new Error(error.message || "No se pudo crear el pago con Handy");
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    const paymentUrl = data?.url || data?.payment_url;
    if (!paymentUrl) {
      throw new Error("Handy no devolvió URL de pago");
    }

    return {
      redirectUrl: paymentUrl,
      data,
    };
  }

  const endpoint = CREATE_PAYMENT_URL;
  const payload = {
    ...params,
    provider: params.provider === 'dlocalgo' ? 'dlocal' : params.provider
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Respuesta no válida del proveedor (${response.status}): ${text}`);
  }

  console.log("payment provider response:", data);

  if (!response.ok) {
    throw new Error(`Error del servidor (${response.status}): ${JSON.stringify(data)}`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  const checkoutUrl = data.checkout_url || data.payment_url;
  if (!checkoutUrl) {
    throw new Error('URL de checkout no recibida del servidor');
  }

  return {
    redirectUrl: checkoutUrl,
    data,
  };
}

export async function getPublicPaymentProviders() {
  try {
    const { data, error } = await supabase.rpc('get_public_payment_providers');
    if (error) {
      console.warn("RPC get_public_payment_providers missing or failed, using robust frontend fallback:", error);
      return getFallbackProviders();
    }
    return (data || []) as PublicPaymentProvider[];
  } catch (err) {
    console.warn("RPC get_public_payment_providers failed, using robust frontend fallback:", err);
    return getFallbackProviders();
  }
}

function getFallbackProviders(): PublicPaymentProvider[] {
  return [
    {
      provider_key: 'mercadopago',
      name: 'Mercado Pago',
      is_active: true,
      status: 'active',
      environment: 'production',
      checkout_text: 'Pagar con Mercado Pago',
      default_image_url: '',
      currency: 858,
      response_type: 'Json'
    },
    {
      provider_key: 'dlocalgo',
      name: 'dLocal Go',
      is_active: true,
      status: 'active',
      environment: 'production',
      checkout_text: 'Pagar con tarjeta de crédito/débito',
      default_image_url: '',
      currency: 858,
      response_type: 'Json'
    },
    {
      provider_key: 'paypal',
      name: 'PayPal',
      is_active: true,
      status: 'active',
      environment: 'production',
      checkout_text: 'Pagar con PayPal',
      default_image_url: '',
      currency: 858,
      response_type: 'Json'
    },
    {
      provider_key: 'handy',
      name: 'Handy Botón de Pago',
      is_active: true,
      status: 'active',
      environment: 'testing',
      checkout_text: 'Pagar con Handy',
      default_image_url: '',
      currency: 858,
      response_type: 'Json'
    }
  ];
}
