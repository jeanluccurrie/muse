import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // use existing public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/paths\/.+/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-paths' },
          },
          {
            urlPattern: /\/api\/muse-content\/.+/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'muse-content' },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
