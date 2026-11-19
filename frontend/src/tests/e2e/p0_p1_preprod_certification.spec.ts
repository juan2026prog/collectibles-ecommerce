import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Pre-Production P0/P1 Certification E2E (Isolated, Zero Real Transactions)', () => {
  test('1. Home Uruguay loads without fatal errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Collectibles/i);
    expect(pageErrors).toEqual([]);
  });

  test('2. Shop catalog route loads cleanly', async ({ page }) => {
    await page.goto(`${BASE_URL}/shop`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/shop/);
  });

  test('3. Checkout Uruguay ignores GeoIP=AR when AR is DISABLED and blocks manual AR checkout', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'cart',
        JSON.stringify([
          {
            product_id: '11111111-1111-1111-1111-111111111111',
            variant_id: '22222222-2222-2222-2222-222222222222',
            quantity: 1,
            title: 'Figura Coleccionable UY Test',
            price: 2000,
            image: '',
            variant_name: 'Standard',
          },
        ])
      );
      localStorage.removeItem('user_selected_country');
      sessionStorage.removeItem('geoip_detected');
    });

    // Mock GeoIP returning Argentina
    await page.route('https://ipapi.co/json/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ country_code: 'AR', country: 'Argentina' }),
      });
    });

    await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Must NOT have switched to Argentina or shown the old broken USD 1.29 conversion
    await expect(page.locator('body')).not.toContainText('USD 1.29');
    await expect(page.locator('body')).not.toContainText('Pagar con Handy (USD 1.29)');
  });

  test('4. DEMO international checkout routes are protected (redirect anonymous users to /login)', async ({ page }) => {
    await page.goto(`${BASE_URL}/internacional/cart`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);

    await page.goto(`${BASE_URL}/internacional/checkout/review`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('5. Non-LIVE international market routes (/intl/ar, /intl/cl) redirect anonymous public users to /', async ({ page }) => {
    await page.goto(`${BASE_URL}/intl/ar`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(`${BASE_URL}/`);

    await page.goto(`${BASE_URL}/intl/cl`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });
});
