import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          const normalizedId = id.replace(/\\/g, '/')

          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (normalizedId.includes('/node_modules/react-router-dom/')) {
            return 'vendor-router'
          }

          if (normalizedId.includes('/node_modules/@supabase/supabase-js/')) {
            return 'vendor-supabase'
          }

          if (normalizedId.includes('/node_modules/recharts/') || normalizedId.includes('/node_modules/d3-')) {
            return 'vendor-charts'
          }

          if (normalizedId.includes('/node_modules/lucide-react/')) {
            return 'vendor-icons'
          }

          if (
            normalizedId.includes('/node_modules/react-hook-form/') ||
            normalizedId.includes('/node_modules/@hookform/resolvers/') ||
            normalizedId.includes('/node_modules/zod/')
          ) {
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
      registerType: 'prompt',
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
