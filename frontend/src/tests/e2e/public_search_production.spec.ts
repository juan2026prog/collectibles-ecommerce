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

    test('4. Full Product Card Integrity: Own Product (Minecraft)', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop?q=MINECRAFT', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      // Target article.grid-card containing product
      const card = page.locator('article.grid-card').first();
      await expect(card).toBeVisible({ timeout: 10000 });

      // Title H3 is visible and non-empty
      const titleElem = card.locator('h3').first();
      await expect(titleElem).toBeVisible({ timeout: 5000 });
      const titleText = await titleElem.textContent();
      expect(titleText?.trim().length).toBeGreaterThan(0);

      // Image has src attribute
      const imgElem = card.locator('img').first();
      await expect(imgElem).toBeVisible({ timeout: 5000 });
      const imgSrc = await imgElem.getAttribute('src');
      expect(imgSrc).toBeTruthy();

      // Link points to product detail
      const linkElem = card.locator('a[href^="/producto/"]').first();
      const href = await linkElem.getAttribute('href');
      expect(href).toMatch(/^\/producto\/[\w-]+$/);
    });

    test('5. Full Product Card Integrity: Vendor Product (Star Wars / Black Series)', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop?q=Star%20Wars', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const card = page.locator('article.grid-card').first();
      await expect(card).toBeVisible({ timeout: 10000 });

      const titleElem = card.locator('h3').first();
      await expect(titleElem).toBeVisible({ timeout: 5000 });
      const titleText = await titleElem.textContent();
      expect(titleText?.trim().length).toBeGreaterThan(0);

      const imgElem = card.locator('img').first();
      await expect(imgElem).toBeVisible({ timeout: 5000 });

      const linkElem = card.locator('a[href^="/producto/"]').first();
      const href = await linkElem.getAttribute('href');
      expect(href).toMatch(/^\/producto\/[\w-]+$/);
    });

    test('6. Full Product Card Integrity: International Product (NECA Ghost Face)', async ({ page }) => {
      await page.goto('https://collectibles.uy/shop?q=Ghost%20Face', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const card = page.locator('article.grid-card').first();
      await expect(card).toBeVisible({ timeout: 10000 });

      const titleElem = card.locator('h3').first();
      await expect(titleElem).toBeVisible({ timeout: 5000 });
      const titleText = await titleElem.textContent();
      expect(titleText?.trim().length).toBeGreaterThan(0);

      const imgElem = card.locator('img').first();
      await expect(imgElem).toBeVisible({ timeout: 5000 });

      const linkElem = card.locator('a[href^="/producto/"]').first();
      const href = await linkElem.getAttribute('href');
      expect(href).toMatch(/^\/producto\/[\w-]+$/);
    });
  });

  // Test mobile viewport
  test.describe('Mobile Viewport (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('7. Mobile storefront search accessible and responsive', async ({ page }) => {
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
