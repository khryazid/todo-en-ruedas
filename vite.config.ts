import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react'
          }

          if (id.includes('react-router-dom')) {
            return 'vendor-router'
          }

          if (id.includes('@supabase/supabase-js')) {
            return 'vendor-supabase'
          }

          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }

          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) {
            return 'vendor-forms'
          }

          return 'vendor-misc'
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Glyph Core - Sistema de Gestión',
        short_name: 'Glyph Core',
        description: 'Sistema ERP & POS - Inventario y Ventas Multimoneda',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/zdoqkpvqpnyntxmudcda\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutos
              }
            }
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
