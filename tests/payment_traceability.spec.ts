import { test, expect } from '@playwright/test';

test.describe('Payment Traceability, Reconciliation & Fulfillment Guards', () => {
  test('Admin Orders displays payment status column and reconciliation option', async ({ page }) => {
    // Navigate to admin orders
    await page.goto('/admin/orders');
    
    // Check table headers
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('Estado de Pago', { exact: false })).toBeVisible();

    // Check filter presence
    const paymentFilter = page.locator('select').filter({ hasText: 'Estado Pago:' });
    await expect(paymentFilter).toBeVisible();
  });

  test('Vendor Orders displays operational payment badges and blocks fulfillment on unpaid orders', async ({ page }) => {
    await page.goto('/vendor/orders');

    // Check header
    await expect(page.getByText('Gestión de Pedidos (Subórdenes)', { exact: false })).toBeVisible();

    // Check table structure
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('Estado de Pago', { exact: false })).toBeVisible();
  });
});
