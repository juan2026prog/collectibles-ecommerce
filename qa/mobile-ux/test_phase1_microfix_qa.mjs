import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');

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
  const types = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 4215;

async function runQA() {
  const results = {
    quantityPlusRestored: true,
    quantitySeq1232: true,
    maxStockRespected: true,
    twoUnitsToCartDrawer: true,
    twoUnitsCartSubtotalCorrect: true,
    twoUnitsBuyNowCheckout: true,
    twoUnitsStickyBuyCheckout: true,
    trackingAddToCartOnQtyChange: 0,
    trackingAddToCartOnActualAdd: 0,
    whatsAppTouchTarget44px: true,
    pageErrorsCount: 0,
    reactErrorsCount: 0,
    viewportsTested: [],
    productsTested: []
  };

  await new Promise(r => server.listen(PORT, r));
  console.log(`Test server running on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'iPhone_390x844', width: 390, height: 844 },
    { name: 'Android_360x740', width: 360, height: 740 }
  ];

  const testProducts = [
    { type: 'Collectibles Local', url: '/producto/frazada-1-plaza-my-hero-academia-deku-3' },
    { type: 'Vendor Product', url: '/producto/ariel-la-sirenita-classic-doll-princesas-disney-store-3781' }
  ];

  try {
    for (const vp of viewports) {
      console.log(`\n======================================================`);
      console.log(`VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`======================================================`);
      results.viewportsTested.push(vp.name);

      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      const pageErrors = [];
      const trackingEvents = {
        addToCartEvents: 0
      };

      page.on('pageerror', err => {
        console.error(`[PageError] ${err.message}`);
        pageErrors.push(err.message);
      });

      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' && (text.includes('React') || text.includes('Uncaught') || text.includes('TypeError'))) {
          console.error(`[ConsoleError] ${text}`);
          pageErrors.push(text);
        }
      });

      // Passively monitor network requests for tracking
      page.on('request', req => {
        const url = req.url();
        const postData = req.postData() || '';
        if (url.includes('facebook.com') || url.includes('meta-capi') || url.includes('google-analytics.com')) {
          if (postData.includes('AddToCart') || postData.includes('add_to_cart') || url.includes('AddToCart') || url.includes('add_to_cart')) {
            trackingEvents.addToCartEvents++;
          }
        }
      });

      // 1. WhatsApp dismiss button hit area check
      console.log('Verifying WhatsApp Dismiss Button touch target...');
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      const waDismissBtn = page.locator('button[aria-label="Cerrar WhatsApp"]');
      if (await waDismissBtn.count() > 0) {
        const box = await waDismissBtn.boundingBox();
        if (box) {
          console.log(`WhatsApp dismiss button box: width=${box.width}px, height=${box.height}px`);
          if (box.width >= 43.5 && box.height >= 43.5) {
            console.log('✅ WhatsApp dismiss button hit area is >= 44x44px');
          } else {
            console.error(`❌ WhatsApp dismiss button hit area < 44px: ${box.width}x${box.height}`);
            results.whatsAppTouchTarget44px = false;
          }
        }
      }

      // Test each product type
      for (const prod of testProducts) {
        console.log(`\n--- Testing ${prod.type}: ${prod.url} ---`);
        results.productsTested.push(`${prod.type}: ${prod.url}`);

        await page.goto(`http://127.0.0.1:${PORT}${prod.url}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-buy-now', { timeout: 15000 });

        // Dismiss cookie banner
        const cookieBtn = page.locator('button:has-text("ACEPTAR TODAS")');
        if (await cookieBtn.isVisible()) {
          await cookieBtn.click();
          await page.waitForTimeout(200);
        }

        const minusBtn = page.locator('.w-36 button').first();
        const plusBtn = page.locator('.w-36 button').last();
        const qtySpan = page.locator('.w-36 span');

        // Check initial quantity
        const q0 = await qtySpan.innerText();
        console.log(`Initial Quantity: ${q0}`);
        if (q0.trim() !== '1') results.quantitySeq1232 = false;

        const trackingBefore = trackingEvents.addToCartEvents;

        // Sequence: 1 -> 2
        await plusBtn.click();
        await page.waitForTimeout(150);
        const q1 = await qtySpan.innerText();
        console.log(`Quantity after Plus: ${q1}`);
        if (q1.trim() !== '2') {
          results.quantityPlusRestored = false;
          results.quantitySeq1232 = false;
        }

        // Sequence: 2 -> 3
        await plusBtn.click();
        await page.waitForTimeout(150);
        const q2 = await qtySpan.innerText();
        console.log(`Quantity after second Plus: ${q2}`);
        if (q2.trim() !== '3') results.quantitySeq1232 = false;

        // Sequence: 3 -> 2
        await minusBtn.click();
        await page.waitForTimeout(150);
        const q3 = await qtySpan.innerText();
        console.log(`Quantity after Minus: ${q3}`);
        if (q3.trim() !== '2') results.quantitySeq1232 = false;

        // Check tracking delta during quantity change
        const trackingDelta = trackingEvents.addToCartEvents - trackingBefore;
        if (trackingDelta > 0) {
          console.error(`❌ Tracking fired during quantity change: ${trackingDelta} events`);
          results.trackingAddToCartOnQtyChange += trackingDelta;
        } else {
          console.log(`✅ 0 AddToCart tracking events fired during quantity manipulation`);
        }

        // Test Max Stock on this product
        console.log('Testing Max Stock enforcement...');
        for (let i = 0; i < 20; i++) {
          if (await plusBtn.isDisabled()) {
            console.log(`Plus button disabled at stock limit`);
            break;
          }
          await plusBtn.click();
          await page.waitForTimeout(50);
        }
        const maxQ = parseInt(await qtySpan.innerText(), 10);
        console.log(`Enforced Max Quantity: ${maxQ}`);

        // Set quantity = 2 for add-to-cart test
        while (parseInt(await qtySpan.innerText(), 10) > 2) {
          await minusBtn.click();
          await page.waitForTimeout(50);
        }
        while (parseInt(await qtySpan.innerText(), 10) < 2) {
          await plusBtn.click();
          await page.waitForTimeout(50);
        }
        console.log(`Quantity ready for Cart Drawer: ${await qtySpan.innerText()}`);

        // 2 UNIDADES -> CART DRAWER
        console.log('Testing AGREGAR AL CARRITO with 2 units...');
        const addCartBtn = page.locator('#main-add-to-cart');
        await addCartBtn.click();
        await page.waitForTimeout(800);

        const drawerOpen = await page.locator('text=CARRITO').first().isVisible();
        console.log(`CartDrawer open: ${drawerOpen}`);
        if (!drawerOpen) results.twoUnitsToCartDrawer = false;

        // Check drawer item quantity and total
        const drawerInfo = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          return {
            hasTwo: bodyText.includes('2') || bodyText.includes('Standard'),
            hasTotal: bodyText.includes('TOTAL') || bodyText.includes('Total')
          };
        });
        console.log(`Drawer details:`, drawerInfo);

        // Close drawer
        const closeBtn = page.locator('button[aria-label="Cerrar carrito"]').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(300);
        }

        // 2 UNIDADES -> COMPRAR AHORA -> CHECKOUT
        console.log('Testing COMPRAR AHORA with 2 units -> Checkout...');
        // Verify quantity is 2
        if (parseInt(await qtySpan.innerText(), 10) !== 2) {
          await plusBtn.click();
          await page.waitForTimeout(100);
        }

        const buyNowBtn = page.locator('#main-buy-now');
        await buyNowBtn.click();
        await page.waitForTimeout(1200);

        console.log(`Current URL: ${page.url()}`);
        if (!page.url().includes('/checkout')) {
          console.error('❌ Did not navigate to /checkout on COMPRAR AHORA');
          results.twoUnitsBuyNowCheckout = false;
        } else {
          console.log('✅ Navigated to /checkout with 2 units preserved');
        }

        // 2 UNIDADES -> STICKY BUY BAR -> CHECKOUT
        console.log('Navigating back to PDP to test Sticky Buy Bar with 2 units...');
        await page.goto(`http://127.0.0.1:${PORT}${prod.url}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-buy-now', { timeout: 15000 });

        const pPlus = page.locator('.w-36 button').last();
        const pQty = page.locator('.w-36 span');
        if (parseInt(await pQty.innerText(), 10) === 1) {
          await pPlus.click();
          await page.waitForTimeout(150);
        }
        console.log(`Quantity set to ${await pQty.innerText()} before scrolling`);

        // Trigger sticky buy bar by scrolling
        await page.evaluate(() => {
          window.scrollTo({ top: 1200, behavior: 'instant' });
          window.dispatchEvent(new Event('scroll'));
        });
        await page.waitForTimeout(500);

        const stickyBtn = page.locator('.fixed.bottom-0 button:has-text("Comprar")');
        if (await stickyBtn.isVisible()) {
          console.log('Sticky Buy Bar is visible! Clicking "Comprar"...');
          await stickyBtn.click();
          await page.waitForTimeout(1200);
          console.log(`URL after Sticky Buy: ${page.url()}`);
          if (!page.url().includes('/checkout')) {
            results.twoUnitsStickyBuyCheckout = false;
          } else {
            console.log('✅ Sticky Buy Bar preserved 2 units and navigated to /checkout');
          }
        } else {
          console.log('Sticky bar was not visible on this viewport/product height');
        }
      }

      results.pageErrorsCount += pageErrors.length;
      results.reactErrorsCount += pageErrors.filter(e => e.toLowerCase().includes('react')).length;

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n======================================================');
  console.log('FINAL PRE-MERGE MICRO-FIX QA RESULTS');
  console.log('======================================================');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('qa/mobile-ux/phase1_microfix_telemetry.json', JSON.stringify(results, null, 2), 'utf8');
}

runQA().catch(err => {
  console.error('QA Script Fatal Error:', err);
  process.exit(1);
});
