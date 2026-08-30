import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'fase_a_mobile');

test.describe('FASE A — Admin Core Mobile UX Screenshots (375x667 & 390x844)', () => {
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
    test(`Capture Admin Dashboard at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_dashboard_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Orders at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_orders_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Categories at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/categories', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_categories_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Tags at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/tags', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_tags_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Groups at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/groups', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_groups_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });

    test(`Capture Admin Badges at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/badges', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `admin_badges_${vp.name}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
});
