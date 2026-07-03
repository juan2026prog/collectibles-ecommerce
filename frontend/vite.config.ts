import { defineConfig } from 'vitest/config'
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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('node_modules')) {
            if (normalizedId.includes('react') || normalizedId.includes('react-dom') || normalizedId.includes('react-router-dom')) return 'vendor-react';
            else if (normalizedId.includes('@supabase')) return 'vendor-supabase';
            else if (normalizedId.includes('lucide-react')) return 'vendor-icons';
            else return 'vendor-libs';
          }
          if (
            normalizedId.includes('/src/hooks/') ||
            normalizedId.includes('/src/contexts/') ||
            normalizedId.includes('/src/lib/') ||
            normalizedId.includes('/src/components/')
          ) {
            return 'storefront-chunk';
          }
          if (normalizedId.includes('/src/pages/admin/') || normalizedId.includes('/src/layouts/AdminLayout')) {
            return 'admin-chunk';
          }
          if (normalizedId.includes('/src/pages/Vendor') || normalizedId.includes('/src/pages/Artist') || normalizedId.includes('/src/pages/Affiliate') || normalizedId.includes('/src/pages/Star2Fan')) {
            return 'portal-chunk';
          }
          if (normalizedId.includes('/src/pages/Login') || normalizedId.includes('/src/pages/Auth')) {
            return 'auth-chunk';
          }
          if (normalizedId.includes('/src/pages/Home') || normalizedId.includes('/src/pages/Shop') || normalizedId.includes('/src/layouts/StorefrontLayout')) {
            return 'storefront-chunk';
          }
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
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../tests/integration/**/*.test.ts',
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
