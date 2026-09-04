import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');
const AFTER_DIR = path.resolve(__dirname, 'phase1-after');

if (!fs.existsSync(AFTER_DIR)) {
  fs.mkdirSync(AFTER_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function startServer(port = 4188) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      let filePath = path.join(DIST_DIR, urlPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`Preview server running at http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

const DEVICES = [
  { name: 'iPhone12_13_14', width: 390, height: 844, scale: 3, isMobile: true, label: '390x844' },
  { name: 'SamsungGalaxy_Android', width: 360, height: 740, scale: 3, isMobile: true, label: '360x740' },
  { name: 'iPhoneSE', width: 375, height: 667, scale: 2, isMobile: true, label: '375x667' },
  { name: 'iPhoneProMax', width: 430, height: 932, scale: 3, isMobile: true, label: '430x932' },
  { name: 'iPadTablet', width: 768, height: 1024, scale: 2, isMobile: false, label: '768x1024' },
];

async function runQA() {
  const { server, port } = await startServer(4188);
  const BASE_URL = `http://127.0.0.1:${port}`;
  const telemetry = {
    metrics: {},
    checks: [],
  };

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    console.log('Testing Primary Viewport: 390x844 (iPhone 12/13/14)...');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();
    page.on('console', msg => console.log('[Console]', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('[PageError]', err.message));
    page.on('requestfailed', req => console.warn('[FailedReq]', req.url(), req.failure()?.errorText));

    // 1. HOME TOP
    console.log('Navigating to Home...');
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Dismiss cookie banner if present
    const cookieBtn = page.locator('button:has-text("Aceptar Todas"), button:has-text("Aceptar")').first();
    if (await cookieBtn.isVisible()) {
      await cookieBtn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
    console.log('Page URL:', page.url());
    console.log('Page Title:', await page.title());
    const headerCount = await page.locator('header').count();
    console.log('Header count:', headerCount);
    if (headerCount === 0) {
      console.log('Body HTML:', (await page.locator('body').innerHTML()).substring(0, 1000));
    }

    const headerBox = await page.locator('header').boundingBox();
    telemetry.metrics.headerHeightMobile = headerBox ? headerBox.height : null;
    console.log('[Metric] Header Height Mobile: ' + telemetry.metrics.headerHeightMobile + 'px');

    await page.screenshot({ path: path.join(AFTER_DIR, '01_home_top_390x844.png') });

    // 2. HOME AFTER HERO
    await page.evaluate(() => window.scrollBy(0, 450));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(AFTER_DIR, '02_home_after_hero_390x844.png') });

    // 3. HOME PRODUCT GRID
    await page.evaluate(() => window.scrollBy(0, 750));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(AFTER_DIR, '03_home_product_grid_390x844.png') });

    // 4. MOBILE MENU DRAWER
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const menuBtn = page.locator('button[aria-label="Abrir menú"]').first();
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(AFTER_DIR, '04_mobile_menu_open_390x844.png') });
      const closeMenuBtn = page.locator('button[aria-label="Cerrar menú"]').first();
      if (await closeMenuBtn.isVisible()) {
        await closeMenuBtn.click().catch(() => page.keyboard.press('Escape'));
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(400);
    }

    // 5. SHOP / CATALOG
    console.log('Navigating to Shop Catalog...');
    await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const firstProduct = page.locator('a[href*="/producto/"]').first();
    let firstProductY = null;
    if (await firstProduct.isVisible()) {
      const box = await firstProduct.boundingBox();
      firstProductY = box ? box.y : null;
    }
    telemetry.metrics.shopFirstProductY = firstProductY;
    console.log('[Metric] Shop First Product Y: ' + firstProductY + 'px');

    await page.screenshot({ path: path.join(AFTER_DIR, '06_shop_catalog_390x844.png') });

    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(AFTER_DIR, '06b_shop_2columns_cards_390x844.png') });

    // 6. OPEN FILTERS
    await page.evaluate(() => window.scrollTo(0, 100));
    await page.waitForTimeout(300);
    const filterBtn = page.locator('button:has-text("Filtros")').first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(AFTER_DIR, '07_shop_filters_open_390x844.png') });
      const applyFilterBtn = page.locator('button:has-text("Ver")').first();
      if (await applyFilterBtn.isVisible()) {
        await applyFilterBtn.click();
      }
      await page.waitForTimeout(400);
    }

    // 7. LICENCIAS
    console.log('Navigating to Licencias...');
    await page.goto(BASE_URL + '/licencias', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(AFTER_DIR, '08_licencias_index_390x844.png') });

    // 8. THEMES
    console.log('Navigating to Themes...');
    await page.goto(BASE_URL + '/themes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(AFTER_DIR, '09_themes_index_390x844.png') });

    // 9. PDP
    console.log('Navigating to Product Detail Page...');
    await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle' });
    const pdpLink = page.locator('a[href*="/producto/"]').first();
    let productUrl = '/producto/frazada-1-plaza-my-hero-academia-deku-3';
    try {
      const href = await pdpLink.getAttribute('href');
      if (href) productUrl = href;
    } catch (_) {}
    console.log('Visiting PDP: ' + productUrl);
    await page.goto(BASE_URL + productUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const buyNowBtn = page.locator('#main-buy-now');
    let ctaY = null;
    if (await buyNowBtn.isVisible()) {
      const box = await buyNowBtn.boundingBox();
      ctaY = box ? box.y : null;
    }
    telemetry.metrics.pdpMainCtaY = ctaY;
    console.log('[Metric] PDP Main CTA Y: ' + ctaY + 'px');

    await page.screenshot({ path: path.join(AFTER_DIR, '10_product_detail_top_390x844.png') });

    if (await buyNowBtn.isVisible()) {
      await buyNowBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(AFTER_DIR, '11_product_detail_cta_390x844.png') });
    }

    await page.evaluate(() => {
      window.scrollTo({ top: 1200, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(600);
    const stickyExists = await page.evaluate(() => {
      return !!document.querySelector('.animate-slide-up.fixed.bottom-0');
    });
    telemetry.checks.push({
      name: 'pdp_sticky_buy_bar_visible_on_scroll',
      passed: stickyExists,
      details: 'Sticky buy bar appears at bottom-0 when CTA is scrolled out of viewport'
    });
    console.log('[Check] PDP Sticky Buy Bar: ' + (stickyExists ? 'VISIBLE' : 'NOT VISIBLE'));
    await page.screenshot({ path: path.join(AFTER_DIR, '11b_product_detail_sticky_bar_390x844.png') });

    // 10. CART DRAWER WITH ITEM
    console.log('Adding item to cart...');
    const addToCartBtn = page.locator('#main-add-to-cart');
    if (await addToCartBtn.isVisible()) {
      await addToCartBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: path.join(AFTER_DIR, '12_cart_drawer_with_item_390x844.png') });
    
    const closeCartBtn = page.locator('button[aria-label="Cerrar carrito"]').first();
    if (await closeCartBtn.isVisible()) {
      await closeCartBtn.click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 11. CART PAGE
    console.log('Navigating to Cart Page...');
    await page.goto(BASE_URL + '/cart', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(AFTER_DIR, '13_cart_page_390x844.png') });

    // 12. CHECKOUT PAGE
    console.log('Navigating to Checkout Page...');
    await page.goto(BASE_URL + '/checkout', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const suggestionsMobileVisible = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Sugerencias para tu compra'));
      if (!heading) return false;
      const container = heading.closest('div.group') || heading.parentElement;
      return window.getComputedStyle(container).display !== 'none';
    });
    telemetry.checks.push({
      name: 'checkout_suggestions_hidden_on_mobile',
      passed: !suggestionsMobileVisible,
      details: suggestionsMobileVisible ? 'Suggestions are visible on mobile checkout' : 'Suggestions are cleanly hidden on mobile checkout (hidden lg:block)'
    });
    console.log('[Check] Checkout suggestions hidden on mobile: ' + (!suggestionsMobileVisible));

    await page.screenshot({ path: path.join(AFTER_DIR, '14_checkout_top_390x844.png') });

    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(AFTER_DIR, '15_checkout_payment_summary_390x844.png') });

    await context.close();

    // 13. Other Viewports
    for (const dev of DEVICES.slice(1)) {
      console.log('Testing Viewport: ' + dev.label + ' (' + dev.name + ')...');
      const ctx = await browser.newContext({
        viewport: { width: dev.width, height: dev.height },
        deviceScaleFactor: dev.scale,
        isMobile: dev.isMobile,
        hasTouch: dev.isMobile,
      });
      const p = await ctx.newPage();

      await p.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
      await p.waitForTimeout(800);
      const homeFilename = 'home_' + dev.width + 'x' + dev.height + '_' + (dev.name.includes('Android') ? 'Android' : dev.name.includes('SE') ? 'iPhoneSE' : dev.name.includes('ProMax') ? 'iPhoneProMax' : 'iPad') + '.png';
      await p.screenshot({ path: path.join(AFTER_DIR, homeFilename) });

      if (dev.width <= 375) {
        await p.goto(BASE_URL + '/shop', { waitUntil: 'networkidle' });
        await p.waitForTimeout(800);
        const shopFilename = 'shop_' + dev.width + 'x' + dev.height + '_' + (dev.name.includes('Android') ? 'Android' : 'iPhoneSE') + '.png';
        await p.screenshot({ path: path.join(AFTER_DIR, shopFilename) });
      }

      await ctx.close();
    }

    fs.writeFileSync(path.join(__dirname, 'phase1_after_telemetry.json'), JSON.stringify(telemetry, null, 2));
    console.log('Phase 1 QA completed successfully! Telemetry saved.');
  } finally {
    await browser.close();
    server.close();
  }
}

runQA().catch((err) => {
  console.error('QA Execution failed:', err);
  process.exit(1);
});
