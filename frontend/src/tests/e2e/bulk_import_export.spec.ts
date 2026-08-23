import { test, expect } from '@playwright/test';

test.describe('Bulk Product Import / Export System E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Set E2E admin bypass in localStorage before loading page
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
    });
    // Navigate to Admin Products page
    await page.goto('/admin/products');
  });

  test('1. Admin Products page displays unified Export and Import buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Exportar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Importar/i })).toBeVisible();
  });

  test('2. Export Modal opens with format selection, product scope, and master column checkboxes', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /Exportar/i });
    await exportBtn.click();

    // Verify modal header
    await expect(page.getByText('Exportación Masiva de Productos', { exact: false })).toBeVisible();
    await expect(page.getByText('1. Formato de Archivo', { exact: false })).toBeVisible();
    await expect(page.getByText('2. Productos a Exportar', { exact: false })).toBeVisible();
    await expect(page.getByText('3. Selección de Columnas', { exact: false })).toBeVisible();

    // Verify Column Counter
    await expect(page.getByText('columnas seleccionadas', { exact: false })).toBeVisible();

    // Verify Quick Buttons
    await expect(page.getByRole('button', { name: /Seleccionar todas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Quitar todas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Restablecer/i })).toBeVisible();

    // Close Modal
    await page.getByRole('button', { name: /Cancelar/i }).click();
    await expect(page.getByText('Exportación Masiva de Productos')).not.toBeVisible();
  });

  test('3. Real XLSX Export Download with Column Selection', async ({ page }) => {
    test.setTimeout(90000);
    const exportBtn = page.getByRole('button', { name: /Exportar/i });
    await exportBtn.click();

    // Wait for product count calculation to finish and enable download button
    const downloadBtn = page.getByRole('button', { name: /GENERAR Y DESCARGAR/i });
    await expect(downloadBtn).toBeEnabled({ timeout: 30000 });

    // Capture real file download with expanded timeout for catalog query
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
    await downloadBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  });

  test('4. Real CSV Export Download with Column Selection', async ({ page }) => {
    test.setTimeout(90000);
    const exportBtn = page.getByRole('button', { name: /Exportar/i });
    await exportBtn.click();

    // Select CSV format button
    const csvBtn = page.getByRole('button', { name: /CSV \(UTF-8\)/i });
    await csvBtn.click();

    // Wait for product count calculation to finish and enable download button
    const downloadBtn = page.getByRole('button', { name: /GENERAR Y DESCARGAR/i });
    await expect(downloadBtn).toBeEnabled({ timeout: 30000 });

    // Capture real file download
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
    await downloadBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test('5. Import Modal opens with dropzone, template download, and web guide', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: /Importar/i });
    await importBtn.click();

    // Verify modal header and dropzone
    await expect(page.getByText('Importación Masiva de Productos', { exact: false })).toBeVisible();
    await expect(page.getByText('Haz clic o arrastra tu archivo aquí', { exact: false })).toBeVisible();
    await expect(page.getByText('Descargar Plantilla XLSX', { exact: false })).toBeVisible();

    // Click Web Guide button inside Import Modal
    const guideBtn = page.getByRole('button', { name: /Guía de Importación/i });
    await expect(guideBtn).toBeVisible();
    await guideBtn.click();

    // Verify Web Guide Modal opens
    await expect(page.getByText('Guía Oficial de Importación Masiva', { exact: false })).toBeVisible();
    await expect(page.getByText('Identificación por SKU', { exact: false })).toBeVisible();
    await expect(page.getByText('Actualizaciones Parciales', { exact: false })).toBeVisible();

    // Close Web Guide Modal via Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Close Import Modal
    await page.getByRole('button', { name: /Cancelar/i }).last().click();
    await page.waitForTimeout(500);
  });

});
