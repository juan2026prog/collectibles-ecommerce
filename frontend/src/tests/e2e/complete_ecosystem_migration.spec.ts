import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'src', 'tests', 'e2e', 'screenshots', 'complete_ecosystem_migration');

test.describe('COMPLETE ECOSYSTEM MIGRATION — Backoffice Design System Across All Internal Roles', () => {
  test.setTimeout(120000);

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
    { width: 390, height: 844, name: '390x844' },
    { width: 1280, height: 800, name: '1280x800' },
  ];

  const screens = [
    { route: '/admin', name: 'admin_dashboard', role: 'Admin' },
    { route: '/admin/products', name: 'admin_products', role: 'Admin' },
    { route: '/admin/orders', name: 'admin_orders', role: 'Admin' },
    { route: '/admin/affiliates', name: 'admin_affiliates', role: 'Admin' },
    { route: '/admin/marketplace', name: 'admin_marketplace', role: 'Admin' },
    { route: '/admin/users', name: 'admin_users', role: 'Admin' },
    { route: '/vendor', name: 'vendor_dashboard', role: 'Vendor' },
    { route: '/vendor?tab=orders', name: 'vendor_orders', role: 'Vendor' },
    { route: '/affiliate', name: 'affiliate_portal', role: 'Affiliate' },
    { route: '/artist', name: 'artist_portal', role: 'Artist' },
    { route: '/star2fan', name: 'star2fan_portal', role: 'Star2Fan' },
    { route: '/account', name: 'customer_portal', role: 'Customer' },
  ];

  for (const vp of viewports) {
    for (const scr of screens) {
      test(`Capture ${scr.name} (${scr.role}) at ${vp.name}`, async ({ page }) => {
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
