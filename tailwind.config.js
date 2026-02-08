/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Aquí definimos tu "Rojo Marca" oficial
        brand: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626', // Rojo principal
          700: '#b91c1c', // Rojo oscuro para hover
          900: '#7f1d1d',
        }
      }
    },
  },
  plugins: [],
}