import { test, expect } from '@playwright/test';

test.describe('Basic E2E Tests', () => {
  
  test('Homepage loads', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await expect(page).toHaveTitle(/Collectibles/i);
  });

  test('Shop page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/shop');
    await expect(page.locator('text=SHOP')).toBeVisible();
  });

  test('Login page loads', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('Cart page redirects to shop and opens drawer', async ({ page }) => {
    await page.goto('http://localhost:5173/cart');
    await expect(page).toHaveURL(/.*shop/);
    await expect(page.locator('text=Carrito')).toBeVisible();
  });
});
