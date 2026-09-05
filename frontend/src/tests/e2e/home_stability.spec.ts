import { test, expect } from '@playwright/test';

test.describe('Home Page Stability & Anti-Flicker Verification', () => {
  // ── DESKTOP SUITE ──
  test.describe('Desktop Viewport (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('1. Initial Load: Hero is visible immediately without flicker or black flash', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Verify Hero H1 is visible immediately
      const heroHeading = page.locator('h1').first();
      await expect(heroHeading).toBeVisible({ timeout: 3000 });
      const initialText = await heroHeading.textContent();
      expect(initialText?.trim().length).toBeGreaterThan(0);

      // Verify continuous presence for 5 seconds (no blank state or removal)
      for (let s = 1; s <= 5; s++) {
        await page.waitForTimeout(1000);
        await expect(heroHeading).toBeVisible();
      }
    });

    test('2. Refresh (Reload): Hero remains stable across page reload', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'domcontentloaded' });

      const heroHeading = page.locator('h1').first();
      await expect(heroHeading).toBeVisible({ timeout: 2000 });

      // Assert it stays solid
      await page.waitForTimeout(3000);
      await expect(heroHeading).toBeVisible();
    });

    test('3. Client-Side Navigation: Navigating /shop -> / preserves instant Hero', async ({ page }) => {
      await page.goto('/shop', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Click on store logo to go to Home
      const logo = page.locator('a[href="/"]').first();
      await logo.click();

      // Expect URL to be /
      await expect(page).toHaveURL('/');
      const heroHeading = page.locator('h1').first();
      await expect(heroHeading).toBeVisible({ timeout: 1500 });
      await page.waitForTimeout(3000);
      await expect(heroHeading).toBeVisible();
    });
  });

  // ── MOBILE SUITE ──
  test.describe('Mobile Viewport (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('4. Mobile Initial Load: Hero is immediately visible without flash or unmount', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const heroHeading = page.locator('h1').first();
      await expect(heroHeading).toBeVisible({ timeout: 3000 });
      const mobileText = await heroHeading.textContent();
      expect(mobileText?.trim().length).toBeGreaterThan(0);

      // Observe for 5 seconds
      for (let s = 1; s <= 5; s++) {
        await page.waitForTimeout(1000);
        await expect(heroHeading).toBeVisible();
      }
    });

    test('5. Mobile Refresh: Hero remains solid without black screen', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });

      const heroHeading = page.locator('h1').first();
      await expect(heroHeading).toBeVisible({ timeout: 2000 });
      await page.waitForTimeout(3000);
      await expect(heroHeading).toBeVisible();
    });
  });
});
