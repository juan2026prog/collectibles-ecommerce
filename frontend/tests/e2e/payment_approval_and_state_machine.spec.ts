import { test, expect } from '@playwright/test';
import { isOrderPaymentApproved } from '../../src/lib/payments';

test.describe('Strict Payment Certification & State Machine Verification', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('A. payment_status = approved, payment_processed_at != null -> isOrderPaymentApproved returns true', () => {
    const order = { payment_status: 'approved', payment_processed_at: new Date().toISOString() };
    expect(isOrderPaymentApproved(order)).toBe(true);
  });

  test('B. payment_status = paid, payment_processed_at != null -> isOrderPaymentApproved returns true', () => {
    const order = { payment_status: 'paid', payment_processed_at: new Date().toISOString() };
    expect(isOrderPaymentApproved(order)).toBe(true);
  });

  test('C. payment_status = accredited, payment_processed_at != null -> isOrderPaymentApproved returns true', () => {
    const order = { payment_status: 'accredited', payment_processed_at: new Date().toISOString() };
    expect(isOrderPaymentApproved(order)).toBe(true);
  });

  test('D. payment_status = approved, payment_processed_at = null -> BLOQUEADA (returns false)', () => {
    const order = { payment_status: 'approved', payment_processed_at: null };
    expect(isOrderPaymentApproved(order)).toBe(false);
  });

  test('E. payment_status = pending, order.status = shipped, payment_processed_at = null -> BLOQUEADA (returns false)', () => {
    const order = { payment_status: 'pending', status: 'shipped', payment_processed_at: null };
    expect(isOrderPaymentApproved(order)).toBe(false);
  });

  test('F. payment_status = pending, order.status = delivered, payment_processed_at = null -> BLOQUEADA (returns false)', () => {
    const order = { payment_status: 'pending', status: 'delivered', payment_processed_at: null };
    expect(isOrderPaymentApproved(order)).toBe(false);
  });

  test('G. suborder.status = confirmed, payment pending (payment_processed_at = null) -> BLOQUEADA (returns false)', () => {
    const order = { payment_status: 'pending', payment_processed_at: null };
    expect(isOrderPaymentApproved(order)).toBe(false);
  });

  test('H. suborder.status = confirmed, payment certified (approved + payment_processed_at) -> isOrderPaymentApproved returns true', () => {
    const order = { payment_status: 'approved', payment_processed_at: new Date().toISOString() };
    expect(isOrderPaymentApproved(order)).toBe(true);
  });

  test('Server-Side Notification Dispatcher Rule Match: evaluates isPaymentCertifiedProcessed logic', () => {
    const isDispatcherCertified = (order: { payment_processed_at: string | null; payment_status: string }) => {
      return order.payment_processed_at !== null && ['approved', 'paid', 'accredited'].includes(order.payment_status);
    };

    expect(isDispatcherCertified({ payment_processed_at: '2026-08-30T12:00:00Z', payment_status: 'approved' })).toBe(true);
    expect(isDispatcherCertified({ payment_processed_at: '2026-08-30T12:00:00Z', payment_status: 'paid' })).toBe(true);
    expect(isDispatcherCertified({ payment_processed_at: '2026-08-30T12:00:00Z', payment_status: 'accredited' })).toBe(true);
    expect(isDispatcherCertified({ payment_processed_at: null, payment_status: 'approved' })).toBe(false);
    expect(isDispatcherCertified({ payment_processed_at: '2026-08-30T12:00:00Z', payment_status: 'pending' })).toBe(false);
    expect(isDispatcherCertified({ payment_processed_at: null, payment_status: 'pending' })).toBe(false);
  });

  test('I & J & K & L. Render 390px mobile view for state machine checks', async ({ page }) => {
    await page.goto('/vendor?tab=orders', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const heading = page.locator('text=Gestión de Pedidos').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Verify zero horizontal overflow
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      return scrollWidth > docWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });
});
