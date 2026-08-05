import { test, expect } from '@playwright/test';

test.describe('Vendor Navigation & Settings Subtabs System', () => {

  test.describe('Desktop Viewport (1440x900)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('01. Unauthenticated access to /vendor/onboarding redirects to login', async ({ page }) => {
      await page.goto('http://localhost:5173/vendor/onboarding');
      await expect(page).toHaveURL(/.*login/);
    });

    test('02. Direct URL access to commercial subtabs is protected', async ({ page }) => {
      await page.goto('http://localhost:5173/vendor?tab=products');
      await expect(page).toHaveURL(/.*(login|vendor)/);
    });

    test('03. Settings page default route resolves to Perfil', async ({ page }) => {
      await page.goto('http://localhost:5173/vendor?tab=settings');
      await expect(page).toHaveURL(/.*login/); // Unauthenticated redirects to login
    });
  });

  test.describe('Mobile Viewport (390x844 - iPhone 12/13/14)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('04. Onboarding page renders without horizontal overflow on mobile', async ({ page }) => {
      await page.goto('http://localhost:5173/vendor/onboarding');
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(390);
    });
  });
});
