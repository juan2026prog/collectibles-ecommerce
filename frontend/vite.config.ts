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
