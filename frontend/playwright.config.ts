import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 10000,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
});
