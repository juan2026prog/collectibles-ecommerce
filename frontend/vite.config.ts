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
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor-libs';
          }
          if (id.includes('/src/pages/admin/') || id.includes('/src/layouts/AdminLayout')) return 'admin-chunk';
          if (id.includes('/src/pages/Vendor') || id.includes('/src/pages/Artist') || id.includes('/src/pages/Affiliate') || id.includes('/src/pages/Star2Fan')) return 'portal-chunk';
          if (id.includes('/src/pages/Login') || id.includes('/src/pages/Auth')) return 'auth-chunk';
          if (id.includes('/src/pages/Home') || id.includes('/src/pages/Shop') || id.includes('/src/layouts/StorefrontLayout')) return 'storefront-chunk';
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
