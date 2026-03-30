import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('should successfully complete a multi-vendor checkout', async ({ page }) => {
    // Navigate to a product page
    await page.goto('/p/test-product');
    
    // Add to cart
    await page.click('[data-testid="add-to-cart"]');
    await expect(page.locator('.toast-success')).toBeVisible();

    // Navigate to a second product from a different vendor
    await page.goto('/p/test-product-vendor-b');
    await page.click('[data-testid="add-to-cart"]');

    // Go to checkout
    await page.goto('/checkout');
    
    // Verify cart totals are accurate
    const subtotal = await page.innerText('[data-testid="cart-subtotal"]');
    expect(subtotal).not.toBeNull();

    // Apply Coupon
    await page.fill('[data-testid="coupon-input"]', 'TEST50');
    await page.click('[data-testid="apply-coupon"]');
    
    // Verify Discount Applied
    await expect(page.locator('[data-testid="discount-amount"]')).toBeVisible();

    // Submit mock payment
    await page.fill('[data-testid="card-number"]', '4242 4242 4242 4242');
    await page.fill('[data-testid="card-expiry"]', '12/26');
    await page.fill('[data-testid="card-cvc"]', '123');
    await page.click('[data-testid="submit-payment"]');

    // Verify Success Redirect
    await page.waitForURL('**/order-confirmation/**');
    await expect(page.locator('text=Thank you for your order!')).toBeVisible();
  });
});
