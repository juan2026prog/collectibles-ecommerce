import { test, expect } from '@playwright/test';

const cartPayload = [
  {
    product_id: '11111111-1111-1111-1111-111111111111',
    variant_id: '22222222-2222-2222-2222-222222222222',
    quantity: 1,
    title: 'Figura Platform (Collectibles)',
    price: 1000,
    image: '',
    variant_name: 'Default',
    vendor_id: null,
    vendor_store_id: null,
    vendor_name: 'Collectibles.uy'
  },
  {
    product_id: '33333333-3333-3333-3333-333333333333',
    variant_id: '44444444-4444-4444-4444-444444444444',
    quantity: 1,
    title: 'Figura JorgiToys',
    price: 1500,
    image: '',
    variant_name: 'Default',
    vendor_id: '88888888-8888-8888-8888-888888888888',
    vendor_store_id: '99999999-9999-9999-9999-999999999999',
    vendor_name: 'JorgiToys'
  },
  {
    product_id: '55555555-5555-5555-5555-555555555555',
    variant_id: '66666666-6666-6666-6666-666666666666',
    quantity: 1,
    title: 'Figura Vendor 3',
    price: 2000,
    image: '',
    variant_name: 'Default',
    vendor_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    vendor_store_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    vendor_name: 'Vendor 3'
  }
];

test.describe('Multi-vendor Checkout E2E tests', () => {
  test('handles mixed cart with separate shipping selections and validations', async ({ page }) => {
    // Setup cart
    await page.addInitScript((cart) => {
      localStorage.setItem('cart', JSON.stringify(cart));
      localStorage.setItem('affiliate_code', 'AFI-TEST');
    }, cartPayload);

    // Mock vendors metadata query
    await page.route('**/rest/v1/vendors*', async (route) => {
      const url = new URL(route.request().url());
      const idParam = url.searchParams.get('id');
      
      let data: any[] = [];
      if (idParam?.includes('88888888-8888-8888-8888-888888888888')) {
        data.push({
          id: '88888888-8888-8888-8888-888888888888',
          shipping_settings: {
            dac: { active: true, agency: true, home: true },
            pickup: { active: false }
          },
          promotions_opt_in: false
        });
      }
      if (idParam?.includes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) {
        data.push({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          shipping_settings: {
            dac: { active: false },
            pickup: { active: true, address: 'Av. Italia 1234', hours: '9 a 18 hs' },
            manual: { active: true, cost: 150 }
          },
          promotions_opt_in: false
        });
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data)
      });
    });

    // Mock dispatch addresses query
    await page.route('**/rest/v1/vendor_dispatch_addresses*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            vendor_id: '88888888-8888-8888-8888-888888888888',
            department: 'Montevideo',
            city: 'Montevideo',
            address: 'Av. Italia 9999',
            phone: '099000000',
            is_default: true
          },
          {
            vendor_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            department: 'Montevideo',
            city: 'Montevideo',
            address: 'Av. Italia 1234',
            phone: '099111111',
            is_default: true
          }
        ])
      });
    });

    // Mock DAC offices query
    await page.route('**/rest/v1/dac_offices*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            k_oficina: 100,
            office_name: 'Agencia Centro',
            address: 'San José 1234',
            department: 'Montevideo'
          }
        ])
      });
    });

    // Mock create-order RPC
    await page.route('**/functions/v1/create-order', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      
      // Ensure the items are correctly passed
      expect(body.items).toHaveLength(3);
      
      // Ensure suborders_shipping is structured
      expect(body.suborders_shipping).toBeDefined();
      expect(body.suborders_shipping.collectibles).toBeDefined();
      expect(body.suborders_shipping['99999999-9999-9999-9999-999999999999']).toBeDefined(); // JorgiToys group
      expect(body.suborders_shipping['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']).toBeDefined(); // Vendor 3 group

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'ord-multi-123',
            total_amount: 4500,
            subtotal: 4500,
            discount: 0,
            bank_discount: 0,
            shipping: 0,
            status: 'pending',
            items_count: 3,
            currency: 'UYU',
            payment_method: 'mercadopago',
            customer_email: 'multivendor@example.com'
          }
        })
      });
    });

    // Mock payment creation
    await page.route('**/functions/v1/create-payment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkout_url: 'http://localhost:5173/checkout/success?order_id=ord-multi-123&provider=mercadopago'
        })
      });
    });

    // Mock payment confirmation
    await page.route('**/functions/v1/confirm-payment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'paid',
          order: {
            id: 'ord-multi-123',
            status: 'paid',
            total_amount: 4500,
            currency: 'UYU',
            payment_method: 'mercadopago',
            customer_email: 'multivendor@example.com'
          }
        })
      });
    });

    // Go to checkout page
    await page.goto('/checkout');

    // Step 1: Billing details
    await expect(page.getByText('Datos de facturacion', { exact: false })).toBeVisible();
    await page.fill('input[type="email"]', 'multivendor@example.com');
    await page.locator('input').nth(1).fill('Juan');
    await page.locator('input').nth(2).fill('Perez');
    await page.fill('input[placeholder="Teléfono móvil"]', '099123456');

    // Click "Continuar" to go to Step 2
    await page.click('button:has-text("Continuar")');

    // Step 2: Shipping details
    await expect(page.getByText('Metodo de envio', { exact: false })).toBeVisible();

    // Verify 3 distinct package headers are shown
    await expect(page.getByText('Collectibles.uy', { exact: false })).toBeVisible();
    await expect(page.getByText('JorgiToys', { exact: false })).toBeVisible();
    await expect(page.getByText('Vendor 3', { exact: false })).toBeVisible();

    // Collectibles package: Choose pickup (Gratis)
    await page.locator('div:has-text("Collectibles.uy") >> text=Retiro en local').click({ force: true });

    // JorgiToys package: Choose DAC Agencia
    await page.locator('div:has-text("JorgiToys") >> text=Retiro en agencia DAC').click({ force: true });
    // Fill required CI for DAC
    await page.fill('input[placeholder="Cédula de Identidad"]', '12345672');
    
    // Choose destination agency (Interacting with selects)
    await page.selectOption('select[name="dac_office_department"]', 'Montevideo');
    await page.selectOption('select[name="dac_office_id"]', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

    // Vendor 3 package: Choose pickup
    await page.locator('div:has-text("Vendor 3") >> text=Retiro en local').click({ force: true });

    // Click "Continuar" to Step 3
    await page.click('button:has-text("Continuar")');

    // Step 3: Payment
    await expect(page.getByText('Metodo de pago', { exact: false })).toBeVisible();
    
    // Accept terms
    await page.locator('#terms-checkbox').click({ force: true });

    // Submit order
    await page.getByRole('button', { name: /Finalizar compra/i }).click();

    // Verification
    await page.waitForURL(/checkout\/success/);
    await expect(page.getByText('Gracias por tu compra')).toBeVisible();
  });
});
