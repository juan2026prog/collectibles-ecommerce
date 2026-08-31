import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(process.cwd(), 'src', 'tests', 'e2e', 'screenshots', 'contact_sheets');

test.describe('FINAL GLOBAL VISUAL QA & AUDIT IN PRODUCTION', () => {
  test.setTimeout(180000);

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
    { width: 430, height: 932, name: '430x932' },
    { width: 768, height: 1024, name: '768x1024' },
    { width: 1280, height: 800, name: '1280x800' },
  ];

  const screens = [
    // Admin
    { route: '/admin', name: 'admin_dashboard', role: 'Admin' },
    { route: '/admin/products', name: 'admin_products', role: 'Admin' },
    { route: '/admin/orders', name: 'admin_orders', role: 'Admin' },
    { route: '/admin/affiliates', name: 'admin_affiliates', role: 'Admin' },
    { route: '/admin/marketplace', name: 'admin_marketplace', role: 'Admin' },
    { route: '/admin/users', name: 'admin_users', role: 'Admin' },
    { route: '/admin/media', name: 'admin_media', role: 'Admin' },
    { route: '/admin/settings', name: 'admin_settings', role: 'Admin' },
    { route: '/admin/categories', name: 'admin_categories', role: 'Admin' },
    { route: '/admin/brands', name: 'admin_brands', role: 'Admin' },
    { route: '/admin/banners', name: 'admin_banners', role: 'Admin' },
    { route: '/admin/promotions', name: 'admin_promotions', role: 'Admin' },
    { route: '/admin/coupons', name: 'admin_coupons', role: 'Admin' },
    { route: '/admin/customers', name: 'admin_customers', role: 'Admin' },
    { route: '/admin/finances', name: 'admin_finances', role: 'Admin' },
    { route: '/admin/logistics', name: 'admin_logistics', role: 'Admin' },
    { route: '/admin/reports', name: 'admin_reports', role: 'Admin' },
    { route: '/admin/pages', name: 'admin_pages', role: 'Admin' },
    { route: '/admin/tags', name: 'admin_tags', role: 'Admin' },
    { route: '/admin/groups', name: 'admin_groups', role: 'Admin' },
    { route: '/admin/badges', name: 'admin_badges', role: 'Admin' },
    { route: '/admin/mailing', name: 'admin_mailing', role: 'Admin' },
    { route: '/admin/seo', name: 'admin_seo', role: 'Admin' },
    { route: '/admin/artists', name: 'admin_artists', role: 'Admin' },
    { route: '/admin/refunds', name: 'admin_refunds', role: 'Admin' },
    { route: '/admin/automations', name: 'admin_automations', role: 'Admin' },

    // Vendor
    { route: '/vendor', name: 'vendor_dashboard', role: 'Vendor' },
    { route: '/vendor?tab=orders', name: 'vendor_orders', role: 'Vendor' },
    { route: '/vendor?tab=products', name: 'vendor_products', role: 'Vendor' },

    // Portales
    { route: '/affiliate', name: 'affiliate_portal', role: 'Affiliate' },
    { route: '/artist', name: 'artist_portal', role: 'Artist' },
    { route: '/star2fan', name: 'star2fan_portal', role: 'Star2Fan' },
    { route: '/account', name: 'customer_portal', role: 'Customer' },
  ];

  for (const vp of viewports) {
    for (const scr of screens) {
      test(`QA ${scr.name} (${scr.role}) at ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        
        const consoleErrors: string[] = [];
        const badRequests: string[] = [];

        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });

        page.on('response', (res) => {
          if (res.status() >= 400) {
            badRequests.push(`${res.status()} ${res.url()}`);
          }
        });

        await page.goto(scr.route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Measure layout metrics in mobile
        if (vp.width < 768) {
          const metrics = await page.evaluate(() => {
            const h1 = document.querySelector('h1, h2');
            const h1Font = h1 ? window.getComputedStyle(h1).fontSize : '0px';
            const bodyWidth = document.body.scrollWidth;
            const vw = window.innerWidth;
            const hasHorizontalOverflow = bodyWidth > vw + 2;
            const tables = Array.from(document.querySelectorAll('table')).filter(
              (t) => window.getComputedStyle(t).display !== 'none'
            );
            return {
              h1FontSizePx: parseFloat(h1Font),
              hasHorizontalOverflow,
              visibleTablesCount: tables.length,
            };
          });

          // Assertions against hard failures
          expect(metrics.hasHorizontalOverflow).toBe(false);
          expect(metrics.h1FontSizePx).toBeLessThanOrEqual(28); // Allows up to 24px - 28px header max
        }

        // Take screenshot for contact sheet
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${scr.role.toLowerCase()}_${scr.name}_${vp.name}.png`),
          fullPage: false,
          animations: 'disabled',
        });

        // Fail if there are 400 Bad Request errors (excluding benign analytics)
        const critical400s = badRequests.filter(url => !url.includes('google-analytics') && !url.includes('onesignal'));
        expect(critical400s.length).toBe(0);
      });
    }
  }
});
