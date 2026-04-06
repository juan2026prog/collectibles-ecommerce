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
        // ═══ GAMGER DARK THEME ═══
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
        },
        surface: {
          DEFAULT: '#111827',
          light: '#1a2236',
          lighter: '#1e293b',
          card: '#151c2e',
          hover: '#1e293b',
        },
        neon: {
          cyan: '#00f5ff',
          blue: '#3b82f6',
          purple: '#a855f7',
          pink: '#ec4899',
          red:  '#ef4444',
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
      boxShadow: {
        'glow-sm': '0 0 15px rgba(0, 245, 255, 0.1)',
        'glow-md': '0 0 30px rgba(0, 245, 255, 0.15)',
        'glow-red': '0 0 30px rgba(226, 45, 79, 0.2)',
        'glow-card': '0 8px 32px rgba(0,0,0,0.4)',
        'dark-lg': '0 10px 40px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'marquee': 'marquee 20s linear infinite',
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
          '0%, 100%': { boxShadow: '0 0 15px rgba(0, 245, 255, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 245, 255, 0.25)' },
        },
      },
    },
  },
  plugins: [],
}
