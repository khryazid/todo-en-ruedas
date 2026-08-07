import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // ✅ FIX: Construir regex de caching dinámicamente desde la variable de entorno
  // en lugar de hardcodear la URL de Supabase.
  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const escapedUrl = supabaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const supabaseCachePattern = escapedUrl
    ? new RegExp(`^${escapedUrl}/.*`, 'i')
    : /^https:\/\/[a-z0-9]+\.supabase\.co\/.*/i;

  return {
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'charts-vendor': ['recharts'],
          },
        },
      },
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
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: supabaseCachePattern,
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
  };
})

