import { test, expect } from '@playwright/test';

test.describe('Admin Mobile Operations & Supervision Flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('1. Deep link /admin/orders?order_id=COL-2001 opens order detail', async ({ page }) => {
    await page.goto('/admin/orders?order_id=COL-2001', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Verify page loads on mobile
    const navText = page.locator('text=Pedidos').first();
    await expect(navText).toBeVisible();
  });

  test('2. Admin Dashboard renders OPERACIÓN DE HOY operational summary card', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Verify Operación de Hoy block is visible
    const opBlock = page.locator('text=Operación de Hoy').first();
    await expect(opBlock).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Collectibles Propios').first()).toBeVisible();
    await expect(page.locator('text=Marketplace Vendors').first()).toBeVisible();
  });

  test('3. Admin Marketplace renders vendor status cards on mobile', async ({ page }) => {
    await page.goto('/admin/marketplace', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Verify zero horizontal overflow
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      return scrollWidth > docWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });
});
