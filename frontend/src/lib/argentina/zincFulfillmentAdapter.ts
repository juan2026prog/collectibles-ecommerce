// frontend/src/lib/argentina/zincFulfillmentAdapter.ts
/**
 * International Purchase Adapter for Zinc API & Central Miami Suite
 * 
 * Rules:
 * 1. Collectibles Argentina purchases use the SINGLE Pixel & Codes suite in Miami.
 * 2. CUIT / Document is attached to the recipient reference / notes.
 * 3. Never triggers automated purchases before validated payment.
 */

import { PIXEL_CODES_MIAMI_SUITE, buildMiamiFulfillmentAddress } from './suiteConfig';

export interface ZincFulfillmentPayload {
  order_id: string;
  order_number: string;
  customer_full_name: string;
  customer_document_number: string;
  items: Array<{
    asin: string;
    quantity: number;
    max_price_usd?: number;
  }>;
  destination_city: string;
  destination_province: string;
}

export function buildZincOrderRequest(payload: ZincFulfillmentPayload) {
  const miamiAddress = buildMiamiFulfillmentAddress(
    payload.customer_full_name,
    payload.customer_document_number
  );

  return {
    client_notes: {
      collectibles_order_id: payload.order_id,
      collectibles_order_number: payload.order_number,
      recipient_cuit: payload.customer_document_number,
      final_destination: `${payload.destination_city}, ${payload.destination_province}, Argentina`,
      courier_hub: 'Deblex Miami Central Suite',
    },
    shipping_address: {
      first_name: miamiAddress.firstName,
      last_name: miamiAddress.lastName,
      address_line1: miamiAddress.addressLine1,
      address_line2: miamiAddress.addressLine2,
      city: miamiAddress.city,
      state: miamiAddress.state,
      zip_code: miamiAddress.zipCode,
      country: miamiAddress.country,
      phone_number: miamiAddress.phoneNumber,
    },
    products: payload.items.map(item => ({
      product_id: item.asin,
      quantity: item.quantity,
    })),
  };
}
