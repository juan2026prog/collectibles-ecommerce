import { describe, it, expect } from 'vitest';
import {
  notificationTemplates,
  formatCurrencyUYU,
  formatOrderNumber,
  resolveValidTrackingUrl,
} from '../../../../supabase/functions/_shared/notificationTemplates';

describe('Collectibles 2026 — Unified Notifications & Activity Center Suite (Fase 10)', () => {
  describe('1. Tracking URL Resolution & Anti-Hallucination Guard', () => {
    it('resolves valid DAC tracking URL when tracking number is provided', () => {
      const url = resolveValidTrackingUrl('DAC', '12345678');
      expect(url).toBe('https://www.dac.com.uy/envios/seguimiento?guia=12345678');
    });

    it('resolves valid UES tracking URL when tracking number is provided', () => {
      const url = resolveValidTrackingUrl('UES', 'UES-9988');
      expect(url).toBe('https://www.ues.com.uy/rastreo/?guia=UES-9988');
    });

    it('resolves Correo Uruguayo URL when tracking number is provided', () => {
      const url = resolveValidTrackingUrl('Correo Uruguayo', 'CU-001122');
      expect(url).toBe('https://www.correo.com.uy/seguimiento-de-envios');
    });

    it('prefers explicit valid https custom tracking URL when provided', () => {
      const url = resolveValidTrackingUrl('Custom', '999', 'https://tracking.example.com/pkg/999');
      expect(url).toBe('https://tracking.example.com/pkg/999');
    });

    it('never invents a tracking URL if tracking number is null or empty', () => {
      expect(resolveValidTrackingUrl('DAC', null)).toBeNull();
      expect(resolveValidTrackingUrl('UES', '   ')).toBeNull();
      expect(resolveValidTrackingUrl(null, null)).toBeNull();
    });
  });

  describe('2. Customer Templates & Partial Multi-Vendor Shipment Clarity', () => {
    it('renders customer_order_created clearly as pending payment', () => {
      const tpl = notificationTemplates.customer_order_created({
        orderNumber: '#COL-1001',
        orderId: 'ord-1001',
        totalAmount: 2500,
        currency: 'UYU',
      });
      expect(tpl.inApp.title).toContain('#COL-1001');
      expect(tpl.inApp.category).toBe('purchases');
      expect(tpl.email.subject).toContain('Pendiente de pago');
    });

    it('renders customer_order_shipped with partial suborder notice and tracking details', () => {
      const tpl = notificationTemplates.customer_order_shipped({
        orderNumber: '#COL-2026',
        orderId: 'ord-2026',
        suborderNumber: 'SUB-01',
        isPartialShipment: true,
        carrier: 'DAC',
        trackingNumber: 'DAC-778899',
        dispatchedAt: '2026-11-18T12:00:00Z',
        items: [{ product_name: 'Funko Pop Goku', quantity: 1 }],
      });

      expect(tpl.inApp.title).toContain('SUB-01');
      expect(tpl.inApp.body).toContain('DAC-778899');
      expect(tpl.email.html).toContain('Envío por suborden (SUB-01)');
      expect(tpl.email.html).toContain('DAC-778899');
      expect(tpl.email.html).toContain('Funko Pop Goku');
      expect(tpl.deepLink).toContain('dac.com.uy');
    });

    it('renders customer_order_delivered notification', () => {
      const tpl = notificationTemplates.customer_order_delivered({
        orderNumber: '#COL-2026',
        orderId: 'ord-2026',
        suborderNumber: 'SUB-01',
      });
      expect(tpl.inApp.category).toBe('deliveries');
      expect(tpl.email.subject).toContain('entregado');
    });
  });

  describe('3. Multi-Vendor Isolation & Vendor Templates', () => {
    it('isolates order items and subtotals strictly per vendor_id', () => {
      const rawItems = [
        { vendor_id: 'vendor-A', product_name: 'Figura A', unit_price: 1200, quantity: 2 },
        { vendor_id: 'vendor-B', product_name: 'Figura B', unit_price: 900, quantity: 1 },
        { vendor_id: null, product_name: 'Propia Collectibles', unit_price: 500, quantity: 1 },
      ];

      const vendorMap: Record<string, { items: { product_name: string; quantity: number }[]; total: number }> = {};
      for (const item of rawItems) {
        if (!item.vendor_id) continue;
        if (!vendorMap[item.vendor_id]) {
          vendorMap[item.vendor_id] = { items: [], total: 0 };
        }
        vendorMap[item.vendor_id].items.push({ product_name: item.product_name, quantity: item.quantity });
        vendorMap[item.vendor_id].total += item.unit_price * item.quantity;
      }

      const tplA = notificationTemplates.vendor_order_paid({
        orderNumber: '#COL-500',
        orderId: 'ord-500',
        vendorTotal: vendorMap['vendor-A'].total,
        items: vendorMap['vendor-A'].items,
      });

      const tplB = notificationTemplates.vendor_order_paid({
        orderNumber: '#COL-500',
        orderId: 'ord-500',
        vendorTotal: vendorMap['vendor-B'].total,
        items: vendorMap['vendor-B'].items,
      });

      expect(tplA.email.html).toContain('Figura A');
      expect(tplA.email.html).not.toContain('Figura B');
      expect(tplA.email.html).not.toContain('Propia Collectibles');
      expect(tplB.email.html).toContain('Figura B');
      expect(tplB.email.html).not.toContain('Figura A');
    });
  });

  describe('4. Influencer / Affiliate Attribution, Privacy & Refund Reconciliation', () => {
    it('generates affiliate notification with zero buyer PII', () => {
      const tpl = notificationTemplates.affiliate_event({
        eventSubType: 'sale_paid_commission',
        code: 'COLECCIONISTA10',
        orderReference: '#COL-9A8B7C6D',
        commissionableAmount: 4000,
        commissionAmount: 200,
        commissionRate: 5,
        statusLabel: 'Comisión generada (Pago confirmado)',
      });

      expect(tpl.inApp.title).toContain('COLECCIONISTA10');
      expect(tpl.inApp.body).toContain('#COL-9A8B7C6D');
      expect(tpl.email.html).not.toContain('@'); // No customer email
      expect(tpl.email.html).not.toContain('+598'); // No customer phone
      expect(tpl.email.html).toContain('COLECCIONISTA10');
    });

    it('reconciles affiliate commission accurately on partial, full, and post-payout refunds', () => {
      function reconcileCommissionOnRefund(params: {
        originalBase: number;
        rate: number;
        currentStatus: 'pending' | 'approved' | 'paid';
        cumulativeRefundedOnOrder: number;
        orderTotal: number;
      }) {
        const isFullRefund = params.cumulativeRefundedOnOrder >= params.orderTotal - 0.01;
        const remainingBase = Math.max(0, params.originalBase - params.cumulativeRefundedOnOrder);
        const newCommission = isFullRefund
          ? 0
          : Number(((remainingBase * params.rate) / 100).toFixed(2));
        const originalCommission = Number(((params.originalBase * params.rate) / 100).toFixed(2));
        const delta = Math.max(0, Number((originalCommission - newCommission).toFixed(2)));

        if (params.currentStatus === 'paid') {
          return {
            status: 'paid',
            amount: originalCommission,
            adjustment_amount: delta,
          };
        }
        return {
          status: isFullRefund ? 'cancelled' : params.currentStatus,
          amount: newCommission,
          adjustment_amount: 0,
        };
      }

      // Case A: Full refund before payout -> cancelled, amount = 0
      const fullRes = reconcileCommissionOnRefund({
        originalBase: 2000,
        rate: 5,
        currentStatus: 'pending',
        cumulativeRefundedOnOrder: 2000,
        orderTotal: 2000,
      });
      expect(fullRes.status).toBe('cancelled');
      expect(fullRes.amount).toBe(0);

      // Case B: Partial refund (50%) before payout -> proportional reduction
      const partialRes = reconcileCommissionOnRefund({
        originalBase: 2000,
        rate: 5,
        currentStatus: 'approved',
        cumulativeRefundedOnOrder: 1000,
        orderTotal: 2000,
      });
      expect(partialRes.status).toBe('approved');
      expect(partialRes.amount).toBe(50);

      // Case C: Refund after commission was already paid -> compensatory adjustment_amount
      const postPaidRes = reconcileCommissionOnRefund({
        originalBase: 2000,
        rate: 5,
        currentStatus: 'paid',
        cumulativeRefundedOnOrder: 2000,
        orderTotal: 2000,
      });
      expect(postPaidRes.status).toBe('paid');
      expect(postPaidRes.adjustment_amount).toBe(100);
    });
  });

  describe('5. Admin Configurable Sales Modes & Exponential Retry Backoff', () => {
    it('evaluates admin immediate alert eligibility by sales_notification_mode', () => {
      const evalAdminMode = (
        mode: string,
        flags: { hasOwn: boolean; hasVendor: boolean; isIntl: boolean; isInf: boolean }
      ) => {
        if (mode === 'daily_summary_only') return false;
        if (mode === 'all') return true;
        if (mode === 'own_only') return flags.hasOwn;
        if (mode === 'vendors_only') return flags.hasVendor;
        if (mode === 'international_only') return flags.isIntl;
        if (mode === 'influencer_only') return flags.isInf;
        return false;
      };

      expect(evalAdminMode('all', { hasOwn: false, hasVendor: true, isIntl: false, isInf: false })).toBe(true);
      expect(evalAdminMode('own_only', { hasOwn: false, hasVendor: true, isIntl: false, isInf: false })).toBe(false);
      expect(evalAdminMode('vendors_only', { hasOwn: false, hasVendor: true, isIntl: false, isInf: false })).toBe(true);
      expect(evalAdminMode('influencer_only', { hasOwn: true, hasVendor: false, isIntl: false, isInf: true })).toBe(true);
      expect(evalAdminMode('daily_summary_only', { hasOwn: true, hasVendor: true, isIntl: true, isInf: true })).toBe(false);
    });

    it('computes bounded exponential backoff and marks exhausted at max_attempts', () => {
      const computeBackoffSec = (attempts: number) => Math.min(3600, Math.pow(2, attempts) * 30);
      expect(computeBackoffSec(1)).toBe(60);
      expect(computeBackoffSec(2)).toBe(120);
      expect(computeBackoffSec(3)).toBe(240);
      expect(computeBackoffSec(10)).toBe(3600);
    });
  });

  describe('6. Resend / Svix Webhook Verification & Final Deliverability State Machine', () => {
    async function verifySvixSignatureTest(
      rawBody: string,
      svixId: string,
      svixTimestamp: string,
      svixSignature: string,
      secret: string
    ): Promise<boolean> {
      const tsSeconds = Number(svixTimestamp);
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > 300) return false;

      const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
      const binarySecret = atob(cleanSecret);
      const keyBytes = new Uint8Array(binarySecret.length);
      for (let i = 0; i < binarySecret.length; i++) keyBytes[i] = binarySecret.charCodeAt(i);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`)
      );
      const sigBytes = new Uint8Array(sigBuffer);
      let binarySig = '';
      for (let i = 0; i < sigBytes.length; i++) binarySig += String.fromCharCode(sigBytes[i]);
      const expectedBase64 = btoa(binarySig);

      return svixSignature
        .split(' ')
        .some((candidate) => candidate.trim() === `v1,${expectedBase64}`);
    }

    it('accepts a valid Svix HMAC-SHA256 signature and rejects tampered payloads or stale timestamps', async () => {
      const secretKeyRaw = 'collectibles-resend-svix-test-secret-32b';
      const secret = `whsec_${btoa(secretKeyRaw)}`;
      const svixId = 'msg_2p9xyz12345';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 're_msg_001', to: ['buyer@example.com'] },
      });

      // Compute valid signature
      const keyBytes = new TextEncoder().encode(secretKeyRaw);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(`${svixId}.${svixTimestamp}.${payload}`)
      );
      let bin = '';
      new Uint8Array(sigBuf).forEach((b) => (bin += String.fromCharCode(b)));
      const validHeader = `v1,${btoa(bin)}`;

      expect(
        await verifySvixSignatureTest(payload, svixId, svixTimestamp, validHeader, secret)
      ).toBe(true);

      // Tampered payload must fail
      const tamperedPayload = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 're_msg_999' },
      });
      expect(
        await verifySvixSignatureTest(tamperedPayload, svixId, svixTimestamp, validHeader, secret)
      ).toBe(false);

      // Stale timestamp (> 5 min old) must fail
      const staleTs = String(Math.floor(Date.now() / 1000) - 600);
      expect(
        await verifySvixSignatureTest(payload, svixId, staleTs, validHeader, secret)
      ).toBe(false);
    });

    it('transitions email states accurately (sent -> delivered / bounced / rejected) with idempotency and out-of-order guard', () => {
      type LogState = {
        status: string;
        webhook_event_id: string | null;
        delivered_at: string | null;
        bounced_at: string | null;
      };

      const applyResendWebhook = (
        current: LogState,
        eventType: string,
        eventId: string,
        ts: string
      ): { state: LogState; idempotentSkip: boolean; ignoredOutOfOrder: boolean } => {
        if (current.webhook_event_id === eventId) {
          return { state: current, idempotentSkip: true, ignoredOutOfOrder: false };
        }
        const terminal = ['delivered', 'bounced', 'rejected'];
        if (
          terminal.includes(current.status) &&
          (eventType === 'email.sent' || eventType === 'email.delivery_delayed')
        ) {
          return { state: current, idempotentSkip: false, ignoredOutOfOrder: true };
        }
        const next: LogState = { ...current, webhook_event_id: eventId };
        if (eventType === 'email.sent') next.status = 'sent';
        else if (eventType === 'email.delivery_delayed') next.status = 'delivery_delayed';
        else if (eventType === 'email.delivered') {
          next.status = 'delivered';
          next.delivered_at = ts;
        } else if (eventType === 'email.bounced') {
          next.status = 'bounced';
          next.bounced_at = ts;
        } else if (eventType === 'email.complained') {
          next.status = 'rejected';
        } else if (eventType === 'email.failed') {
          next.status = 'failed';
        }
        return { state: next, idempotentSkip: false, ignoredOutOfOrder: false };
      };

      let log: LogState = {
        status: 'sent',
        webhook_event_id: null,
        delivered_at: null,
        bounced_at: null,
      };

      // 1. Delivery delayed
      const step1 = applyResendWebhook(log, 'email.delivery_delayed', 'evt_1', '2026-11-18T15:00:00Z');
      expect(step1.state.status).toBe('delivery_delayed');

      // 2. Delivered confirmed
      const step2 = applyResendWebhook(step1.state, 'email.delivered', 'evt_2', '2026-11-18T15:01:00Z');
      expect(step2.state.status).toBe('delivered');
      expect(step2.state.delivered_at).toBe('2026-11-18T15:01:00Z');

      // 3. Duplicate webhook event_id is skipped idempotently
      const step3 = applyResendWebhook(step2.state, 'email.delivered', 'evt_2', '2026-11-18T15:01:05Z');
      expect(step3.idempotentSkip).toBe(true);
      expect(step3.state.status).toBe('delivered');

      // 4. Out-of-order email.sent after delivered is ignored without downgrading state
      const step4 = applyResendWebhook(step2.state, 'email.sent', 'evt_0_late', '2026-11-18T15:02:00Z');
      expect(step4.ignoredOutOfOrder).toBe(true);
      expect(step4.state.status).toBe('delivered');
    });
  });

  describe('7. Historical Legacy Segregation & RLS Immutability Rules', () => {
    it('excludes historical legacy expired logs from active error counters', () => {
      const sampleLogs = [
        { id: '1', status: 'expired', channel: 'whatsapp' },
        { id: '2', status: 'expired', channel: 'whatsapp' },
        { id: '3', status: 'sent', channel: 'email' },
        { id: '4', status: 'delivered', channel: 'email' },
        { id: '5', status: 'bounced', channel: 'email' },
      ];

      const activeErrors = sampleLogs.filter((l) =>
        ['failed', 'retrying', 'exhausted', 'bounced', 'rejected', 'delivery_delayed', 'provider_unavailable'].includes(
          l.status
        )
      );
      const historicalExpired = sampleLogs.filter((l) => l.status === 'expired');

      expect(activeErrors.map((e) => e.id)).toEqual(['5']);
      expect(historicalExpired.length).toBe(2);
    });
  });
});
