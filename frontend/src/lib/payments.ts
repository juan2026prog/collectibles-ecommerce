import { supabase } from './supabase';
import { withRecoverableCheckout } from './checkout-recovery';

interface CreateOrderParams {
  items: Array<{
    product_id: string;
    variant_id?: string;
    vendor_id?: string;
    vendor_store_id?: string;
    quantity: number;
    price: number;
    title?: string;
  }>;
  coupon_code?: string;
  affiliate_code?: string;
  reservation_id?: string;
  payment_method: 'dlocalgo' | 'paypal' | 'mercadopago' | 'handy';
  currency: string;
  shipping_method: 'delivery' | 'pickup' | 'dac' | 'dac_home' | 'dac_agency' | 'ues' | 'correo_uruguayo' | 'manual' | 'international_courier_direct';
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
    recipient_type?: 'person' | 'company';
    dni?: string;
    cuit?: string;
    razon_social?: string;
    street_number?: string;
    logistics_consent?: boolean;
  };
  logistics_consent?: boolean;
  customer_email: string;
  customer_phone?: string;
  bank_promo?: {
    promo_id: string;
  };
  terms_accepted: boolean;
  terms_accepted_at: string;
  accepted_terms_version: string;
  email_opt_in?: boolean;
  whatsapp_opt_in?: boolean;
  suborders_shipping?: Record<string, {
    shipping_method: 'delivery' | 'pickup' | 'dac' | 'dac_home' | 'dac_agency' | 'ues' | 'correo_uruguayo' | 'manual' | 'international_courier_direct';
    dac_office_id?: string | null;
    dac_k_oficina_destino?: number | null;
    dac_office_name?: string;
    dac_office_address?: string;
    ci?: string;
  }>;
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

const env = (typeof import.meta !== 'undefined' && import.meta?.env) ? import.meta.env : (process.env as any) || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const CREATE_ORDER_URL = `${SUPABASE_URL}/functions/v1/create-order`;
const CREATE_PAYMENT_URL = `${SUPABASE_URL}/functions/v1/create-payment`;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

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
  if(params.payment_method === 'mercadopago') {
    const {data:{session}}=await supabase.auth.getSession();
    return withRecoverableCheckout({...params,customer_scope:session?.user?.id || 'guest'},async requestKey => createCheckoutOrderRequest(params,requestKey));
  }
  if(localStorage.getItem('mp_checkout_recovery_v1')) throw new Error('Hay un intento de Mercado Pago pendiente. Revisá esa orden antes de iniciar otro pago.');
  return (await createCheckoutOrderRequest(params)).order;
}

async function createCheckoutOrderRequest(params:CreateOrderParams,requestKey?:string) {
  console.log("createCheckoutOrder initiating with fetch...");
  try {
    const response = await fetch(CREATE_ORDER_URL, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({...params,checkout_request_key:requestKey}),
      signal:AbortSignal.timeout(60000),
    });

    const text = await response.text();
    console.info('checkout_order_response',{http_status:response.status});

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
      if (data.order_token && data.order.id) {
        sessionStorage.setItem(`order_token_${data.order.id}`, data.order_token);
      }
    } catch {
      // Ignore storage failures; the payment flow can continue without local cache.
    }

    return {order:data.order,order_token:data.order_token};
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

  const paymentStarted=performance.now();
  const authStarted=performance.now();
  const authHeaders=await getAuthHeaders();
  const authDuration=performance.now()-authStarted;
  const endpoint = CREATE_PAYMENT_URL;
  const guestOrderToken = sessionStorage.getItem(`order_token_${params.order_id}`) || undefined;
  const payload = {
    ...params,
    provider: params.provider === 'dlocalgo' ? 'dlocal' : params.provider,
    order_token: guestOrderToken,
  };
  let response:Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: authHeaders, body: JSON.stringify(payload),signal:AbortSignal.timeout(60000),
    });
  } catch {
    console.info('payment_frontend_timing',{duration_ms:Math.round(performance.now()-paymentStarted),outcome:'response_unavailable'});
    throw new Error('La respuesta del pago demoró o se interrumpió. Conservamos la orden; verificá el intento antes de volver a pagar.');
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Respuesta no válida del proveedor (${response.status}): ${text}`);
  }

  console.info('payment_frontend_timing',{request_id:response.headers.get('X-Payment-Request-Id')||data.request_id,
    duration_ms:Math.round(performance.now()-paymentStarted),auth_ms:Math.round(authDuration),server_timing:response.headers.get('Server-Timing'),http_status:response.status});

  if (!response.ok) {
    throw new Error(data?.error || `No se pudo verificar el pago (${response.status}). Conservá esta orden antes de reintentar.`);
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
      console.warn("RPC get_public_payment_providers missing or failed:", error);
      return [];
    }
    return (data || []) as PublicPaymentProvider[];
  } catch (err) {
    console.warn("RPC get_public_payment_providers failed:", err);
    return [];
  }
}

export function isOrderPaymentApproved(order: any): boolean {
  if (!order) return false;

  const paymentStatus = String(order.payment_status || '').toLowerCase().trim();
  const processedAt = order.payment_processed_at;

  const isValidStatus = ['approved', 'paid', 'accredited'].includes(paymentStatus);
  const hasProcessedAt = Boolean(processedAt);

  // Strict payment certification: requires valid approved status AND payment_processed_at timestamp.
  // Never authorizes based on operational order.status alone (e.g. shipped, delivered).
  return isValidStatus && hasProcessedAt;
}

export function isRealPaidOrder(order: any): boolean {
  if (!order) return false;

  if (!isOrderPaymentApproved(order)) return false;
  
  // Check main status
  const invalidStatuses = ['cancelled', 'cancelada', 'refunded', 'partially_refunded', 'failed', 'rejected', 'pending'];
  if (order.status && invalidStatuses.includes(order.status)) return false;
  
  // Check test order flag
  if (order.is_test_order) return false;
  
  // Check mock references
  const checkMock = (val: string | null | undefined) => {
    if (!val) return false;
    const lower = val.toLowerCase();
    return lower.includes('mock') || lower.includes('test') || lower.includes('demo') || lower.includes('sandbox');
  };
  
  if (checkMock(order.payment_provider_reference)) return false;
  if (checkMock(order.payment_provider)) return false;
  if (checkMock(order.payment_method)) return false;
  if (checkMock(order.payment_id)) return false;
  
  return true;
}
