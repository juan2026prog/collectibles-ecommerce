import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BEFORE_DIR = path.resolve(__dirname, 'phase2b-before');

if (!fs.existsSync(BEFORE_DIR)) {
  fs.mkdirSync(BEFORE_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'Android_360x740', width: 360, height: 740, isMobile: true, scale: 3 },
  { name: 'iPhoneSE_375x667', width: 375, height: 667, isMobile: true, scale: 2 },
  { name: 'iPhone_390x844', width: 390, height: 844, isMobile: true, scale: 3 },
  { name: 'iPhoneProMax_430x932', width: 430, height: 932, isMobile: true, scale: 3 },
  { name: 'iPad_768x1024', width: 768, height: 1024, isMobile: false, scale: 2 },
  { name: 'Desktop_1440x900', width: 1440, height: 900, isMobile: false, scale: 1 },
];

const BASE_URL = process.env.BASE_URL || 'https://collectibles-ecommerce-ha6e8vdug-juans-projects-05818af2.vercel.app';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  console.log('Starting Phase 2B BEFORE capture from ' + BASE_URL + '...');

  for (const vp of VIEWPORTS) {
    console.log('\n--- Capturing Viewport: ' + vp.name + ' (' + vp.width + 'x' + vp.height + ') ---');
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });
    const page = await context.newPage();

    try {
      // 1. Home Top
      await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '01_home_top_' + vp.name + '.png') });
      console.log('✓ 01_home_top_' + vp.name);

      // 2. Home Hero / Catalog scroll
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(BEFORE_DIR, '02_home_catalog_' + vp.name + '.png') });
      console.log('✓ 02_home_catalog_' + vp.name);

      // 3. Mobile menu (if mobile)
      if (vp.isMobile) {
        await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 45000 });
        const menuBtn = page.locator('button[aria-label="Abrir menú"], button[aria-label*="menú"], button:has(svg.lucide-menu)').first();
        if (await menuBtn.isVisible()) {
          await menuBtn.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(BEFORE_DIR, '04_mobile_menu_' + vp.name + '.png') });
          console.log('✓ 04_mobile_menu_' + vp.name);
        }
      }

      // 4. Shop Page
      await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '06_shop_' + vp.name + '.png') });
      console.log('✓ 06_shop_' + vp.name);

      // 5. Shop Filters Open (mobile)
      if (vp.isMobile) {
        const filterBtn = page.locator('button:has-text("Filtros"), button[aria-label*="Filtros"]').first();
        if (await filterBtn.isVisible()) {
          await filterBtn.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(BEFORE_DIR, '07_shop_filters_' + vp.name + '.png') });
          console.log('✓ 07_shop_filters_' + vp.name);
        }
      }

      // 6. Licencias Index
      await page.goto(BASE_URL + '/licencias', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '08_licencias_' + vp.name + '.png') });
      console.log('✓ 08_licencias_' + vp.name);

      // 7. Themes Index
      await page.goto(BASE_URL + '/themes', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '09_themes_' + vp.name + '.png') });
      console.log('✓ 09_themes_' + vp.name);

      // 8. Product Detail Page (PDP)
      const pdpUrl = BASE_URL + '/producto/funko-pop-the-eternals-ikaris';
      await page.goto(pdpUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '10_pdp_top_' + vp.name + '.png') });
      console.log('✓ 10_pdp_top_' + vp.name);

      // Scroll to CTA / Sticky Buy Bar
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(BEFORE_DIR, '11_pdp_cta_sticky_' + vp.name + '.png') });
      console.log('✓ 11_pdp_cta_sticky_' + vp.name);

      // Add to cart & Cart Drawer
      const addToCartBtn = page.locator('button:has-text("AGREGAR AL CARRITO"), button:has-text("Agregar al carrito"), button:has-text("Agregar al Carrito")').first();
      if (await addToCartBtn.isVisible()) {
        await addToCartBtn.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(BEFORE_DIR, '12_cart_drawer_' + vp.name + '.png') });
        console.log('✓ 12_cart_drawer_' + vp.name);
      }

      // 9. Cart Page
      await page.goto(BASE_URL + '/cart', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '13_cart_page_' + vp.name + '.png') });
      console.log('✓ 13_cart_page_' + vp.name);

      // 10. Checkout Page
      await page.goto(BASE_URL + '/checkout', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(BEFORE_DIR, '14_checkout_' + vp.name + '.png') });
      console.log('✓ 14_checkout_' + vp.name);

    } catch (err) {
      console.error('Error capturing ' + vp.name + ':', err.message);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log('\nPhase 2B BEFORE capture complete. Files saved to: ' + BEFORE_DIR);
}

captureScreenshots().catch(console.error);
