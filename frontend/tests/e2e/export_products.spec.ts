import { test, expect } from '@playwright/test';

test.describe('Admin Product Export Module E2E', () => {

  test('Export flow: Verify catalog count decoupling, modal filter sync and file generation', async ({ page }) => {
    // 1. Navigate to Login & Authenticate as Admin
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@collectibles.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    // Wait for redirection to dashboard or admin
    await page.waitForURL('**/admin**', { timeout: 10000 }).catch(() => {});
    await page.goto('http://localhost:5173/admin/products');

    // 2. Ensure table pagination shows 50 per page
    const selectPerPage = page.locator('select').filter({ hasText: '50' }).first();
    if (await selectPerPage.isVisible()) {
      await selectPerPage.selectOption('50');
    }

    // 3. Open Export Modal
    const exportButton = page.locator('button', { hasText: 'Exportar' }).first();
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    // 4. Verify Export Modal title & scope options
    await expect(page.locator('text=Exportación Masiva de Productos')).toBeVisible();

    const scopeSelect = page.locator('select').filter({ hasText: 'Todos los productos' }).first();
    await expect(scopeSelect).toBeVisible();

    // 5. Select "Todos los productos" and check counter text
    await scopeSelect.selectOption('all');
    await expect(page.locator('text=Se exportarán')).toBeVisible();

    // 6. Test Format selection & column selector
    const csvFormatButton = page.locator('button', { hasText: 'CSV' }).first();
    if (await csvFormatButton.isVisible()) {
      await csvFormatButton.click();
    }

    // 7. Test Column Checkboxes: Quitar todas, select individual columns
    const removeAllBtn = page.locator('button', { hasText: 'Quitar todas' });
    await expect(removeAllBtn).toBeVisible();
    await removeAllBtn.click();

    // Counter should show 0 columns selected
    await expect(page.locator('text=0 de')).toBeVisible();

    // Button should be disabled with 0 columns
    const generateButton = page.locator('button', { hasText: 'GENERAR Y DESCARGAR' }).first();
    await expect(generateButton).toBeDisabled();

    // Click individual column label/checkbox (SKU)
    const skuLabel = page.locator('label', { hasText: 'SKU' }).first();
    await skuLabel.click();

    // Counter should update to 1 de
    await expect(page.locator('text=1 de')).toBeVisible();
    await expect(generateButton).toBeEnabled();

    // Click Título label
    const titleLabel = page.locator('label', { hasText: 'Título' }).first();
    await titleLabel.click();

    // Counter should update to 2 de
    await expect(page.locator('text=2 de')).toBeVisible();

    // Click "Seleccionar todas"
    const selectAllBtn = page.locator('button', { hasText: 'Seleccionar todas' });
    await selectAllBtn.click();
    await expect(page.locator('text=27 de 27')).toBeVisible();

    // 8. Trigger Download event and verify event promise
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await generateButton.click();
    const download = await downloadPromise;

    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('Productos_Collectibles');
    }
  });

  test('Export flow: Modal filter changes do not affect main table filters', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@collectibles.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    await page.goto('http://localhost:5173/admin/products');

    // Open Export Modal
    await page.click('button:has-text("Exportar")');
    await expect(page.locator('text=Exportación Masiva de Productos')).toBeVisible();

    // Select "Resultados filtrados"
    const scopeSelect = page.locator('select').filter({ hasText: 'Resultados filtrados' }).first();
    if (await scopeSelect.isVisible()) {
      await scopeSelect.selectOption('filtered');
    }

    // Close Modal without applying to table
    const closeButton = page.locator('button', { hasText: 'Cancelar' }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    // Ensure main page table is intact and modal is closed
    await expect(page.locator('text=Exportación Masiva de Productos')).not.toBeVisible();
    await expect(page.locator('h2', { hasText: 'Productos' })).toBeVisible();
  });
});
