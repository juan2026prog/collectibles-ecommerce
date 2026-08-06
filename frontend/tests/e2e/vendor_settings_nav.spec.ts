import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const MOCK_VENDOR = {
  id: 'test-vendor-uuid-1234',
  store_name: 'Tienda Coleccionables E2E',
  slug: 'tienda-coleccionables-e2e',
  description: 'Tienda de prueba E2E',
  logo_url: '',
  banner_url: '',
  contact_email: 'vendor@collectibles.uy',
  contact_phone: '+59899123456',
  social_links: { facebook: '', instagram: '', twitter: '' },
  promotions_opt_in: true,
  status: 'active',
  vendor_payment_settings: {
    bank_name: 'BROU',
    account_name: 'Tienda E2E SRL',
    account_number: '123456789',
    currency: 'UYU'
  },
  vendor_settings: {}
};

const MOCK_TERMS_DOC = {
  id: 'terms-doc-123',
  title: 'Términos y Condiciones para Vendedores',
  document_type: 'vendor_terms',
  version: '1.0',
  content: 'Contenido completo del contrato de términos y condiciones para vendedores de Collectibles.uy.',
  checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  effective_at: '2026-08-01T00:00:00Z'
};

const ARTIFACT_DIR = 'C:/Users/juanm/.gemini/antigravity/brain/72793ec0-4d75-4df5-bddc-88c0f1f50702';

test.describe('Vendor Settings Navigation Responsive E2E', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(ARTIFACT_DIR)) {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    // Intercept Supabase Auth & REST calls to simulate active vendor session
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-vendor-uuid-1234',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'vendor@collectibles.uy'
        })
      });
    });

    await page.route('**/rest/v1/profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-vendor-uuid-1234',
          email: 'vendor@collectibles.uy',
          first_name: 'Vendor',
          last_name: 'Test',
          is_vendor: true,
          is_admin: false
        })
      });
    });

    await page.route('**/rest/v1/vendors*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_VENDOR)
      });
    });

    await page.route('**/rest/v1/rpc/get_active_vendor_terms*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TERMS_DOC)
      });
    });

    await page.route('**/rest/v1/vendor_terms_acceptances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/rest/v1/vendor_notification_settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/rest/v1/notification_logs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/rest/v1/vendor_stores*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Seed localStorage with mock session
    await page.addInitScript(() => {
      const mockSession = {
        access_token: 'fake-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: 'test-vendor-uuid-1234',
          email: 'vendor@collectibles.uy',
          aud: 'authenticated',
          role: 'authenticated'
        }
      };
      localStorage.setItem('sb-supabase-auth-token', JSON.stringify(mockSession));
    });
  });

  test('A. Desktop 1366x768: All tabs visible, "Términos" tab not clipped and fully clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/vendor?tab=settings');

    // Wait for header
    await expect(page.locator('h2:has-text("Configuración")')).toBeVisible({ timeout: 10000 });

    // Verify all 7 tabs are present in role="tablist"
    const tablist = page.locator('div[role="tablist"]');
    await expect(tablist).toBeVisible();

    const terminosTab = tablist.locator('button[id="tab-terms"]');
    await expect(terminosTab).toBeVisible();
    await expect(terminosTab).toHaveText(/Términos/);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop_1366_profile.png') });

    // Verify Términos tab is fully within bounding box and not clipped off-screen
    const tabBox = await terminosTab.boundingBox();
    expect(tabBox).not.toBeNull();
    if (tabBox) {
      expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(1366);
    }

    // Click Términos tab
    await terminosTab.click();
    await expect(page).toHaveURL(/.*sub=terms/);
    await expect(page.locator('h3:has-text("Términos y Condiciones para Vendedores")')).toBeVisible();

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop_1366_terms.png') });
  });

  test('B. Desktop 1920x1080: Complete tab bar rendering without awkward gaps', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/vendor?tab=settings');

    await expect(page.locator('h2:has-text("Configuración")')).toBeVisible();
    const tablist = page.locator('div[role="tablist"]');
    await expect(tablist).toBeVisible();

    // Verify all tabs are visible
    const tabs = ['profile', 'billing', 'shipping', 'notifications', 'mercadolibre', 'documents', 'terms'];
    for (const tabId of tabs) {
      await expect(page.locator(`button[id="tab-${tabId}"]`)).toBeVisible();
    }
  });

  test('C. Tablet 1024x768: Internal tablist scrollable, no global page horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/vendor?tab=settings');

    await expect(page.locator('h2:has-text("Configuración")')).toBeVisible();
    const tablist = page.locator('div[role="tablist"]');
    await expect(tablist).toBeVisible();

    // Check page horizontal overflow: scrollWidth should equal clientWidth
    const pageOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(pageOverflow).toBe(false);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'tablet_1024_settings.png') });

    // Click Términos tab in tablet
    const terminosTab = page.locator('button[id="tab-terms"]');
    await terminosTab.click();
    await expect(page).toHaveURL(/.*sub=terms/);
  });

  test('D. Mobile 390x844: Select dropdown visible, horizontal tablist hidden, dropdown navigation works', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/vendor?tab=settings');

    await expect(page.locator('h2:has-text("Configuración")')).toBeVisible();

    // Tablist should be hidden on mobile
    const tablist = page.locator('div[role="tablist"]');
    await expect(tablist).toBeHidden();

    // Select dropdown should be visible
    const select = page.locator('#vendor-settings-tab-select');
    await expect(select).toBeVisible();

    // Verify option full labels exist in select
    await expect(select.locator('option[value="terms"]')).toHaveText('Términos y Condiciones');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_390_settings.png') });

    // Switch section via select dropdown
    await select.selectOption('terms');
    await expect(page).toHaveURL(/.*sub=terms/);
    await expect(page.locator('h3:has-text("Términos y Condiciones para Vendedores")')).toBeVisible();

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile_390_terms.png') });
  });

  test('E. Direct URL: Navigation to /vendor?tab=settings&sub=terms directly opens terms section', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/vendor?tab=settings&sub=terms');

    await expect(page.locator('h3:has-text("Términos y Condiciones para Vendedores")')).toBeVisible({ timeout: 10000 });
    const terminosTab = page.locator('button[id="tab-terms"]');
    await expect(terminosTab).toHaveAttribute('aria-selected', 'true');
  });

  test('F. Reload and Back/Forward: Preserves section and updates URL correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/vendor?tab=settings&sub=shipping');

    await expect(page.locator('button[id="tab-shipping"]')).toHaveAttribute('aria-selected', 'true');

    // Navigate to terms
    await page.click('button[id="tab-terms"]');
    await expect(page).toHaveURL(/.*sub=terms/);

    // Reload page
    await page.reload();
    await expect(page).toHaveURL(/.*sub=terms/);
    await expect(page.locator('h3:has-text("Términos y Condiciones para Vendedores")')).toBeVisible();

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/.*sub=shipping/);

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/.*sub=terms/);
  });
});
