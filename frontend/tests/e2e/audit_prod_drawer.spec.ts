import { test, expect } from '@playwright/test';

test.describe('Audit Live Production Drawer Computed Styles', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('Audit computed styles of MobileDrawer on local/production admin products', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e_bypass_admin', 'true');
      (window as any).__BYPASS_AUTH_FOR_E2E__ = true;
    });

    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Open Mobile Drawer
    const menuBtn = page.locator('button[aria-label="Abrir navegación"]').first();
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(600);
    }

    const computedAudit = await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const drawerPanel = dialog ? dialog.children[1] || dialog.querySelector('.bg-dark-900') : null;
      const productosLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent?.includes('Productos'));
      const productosIcon = productosLink?.querySelector('svg');
      const drawerHeader = drawerPanel?.querySelector('div');
      const drawerFooter = drawerPanel?.querySelector('div:last-child');

      const getStyles = (el: Element | null | undefined) => {
        if (!el) return null;
        const s = window.getComputedStyle(el);
        return {
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          height: s.height,
          minHeight: s.minHeight,
          paddingTop: s.paddingTop,
          paddingBottom: s.paddingBottom,
          paddingLeft: s.paddingLeft,
          paddingRight: s.paddingRight,
          marginTop: s.marginTop,
          marginBottom: s.marginBottom,
          gap: s.gap,
          width: s.width,
          maxWidth: s.maxWidth,
          className: el.className,
        };
      };

      return {
        url: window.location.href,
        drawerPanel: getStyles(drawerPanel),
        productosLink: getStyles(productosLink),
        productosIcon: productosIcon ? {
          width: window.getComputedStyle(productosIcon).width,
          height: window.getComputedStyle(productosIcon).height,
        } : null,
        drawerHeader: getStyles(drawerHeader),
        drawerFooter: getStyles(drawerFooter),
      };
    });

    console.log('COMPUTED_DRAWER_PANEL_AUDIT:', JSON.stringify(computedAudit, null, 2));
  });
});
