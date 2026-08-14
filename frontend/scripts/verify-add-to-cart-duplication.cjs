const { chromium } = require('@playwright/test');

async function verifyNoAddToCartDuplication() {
  console.log('--- VERIFYING SINGLE ADDTOCART BROWSER EVENT IN PRODUCTION ---');
  const browser = await chromium.launch({ headless: true });

  for (let attempt = 1; attempt <= 15; attempt++) {
    console.log(`Attempt ${attempt}/15 (waiting for Vercel deployment...)...`);
    const page = await browser.newPage();
    const capturedFbqTrackCalls = [];

    await page.addInitScript(() => {
      window.metaDebug = true;
    });

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Meta] Track:') || text.includes('[Analytics] Tracked Event:') || text.includes('AddToCart')) {
        console.log('  [CONSOLE]:', text);
      }
      if (text.includes('Track: AddToCart') || text.includes('Tracked Event: AddToCart')) {
        capturedFbqTrackCalls.push(text);
      }
    });

    try {
      await page.goto('https://collectibles.uy/p/mercadolibre-MLU615896308', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Find and click Add to Cart button ONCE
      const addToCartBtn = page.locator('button').filter({ hasText: 'Agregar al carrito' }).first();
      if (await addToCartBtn.isVisible()) {
        console.log('  Clicking "Agregar al carrito" once...');
        await addToCartBtn.click();
        await page.waitForTimeout(5000);

        const addToCartEvents = capturedFbqTrackCalls.filter(c => c.includes('AddToCart'));
        console.log(`  Total AddToCart browser calls captured: ${addToCartEvents.length}`);

        if (addToCartEvents.length === 1 && addToCartEvents[0].includes('meta_addtocart_')) {
          console.log('\n✅ SUCCESS! EXACTLY 1 BROWSER ADDTOCART EVENT CAPTURED:');
          console.log(' ->', addToCartEvents[0]);
          console.log(' -> No ob3_plugin-set_... duplicate events found!');
          await page.close();
          await browser.close();
          return;
        } else if (addToCartEvents.length > 0) {
          console.log('  Captured calls detail:', addToCartEvents);
        }
      }
    } catch (e) {
      console.error('  Page error:', e.message);
    }

    await page.close();
    await new Promise(r => setTimeout(r, 6000));
  }

  await browser.close();
}

verifyNoAddToCartDuplication();
