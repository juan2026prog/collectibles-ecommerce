import { test, expect } from '@playwright/test';

const cartPayload = [
  {
    product_id: '11111111-1111-1111-1111-111111111111',
    variant_id: '22222222-2222-2222-2222-222222222222',
    quantity: 1,
    title: 'Figura Test',
    price: 1990,
    image: '',
    variant_name: 'Default',
  },
];

test.describe('Checkout flow', () => {
  test('creates an order and redirects to the success screen using the validated flow', async ({ page }) => {
    await page.addInitScript((cart) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('affiliate_code', 'AFI-TEST');
    }, cartPayload);

    await page.route('**/functions/v1/create-order', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');
      expect(body.payment_method).toBe('mercadopago');
      expect(body.affiliate_code).toBe('AFI-TEST');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'ord-test-12345678',
            total_amount: 1990,
            subtotal: 1990,
            discount: 0,
            bank_discount: 0,
            shipping: 0,
            status: 'pending',
            items_count: 1,
            currency: 'UYU',
            payment_method: 'mercadopago',
            customer_email: 'tester@example.com',
          },
        }),
      });
    });

    await page.route('**/functions/v1/create-payment', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      expect(body.order_id).toBe('ord-test-12345678');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkout_url: 'http://localhost:5173/checkout/success?order_id=ord-test-12345678&provider=mercadopago',
        }),
      });
    });

    await page.route('**/functions/v1/confirm-payment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'paid',
          order: {
            id: 'ord-test-12345678',
            status: 'paid',
            total_amount: 1990,
            currency: 'UYU',
            payment_method: 'mercadopago',
            customer_email: 'tester@example.com',
          },
        }),
      });
    });

    await page.goto('/checkout');
    await expect(page.getByText('Datos de facturacion', { exact: false })).toBeVisible();

    await page.fill('input[type="email"]', 'tester@example.com');
    await page.locator('input').nth(1).fill('Test');
    await page.locator('input').nth(2).fill('Buyer');
    await page.getByLabel('Retiro en local').click({ force: true });

    await page.getByRole('button', { name: /Finalizar compra/i }).click();

    await page.waitForURL(/checkout\/success/);
    await expect(page.getByText('Gracias por tu compra')).toBeVisible();
    await expect(page.getByText('Numero de orden')).toBeVisible();
  });
});
