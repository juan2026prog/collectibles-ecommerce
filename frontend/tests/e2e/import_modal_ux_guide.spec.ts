import { test, expect } from '@playwright/test';

test.describe('Import Modal UX & Guide Portal E2E Tests', () => {
  test('Open Import Modal -> Open Guide Modal -> Check Portals & Z-Index Stack', async ({ page }) => {
    // Navigate to admin products page
    await page.goto('/admin/products');

    // Find and click "Importación Masiva" button
    const importBtn = page.getByRole('button', { name: /importar/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();

    // Check Import Modal is open
    const importHeading = page.getByRole('heading', { name: 'Importación Masiva de Productos' });
    await expect(importHeading).toBeVisible();

    // Verify exactly ONE close button X on Import Modal header
    const importCloseBtn = page.getByRole('button', { name: 'Cerrar Importación Masiva' });
    await expect(importCloseBtn).toBeVisible();

    // Click "Guía de Importación"
    const guideBtn = page.getByRole('button', { name: /guía de importación/i });
    await expect(guideBtn).toBeVisible();
    await guideBtn.click();

    // Check Guide Modal is open
    const guideHeading = page.getByRole('heading', { name: 'Guía Oficial de Importación Masiva' });
    await expect(guideHeading).toBeVisible();

    // Verify Guide Close button X is visible and distinct
    const guideCloseBtn = page.getByRole('button', { name: 'Cerrar Guía de Importación' });
    await expect(guideCloseBtn).toBeVisible();

    // Close Guide Modal via "Entendido" button
    const understoodBtn = page.getByRole('button', { name: 'Entendido' });
    await expect(understoodBtn).toBeVisible();
    await understoodBtn.click();

    // Check Guide Modal is closed and Import Modal is still open
    await expect(guideHeading).not.toBeVisible();
    await expect(importHeading).toBeVisible();

    // Close Import Modal
    await importCloseBtn.click();
    await expect(importHeading).not.toBeVisible();
  });
});
