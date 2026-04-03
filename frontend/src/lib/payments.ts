import { supabase } from './supabase';

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
}

export async function createCheckoutSession(params: CreatePaymentParams) {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: params
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error('URL de checkout no recibida');
    }
  } catch (err: any) {
    console.error('Error creating checkout:', err.message);
    throw err;
  }
}
