import { test, expect } from '@playwright/test';

test.describe('Mobile Layout 375px Root Cause Audit', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('Inspect DOM layout at 375px', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const layoutInfo = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const header = document.querySelector('header');
      const main = document.querySelector('main');
      const bodyWidth = document.body.clientWidth;

      return {
        bodyWidth,
        aside: aside ? {
          offsetWidth: aside.offsetWidth,
          clientWidth: aside.clientWidth,
          computedDisplay: window.getComputedStyle(aside).display,
          computedWidth: window.getComputedStyle(aside).width,
          computedVisibility: window.getComputedStyle(aside).visibility,
          classes: aside.className
        } : null,
        header: header ? {
          offsetWidth: header.offsetWidth,
          computedDisplay: window.getComputedStyle(header).display,
          classes: header.className
        } : null,
        main: main ? {
          offsetWidth: main.offsetWidth,
          clientWidth: main.clientWidth,
          computedWidth: window.getComputedStyle(main).width,
          classes: main.className
        } : null,
      };
    });

    console.log('LAYOUT_AUDIT_375:', JSON.stringify(layoutInfo, null, 2));

    await page.screenshot({ path: 'test-results/admin_375px_audit.png', fullPage: false });
  });
});
