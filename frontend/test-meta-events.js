import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const events = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Meta] Track:')) {
      console.log('Intercepted:', text);
      events.push(text);
    }
  });

  // Enable meta debug and cookie settings before navigation
  await context.addInitScript(() => {
    window.metaDebug = true;
    window.localStorage.setItem('cookieSettings', 'accepted');
  });

  console.log('Testing PageView on Home...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);

  console.log('Testing PageView and Search on Shop...');
  await page.goto('http://localhost:5173/shop?q=batman');
  await page.waitForTimeout(2000);

  console.log('Testing ViewContent and AddToCart...');
  // We need to find a product link to click, or go to a known product.
  // We can just click the first product link on the shop page.
  const productLinks = await page.$$('a[href^="/product/"]');
  if (productLinks.length > 0) {
    await productLinks[0].click();
    await page.waitForTimeout(3000); // Wait for ViewContent
    
    // Add to cart
    const addToCartBtn = await page.$('button:has-text("Agregar al carrito")');
    if (addToCartBtn) {
      await addToCartBtn.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('No Add to Cart button found');
    }
  } else {
    console.log('No products found to click');
  }

  console.log('Testing InitiateCheckout...');
  await page.goto('http://localhost:5173/checkout');
  await page.waitForTimeout(3000); // Wait for InitiateCheckout

  // Fill step 1 to advance
  console.log('Filling checkout form...');
  await page.fill('input[type="email"]', 'test@test.com');
  await page.fill('input:has-text("Nombre") >> nth=0', 'Test'); // Using simpler selectors or just evaluate
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => {
      if(i.type === 'email') i.value = 'test@test.com';
      else if(i.required) i.value = 'Test Value';
    });
    // Trigger React events
    inputs.forEach(i => i.dispatchEvent(new Event('input', { bubbles: true })));
  });
  
  const goNextBtn = await page.$('button:has-text("Continuar")');
  if (goNextBtn) {
    await goNextBtn.click();
    await page.waitForTimeout(1000);
    // Step 2
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      inputs.forEach(i => {
        if(i.required) i.value = 'Test Value';
      });
      inputs.forEach(i => i.dispatchEvent(new Event('input', { bubbles: true })));
    });
    const goNextBtn2 = await page.$('button:has-text("Continuar")');
    if (goNextBtn2) {
      await goNextBtn2.click();
      await page.waitForTimeout(2000); // AddPaymentInfo should trigger here!
    }
  }

  console.log('Testing Purchase...');
  // Mock order data in sessionStorage for checkout success
  await page.evaluate(() => {
    sessionStorage.setItem('pending_checkout_order', JSON.stringify({
      id: 'test-order-123',
      status: 'paid',
      total_amount: 1500,
      currency: 'UYU',
      customer_email: 'test@test.com',
      payment_method: 'mercadopago'
    }));
  });
  await page.goto('http://localhost:5173/checkout-success?order_id=test-order-123&status=approved');
  await page.waitForTimeout(3000); // Wait for Purchase

  // Test Deduplication (reload)
  console.log('Testing Purchase Deduplication...');
  await page.reload();
  await page.waitForTimeout(2000);

  console.log('--- TEST RESULTS ---');
  events.forEach(e => console.log(e));

  await browser.close();
})();
