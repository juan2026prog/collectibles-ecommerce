import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'final_mobile_audit');

test.describe('FINAL MOBILE VISUAL AUDIT — Backoffice Screenshots (375x667 & 390x844)', () => {
  test.setTimeout(90000);

  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

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

  const screens = [
    { route: '/admin', name: 'admin_dashboard' },
    { route: '/admin/products', name: 'admin_products' },
    { route: '/admin/orders', name: 'admin_orders' },
    { route: '/admin/vendors', name: 'admin_vendors' },
    { route: '/admin/settings?tab=notifications', name: 'admin_settings_notifications' },
    { route: '/vendor', name: 'vendor_dashboard' },
    { route: '/vendor?tab=orders', name: 'vendor_orders' },
  ];

  for (const vp of viewports) {
    for (const scr of screens) {
      test(`Capture ${scr.name} at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(scr.route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${scr.name}_${vp.name}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      });
    }
  }
});
