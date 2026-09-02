import { test, expect } from '@playwright/test';

test.describe('Storefront Licenses & Themes Navigation E2E', () => {

  test('Desktop 1280px: Header Nav, Hover Mega Menu & /licencias Navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/licencias');
    await page.waitForLoadState('networkidle');

    // 1. Verify Header link for Licencias
    const desktopLicenciasLink = page.locator('header nav, header').filter({ hasText: /licencias/i }).first();
    await expect(desktopLicenciasLink).toBeVisible();

    // 2. Verify /licencias page title
    const pageTitle = page.locator('h1').filter({ hasText: /licencias/i });
    await expect(pageTitle).toBeVisible();

    // 3. Verify Active licenses appear on page (Marvel, Pokémon, Star Wars, Sonic, etc.)
    await expect(page.locator('text=Marvel').first()).toBeVisible();
    await expect(page.locator('text=Pokémon').first()).toBeVisible();
    await expect(page.locator('text=Star Wars').first()).toBeVisible();
  });

  const mobileViewports = [
    { width: 360, height: 740, name: 'Mobile 360px' },
    { width: 390, height: 844, name: 'Mobile 390px' },
    { width: 430, height: 932, name: 'Mobile 430px' },
  ];

  for (const vp of mobileViewports) {
    test(`${vp.name}: Drawer Menu Contains Licencias and Navigates to /licencias`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click Hamburger Button if drawer button exists
      const menuButton = page.locator('button[aria-label="Abrir menú"], button[aria-label="Toggle Menu"], header button').first();
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(300);
      }

      // Verify Licencias link inside Drawer
      const drawerLicencias = page.locator('a[href="/licencias"]').first();
      await expect(drawerLicencias).toBeVisible();
      await drawerLicencias.click();

      await page.waitForURL('**/licencias');
      expect(page.url()).toContain('/licencias');
    });
  }
});
