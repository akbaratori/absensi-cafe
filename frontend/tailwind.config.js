/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef7ed',
          100: '#fdecd4',
          200: '#fbd5a8',
          300: '#f8b871',
          400: '#f59338',
          500: '#f27712',
          600: '#e35d08',
          700: '#bc4509',
          800: '#96370f',
          900: '#792f10',
        },
        cafe: {
          50: '#fdf8f0',
          100: '#f9eddb',
          200: '#f2d8b6',
          300: '#eabc87',
          400: '#e09756',
          500: '#d97b33',
          600: '#ca6428',
          700: '#a84d23',
          800: '#873e22',
          900: '#6e341e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
