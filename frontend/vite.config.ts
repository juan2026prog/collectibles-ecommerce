/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('xlsx') || id.includes('exceljs')) return 'vendor-excel';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('react-router') || id.includes('react-router-dom') || id.includes('@remix-run')) return 'vendor-router';
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor-libs';
          }
          // Let route-level dynamic imports isolate application code. Grouping all admin
          // components pulled every admin page into the public graph via shared UI.
        },
      },
    },
    // Warn at 500kB, suitable for an ecommerce SPA
    chunkSizeWarningLimit: 500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    testTimeout: 20000,
    maxConcurrency: 5,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/e2e/**',
      'src/tests/e2e/**',
      'tests/e2e/**',
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: [
        'src/contexts/**',
        'src/lib/**',
        'src/hooks/**',
        'src/pages/**',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/setupTests.ts',
      ],
    },
  },
})
