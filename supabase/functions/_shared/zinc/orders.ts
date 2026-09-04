// supabase/functions/_shared/zinc/orders.ts
// Order adapter, integer cents conversion, and production safety gate for Zinc V2

import { ZincAddress, ZincOrderCreatePayload, ZincOrderProduct } from "./types.ts";

/**
 * Converts USD decimal currency to integer cents.
 * e.g. 42.37 -> 4237, 0.01 -> 1, 0 -> 0.
 */
export function dollarsToCents(amountUsd: number): number {
  if (typeof amountUsd !== "number" || isNaN(amountUsd) || amountUsd < 0) {
    return 0;
  }
  return Math.round(amountUsd * 100);
}

/**
 * Converts integer cents to USD decimal.
 * e.g. 4237 -> 42.37.
 */
export function centsToDollars(cents: number): number {
  if (typeof cents !== "number" || isNaN(cents) || cents <= 0) {
    return 0;
  }
  return Number((cents / 100).toFixed(2));
}

/**
 * Adapts internal shipping address into Zinc V2 Address schema.
 * Replaces legacy zip_code with postal_code, address_line_1 with address_line1.
 */
/**
 * Adapts and strictly validates internal shipping address into Zinc V2 Address schema.
 * 
 * Strict Validation:
 * - Eliminates fake fallbacks (no "Cliente", no ".", no "206-555-0100").
 * - Requires first_name, last_name, address_line1, city, postal_code, phone_number.
 * - Requires state for US shipments.
 * - Throws descriptive error if any required component is missing.
 */
export function buildZincAddress(shipping: Record<string, any>): ZincAddress {
  if (!shipping || typeof shipping !== "object") {
    throw new Error("Dirección de envío no provista o inválida.");
  }

  const recipientName = String(
    shipping.international_recipient_name || 
    shipping.full_name || 
    shipping.name || 
    ""
  ).trim();
  
  const nameParts = recipientName.split(/\s+/).filter(Boolean);
  const firstName = (shipping.first_name || nameParts[0] || "").trim();
  const lastName = (shipping.last_name || nameParts.slice(1).join(" ") || "").trim();

  if (!firstName) {
    throw new Error("Dirección de envío inválida: nombre del destinatario faltante (first_name requerido).");
  }
  if (!lastName) {
    throw new Error("Dirección de envío inválida: apellido del destinatario faltante (last_name requerido).");
  }

  const line1 = String(
    shipping.international_address_line_1 || 
    shipping.address_line1 || 
    shipping.address || 
    ""
  ).trim();

  if (!line1) {
    throw new Error("Dirección de envío inválida: línea 1 de dirección faltante (address_line1 requerido).");
  }
  
  const line2Parts = [
    shipping.international_address_line_2 || shipping.address_line2,
    shipping.international_customer_code || shipping.customer_code
  ].filter(Boolean);
  const line2 = line2Parts.join(" ").trim() || null;

  const city = String(shipping.international_city || shipping.city || "").trim();
  if (!city) {
    throw new Error("Dirección de envío inválida: ciudad faltante (city requerida).");
  }

  const country = String(shipping.international_country || shipping.country || "US").trim().toUpperCase();
  const state = String(shipping.international_state || shipping.state || "").trim() || null;

  if (country === "US" && !state) {
    throw new Error("Dirección de envío inválida: estado/provincia faltante para envíos dentro de Estados Unidos (state requerido para US).");
  }

  const postalCode = String(
    shipping.international_postal_code || 
    shipping.postal_code || 
    shipping.zip_code || 
    ""
  ).trim();

  if (!postalCode) {
    throw new Error("Dirección de envío inválida: código postal faltante (postal_code requerido).");
  }
  
  const phone = String(
    shipping.international_phone || 
    shipping.phone_number || 
    shipping.phone || 
    ""
  ).trim();

  if (!phone) {
    throw new Error("Dirección de envío inválida: teléfono de contacto faltante (phone_number requerido).");
  }

  return {
    first_name: firstName,
    last_name: lastName,
    address_line1: line1,
    address_line2: line2,
    city,
    state,
    postal_code: postalCode,
    phone_number: phone,
    country: country || "US",
  };
}

/**
 * Server-side hard gate to prevent accidental real purchases in production.
 * Must be checked before every POST /orders call.
 */
export function assertProductionGate(apiKey: string, productionEnabled: boolean): void {
  if (apiKey.startsWith("zn_live_")) {
    if (productionEnabled !== true) {
      throw new Error("[SECURITY GATE] Compras reales con Zinc Production están estrictamente bloqueadas (zinc_production_enabled = false).");
    }
  }
}

/**
 * Builds compliant Zinc V2 OrderCreate request payload.
 * No top-level retailer, no payment_method, max_price in integer cents.
 */
export function buildZincOrderPayload(params: {
  productUrl: string;
  quantity: number;
  shippingAddress: ZincAddress;
  maxPriceUsd: number;
  idempotencyKey: string;
  poNumber?: string;
  metadata?: Record<string, unknown>;
}): ZincOrderCreatePayload {
  const maxPriceCents = dollarsToCents(params.maxPriceUsd);
  if (maxPriceCents <= 0) {
    throw new Error("max_price must be greater than 0 cents");
  }

  // Idempotency key must be string up to 36 chars
  const key = String(params.idempotencyKey || "").trim().slice(0, 36);
  if (!key) {
    throw new Error("idempotency_key is required for Zinc V2 order creation");
  }

  const products: ZincOrderProduct[] = [{
    url: params.productUrl,
    quantity: Math.max(1, params.quantity || 1),
  }];

  return {
    products,
    shipping_address: params.shippingAddress,
    max_price: maxPriceCents,
    idempotency_key: key,
    po_number: params.poNumber || undefined,
    metadata: params.metadata || undefined,
  };
}
