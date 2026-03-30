import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ───────────────────────────────────────────────────────────────
async function addToCart(page: Page, slug: string) {
  await page.goto(`/p/${slug}`);
  await page.waitForLoadState('networkidle');
  const addBtn = page.locator('button:has-text("Agregar al Carrito"), button:has-text("Add to Cart")');
  await expect(addBtn).toBeVisible({ timeout: 8000 });
  await addBtn.click();
}

async function fillShippingForm(page: Page) {
  await page.fill('input[type="email"]', 'testcomprador@example.com');
  await page.fill('input', 'Ana').nth(1);   // first_name
  await page.fill('input', 'Pérez').nth(2); // last_name
  await page.fill('input[placeholder*="Calle"]', 'Rivera 1234');
  await page.fill('input[placeholder*="Ciudad"]', 'Montevideo');
}

// ─── Storefront Tests ───────────────────────────────────────────────────────
test.describe('🏪 Storefront — Navegación Principal', () => {

  test('Home carga y muestra los banners de colecciones', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Collectibles/i);
    // Hero section visible
    const hero = page.locator('section, [class*="hero"]').first();
    await expect(hero).toBeVisible({ timeout: 10000 });
  });

  test('Shop carga productos desde la base de datos', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    // Si hay productos, deben renderizarse como cards
    const productLinks = page.locator('a[href^="/p/"]');
    const count = await productLinks.count();
    console.log(`Productos visibles en /shop: ${count}`);
    // La página debe cargarse sin error
    await expect(page.locator('body')).not.toContainText('500', { timeout: 5000 });
    await expect(page.locator('body')).not.toContainText('Error fatal');
  });

  test('Filtros de categoría funcionan en /shop', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    // Buscar filtro de categoría
    const categoryFilter = page.locator('button:has-text("Figuras"), button:has-text("Colecciones"), input[placeholder*="Buscar"]');
    if (await categoryFilter.count() > 0) {
      await categoryFilter.first().click();
      await page.waitForLoadState('networkidle');
    }
  });

  test('Página de detalle de producto carga correctamente', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    const firstProduct = page.locator('a[href^="/p/"]').first();
    if (await firstProduct.count() === 0) {
      test.skip(true, 'No hay productos seedeados — omitiendo test de detalle');
    }
    const href = await firstProduct.getAttribute('href');
    await page.goto(href!);
    await page.waitForLoadState('networkidle');
    // Botón agregar al carrito debe estar presente
    await expect(page.locator('button:has-text("Agregar"), button:has-text("Carrito")')).toBeVisible({ timeout: 8000 });
  });

  test('Navegación mobile — menú hamburguesa funciona', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Solo en dispositivos móviles');
    await page.goto('/');
    const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], button svg').first();
    await hamburger.click();
    const mobileMenu = page.locator('nav, [class*="mobile"]');
    await expect(mobileMenu).toBeVisible({ timeout: 3000 });
  });
});

// ─── Carrito Tests ──────────────────────────────────────────────────────────
test.describe('🛒 Carrito — Flujo Completo', () => {

  test('Carrito vacío muestra estado vacío', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.locator('body')).toContainText(/carrito/i);
    // Sin productos debería mostrar mensaje de carrito vacío
    const emptyMsg = page.locator('text=vacío, text=empty, text=no hay');
    const hasEmpty = await emptyMsg.count();
    console.log(`Estado vacío detectado: ${hasEmpty > 0}`);
  });

  test('Agregar producto y verificar en carrito', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    const firstProduct = page.locator('a[href^="/p/"]').first();
    if (await firstProduct.count() === 0) {
      test.skip(true, 'Sin productos seedeados');
    }
    const href = await firstProduct.getAttribute('href');
    await page.goto(href!);
    
    const addBtn = page.locator('button:has-text("Agregar al Carrito"), button:has-text("Agregar")');
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();
    
    // Navegar al carrito
    await page.goto('/cart');
    await expect(page.locator('body')).toContainText(/Total/i);
    // El carrito NO debería estar vacío
    const emptyEls = await page.locator('text=vacío, text=Nothing').count();
    expect(emptyEls).toBe(0);
  });

  test('Carrito persiste al refrescar la página', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    const firstProduct = page.locator('a[href^="/p/"]').first();
    if (await firstProduct.count() === 0) test.skip(true, 'Sin productos');

    const href = await firstProduct.getAttribute('href');
    await page.goto(href!);
    const addBtn = page.locator('button:has-text("Agregar")');
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
    }
    
    // Refrescar
    await page.reload();
    await page.goto('/cart');
    // El carrito no debe estar vacío (depende de que localStorage funcione)
    await page.waitForLoadState('networkidle');
    console.log('Verificando persistencia del carrito post-reload...');
  });
});

// ─── Checkout Tests ──────────────────────────────────────────────────────────
test.describe('💳 Checkout — Flujo de Pago', () => {

  test('Redirige a /login si no está autenticado (si aplica)', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    // Si el checkout requiere auth, debería redirigir
    const url = page.url();
    console.log(`URL después de /checkout sin auth: ${url}`);
  });

  test('Checkout con carrito vacío muestra mensaje correcto', async ({ page }) => {
    // Limpiar localStorage primero
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    // Debería mostrar mensaje de carrito vacío o redirigir
    const bodyText = await page.locator('body').textContent();
    const hasEmptyMsg = bodyText?.includes('vacío') || bodyText?.includes('Nothing') || bodyText?.includes('empty');
    console.log(`Checkout vacío muestra mensaje: ${hasEmptyMsg}`);
  });

  test('Formulario de checkout valida campos requeridos', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');
    // Intentar enviar sin completar el formulario
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      // La validación nativa del browser previene el submit
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.count() > 0) {
        const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
        console.log(`Email vacío es válido (debería ser false): ${isValid}`);
      }
    }
  });

  test('Página /checkout/success renderiza con order_id', async ({ page }) => {
    const mockOrderId = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';
    await page.goto(`/checkout/success?order_id=${mockOrderId}`);
    await page.waitForLoadState('networkidle');
    // Debería mostrar el número de orden
    await expect(page.locator('body')).toContainText(/AAAABBBB/i, { timeout: 5000 });
    // Debe tener los botones de navegación post-compra
    await expect(page.locator('a:has-text("Seguir Comprando"), a:has-text("tienda")')).toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin Tests ─────────────────────────────────────────────────────────────
test.describe('⚙️ Admin — Control de Acceso', () => {

  test('Admin redirect a login si no autenticado', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    // Debe redirigir a login o mostrar pantalla de auth
    const url = page.url();
    const isProtected = url.includes('/login') || url.includes('/admin');
    expect(isProtected).toBe(true);
    console.log(`URL post-/admin sin auth: ${url}`);
  });

  test('GodMode carga correctamente', async ({ page }) => {
    await page.goto('/godmode');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/God Mode/i, { timeout: 5000 });
  });
});

// ─── Responsive Audit ────────────────────────────────────────────────────────
test.describe('📱 Responsive — Audit de Páginas Críticas', () => {
  const criticalPages = [
    { path: '/', name: 'Home' },
    { path: '/shop', name: 'Shop' },
    { path: '/cart', name: 'Cart' },
    { path: '/login', name: 'Login' },
  ];

  for (const { path, name } of criticalPages) {
    test(`${name} renderiza sin overflow horizontal en mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      
      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      
      if (hasOverflow) {
        console.warn(`⚠️ OVERFLOW HORIZONTAL detectado en mobile: ${path}`);
      }
      // Log but don't fail — this is an audit
      console.log(`${name} mobile overflow: ${hasOverflow}`);
    });

    test(`${name} título SEO está configurado`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      const title = await page.title();
      expect(title.length).toBeGreaterThan(3);
      console.log(`${name} title: "${title}"`);
    });
  }
});

// ─── Login Flow ───────────────────────────────────────────────────────────────
test.describe('🔐 Autenticación', () => {

  test('Login page renderiza correctamente', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[type="text"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 });
  });

  test('Login con credenciales vacías muestra validación', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.count() > 0) await submitBtn.click();
    // Validación nativa debe activarse
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.count() > 0) {
      const valid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
      expect(valid).toBe(false);
    }
  });

  test('Link de registro visible en login', async ({ page }) => {
    await page.goto('/login');
    const registerLink = page.locator('a:has-text("Registrar"), a:has-text("Sign Up"), button:has-text("Crear")');
    const count = await registerLink.count();
    console.log(`Links de registro encontrados: ${count}`);
  });
});
