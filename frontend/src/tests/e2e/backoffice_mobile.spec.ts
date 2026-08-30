import { test, expect } from '@playwright/test';

const viewports = [
  { width: 320, height: 667, name: 'Mobile 320' },
  { width: 360, height: 740, name: 'Mobile 360' },
  { width: 375, height: 667, name: 'Mobile 375' },
  { width: 390, height: 844, name: 'Mobile 390' },
  { width: 412, height: 915, name: 'Mobile 412' },
  { width: 430, height: 932, name: 'Mobile 430' },
  { width: 768, height: 1024, name: 'Tablet 768' },
  { width: 1440, height: 900, name: 'Desktop 1440' },
];

const allRoutes = [
  { path: '/admin', title: 'Admin Dashboard' },
  { path: '/admin/products', title: 'Admin Products' },
  { path: '/admin/orders', title: 'Admin Orders' },
  { path: '/admin/customers', title: 'Admin Customers' },
  { path: '/admin/marketplace', title: 'Admin Marketplace' },
  { path: '/admin/finances', title: 'Admin Finances' },
  { path: '/admin/logistics', title: 'Admin Logistics' },
  { path: '/admin/settings', title: 'Admin Settings' },
  { path: '/admin/categories', title: 'Admin Categories' },
  { path: '/admin/brands', title: 'Admin Brands' },
  { path: '/vendor?tab=overview', title: 'Vendor Overview' },
  { path: '/vendor?tab=orders', title: 'Vendor Orders' },
  { path: '/vendor?tab=products', title: 'Vendor Products' },
  { path: '/vendor?tab=finances', title: 'Vendor Finances' },
  { path: '/vendor?tab=shipping', title: 'Vendor Shipping' },
  { path: '/vendor?tab=settings', title: 'Vendor Settings' },
  { path: '/artist', title: 'Artist Portal' },
  { path: '/affiliate', title: 'Affiliate Portal' },
  { path: '/star2fan', title: 'Star2Fan Portal' },
];

test.describe('Backoffice Mobile-First & Responsive Verification', () => {
  for (const vp of viewports) {
    test.describe(`Viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const route of allRoutes) {
        test(`Route ${route.path} has ZERO horizontal overflow`, async ({ page }) => {
          await page.goto(route.path, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(400);

          const overflowInfo = await page.evaluate(() => {
            const docWidth = document.documentElement.clientWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
            const maxScrollWidth = Math.max(scrollWidth, bodyScrollWidth);
            return {
              docWidth,
              maxScrollWidth,
              hasOverflow: maxScrollWidth > docWidth + 1
            };
          });

          expect(overflowInfo.hasOverflow).toBeFalsy();
        });
      }

      if (vp.width < 1024) {
        test('Mobile drawer opens and closes correctly', async ({ page }) => {
          await page.goto('/admin', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(400);

          const menuBtn = page.locator('button[aria-label="Abrir navegación"]').first();
          if (await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(300);

            const drawer = page.locator('[role="dialog"]').first();
            await expect(drawer).toBeVisible();

            const closeBtn = page.locator('button[aria-label="Cerrar menú"]').first();
            if (await closeBtn.isVisible()) {
              await closeBtn.click();
              await page.waitForTimeout(300);
              await expect(drawer).toBeHidden();
            }
          }
        });

        test('FilterDrawer bottom sheet opens and closes correctly on Admin Orders', async ({ page }) => {
          await page.goto('/admin/orders', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(400);

          const filterTrigger = page.locator('button:has-text("Filtros")').first();
          if (await filterTrigger.isVisible()) {
            await filterTrigger.click();
            await page.waitForTimeout(300);

            const filterDrawer = page.locator('[role="dialog"]:has-text("Filtros")').first();
            await expect(filterDrawer).toBeVisible();

            const applyBtn = page.locator('button:has-text("Aplicar Filtros")').first();
            if (await applyBtn.isVisible()) {
              await applyBtn.click();
              await page.waitForTimeout(300);
              await expect(filterDrawer).toBeHidden();
            }
          }
        });
      }
    });
  }
});

test.describe('Visual Screenshots Capture at 390px (Mobile 390)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const screenshotRoutes = [
    { path: '/admin', name: 'admin_dashboard' },
    { path: '/admin/products', name: 'admin_products' },
    { path: '/admin/orders', name: 'admin_orders' },
    { path: '/admin/marketplace', name: 'admin_marketplace' },
    { path: '/admin/customers', name: 'admin_customers' },
    { path: '/admin/finances', name: 'admin_finances' },
    { path: '/admin/logistics', name: 'admin_logistics' },
    { path: '/admin/settings', name: 'admin_settings' },
    { path: '/vendor?tab=overview', name: 'vendor_overview' },
    { path: '/vendor?tab=orders', name: 'vendor_orders' },
    { path: '/vendor?tab=products', name: 'vendor_products' },
    { path: '/vendor?tab=finances', name: 'vendor_finances' },
    { path: '/vendor?tab=settings', name: 'vendor_settings' },
    { path: '/artist', name: 'portal_artist' },
    { path: '/affiliate', name: 'portal_affiliate' },
    { path: '/star2fan', name: 'portal_star2fan' },
  ];

  for (const item of screenshotRoutes) {
    test(`Capture screenshot for ${item.name}`, async ({ page }) => {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `tests/e2e/screenshots/${item.name}_390px.png`, fullPage: false });
    });
  }
});
