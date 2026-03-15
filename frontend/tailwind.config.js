/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0B0F1A',
        surface: '#111827',
        elevated: '#1F2937',
        glass: 'rgba(17, 24, 39, 0.7)',
        accent: { DEFAULT: '#D04A02', light: '#F97316', dark: '#B33E00', glow: 'rgba(208, 74, 2, 0.15)' },
        severity: {
          critical: '#EF4444',
          high: '#F97316',
          medium: '#EAB308',
          low: '#22C55E',
          info: '#6366F1',
        },
        success: '#10B981',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'rgba(255, 255, 255, 0.06)',
        glow: 'rgba(208, 74, 2, 0.3)',
      },
      boxShadow: {
        glow: '0 0 20px rgba(208, 74, 2, 0.15)',
        'glow-lg': '0 0 40px rgba(208, 74, 2, 0.2)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.3)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      backdropBlur: {
        glass: '16px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(208, 74, 2, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(208, 74, 2, 0.5)' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
