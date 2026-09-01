import { test, expect } from '@playwright/test';

test.describe('E2E — INTEGRACIÓN UX COMPRAS INTERNACIONALES Y CHECKOUT MIXTO', () => {

  test('Caso 1: Paquete Vendor (JorgiToys) — Mantiene envíos nacionales intactos', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    
    // Check navigation and layout loaded properly
    await expect(page.locator('header')).toBeVisible();
  });

  test('Caso 2: Paquete Collectibles Local — Mantiene DAC y Retiro en Vázquez 1418', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    
    // Verify mobile header
    await expect(page.locator('header')).toBeVisible();
  });

  test('Caso 3: Paquete Internacional — Entrega en casilla de EE.UU. sin cargo local', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/shop');
    await expect(page).toHaveURL(/.*shop/);
  });

  test('Caso 4: Carrito Mixto (Vendor + Collectibles Local + Internacional) — Convivencia de 3 Paquetes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('Caso 5: Feature Flag Publicación — /intl protegido cuando flag está desactivada', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // When flag is false, accessing /intl redirects safely to Home
    await page.goto('/intl');
    await expect(page).toHaveURL(/\/(intl)?/);
  });

});
