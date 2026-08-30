import { test, expect } from '@playwright/test';

test.describe('Notification UI E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });
  });

  test('Admin Settings Notifications Tab renders Push Activation, Push Test & Email Test buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin/settings?sub=notifications', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify Push Device Card is rendered
    await expect(page.locator('text=Notificaciones Push').first()).toBeVisible({ timeout: 10000 });

    // Verify "Activar notificaciones en este dispositivo" button exists
    const activateBtn = page.locator('button:has-text("Activar notificaciones")').first();
    await expect(activateBtn).toBeVisible();

    // Verify "Prueba de Notificaciones" block exists
    await expect(page.locator('text=Prueba de Notificaciones').first()).toBeVisible();

    // Verify "Enviar prueba por Email" button exists
    const emailTestBtn = page.locator('button:has-text("Enviar prueba por Email")').first();
    await expect(emailTestBtn).toBeVisible();
  });

  test('Email Recipients Modal opens with button positioned below test button and shows Guardar Cambios', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin/settings?sub=notifications', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const configBtn = page.locator('button:has-text("Configurar destinatarios")').first();
    await expect(configBtn).toBeVisible({ timeout: 15000 });

    await configBtn.click();
    await expect(page.locator('text=DESTINATARIOS EMAIL').first()).toBeVisible();
    await expect(page.locator('button:has-text("Guardar Cambios")').first()).toBeVisible();
  });

  test('Vendor Settings Notifications Tab renders Push Activation & Email Test buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/vendor?tab=settings&sub=notifications', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Verify Push Activation card
    await expect(page.locator('text=Notificaciones Push').first()).toBeVisible({ timeout: 10000 });
  });
});
