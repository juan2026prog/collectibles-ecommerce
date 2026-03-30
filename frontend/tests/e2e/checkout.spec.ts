import { test, expect } from '@playwright/test';

// ==========================================
// TESTER AGENT REPORT: E2E Checkout Flow
// ==========================================
// Este archivo representa la Capa de Pruebas Automatizadas 
// solicitada por el Arquitecto. Asegura que ninguna actualización 
// futura rompa el flujo de ventas principal (Checkout).

test.describe('E-Commerce Core E2E', () => {
  
  test('Flujo de la orden: De la Frontpage a Completar Checkout', async ({ page }) => {
    // 1. Visitar Web
    await page.goto('http://localhost:5173/');
    await expect(page).toHaveTitle(/Collectibles/);

    // 2. Navegar a Tienda
    await page.click('text=SHOP NOW');
    await expect(page).toHaveURL(/.*shop/);

    // 3. Añadir Producto al Carrito (Intercepción simulada de UI)
    // El Test espera que exista un botón de 'Add to Cart' en la primera tarjeta de producto
    const productCard = page.locator('.group').first();
    await productCard.hover();
    await productCard.locator('button:has-text("Add to Cart")').click();

    // 4. Ir a Checkout
    await page.goto('http://localhost:5173/checkout');
    await expect(page.locator('text=BILLING DETAILS')).toBeVisible();

    // 5. Rellenar Datos
    await page.fill('input[type="email"]', 'tester-agent@collectibles.com');
    await page.fill('input:has-text("First Name"), input[placeholder="First Name"]', 'Agent');
    await page.fill('input:has-text("Last Name"), input[placeholder="Last Name"]', 'Tester');
    await page.fill('input:has-text("Phone"), input[placeholder="Phone"]', '+59899123456');
    await page.fill('input:has-text("Street Address"), input[placeholder="Street Address"]', 'Av. 18 de Julio 1234');
    await page.fill('input:has-text("City"), input[placeholder="City"]', 'Montevideo');

    // 6. Seleccionar dLocal Go
    await page.click('label:has-text("dLocal Go")');

    // MOCK: Prevenir redirección real a Sandbox Dlocal
    await page.route('**/functions/v1/dlocalgo-checkout', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ redirect_url: 'http://localhost:5173/checkout/success?order_id=test-1234' })
      });
    });

    // 7. Pagar
    await page.click('button:has-text("PLACE ORDER")');

    // Verificación
    // Como simulamos dlocal, deberá navegar a /checkout/success (este endpoint existe idealmente)
    await page.waitForURL(/.*success/);
    await expect(page.locator('text=Order placed')).toBeVisible();
  });
});
