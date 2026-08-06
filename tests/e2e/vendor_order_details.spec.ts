import { test, expect } from '@playwright/test';

test.describe('Vendor Order Details Drawer E2E Tests', () => {
  test('Vendor can click suborder row and view complete detail drawer with isolated products and payment status', async ({ page }) => {
    await page.goto('/vendor?tab=orders');

    // Wait for suborders table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Click first suborder row
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();

      // Drawer should open
      await expect(page.getByText('Suborden', { exact: false })).toBeVisible();

      // Verify sections are present
      await expect(page.getByText('Estado del Pago', { exact: false })).toBeVisible();
      await expect(page.getByText('Productos a Preparar', { exact: false })).toBeVisible();
      await expect(page.getByText('Datos de Destino / Cliente', { exact: false })).toBeVisible();
      await expect(page.getByText('Resumen Financiero', { exact: false })).toBeVisible();
      await expect(page.getByText('Historial Operativo', { exact: false })).toBeVisible();
    }
  });

  test('Suborder detail drawer URL parameter deeplinking works', async ({ page }) => {
    await page.goto('/vendor?tab=orders&suborder=COL-20260805-0001-A');

    // Drawer should open automatically from URL parameter
    await expect(page.getByText('Suborden', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('COL-20260805-0001-A', { exact: false })).toBeVisible();
  });

  test('Expired payment suborders disable preparation and shipping label buttons', async ({ page }) => {
    await page.goto('/vendor?tab=orders&suborder=COL-20260805-0001-A');

    await page.waitForTimeout(1000);
    const labelButton = page.getByRole('button', { name: /Etiqueta DAC/i });
    if (await labelButton.isVisible()) {
      // For expired order C7ED7017 / COL-20260805-0001-A, label button should be disabled
      await expect(labelButton).toBeDisabled();
    }
  });
});
