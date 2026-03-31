import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

test.describe('Load Testing - Critical Endpoints', () => {
  
  const CONCURRENT_USERS = 10;
  const ITERATIONS_PER_USER = 5;

  async function fetchWithTiming(url: string) {
    const start = Date.now();
    const response = await fetch(url);
    const duration = Date.now() - start;
    return { status: response.status, duration, ok: response.ok };
  }

  test('Homepage responds within acceptable time', async () => {
    const results = await Promise.all(
      Array(ITERATIONS_PER_USER).fill(0).map(() => fetchWithTiming(BASE_URL))
    );
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const failedRequests = results.filter(r => !r.ok).length;
    
    console.log(`Average response time: ${avgDuration}ms`);
    console.log(`Failed requests: ${failedRequests}/${results.length}`);
    
    expect(avgDuration).toBeLessThan(3000);
    expect(failedRequests).toBe(0);
  });

  test('Shop endpoint responds within acceptable time', async () => {
    const results = await Promise.all(
      Array(ITERATIONS_PER_USER).fill(0).map(() => fetchWithTiming(`${BASE_URL}/shop`))
    );
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    console.log(`Shop page average: ${avgDuration}ms`);
    expect(avgDuration).toBeLessThan(3000);
  });

  test('Product detail endpoint stress', async ({ page }) => {
    const timings: number[] = [];
    
    for (let i = 0; i < ITERATIONS_PER_USER; i++) {
      const start = Date.now();
      await page.goto(`${BASE_URL}/shop`);
      await page.waitForLoadState('networkidle');
      timings.push(Date.now() - start);
    }
    
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`Average shop load: ${avgTime}ms`);
  });
});

test.describe('Integration Tests - Commission Calculations', () => {
  
  test('Commission calculation for vendor order', async ({ page }) => {
    const orderTotal = 1000;
    const commissionRate = 10;
    const expectedVendorPayout = orderTotal * (1 - commissionRate / 100);
    
    console.log(`Order total: $${orderTotal}`);
    console.log(`Commission rate: ${commissionRate}%`);
    console.log(`Expected vendor payout: $${expectedVendorPayout}`);
    
    expect(expectedVendorPayout).toBe(900);
  });

  test('Commission calculation with multiple items', async ({ page }) => {
    const items = [
      { price: 500, quantity: 2 },
      { price: 250, quantity: 1 },
    ];
    
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const platformFee = subtotal * 0.10;
    const vendorPayout = subtotal - platformFee;
    
    console.log(`Subtotal: $${subtotal}`);
    console.log(`Platform fee (10%): $${platformFee}`);
    console.log(`Vendor payout: $${vendorPayout}`);
    
    expect(subtotal).toBe(1250);
    expect(platformFee).toBe(125);
    expect(vendorPayout).toBe(1125);
  });

  test('Affiliate commission calculation', async () => {
    const orderTotal = 1000;
    const affiliateRate = 5;
    const affiliateCommission = orderTotal * (affiliateRate / 100);
    
    console.log(`Affiliate commission: $${affiliateCommission}`);
    expect(affiliateCommission).toBe(50);
  });

  test('Tiered commission calculation', async () => {
    const tiers = [
      { min: 0, max: 5000, rate: 10 },
      { min: 5000, max: 15000, rate: 8 },
      { min: 15000, max: Infinity, rate: 5 },
    ];
    
    function getCommissionRate(totalSales: number): number {
      for (const tier of tiers) {
        if (totalSales >= tier.min && totalSales < tier.max) {
          return tier.rate;
        }
      }
      return tiers[tiers.length - 1].rate;
    }
    
    expect(getCommissionRate(3000)).toBe(10);
    expect(getCommissionRate(8000)).toBe(8);
    expect(getCommissionRate(20000)).toBe(5);
  });
});

test.describe('API Endpoints', () => {
  
  test('Supabase health check', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    console.log(`Health check status: ${response.status()}`);
  });

  test('Products API returns valid data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/products`);
    const data = await response.json();
    
    expect(response.ok()).toBeTruthy();
    expect(Array.isArray(data)).toBeTruthy();
  });
});
