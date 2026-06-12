import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        remit: {
          50: '#eff6ff',
          100: '#dbeafe',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        mint: {
          50: '#ecfdf5',
          600: '#0f766e',
        },
      },
      boxShadow: {
        soft: '0 18px 50px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
