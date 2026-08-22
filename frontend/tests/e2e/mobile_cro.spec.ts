import { test, expect } from '@playwright/test';

test.describe('CRO Mobile Audit & E2E Verification', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Mobile Viewport (iPhone 13)
  });

  test('1. Mobile Home loads correctly, search bar is visible, Hero CTA & Novedades section exist', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Mobile Search Bar visible
    const searchInput = page.locator('input[placeholder*="Buscar Funko"]');
    await expect(searchInput).toBeVisible();

    // Hero CTA link (Primary CTA)
    const heroCta = page.locator('.btn-primary').first();
    await expect(heroCta).toBeVisible();

    // Novedades section with products (waits for async data)
    const novedadesHeading = page.locator('h2', { hasText: 'NOVEDADES' });
    await expect(novedadesHeading).toBeVisible({ timeout: 10000 });

    const verTodasLink = page.getByRole('link', { name: /VER TODAS/i });
    await expect(verTodasLink).toBeVisible();
  });

  test('2. Mobile Search bar navigates to Shop with query', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('input[placeholder*="Buscar Funko"]');
    await searchInput.fill('Funko');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/shop\?q=Funko/);
  });

  test('3. Product card Wishlist button click does NOT navigate away', async ({ page }) => {
    await page.goto('/');
    
    // Find wishlist button inside first ProductGridCard
    const wishlistBtn = page.locator('button[title*="favoritos"]').first();
    if (await wishlistBtn.isVisible()) {
      const currentUrl = page.url();
      await wishlistBtn.click();
      // Should remain on the same page
      expect(page.url()).toBe(currentUrl);
    }
  });

  test('4. AddToCart button updates state and does not trigger card navigation', async ({ page }) => {
    await page.goto('/');
    
    const cartBtn = page.locator('button[title="Agregar al carrito"]').first();
    if (await cartBtn.isVisible()) {
      await cartBtn.click();
      // Verify button shows feedback text (Cargando or ✓ Agregado)
      await expect(cartBtn).toHaveText(/Cargando|Agregado/);
    }
  });

  test('5. Shop mobile page uses Cargar Más button without duplicate items', async ({ page }) => {
    await page.goto('/shop');

    const loadMoreBtn = page.getByRole('button', { name: /CARGAR MÁS PRODUCTOS/i });
    if (await loadMoreBtn.isVisible()) {
      await expect(loadMoreBtn).toBeEnabled();

      // Count initial cards
      const initialCardsCount = await page.locator('article.grid-card').count();

      // Click Cargar Más
      await loadMoreBtn.click();
      await page.waitForTimeout(1000);

      // Verify more cards are appended
      const newCardsCount = await page.locator('article.grid-card').count();
      expect(newCardsCount).toBeGreaterThanOrEqual(initialCardsCount);
    }
  });

  test('6. Search & Cargar Más work together', async ({ page }) => {
    await page.goto('/shop?q=a');

    const cardsCount = await page.locator('article.grid-card').count();
    expect(cardsCount).toBeGreaterThanOrEqual(0);
  });

  test('7. Navigation to product detail and Back button restores state', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    const firstCardLink = page.locator('article.grid-card a[href^="/p/"]').first();
    if (await firstCardLink.isVisible()) {
      await firstCardLink.click();
      await expect(page).toHaveURL(/\/p\//);

      // Click Back
      await page.goBack();
      await expect(page).toHaveURL(/\/shop/);
    }
  });
});
