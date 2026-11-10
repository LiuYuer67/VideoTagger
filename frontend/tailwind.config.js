/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#090b0e',
          900: '#0d1014',
          850: '#11151a',
          800: '#151a20',
          750: '#1a2027',
          700: '#20272f',
          650: '#28313a',
          600: '#333d47',
        },
        accent: {
          DEFAULT: '#f59a4b',
          bright: '#ffb066',
          dim: '#b76e32',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 18px 50px rgba(0,0,0,.32)',
      },
    },
  },
  plugins: [],
}
