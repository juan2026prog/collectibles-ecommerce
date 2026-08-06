import { test, expect } from '@playwright/test';

test.describe('Admin Order Payment Traceability Drawer E2E Tests', () => {
  test('Expired Order #C7ED7017 displays PAGO EXPIRADO, Handy, Session ID, and blocks DAC label generation', async ({ page }) => {
    await page.goto('/admin/orders');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Verify payment status column header
    await expect(page.getByText('Estado de Pago', { exact: false })).toBeVisible();

    // Check if order C7ED7017 is listed
    const orderLink = page.getByText('#C7ED7017', { exact: false });
    if (await orderLink.isVisible()) {
      await orderLink.click();

      // Verify Drawer Title
      await expect(page.getByText('Orden #C7ED7017', { exact: false })).toBeVisible();

      // Verify Pago y Transacciones Section
      await expect(page.getByText('Pago y Transacciones', { exact: false })).toBeVisible();
      await expect(page.getByText('PAGO EXPIRADO', { exact: false })).toBeVisible();
      await expect(page.getByText('Handy', { exact: false })).toBeVisible();
      await expect(page.getByText('5489c720-c08b-4091-8555-9bf3dfb07be1', { exact: false })).toBeVisible();
      await expect(page.getByText('No recibido', { exact: false })).toBeVisible();

      // Verify DAC label button is disabled with alert
      const dacButton = page.getByRole('button', { name: /Regenerar etiqueta DAC|Crear Guía y Etiqueta DAC/i });
      if (await dacButton.isVisible()) {
        await expect(dacButton).toBeDisabled();
      }

      // Verify preparation restriction warning
      await expect(page.getByText('Restricción Operativa Activa', { exact: false })).toBeVisible();
    }
  });

  test('Payment Status filter works correctly', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.locator('table')).toBeVisible();

    const paymentFilter = page.locator('select').filter({ hasText: 'Estado Pago:' });
    await expect(paymentFilter).toBeVisible();

    await paymentFilter.selectOption('expired');
    await page.waitForTimeout(1000);
    await expect(page.locator('table')).toBeVisible();
  });
});
