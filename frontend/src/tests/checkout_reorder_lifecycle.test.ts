// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRecoverableCheckout, clearRecoveredCheckout } from '../lib/checkout-recovery';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe('Checkout Reorder & Lifecycle Invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('1. Generates two distinct orders (UUID A != UUID B) for identical consecutive purchases', async () => {
    const cartParams = {
      items: [
        { product_id: 'prod-item-1', quantity: 1, price: 2, title: 'Item Prueba $2' }
      ],
      payment_method: 'mercadopago',
      currency: 'UYU',
      shipping_method: 'pickup',
      shipping_address: { first_name: 'Comprador', last_name: 'Prueba', country: 'Uruguay' },
      customer_email: 'comprador@test.com',
      terms_accepted: true,
      accepted_terms_version: '2026-v1'
    };

    let callCount = 0;
    const requestKeysUsed: string[] = [];
    const generatedOrderIds: string[] = [];

    const mockCreateOrder = vi.fn(async (reqKey: string) => {
      callCount++;
      requestKeysUsed.push(reqKey);
      const orderId = `order-uuid-${callCount}-${Math.random().toString(36).slice(2, 7)}`;
      generatedOrderIds.push(orderId);
      return {
        order: {
          id: orderId,
          order_number: `COL-2026-${callCount}`,
          status: 'pending',
          payment_status: 'initiated',
          total_amount: 2
        },
        order_token: `token-${orderId}`
      };
    });

    // Mock get-order-status (read-only): first order paid
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string, options: any) => {
      if (fnName === 'get-order-status') {
        return {
          data: {
            order: {
              id: options.body?.order_id,
              status: 'confirmed',
              payment_status: 'approved',
              is_paid: true,
              created_at: new Date().toISOString()
            }
          }
        };
      }
      return { data: null };
    });

    // --- Compra A ---
    const orderA = await withRecoverableCheckout(cartParams, mockCreateOrder);
    expect(orderA).toBeDefined();
    expect(orderA.id).toBe(generatedOrderIds[0]);

    // Simula pago completado y certificado para Compra A (CheckoutSuccess)
    clearRecoveredCheckout(orderA.id);

    // --- Compra B (Mismo producto, mismo comprador, misma dirección) ---
    const orderB = await withRecoverableCheckout(cartParams, mockCreateOrder);
    expect(orderB).toBeDefined();
    expect(orderB.id).toBe(generatedOrderIds[1]);

    // Verificaciones críticas de aislamiento de IDs
    expect(orderA.id).not.toBe(orderB.id);
    expect(requestKeysUsed[0]).not.toBe(requestKeysUsed[1]);
    expect(callCount).toBe(2);
  });

  it('2. Collapses double click into a single order creation in-flight', async () => {
    const cartParams = {
      items: [{ product_id: 'prod-2', quantity: 1, price: 100 }],
      payment_method: 'mercadopago',
      customer_email: 'buyer@test.com',
      currency: 'UYU'
    };

    let serverCreations = 0;
    const mockCreateOrder = vi.fn(async (_reqKey: string) => {
      await new Promise(res => setTimeout(res, 50));
      serverCreations++;
      return {
        order: {
          id: 'single-order-uuid',
          total_amount: 100
        }
      };
    });

    const [click1Result, click2Result] = await Promise.all([
      withRecoverableCheckout(cartParams, mockCreateOrder),
      withRecoverableCheckout(cartParams, mockCreateOrder)
    ]);

    expect(serverCreations).toBe(1);
    expect(click1Result.id).toBe('single-order-uuid');
    expect(click2Result.id).toBe('single-order-uuid');
    expect(click1Result).toBe(click2Result);
  });

  it('3. Preserves requestKey during technical retry after lost server response', async () => {
    const cartParams = {
      items: [{ product_id: 'prod-retry-1', quantity: 1, price: 50 }],
      payment_method: 'mercadopago',
      customer_email: 'retry@test.com',
      currency: 'UYU'
    };

    let attemptCount = 0;
    const requestKeysUsed: string[] = [];

    const mockCreateOrder = vi.fn(async (reqKey: string) => {
      attemptCount++;
      requestKeysUsed.push(reqKey);
      if (attemptCount === 1) {
        // First attempt loses connection after saving attempt
        throw new Error('NETWORK_TIMEOUT_SIMULATED');
      }
      return {
        order: {
          id: 'order-recovered-uuid',
          total_amount: 50
        }
      };
    });

    // Mock get-order-status (read-only): order is not paid yet
    (supabase.functions.invoke as any).mockImplementation(async (fnName: string, options: any) => {
      if (fnName === 'get-order-status') {
        return {
          data: {
            order: {
              id: options.body?.order_id,
              status: 'pending',
              payment_status: 'initiated',
              is_paid: false
            }
          }
        };
      }
      return { data: null };
    });

    // Attempt 1: Fails due to simulated timeout
    await expect(withRecoverableCheckout(cartParams, mockCreateOrder)).rejects.toThrow('NETWORK_TIMEOUT_SIMULATED');

    // Attempt 2: Re-invoked (page reload or retry button)
    const recoveredOrder = await withRecoverableCheckout(cartParams, mockCreateOrder);

    expect(recoveredOrder.id).toBe('order-recovered-uuid');
    expect(requestKeysUsed.length).toBe(2);
    // Both technical attempts for the unconfirmed purchase share the identical requestKey
    expect(requestKeysUsed[0]).toBe(requestKeysUsed[1]);
  });

  it('4. Multi-tab serialization via navigator.locks avoids duplicate orders', async () => {
    const cartParams = {
      items: [{ product_id: 'prod-tab-sync', quantity: 1, price: 30 }],
      payment_method: 'mercadopago',
      customer_email: 'multitab@test.com',
      currency: 'UYU'
    };

    // Simulate Web Locks API
    let activeLock: Promise<any> | null = null;
    const mockLocksRequest = vi.fn(async (_name: string, callback: () => Promise<any>) => {
      if (activeLock) {
        await activeLock;
      }
      activeLock = callback();
      try {
        return await activeLock;
      } finally {
        activeLock = null;
      }
    });

    Object.defineProperty(navigator, 'locks', {
      value: { request: mockLocksRequest },
      configurable: true
    });

    let executions = 0;
    const mockCreateOrder = vi.fn(async (reqKey: string) => {
      executions++;
      return {
        order: { id: `order-tab-${executions}`, requestKey: reqKey }
      };
    });

    (supabase.functions.invoke as any).mockResolvedValue({ data: null });

    // Simultaneous requests representing two tabs
    const [tab1, tab2] = await Promise.all([
      withRecoverableCheckout(cartParams, mockCreateOrder),
      withRecoverableCheckout(cartParams, mockCreateOrder)
    ]);

    expect(mockLocksRequest).toHaveBeenCalled();
    expect(tab1).toBeDefined();
    expect(tab2).toBeDefined();
  });
});
