import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Capture Production MobileDrawer Open (375x667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Capture MobileDrawer open at 375x667', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });

    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const menuBtn = page.locator('button[aria-label="Abrir navegación"]').first();
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(600);
    }

    const screenshotPath = path.join(process.cwd(), 'tests', 'e2e', 'screenshots', 'pilot_mobile', 'prod_drawer_open_375x667.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const auditData = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const drawerPanel = dialog ? dialog.children[1] || dialog.querySelector('.bg-dark-900') : null;
      const productosLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent?.includes('Productos'));
      const productosIcon = productosLink?.querySelector('svg');

      return {
        drawerWidth: drawerPanel ? window.getComputedStyle(drawerPanel).width : null,
        drawerMaxWidth: drawerPanel ? window.getComputedStyle(drawerPanel).maxWidth : null,
        itemFontSize: productosLink ? window.getComputedStyle(productosLink).fontSize : null,
        itemHeight: productosLink ? window.getComputedStyle(productosLink).height : null,
        iconWidth: productosIcon ? window.getComputedStyle(productosIcon).width : null,
        iconHeight: productosIcon ? window.getComputedStyle(productosIcon).height : null,
      };
    });

    console.log('FINAL_PRODUCTION_COMPUTED_DRAWER_AUDIT:', JSON.stringify(auditData, null, 2));
  });
});
