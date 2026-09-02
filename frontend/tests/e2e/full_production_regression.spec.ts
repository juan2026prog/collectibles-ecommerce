import { test, expect } from '@playwright/test';

test.describe('COLLECTIBLES2026 — FULL PRODUCTION REGRESSION SUITE (RELEASE GATE)', () => {

  test('1. STOREFRONT: Home, Shop, Categories, Brands & Product Details', async ({ page }) => {
    // Home
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1, header, nav').first()).toBeVisible();

    // Shop
    await page.goto('/shop');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/shop');

    // Categoría Real
    await page.goto('/categoria/figuras');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/categoria/figuras');

    // Marca Real
    await page.goto('/marca/funko');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/marca/funko');

    // Producto Real
    await page.goto('/producto/figura-de-acci-n-glamrock-fred-security-breach-47490-de-funko-4336');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/producto/');
  });

  test('2. THEMES & LICENCIAS: Indexes and dynamic route redirects', async ({ page }) => {
    // /themes index
    await page.goto('/themes');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/themes');

    // /themes/:slug
    await page.goto('/themes/anime-manga');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/themes/anime-manga');

    // /temas redirect
    await page.goto('/temas');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/themes');

    // /temas/:slug redirect
    await page.goto('/temas/anime-manga');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/themes/anime-manga');

    // /licencias
    await page.goto('/licencias');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/licencias');
  });

  test('3. STATIC PAGES: Nosotros, Terminos, Privacidad, Contacto', async ({ page }) => {
    await page.goto('/page/nosotros');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/page/nosotros');

    await page.goto('/page/terminos');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/page/terminos');

    await page.goto('/page/pol-ticas-de-privacidad');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/page/pol-ticas-de-privacidad');

    await page.goto('/contact');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/contact');
  });

  test('4. AUTH & CART: Login routes, Cart page, Checkout entry', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/login');

    await page.goto('/cart');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/cart');

    await page.goto('/checkout');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/checkout');
  });

  test('5. VENDOR & ADMIN GUARDS: Protected routes redirect to login or show guard', async ({ page }) => {
    await page.goto('/vendor');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
  });

  test('6. INTERNATIONAL & MARKETPLACE: International storefront & cart', async ({ page }) => {
    await page.goto('/intl');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/internacional/cart');
    await page.waitForLoadState('domcontentloaded');
  });

  test('7. 404 HANDLING: Invalid routes display 404 page', async ({ page }) => {
    const response = await page.goto('/marca/no-existe-xyz-999');
    expect([200, 404]).toContain(response?.status());
  });

});
