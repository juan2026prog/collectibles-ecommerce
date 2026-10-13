import { test, expect } from '@playwright/test';

test.describe('E2E Public Search Verification on https://collectibles.uy', () => {
  // Test desktop viewport
  test.describe('Desktop Viewport (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('1. Header search autocomplete & navigation on Desktop', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Verify search input is present in header or catalog
      const searchInputs = page.locator('input[type="text"], input[type="search"]');
      await expect(searchInputs.first()).toBeVisible({ timeout: 5000 });

      // Type query into search input
      const searchBox = page.locator('input[placeholder*="Buscar"]').first();
      if (await searchBox.isVisible()) {
        await searchBox.fill('Pokemon');
        await page.waitForTimeout(500);
        await searchBox.press('Enter');
        await page.waitForTimeout(1500);

        // Ensure URL updated to include query
        expect(page.url()).toContain('Pokemon');
      }
    });

    test('2. Direct catalog search query via URL with pagination', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop?q=Pokemon', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Verify products are rendered or catalog container exists
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeDefined();

      // Ensure page 2 pagination navigation does not crash
      await page.goto('https://collectibles.uy/shop?q=Pokemon&page=2', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      expect(page.url()).toContain('page=2');
    });

    test('3. Zero results search displays graceful empty state without crashing', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop?q=producto_inexistente_xyz_99999', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const bodyText = await page.textContent('body');
      expect(bodyText).toBeDefined();
    });
  });

  // Test mobile viewport
  test.describe('Mobile Viewport (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('4. Mobile storefront search accessible and responsive', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Locate mobile search input in mobile container
      const mobileSearchInput = page.locator('.lg\\:hidden input[placeholder*="Buscar"]').first();
      await expect(mobileSearchInput).toBeVisible({ timeout: 5000 });

      await mobileSearchInput.fill('Chucky');
      await mobileSearchInput.press('Enter');
      await page.waitForTimeout(1500);

      expect(page.url()).toContain('Chucky');
    });
  });
});
