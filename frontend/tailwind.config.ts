import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#211a20',
        remit: {
          50: '#fff3ec',
          100: '#ffe0d1',
          600: '#e85d2a',
          700: '#c94719',
        },
        mint: {
          50: '#eef9f3',
          200: '#b9e8cf',
          600: '#2f8a5d',
          700: '#226c48',
        },
      },
      boxShadow: {
        soft: '0 14px 36px rgba(43, 19, 43, 0.07)',
      },
    },
  },
  plugins: [],
} satisfies Config
