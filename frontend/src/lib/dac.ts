import { supabase } from './supabase';

export interface DacProvider {
  id?: string;
  provider_key: string;
  provider_name: string;
  is_active: boolean;
  environment: 'uat' | 'production';
  api_url: string;
  username: string;
  password_encrypted?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DacShipment {
  id: string;
  order_id: string;
  provider_key: string;
  tracking_code: string | null;
  external_guide: string | null;
  destination_office: string | null;
  shipping_status: 'documented' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'rejected';
  shipping_label_url: string | null;
  shipping_label_base64: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  customer_department: string;
  package_weight: number;
  package_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface CreateShipmentInput {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  customer_department: string;
  package_weight: number;
  package_quantity: number;
  observations?: string;
}

/**
 * Fetch DAC Provider Configuration
 */
export async function getDacProvider(): Promise<DacProvider | null> {
  const { data, error } = await supabase
    .from('delivery_providers_admin')
    .select('id, provider_key, provider_name, is_active, environment, api_url, username')
    .eq('provider_key', 'dac')
    .maybeSingle();

  if (error) {
    console.error('Error fetching DAC provider:', error.message);
    throw error;
  }
  return data;
}

/**
 * Update DAC Provider Configuration
 */
export async function updateDacProvider(updates: Partial<DacProvider>): Promise<DacProvider> {
  const { data, error } = await supabase
    .from('delivery_providers')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('provider_key', 'dac')
    .select('id, provider_key, provider_name, is_active, environment, api_url, username')
    .single();

  if (error) {
    console.error('Error updating DAC provider:', error.message);
    throw error;
  }
  return data;
}

/**
 * Test Connection (Invokes the dac-login edge function)
 */
export async function testDacConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('dac-login', {
      method: 'POST'
    });

    if (error) {
      return { success: false, error: error.message || 'Error invoking connection test function' };
    }
    
    if (data && data.success) {
      return { success: true };
    } else {
      return { success: false, error: data?.error || 'Connection failed' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Connection failed' };
  }
}

/**
 * Get shipment details by Order ID
 */
export async function getShipmentByOrderId(orderId: string): Promise<DacShipment | null> {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('order_id', orderId)
    .eq('provider_key', 'dac')
    .maybeSingle();

  if (error) {
    console.error('Error fetching shipment by order ID:', error.message);
    throw error;
  }
  return data;
}

/**
 * Create DAC Shipment
 */
export async function createDacShipment(input: CreateShipmentInput): Promise<{
  success: boolean;
  shipment?: DacShipment;
  trackingCode?: string;
  labelUrl?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('dac-create-shipment', {
      method: 'POST',
      body: input
    });

    if (error) {
      return { success: false, error: error.message || 'Error invoking create shipment function' };
    }

    if (data && data.success) {
      return {
        success: true,
        shipment: data.shipment,
        trackingCode: data.trackingCode,
        labelUrl: data.labelUrl
      };
    } else {
      return { success: false, error: data?.error || 'Failed to create shipment' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to create shipment' };
  }
}

/**
 * Regenerate / Retrieve label PDF
 */
export async function getDacLabel(orderId: string): Promise<{ success: boolean; labelUrl?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('dac-get-label', {
      method: 'POST',
      body: { order_id: orderId }
    });

    if (error) {
      return { success: false, error: error.message || 'Error invoking label function' };
    }

    if (data && data.success) {
      return { success: true, labelUrl: data.labelUrl };
    } else {
      return { success: false, error: data?.error || 'Failed to retrieve label' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to retrieve label' };
  }
}

/**
 * Track shipment
 */
export async function trackDacShipment(orderId: string): Promise<{
  success: boolean;
  status?: string;
  rawStatus?: string;
  description?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('dac-track-shipment', {
      method: 'POST',
      body: { order_id: orderId }
    });

    if (error) {
      return { success: false, error: error.message || 'Error invoking track function' };
    }

    if (data && data.success) {
      return {
        success: true,
        status: data.status,
        rawStatus: data.rawStatus,
        description: data.description
      };
    } else {
      return { success: false, error: data?.error || 'Failed to track shipment' };
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to track shipment' };
  }
}
