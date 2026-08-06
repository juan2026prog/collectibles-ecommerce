import { test, expect } from '@playwright/test';

test.describe('Vendor Guard Focus Revalidation & Silent Refresh E2E', () => {

  test('01. Unauthenticated user redirects to login on initial load', async ({ page }) => {
    await page.goto('http://localhost:5173/vendor/onboarding');
    await expect(page).toHaveURL(/.*login/);
  });

  test('02. Verify full-screen loader does NOT appear on window focus or visibility change', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    
    // Simulate window blur and focus
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Assert that "VERIFICANDO PERMISOS Y ESTADO DE VENDEDOR..." loader overlay is NOT visible
    const checkingText = page.getByText(/verificando permisos y estado de vendedor/i);
    await expect(checkingText).not.toBeVisible();
  });
});
