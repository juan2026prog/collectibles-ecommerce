import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

test.describe('Bulk Product Import / Export System E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    // Set E2E admin bypass in localStorage before loading page
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
    });
    // Navigate to Admin Products page
    await page.goto('/admin/products');
  });

  test('1. Admin Products page displays unified Export and Import buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Exportar/i })).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole('button', { name: /Importar/i })).toBeVisible({ timeout: 45000 });
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
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      downloadBtn.click()
    ]);

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
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      downloadBtn.click()
    ]);

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

  test('6. Real Import Upload Valid File Preview', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: /Importar/i });
    await importBtn.click();

    const validCsvContent = 'SKU,Título,Precio,Stock\nSKU-E2E-TEST1,Producto Playwright Test,1990,5';
    
    // Upload valid CSV file buffer directly into input
    await page.setInputFiles('input[type="file"]', {
      name: 'valid_import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(validCsvContent, 'utf-8')
    });

    // Verify preview screen statistics and SKU row
    await expect(page.getByText('Filas Leídas', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('SKU-E2E-TEST1')).toBeVisible();
  });

  test('7. Real Import Upload Invalid File Error Rejection', async ({ page }) => {
    const importBtn = page.getByRole('button', { name: /Importar/i });
    await importBtn.click();

    const invalidCsvContent = 'SKU,Título,Precio,Stock,Tipo MBE\nSKU-E2E-ERR,Producto Error,100,5,PRUEBA123';

    // Upload invalid CSV file buffer
    await page.setInputFiles('input[type="file"]', {
      name: 'invalid_mbe.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCsvContent, 'utf-8')
    });

    // Verify error detection in preview
    await expect(page.getByText('no es un Tipo MBE válido', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Rechazadas', { exact: false })).toBeVisible();
  });

  test('8. Real All Scope Master Column Export Download Verification', async ({ page }) => {
    test.setTimeout(120000);
    const exportBtn = page.getByRole('button', { name: /Exportar/i });
    await exportBtn.click();

    // Select "Todos los productos del catálogo"
    await page.getByLabel('Todos los productos del catálogo').check();

    // Select all columns
    await page.getByRole('button', { name: /Seleccionar todas/i }).click();
    await expect(page.getByText('36 de 36 columnas seleccionadas', { exact: false })).toBeVisible();

    const downloadBtn = page.getByRole('button', { name: /GENERAR Y DESCARGAR/i });
    await expect(downloadBtn).toBeEnabled({ timeout: 30000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      downloadBtn.click()
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    if (downloadPath) {
      const fileBuffer = fs.readFileSync(downloadPath);
      const wb = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet = wb.Sheets['Productos'];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      const headers = rows[0];
      expect(headers.length).toBe(36);
      expect(headers).toContain('Título');
      expect(headers).toContain('Slug / URL Friendly');
      expect(headers).toContain('URL del producto');
      expect(headers).toContain('Descripción');
      expect(headers).toContain('Descripción corta');
      expect(headers).toContain('Contenido');
      expect(headers).toContain('Precio anterior');
      expect(headers).toContain('Estado AR');
      expect(headers).toContain('Imagen principal');
      expect(headers).toContain('Imágenes adicionales');
      expect(headers).toContain('Fecha creación');
      expect(headers).toContain('Última actualización');

      // Verify product data row count matches expected database count 1563
      expect(rows.length - 1).toBe(1563);
    }
  });

});
