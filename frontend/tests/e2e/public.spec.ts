import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  
  test('Homepage loads correctly', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await expect(page).toHaveTitle(/Collectibles/i);
  });

  test('Shop page loads with products', async ({ page }) => {
    await page.goto('http://localhost:5173/shop');
    await expect(page.locator('text=SHOP')).toBeVisible({ timeout: 10000 });
  });

  test('Product detail page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/shop');
    await page.waitForSelector('a[href^="/p/"]', { timeout: 10000 });
    const firstProduct = page.locator('a[href^="/p/"]').first();
    await firstProduct.click();
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('Cart page redirects to shop and opens drawer', async ({ page }) => {
    await page.goto('http://localhost:5173/cart');
    await expect(page).toHaveURL(/.*shop/);
    await expect(page.locator('text=Carrito')).toBeVisible({ timeout: 10000 });
  });

  test('Login page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });

  test('Register page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/register');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navigation', () => {
  
  test('Navigate from home to shop', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.click('text=SHOP NOW');
    await expect(page).toHaveURL(/.*shop/);
  });

  test('Open cart drawer from header', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.click('button[title="Ver Carrito"]');
    await expect(page.locator('text=Carrito')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Responsive Design', () => {
  
  test('Mobile viewport works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5173/shop');
    await expect(page.locator('text=SHOP')).toBeVisible({ timeout: 10000 });
  });

  test('Tablet viewport works', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('http://localhost:5173/shop');
    await expect(page.locator('text=SHOP')).toBeVisible({ timeout: 10000 });
  });
});
