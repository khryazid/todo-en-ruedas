import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isProduction = mode === 'production';

  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const escapedUrl = supabaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const supabaseCachePattern = escapedUrl
    ? new RegExp(`^${escapedUrl}/rest/v1/.*`, 'i')
    : /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/.*/i;

  return {
    build: {
      // ✅ SRE / DEVSECOPS: Desactivar sourcemaps en producción de forma explícita
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2022',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'charts-vendor': ['recharts'],
            'ui-vendor': ['lucide-react', 'react-hot-toast', 'clsx', 'tailwind-merge'],
          },
        },
      },
    },
    esbuild: {
      // ✅ SRE / DEVSECOPS: Depuración y eliminación de logs en producción
      drop: isProduction ? ['console', 'debugger'] : [],
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
          // ✅ SRE / DEVSECOPS: Restringir caching únicamente a peticiones GET de lectura
          runtimeCaching: [
            {
              urlPattern: supabaseCachePattern,
              handler: 'NetworkFirst',
              method: 'GET',
              options: {
                cacheName: 'supabase-read-cache',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 60 * 3 // 3 minutos
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
    ],
    server: {
      // ✅ DEVSECOPS: Enlazar a 127.0.0.1 por defecto. Requiere VITE_DEV_HOST para exponer a la red
      host: process.env.VITE_DEV_HOST ? true : '127.0.0.1',
      port: 5173,
    }
  };
})
