import { describe, it, expect } from 'vitest';

/**
 * Live PostgreSQL Certification for Mercado Pago RPCs:
 * - public.claim_mp_checkout(p_order_id UUID)
 * - public.persist_mp_preference(p_order_id UUID, p_attempt_id UUID, p_preference_id TEXT, p_checkout_url TEXT, p_reconciled BOOLEAN)
 */

describe('Mercado Pago RPCs Live PostgreSQL Certification', () => {
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDU3MjA1MywiZXhwIjoyMDkwMTQ4MDUzfQ.jajO92RgFxYTkMkvJDA9Dl2Kug1iNbaGhVNrsDxV6mU';
  const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';

  async function invokeRpc(name: string, params: Record<string, any>) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
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

  it('1. Tests claim_mp_checkout on order 55e1f242-1375-4d0f-a209-d009ecf0b8fa (with existing create_order attempt)', async () => {
    const orderId = '55e1f242-1375-4d0f-a209-d009ecf0b8fa';
    const claimRes = await invokeRpc('claim_mp_checkout', { p_order_id: orderId });
    
    expect(claimRes.ok).toBe(true);
    expect(claimRes.data.success).toBe(true);
    // Should be mode 'create' because it has no external_preference_id yet
    expect(claimRes.data.mode).toBe('create');
    expect(claimRes.data.attempt_id).toBeDefined();
    expect(claimRes.data.expires_at).toBeDefined();

    // 2. Simulate persist_mp_preference with test preference id and url
    const mockPrefId = `63700367-test-${Date.now()}`;
    const mockUrl = `https://www.mercadopago.com.uy/checkout/v1/redirect?pref_id=${mockPrefId}`;
    
    const persistRes = await invokeRpc('persist_mp_preference', {
      p_order_id: orderId,
      p_attempt_id: claimRes.data.attempt_id,
      p_preference_id: mockPrefId,
      p_checkout_url: mockUrl,
      p_reconciled: false
    });

    expect(persistRes.ok).toBe(true);
    expect(persistRes.data.success).toBe(true);
    expect(persistRes.data.preference_id).toBe(mockPrefId);

    // 3. Second call with same orderId -> MUST return mode 'existing' with the persisted preference!
    const claimRes2 = await invokeRpc('claim_mp_checkout', { p_order_id: orderId });
    expect(claimRes2.ok).toBe(true);
    expect(claimRes2.data.mode).toBe('existing');
    expect(claimRes2.data.preference_id).toBe(mockPrefId);

    // Clean up mock preference on order 55e1f242 to restore pristine state
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment_provider: 'mercadopago',
        payment_provider_reference: null,
        payment_status: 'not_started'
      })
    });
    await fetch(`${supabaseUrl}/rest/v1/payment_attempts?id=eq.${claimRes.data.attempt_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        external_preference_id: null,
        provider_status: 'order_created',
        metadata: { checkout_request_key: 'af9298aa-1140-47cb-87eb-309bf58628ca' }
      })
    });
  });

  it('2. Mode hold on already confirmed/paid order', async () => {
    // Find any paid order
    const paidOrderRes = await fetch(`${supabaseUrl}/rest/v1/orders?status=eq.confirmed&limit=1`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    const paidOrders = await paidOrderRes.json();
    if (paidOrders && paidOrders.length > 0) {
      const claimPaid = await invokeRpc('claim_mp_checkout', { p_order_id: paidOrders[0].id });
      expect(claimPaid.ok).toBe(true);
      expect(claimPaid.data.mode).toBe('hold');
      expect(claimPaid.data.reason).toBe('ORDER_ALREADY_PAID');
    }
  });
});
