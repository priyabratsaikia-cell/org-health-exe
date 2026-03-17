/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        glass: 'var(--bg-surface)',
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          light: 'rgb(var(--accent-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--accent-dark-rgb) / <alpha-value>)',
          glow: 'rgb(var(--accent-rgb) / 0.15)',
        },
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
        DEFAULT: 'var(--border-subtle)',
        glow: 'rgb(var(--accent-rgb) / 0.3)',
      },
      boxShadow: {
        glow: '0 0 20px rgb(var(--accent-rgb) / 0.15)',
        'glow-lg': '0 0 40px rgb(var(--accent-rgb) / 0.2)',
        'glow-xl': '0 0 60px rgb(var(--accent-rgb) / 0.3)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
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
          '0%, 100%': { boxShadow: '0 0 8px rgb(var(--accent-rgb) / 0.3)' },
          '50%': { boxShadow: '0 0 20px rgb(var(--accent-rgb) / 0.5)' },
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
