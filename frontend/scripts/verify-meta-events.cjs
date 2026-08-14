const { chromium } = require('@playwright/test');

async function testFullUserFlow() {
  console.log('--- STARTING FULL E2E METAPIXEL VERIFICATION IN PRODUCTION ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const fbqEvents = [];

  await page.addInitScript(() => {
    window.metaDebug = true;
  });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Meta]') || text.includes('[Meta CAPI Debug]')) {
      console.log('CONSOLE:', text);
      if (text.includes('Track: ViewContent') || text.includes('Track: AddToCart') || text.includes('Sending payload for ViewContent') || text.includes('Sending payload for AddToCart')) {
        fbqEvents.push(text);
      }
    }
  });

  console.log('1. Navigating to Product Detail Page (https://collectibles.uy/p/mercadolibre-MLU615896308)...');
  await page.goto('https://collectibles.uy/p/mercadolibre-MLU615896308', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const productUUID = 'fef2acf0-4c0b-4a70-b93d-fb6ae258b1f7';
  console.log(`2. Verifying product UUID (${productUUID}) in https://collectibles.uy/meta-catalog.csv...`);
  const csvRes = await fetch('https://collectibles.uy/meta-catalog.csv');
  const csvText = await csvRes.text();

  const csvHasUUID = csvText.includes(productUUID);
  console.log('   UUID present in meta-catalog.csv?', csvHasUUID);

  console.log('3. Clicking "Agregar al carrito"...');
  const addToCartBtn = page.locator('button').filter({ hasText: 'Agregar al carrito' }).first();
  if (await addToCartBtn.isVisible()) {
    await addToCartBtn.click();
    await page.waitForTimeout(4000);
  } else {
    console.log('Add to cart button not visible');
  }

  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log('Captured Events Count:', fbqEvents.length);
  fbqEvents.forEach(e => console.log(' ->', e));

  await browser.close();
}

testFullUserFlow();
