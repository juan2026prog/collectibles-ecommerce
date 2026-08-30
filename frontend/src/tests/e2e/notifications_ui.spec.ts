import { test, expect } from '@playwright/test';

test.describe('Notification UI E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Supabase Auth & REST calls to simulate active session
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-admin-uuid-9999',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'admin@collectibles.uy'
        })
      });
    });

    await page.route('**/rest/v1/profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-admin-uuid-9999',
          email: 'admin@collectibles.uy',
          first_name: 'Admin',
          last_name: 'Test',
          is_vendor: true,
          is_admin: true
        })
      });
    });

    await page.route('**/rest/v1/admin_notification_settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'admin-notif-1',
          whatsapp_numbers: [],
          notify_own_sales: true,
          notify_vendor_sales: true,
          notify_payment_received: true,
          notify_low_stock: true,
          notify_shipping_events: true,
          notify_payout_pending: true,
          is_active: true
        })
      });
    });

    await page.route('**/rest/v1/vendor_notification_settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'vendor-notif-1',
          whatsapp_numbers: [],
          is_active: true
        })
      });
    });

    await page.route('**/rest/v1/user_notification_devices*', async (route) => {
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

    await page.route('**/rest/v1/vendors*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-admin-uuid-9999',
          store_name: 'Admin Store',
          status: 'active'
        })
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
          id: 'test-admin-uuid-9999',
          email: 'admin@collectibles.uy',
          aud: 'authenticated',
          role: 'authenticated'
        }
      };
      localStorage.setItem('sb-supabase-auth-token', JSON.stringify(mockSession));
    });
  });

  test('Admin Settings Notifications Tab renders Push Activation, Push Test & Email Test buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin/settings?tab=notifications');

    // Wait for notifications header
    await expect(page.locator('h3:has-text("Notificaciones")')).toBeVisible({ timeout: 15000 });

    // Verify Push Device Card is rendered
    await expect(page.locator('text=Notificaciones Push en este dispositivo')).toBeVisible();

    // Verify "Activar notificaciones en este dispositivo" button exists
    const activateBtn = page.locator('button:has-text("Activar notificaciones en este dispositivo")');
    await expect(activateBtn).toBeVisible();

    // Verify "Prueba de Notificaciones" block exists
    await expect(page.locator('text=Prueba de Notificaciones')).toBeVisible();

    // Verify "Enviar prueba por Email" button exists
    const emailTestBtn = page.locator('button:has-text("Enviar prueba por Email")');
    await expect(emailTestBtn).toBeVisible();
  });

  test('Email Recipients Config expands and renders recipient inputs in Admin', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin/settings?tab=notifications');

    await expect(page.locator('text=DESTINATARIOS EMAIL')).toBeVisible({ timeout: 15000 });
    const configBtn = page.locator('button:has-text("Configurar")').first();
    await expect(configBtn).toBeVisible();

    await configBtn.click();
    await expect(page.locator('button:has-text("Cerrar configuración")')).toBeVisible();
  });

  test('Vendor Settings Notifications Tab renders Push Activation & Email Test buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/vendor?tab=settings&sub=notifications');

    // Wait for notifications section header
    await expect(page.locator('h3:has-text("Notificaciones")')).toBeVisible({ timeout: 15000 });

    // Verify Push Device Card is rendered
    await expect(page.locator('text=Notificaciones Push en este dispositivo')).toBeVisible();

    // Verify "Activar notificaciones en este dispositivo" button exists
    const activateBtn = page.locator('button:has-text("Activar notificaciones en este dispositivo")');
    await expect(activateBtn).toBeVisible();

    // Verify DESTINATARIOS EMAIL block
    await expect(page.locator('text=DESTINATARIOS EMAIL')).toBeVisible();

    // Verify "Enviar prueba por Email" button exists
    const emailTestBtn = page.locator('button:has-text("Enviar prueba por Email")');
    await expect(emailTestBtn).toBeVisible();

    // Intercept function call for test_notification email
    await page.route('**/functions/v1/notification-dispatcher*', async (route) => {
      const reqBody = route.request().postDataJSON();
      if (reqBody?.event_type === 'test_notification' && reqBody?.channel === 'email') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, count: 1, message: 'Email de prueba enviado exitosamente' })
        });
      } else {
        await route.continue();
      }
    });

    await emailTestBtn.click();
    await expect(page.locator('text=Correo de prueba enviado')).toBeVisible({ timeout: 5000 });
  });
});
