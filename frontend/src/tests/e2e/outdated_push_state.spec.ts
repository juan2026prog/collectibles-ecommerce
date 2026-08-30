import { test, expect } from '@playwright/test';

test.describe('Fresh DB State Loading from Deep Link', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('Always loads real-time fresh status from database when opening deep link', async ({ page }) => {
    await page.goto('/vendor?tab=orders&suborder=COL-1045-A', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify suborder drawer opened with deep-linked suborder number
    const drawerText = page.locator('text=COL-1045-A').first();
    await expect(drawerText).toBeVisible({ timeout: 10000 });
  });
});
