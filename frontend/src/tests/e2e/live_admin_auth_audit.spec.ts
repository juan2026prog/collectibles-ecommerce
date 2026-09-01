import { test, expect } from '@playwright/test';

test.describe('Live Production Authenticated DOM & BoundingBox Audit', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('Audit authenticated DOM on https://collectibles.uy/admin/categories at 375x667', async ({ page }) => {
    // Navigate directly to live production URL
    await page.goto('https://collectibles.uy/admin/categories', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log('LIVE_PROD_URL_AFTER_BYPASS:', currentUrl);

    const auditResult = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const header = document.querySelector('header');
      const mobileHeader = document.querySelector('header.lg\\:hidden') || document.querySelector('header');
      const drawer = document.querySelector('div[role="dialog"]');

      return {
        url: window.location.href,
        aside: aside ? {
          className: aside.className,
          computedDisplay: window.getComputedStyle(aside).display,
          computedWidth: window.getComputedStyle(aside).width,
          offsetWidth: aside.offsetWidth,
          getBoundingClientRectWidth: aside.getBoundingClientRect().width,
          hasDesktopSidebarClass: aside.classList.contains('desktop-sidebar'),
        } : null,
        main: main ? {
          className: main.className,
          computedWidth: window.getComputedStyle(main).width,
          getBoundingClientRectWidth: main.getBoundingClientRect().width,
          hasDesktopMainClass: main.classList.contains('desktop-main'),
        } : null,
        header: header ? {
          className: header.className,
          computedDisplay: window.getComputedStyle(header).display,
          offsetWidth: header.offsetWidth,
        } : null,
        mobileHeaderVisible: mobileHeader ? window.getComputedStyle(mobileHeader).display !== 'none' : false,
        drawerVisible: drawer ? window.getComputedStyle(drawer).display !== 'none' : false,
      };
    });

    console.log('LIVE_AUTHENTICATED_DOM_AUDIT_RES:', JSON.stringify(auditResult, null, 2));

    await page.screenshot({ path: 'test-results/live_prod_categories_375px_final.png', fullPage: false });
  });
});
