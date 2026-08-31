import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'refinement_fase2_mobile');

test.describe('REFINEMENT FASE 2 — Listados con Metadata Mobile UX Screenshots (375x667 & 390x844)', () => {
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
    test(`Capture Admin Products Refined at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_products_refined_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Orders Refined at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_orders_refined_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Vendor Orders Refined at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/vendor?tab=orders', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `vendor_orders_refined_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
});
