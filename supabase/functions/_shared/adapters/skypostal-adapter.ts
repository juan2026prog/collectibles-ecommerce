// supabase/functions/_shared/adapters/skypostal-adapter.ts

import { ShippingAdapter, ShipmentResult } from './shipping-adapter.ts';
import {
  SkyPostalClient,
  buildSkyPostalShipmentRequest,
  resolveSkyPostalConfig,
  sanitizeProviderPayload
} from '../skypostal/index.ts';

export class SkyPostalAdapter implements ShippingAdapter {
  /**
   * Validate credentials/configuration
   */
  validateConfig(creds: any): boolean {
    if (!creds) return false;
    // In test/sandbox, minimal config is allowed
    if (creds.isSandbox || creds.environment === 'test') return true;
    return !!(creds.apiKey || (creds.username && creds.password));
  }

  /**
   * Check if a shipment already exists for this order/suborder to enforce idempotency
   */
  async checkExistingShipment(
    supabaseClient: any,
    orderId: string,
    _creds: any
  ): Promise<ShipmentResult | null> {
    try {
      const { data: existingShipment } = await supabaseClient
        .from('shipments')
        .select('*')
        .or(`order_id.eq.${orderId},suborder_id.eq.${orderId}`)
        .not('tracking_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingShipment && existingShipment.tracking_code) {
        console.log(`[SkyPostal Adapter] Found existing guide for order ${orderId}: ${existingShipment.tracking_code}`);
        return {
          success: true,
          trackingCode: existingShipment.tracking_code,
          externalGuide: existingShipment.external_guide || undefined,
          labelUrl: existingShipment.shipping_label_url || undefined,
          labelPath: existingShipment.shipping_label_path || undefined,
          rawResponse: {
            resolved_existing: true,
            shipment_id: existingShipment.id,
            tracking_code: existingShipment.tracking_code
          }
        };
      }
    } catch (err: any) {
      console.error('[SkyPostal Adapter] Error in checkExistingShipment:', err.message);
    }
    return null;
  }

  /**
   * Create shipment using SkyPostalClient
   */
  async createShipment(
    supabaseClient: any,
    orderId: string,
    creds: any,
    shippingAddress: any,
    weight: number,
    quantity: number,
    observations?: string,
    recipientInfo?: { name: string; phone: string }
  ): Promise<ShipmentResult> {
    try {
      // 1. Resolve country & market status
      const countryCode = (shippingAddress?.country_code || shippingAddress?.country || 'CL').toUpperCase();
      const { data: market } = await supabaseClient
        .from('international_markets')
        .select('*')
        .eq('country_code', countryCode)
        .maybeSingle();

      const isPreview = market ? market.market_status === 'PREVIEW' : false;

      // 2. Initialize SkyPostalClient
      const client = new SkyPostalClient({
        credentials: creds || {},
        environment: creds?.environment || 'test',
        isDryRun: isPreview || creds?.isSandbox !== false
      });

      // 3. Build request payload
      const shipmentRequest = buildSkyPostalShipmentRequest(
        orderId,
        orderId,
        shippingAddress,
        weight,
        quantity,
        50.0,
        observations,
        recipientInfo
      );

      // 4. Create shipment via Client (dry-run/mock in Phase 1)
      const res = await client.createShipment(shipmentRequest, isPreview);

      if (!res.success) {
        return {
          success: false,
          error: res.error || 'Failed to register SkyPostal shipment'
        };
      }

      return {
        success: true,
        trackingCode: res.trackingNumber,
        externalGuide: res.externalGuide,
        labelUrl: res.labelUrl,
        labelPath: res.labelPath,
        rawResponse: sanitizeProviderPayload(res.rawResponse || res)
      };

    } catch (err: any) {
      console.error('[SkyPostal Adapter Error]:', err.message);
      return {
        success: false,
        error: err.message || String(err)
      };
    }
  }
}
