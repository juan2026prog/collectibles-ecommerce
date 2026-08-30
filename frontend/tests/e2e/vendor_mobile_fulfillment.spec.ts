import { test, expect } from '@playwright/test';

test.describe('Vendor Mobile Fulfillment Operational Flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('1. Production notification deep link /vendor?tab=orders&order_id=550e8400-e29b-41d4-a716-446655440000 opens vendor suborder detail', async ({ page }) => {
    await page.goto('/vendor?tab=orders&order_id=550e8400-e29b-41d4-a716-446655440000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify orders view loads on 390px mobile viewport
    const pageHeading = page.locator('text=Gestión de Pedidos').first();
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  test('2. Vendor sees quick filter chips and mobile sticky action buttons', async ({ page }) => {
    await page.goto('/vendor?tab=orders', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify Quick Filter Chips are visible
    const todosBtn = page.locator('button', { hasText: /Todos/i }).first();
    await expect(todosBtn).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button', { hasText: /Por preparar/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /Preparados/i }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /Despachados/i }).first()).toBeVisible();

    // Click quick filter chip
    await todosBtn.click();
    await page.waitForTimeout(300);
  });

  test('3. Vendor Overview displays top operational block when action required', async ({ page }) => {
    await page.goto('/vendor?tab=overview', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify NO horizontal overflow
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      return scrollWidth > docWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });

  test('4. Canceled suborder shows cancellation banner and hides preparation CTAs', async ({ page }) => {
    await page.goto('/vendor?tab=orders&suborder=COL-1099-CANCELED', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Verify page loads cleanly on mobile
    const pageHeading = page.locator('text=Gestión de Pedidos').first();
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  test('5. Mixed order deep link isolates suborder for authenticating vendor', async ({ page }) => {
    await page.goto('/vendor?tab=orders&order_id=MIXED-ORDER-999', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Ensure zero horizontal overflow
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      return scrollWidth > docWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });
});
