/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fdfaef',
          100: '#fbf3d4',
          200: '#f6e4a6',
          300: '#f0ce6f',
          400: '#eab43e',
          500: '#e0981b', // Тот самый основной золотой
          600: '#c27413',
          700: '#9b5313',
        }
      }
    },
  },
  plugins: [],
}