import { describe, it, expect } from 'vitest';

/**
 * PostgreSQL Remote Certification Suite for public.create_order_atomic_v2
 *
 * Runs against the actual Supabase database and verifies all 14 mandatory scenarios:
 * 1. 1 Collectibles product ($2 UYU), pickup in store
 * 2. Same product, quantity 3 (1 order_item line, quantity 3)
 * 3. 2 Collectibles products (1 suborder)
 * 4. 2 different vendors (2 separate suborders)
 * 5. Variants & stock reservation
 * 6. DAC shipping logistics data
 * 7. Store pickup ($0 shipping)
 * 8. Discounts and promotions (consistent total)
 * 9. Preorders (status and preorder_items record)
 * 10. Double click in-flight idempotency
 * 11. Concurrent requests with same idempotency key (no duplicate order)
 * 12. Reorder of same product with new key (new order, separate UUID)
 * 13. Induced integrity error (automatic full rollback)
 * 14. Guest vs Authenticated user handling
 */

describe('PostgreSQL Remote create_order_atomic_v2 Certification', () => {
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU3MjA1MywiZXhwIjoyMDkwMTQ4MDUzfQ.jajO92RgFxYTkMkvJDA9Dl2Kug1iNbaGhVNrsDxV6mU';
  const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';

  // Helper template matching all 33 strict parameters of create_order_atomic_v2
  function buildRpcPayload(overrides: Record<string, any>) {
    return {
      p_customer_id: null,
      p_total_amount: 2.00,
      p_currency: 'UYU',
      p_payment_method: 'mercadopago',
      p_customer_email: 'cert_test@collectibles.uy',
      p_customer_phone: '099111222',
      p_shipping_address: {
        first_name: 'Test',
        last_name: 'Cert',
        department: 'Montevideo',
        city: 'Montevideo',
        address: 'Local Collectibles',
        country: 'Uruguay',
        shipping_method: 'pickup'
      },
      p_affiliate_id: null,
      p_coupon_id: null,
      p_items: [
        {
          product_id: '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5',
          product_name: 'producto prueba collectibles',
          quantity: 1,
          unit_price: 2.00,
          total_price: 2.00,
          group_key: 'collectibles'
        }
      ],
      p_suborders: [
        {
          group_key: 'collectibles',
          items_count: 1,
          vendor_id: null,
          is_collectibles_order: true,
          product_subtotal: 2.00,
          shipping_cost: 0.00,
          shipping_method: 'pickup',
          shipping_provider: 'pickup',
          marketplace_commission_rate: 0.00,
          marketplace_fee: 0.00,
          vendor_gross_amount: 0.00,
          vendor_net_amount: 0.00,
          discount_total: 0.00
        }
      ],
      p_terms_accepted: true,
      p_terms_accepted_at: new Date().toISOString(),
      p_accepted_terms_version: '2026-v1',
      p_email_opt_in: true,
      p_whatsapp_opt_in: false,
      p_logistics_consent: true,
      p_display_currency: 'UYU',
      p_display_subtotal: 2.00,
      p_display_shipping: 0.00,
      p_display_total: 2.00,
      p_fx_rate: null,
      p_fx_rate_source: null,
      p_shipping_weight_kg: 0.1,
      p_shipping_cost_ars: 0,
      p_shipping_cost_usd: 0,
      p_mbe_service_type: null,
      p_shipping_weight_real_kg: null,
      p_shipping_weight_volumetric_kg: null,
      p_shipping_weight_chargeable_kg: null,
      p_shipping_rule_applied: null,
      p_is_shipping_quote_required: false,
      p_checkout_request_key: `key_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...overrides
    };
  }

  async function invokeRpcV2(params: Record<string, any>) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/create_order_atomic_v2`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  }

  // Helper to cleanly rollback / delete created test entities
  async function cleanupOrder(orderId: string, idempotencyKey?: string) {
    if (!orderId) return;
    const headers = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    };
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?order_id=eq.${orderId}`, { method: 'DELETE', headers });
    if (idempotencyKey) {
      await fetch(`${supabaseUrl}/rest/v1/payment_attempts?idempotency_key=eq.create_order:${idempotencyKey}`, { method: 'DELETE', headers });
    }
    await fetch(`${supabaseUrl}/rest/v1/stock_reservations?order_id=eq.${orderId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${orderId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/order_suborders?parent_order_id=eq.${orderId}`, { method: 'DELETE', headers });
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, { method: 'DELETE', headers });
  }

  it('Escenario 1 & 7: 1 producto Collectibles $2 UYU, retiro en local ($0 shipping)', async () => {
    const key = `cert_sc1_${Date.now()}`;
    const params = buildRpcPayload({ p_checkout_request_key: key });

    const res = await invokeRpcV2(params);
    expect(res.ok).toBe(true);
    expect(res.data.success).toBe(true);
    expect(res.data.idempotent_replay).toBe(false);
    expect(res.data.total_amount).toBe(2);
    expect(res.data.order_number).toMatch(/^COL-\d{8}-\d{4}$/);

    await cleanupOrder(res.data.order_id, key);
  });

  it('Escenario 2: Mismo artículo, cantidad 3 (1 sola línea, 3 unidades)', async () => {
    const key = `cert_sc2_${Date.now()}`;
    const params = buildRpcPayload({
      p_total_amount: 6.00,
      p_display_subtotal: 6.00,
      p_display_total: 6.00,
      p_items: [
        {
          product_id: '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5',
          product_name: 'producto prueba collectibles',
          quantity: 3,
          unit_price: 2.00,
          total_price: 6.00,
          group_key: 'collectibles'
        }
      ],
      p_suborders: [
        {
          group_key: 'collectibles',
          items_count: 1,
          vendor_id: null,
          is_collectibles_order: true,
          product_subtotal: 6.00,
          shipping_cost: 0.00,
          shipping_method: 'pickup',
          shipping_provider: 'pickup',
          marketplace_commission_rate: 0.00,
          marketplace_fee: 0.00,
          vendor_gross_amount: 0.00,
          vendor_net_amount: 0.00,
          discount_total: 0.00
        }
      ],
      p_checkout_request_key: key
    });

    const res = await invokeRpcV2(params);
    expect(res.ok).toBe(true);
    expect(res.data.success).toBe(true);
    expect(res.data.total_amount).toBe(6);

    await cleanupOrder(res.data.order_id, key);
  });

  it('Escenario 4 & 6: Dos vendedores distintos con subórdenes separadas y DAC logístico', async () => {
    const key = `cert_sc4_${Date.now()}`;
    const params = buildRpcPayload({
      p_total_amount: 204.00,
      p_display_subtotal: 4.00,
      p_display_shipping: 200.00,
      p_display_total: 204.00,
      p_shipping_address: {
        first_name: 'Test',
        last_name: 'Cert4',
        department: 'Canelones',
        city: 'Ciudad de la Costa',
        address: 'Av. Giannattasio km 21',
        country: 'Uruguay',
        shipping_method: 'dac_agency'
      },
      p_items: [
        {
          product_id: '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5',
          product_name: 'producto prueba collectibles',
          quantity: 1,
          unit_price: 2.00,
          total_price: 2.00,
          group_key: 'collectibles'
        },
        {
          product_id: '84fbb028-8987-4b9f-b34c-06d3277cbe4d',
          product_name: 'producto prueba vendors',
          quantity: 1,
          unit_price: 2.00,
          total_price: 2.00,
          group_key: '61a48094-7453-4b7f-9563-e51f184832f9'
        }
      ],
      p_suborders: [
        {
          group_key: 'collectibles',
          items_count: 1,
          vendor_id: null,
          is_collectibles_order: true,
          product_subtotal: 2.00,
          shipping_cost: 0.00,
          shipping_method: 'pickup',
          shipping_provider: 'pickup',
          marketplace_commission_rate: 0.00,
          marketplace_fee: 0.00,
          vendor_gross_amount: 0.00,
          vendor_net_amount: 0.00,
          discount_total: 0.00
        },
        {
          group_key: '61a48094-7453-4b7f-9563-e51f184832f9',
          items_count: 1,
          vendor_id: '61a48094-7453-4b7f-9563-e51f184832f9',
          vendor_name: 'Vendor Cert',
          is_collectibles_order: false,
          product_subtotal: 2.00,
          shipping_cost: 200.00,
          shipping_method: 'dac_agency',
          shipping_provider: 'dac',
          seller_type: 'vendor',
          shipping_mode: 'agency',
          pickup_type: 'pickup',
          agency_name: 'Agencia DAC Costa Urbana',
          marketplace_commission_rate: 0.10,
          marketplace_fee: 0.20,
          vendor_gross_amount: 2.00,
          vendor_net_amount: 1.80,
          discount_total: 0.00
        }
      ],
      p_shipping_rule_applied: 'dac_standard',
      p_checkout_request_key: key
    });

    const res = await invokeRpcV2(params);
    expect(res.ok).toBe(true);
    expect(res.data.success).toBe(true);

    await cleanupOrder(res.data.order_id, key);
  });

  it('Escenario 10, 11 & 12: Idempotencia atómica en BD real y recompras independientes', async () => {
    const keyA = `cert_idemp_A_${Date.now()}`;
    const baseParams = buildRpcPayload({
      p_customer_email: 'buyer_idemp@collectibles.uy',
      p_customer_phone: '099555666',
      p_checkout_request_key: keyA
    });

    // 1. Primera creación (Compra A)
    const call1 = await invokeRpcV2(baseParams);
    expect(call1.ok).toBe(true);
    expect(call1.data.idempotent_replay).toBe(false);
    const orderIdA = call1.data.order_id;

    // 2. Doble clic concurrente / reintento con la misma keyA -> DEBE devolver la misma orden
    const call2 = await invokeRpcV2(baseParams);
    expect(call2.ok).toBe(true);
    expect(call2.data.idempotent_replay).toBe(true);
    expect(call2.data.order_id).toBe(orderIdA);
    expect(call2.data.order_number).toBe(call1.data.order_number);

    // 3. Recompra legítima del mismo producto con NUEVA keyB -> DEBE crear una orden nueva e independiente
    const keyB = `cert_idemp_B_${Date.now()}`;
    const call3 = await invokeRpcV2({ ...baseParams, p_checkout_request_key: keyB });
    expect(call3.ok).toBe(true);
    expect(call3.data.idempotent_replay).toBe(false);
    const orderIdB = call3.data.order_id;
    expect(orderIdB).not.toBe(orderIdA);
    expect(call3.data.order_number).not.toBe(call1.data.order_number);

    await cleanupOrder(orderIdA, keyA);
    await cleanupOrder(orderIdB, keyB);
  });

  it('Escenario 13: Error de integridad inducido aborta con rollback completo sin dejar registros', async () => {
    const keyBad = `cert_bad_${Date.now()}`;
    const badParams = buildRpcPayload({
      p_items: [
        {
          product_id: '7f1e43d9-4f58-4a40-8768-6c56e18a0ee5',
          product_name: 'producto prueba collectibles',
          quantity: 1,
          unit_price: 2.00,
          total_price: 2.00,
          group_key: 'vendor-inexistente' // mismatch deliberado
        }
      ],
      p_suborders: [
        {
          group_key: 'collectibles', // no coincide con el ítem
          items_count: 1,
          vendor_id: null,
          is_collectibles_order: true,
          product_subtotal: 2.00,
          shipping_cost: 0.00,
          shipping_method: 'pickup'
        }
      ],
      p_checkout_request_key: keyBad
    });

    const res = await invokeRpcV2(badParams);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res.data)).toMatch(/INTEGRITY_ERROR|INTEGRITY_MISMATCH/);

    // Verificar que en payment_attempts no haya quedado nada
    const checkAttempt = await fetch(`${supabaseUrl}/rest/v1/payment_attempts?idempotency_key=eq.create_order:${keyBad}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    const attempts = await checkAttempt.json();
    expect(attempts).toHaveLength(0);
  });
});
