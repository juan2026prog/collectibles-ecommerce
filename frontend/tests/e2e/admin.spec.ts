import { test, expect } from '@playwright/test';

test.describe('Admin CRUD Operations', () => {
  
  test('Admin: Create new product', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@collectibles.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    await page.goto('http://localhost:5173/admin/products');
    await page.click('text=Agregar Producto');
    
    await page.fill('input[name="title"]', 'Test Product E2E');
    await page.fill('input[name="base_price"]', '99.99');
    await page.fill('input[name="sku"]', 'SKU-TEST-001');
    await page.click('button:has-text("Guardar")');
    
    await expect(page.locator('text=Test Product E2E')).toBeVisible();
  });

  test('Admin: Edit category', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@collectibles.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    await page.goto('http://localhost:5173/admin/categories');
    await page.click('button:has-text("Editar") >> nth=0');
    await page.fill('input[name="name"]', 'Updated Category');
    await page.click('button:has-text("Guardar")');
    
    await expect(page.locator('text=Updated Category')).toBeVisible();
  });

  test('Admin: Update site settings', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'admin@collectibles.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    await page.goto('http://localhost:5173/admin/settings');
    await page.fill('input[name="store_name"]', 'Updated Store Name');
    await page.click('button:has-text("Guardar")');
    
    await expect(page.locator('text=Guardado')).toBeVisible();
  });
});

test.describe('Vendor Dashboard', () => {
  
  test('Vendor: View orders', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'vendor@collectibles.com');
    await page.fill('input[type="password"]', 'vendor123');
    await page.click('button[type="submit"]');
    
    await page.goto('http://localhost:5173/vendor?tab=orders');
    await expect(page.locator('text=Pedidos')).toBeVisible();
  });

  test('Vendor: Add new product', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[type="email"]', 'vendor@collectibles.com');
    await page.fill('input[type="password"]', 'vendor123');
    await page.click('button[type="submit"]');
    
    await page.goto('http://localhost:5173/vendor?tab=products');
    await page.click('text=Agregar Producto');
    await page.fill('input[name="title"]', 'Vendor Test Product');
    await page.fill('input[name="base_price"]', '49.99');
    await page.click('button:has-text("Guardar")');
    
    await expect(page.locator('text=Vendor Test Product')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    test(`Shop page on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:5173/shop');
      await expect(page.locator('text=SHOP')).toBeVisible();
    });
  }
});
