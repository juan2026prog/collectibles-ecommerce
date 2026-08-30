import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'fase_b_mobile');

test.describe('FASE B — Admin Operación Mobile UX Screenshots (375x667 & 390x844)', () => {
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
    test(`Capture Admin Marketplace at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/marketplace', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_marketplace_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Customers at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/customers', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_customers_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Finances at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/finances', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_finances_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Logistics at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/logistics', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_logistics_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
});
