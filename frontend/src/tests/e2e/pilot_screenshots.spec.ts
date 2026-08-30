import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'pilot_mobile');

test.describe('Pilot Admin Mobile UX Screenshots (375x667 & 390x844)', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  const viewports = [
    { width: 375, height: 667, name: '375x667' },
    { width: 390, height: 844, name: '390x844' },
  ];

  for (const vp of viewports) {
    test(`Capture Admin Products at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_products_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Brands at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/brands', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_brands_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Home / Banners at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/banners', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_banners_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Mobile Drawer Open at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const menuBtn = page.locator('button[aria-label="Abrir navegación"]').first();
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(500);
      }
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `mobile_drawer_open_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
});
