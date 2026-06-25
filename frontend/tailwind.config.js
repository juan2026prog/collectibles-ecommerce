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
          100: 'var(--color-primary-100, #ffe0e6)',
          200: 'var(--color-primary-200, #ffc0cf)',
          300: 'var(--color-primary-300, #ff8da8)',
          400: 'var(--color-primary-400, #ff4a78)',
          500: 'var(--color-primary-500, #f00856)',
          600: 'var(--color-primary-600, #e2064d)',
          700: 'var(--color-primary-700, #c41e3a)',
          800: 'var(--color-primary-800, #a31c35)',
          900: 'var(--color-primary-900, #8b1c33)',
        },
        accent: {
          500: 'var(--color-primary-600, #f00856)',
          600: 'var(--color-primary-700, #C41E3A)',
        },
        // ═══ COLLECTIBLES DARK SYSTEM ═══
        dark: {
          50:  '#f8fafc',
          100: '#e2e8f0',
          200: '#1e293b',
          300: '#1a2236',
          400: '#151c2e',
          500: '#111827',
          600: '#0d1320',
          700: '#0a0f1a',
          800: '#070b14',
          900: '#04060d',
          950: '#05070f',
        },
        surface: {
          DEFAULT: '#0e1525',
          light: '#131c31',
          lighter: '#1e293b',
          card: '#0e1525',
          hover: '#131c31',
        },
        neon: {
          cyan: '#00f5ff',
          blue: '#3b82f6',
          purple: '#a855f7',
          pink: '#ec4899',
          red:  '#ff2c68',
        },
        badge: {
          hot: '#f00856',
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
      borderRadius: {
        'none': '0',
        'sm': '0',
        DEFAULT: '0',
        'md': '0',
        'lg': '0',
        'xl': '0',
        '2xl': '0',
        '3xl': '0',
        'full': '9999px',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(240, 8, 86, 0.15)',
        'glow-md': '0 0 30px rgba(240, 8, 86, 0.2)',
        'glow-red': '0 0 40px rgba(240, 8, 86, 0.35)',
        'glow-card': '0 25px 60px rgba(0,0,0,0.45)',
        'dark-lg': '0 10px 40px rgba(0,0,0,0.5)',
        'glass': '0 8px 32px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'marquee': 'marquee 60s linear infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
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
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(240, 8, 86, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(240, 8, 86, 0.3)' },
        },
      },
    },
  },
  plugins: [],
}
