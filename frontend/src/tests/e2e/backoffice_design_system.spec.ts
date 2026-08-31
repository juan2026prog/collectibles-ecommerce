import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'src', 'tests', 'e2e', 'screenshots', 'backoffice_design_system');

test.describe('BACKOFFICE DESIGN SYSTEM — Shared Primitives Screenshots', () => {
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
    { width: 360, height: 740, name: '360x740' },
    { width: 375, height: 667, name: '375x667' },
    { width: 390, height: 844, name: '390x844' },
    { width: 1280, height: 800, name: '1280x800' },
  ];

  const screens = [
    { route: '/admin', name: 'admin_dashboard' },
    { route: '/admin/products', name: 'admin_products' },
    { route: '/admin/users', name: 'admin_users' },
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
