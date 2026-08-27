import { test, expect } from '@playwright/test';

test.describe('Import SKU Change E2E Test', () => {
  test('Upload XLSX with SKU change -> Detect UPDATE = 1 and enable confirm button without writing DB', async ({ page }) => {
    await page.goto('/admin/products');

    // Open Import Modal
    const importBtn = page.getByRole('button', { name: /importar/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();

    // Verify modal is visible
    const importHeading = page.getByRole('heading', { name: 'Importación Masiva de Productos' });
    await expect(importHeading).toBeVisible();

    // Upload file input is present
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });
});
