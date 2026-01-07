import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'], // Asegúrate de tener tu icon.png en public
      manifest: {
        name: 'Todo en Ruedas - Sistema de Gestión',
        short_name: 'TodoEnRuedas',
        description: 'Sistema de Inventario y Ventas',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // Esto hace que se abra como programa, sin barra de navegador
        icons: [
          {
            src: 'icon.png', // Tu logo debe estar en la carpeta public
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
  }
})