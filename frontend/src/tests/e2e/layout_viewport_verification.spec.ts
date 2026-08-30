import { test, expect } from '@playwright/test';

test.describe('Mobile-First Layout & Viewport Regression Certification', () => {
  const viewports = [
    { name: '320x667', width: 320, height: 667 },
    { name: '375x667', width: 375, height: 667 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1440x900', width: 1440, height: 900 },
  ];

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('Strict BoundingBox & Visibility Assertions at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // 1. Desktop sidebar must be NOT VISIBLE (display: none, offsetWidth = 0)
    const aside = page.locator('aside.desktop-sidebar');
    await expect(aside).toBeHidden();
    const asideWidth = await aside.evaluate(el => (el as HTMLElement).offsetWidth);
    expect(asideWidth).toBe(0);

    // 2. MobileHeader must be VISIBLE
    const mobileHeader = page.locator('header').first();
    await expect(mobileHeader).toBeVisible();

    // 3. MobileDrawer initially CLOSED
    const drawerBackdrop = page.locator('div[role="dialog"]');
    await expect(drawerBackdrop).toBeHidden();

    // 4. Main boundingBox width >= 340px
    const main = page.locator('main.desktop-main');
    const initialMainBox = await main.boundingBox();
    expect(initialMainBox?.width).toBeGreaterThanOrEqual(340);

    // 5. Open Drawer: Main width DOES NOT CHANGE, Drawer becomes VISIBLE
    const menuButton = page.locator('button[aria-label="Abrir navegación"]').first();
    await menuButton.click();
    await page.waitForTimeout(400);

    await expect(drawerBackdrop).toBeVisible();

    const openMainBox = await main.boundingBox();
    expect(openMainBox?.width).toBeCloseTo(initialMainBox!.width, 1);

    // 6. Close Drawer via Backdrop click
    const backdrop = page.locator('div[aria-hidden="true"]').first();
    await backdrop.click({ force: true });
    await page.waitForTimeout(400);
    await expect(drawerBackdrop).toBeHidden();
  });

  test('Strict BoundingBox Assertions at 1440px Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const aside = page.locator('aside.desktop-sidebar');
    await expect(aside).toBeVisible();

    const mobileHeader = page.locator('header.lg\\:hidden');
    await expect(mobileHeader).toBeHidden();
  });

  for (const vp of viewports) {
    test(`Render and Capture Screenshot for ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);

      // Verify zero horizontal overflow
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.clientWidth;
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
        return scrollWidth > docWidth + 1;
      });
      expect(overflow).toBeFalsy();

      await page.screenshot({ path: `test-results/admin_${vp.name}_closed.png`, fullPage: false });

      if (vp.width < 1024) {
        const menuButton = page.locator('button[aria-label="Abrir navegación"]').first();
        if (await menuButton.isVisible()) {
          await menuButton.click();
          await page.waitForTimeout(400);
          await page.screenshot({ path: `test-results/admin_${vp.name}_open.png`, fullPage: false });
        }
      }
    });
  }
});
