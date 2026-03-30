/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--color-primary-50, #fef2f4)',
          100: 'var(--color-primary-100, #fde6e9)',
          200: 'var(--color-primary-200, #fbd0d8)',
          300: 'var(--color-primary-300, #f7a8b8)',
          400: 'var(--color-primary-400, #f17593)',
          500: 'var(--color-primary-500, #e74268)',
          600: 'var(--color-primary-600, #e22d4f)',
          700: 'var(--color-primary-700, #c41e3a)',
          800: 'var(--color-primary-800, #a31c35)',
          900: 'var(--color-primary-900, #8b1c33)',
        },
        accent: {
          500: 'var(--color-primary-600, #E22D4F)',
          600: 'var(--color-primary-700, #C41E3A)',
        },
        announcement: '#8B1A1A',
        dark: {
          800: '#1f2937',
          900: '#1A1A1A',
        },
        badge: {
          hot: '#EF4444',
          sale: '#0EA5E9',
          preorder: '#F97316',
          new: '#10B981',
          soldout: '#6B7280',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      maxWidth: {
        container: '1280px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'marquee': 'marquee 20s linear infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
