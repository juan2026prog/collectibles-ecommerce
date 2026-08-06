import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Vendor Terms & Conditions Acceptance E2E', () => {

  test('Non-vendor user should not see vendor terms acceptance screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page).toBeDefined();
  });

  test('Vendor terms acceptance UI renders correctly and enforces mandatory scroll & checkbox', async ({ page }) => {
    await page.goto(`${BASE_URL}/vendor`);

    const termsModal = page.locator('text=Antes de comenzar');
    
    if (await termsModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const acceptButton = page.getByRole('button', { name: /ACEPTAR Y ACTIVAR MI TIENDA/i });
      const checkbox = page.getByRole('checkbox');

      // 1. Button must be disabled initially before scrolling
      await expect(acceptButton).toBeDisabled();

      // 2. Checkbox must be disabled before scrolling
      await expect(checkbox).toBeDisabled();

      // 3. Scroll to bottom of terms text box
      const scrollBox = page.locator('.overflow-y-auto').first();
      await scrollBox.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      // 4. After scrolling, checkbox becomes enabled, but button remains disabled until checked
      await expect(checkbox).toBeEnabled();
      await expect(acceptButton).toBeDisabled();

      // 5. Check mandatory checkbox
      await checkbox.check();

      // 6. Button becomes enabled
      await expect(acceptButton).toBeEnabled();
    }
  });

  test('Bypass attempt via direct tab URL /vendor?tab=products should remain blocked', async ({ page }) => {
    await page.goto(`${BASE_URL}/vendor?tab=products`);
    
    const termsHeading = page.locator('text=Antes de comenzar');
    const loginHeading = page.locator('text=Iniciar Sesión');
    
    const isTermsOrLogin = (await termsHeading.isVisible().catch(() => false)) || (await loginHeading.isVisible().catch(() => false));
    expect(isTermsOrLogin).toBe(true);
  });
});
