import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Kucne financije',
        short_name: 'Financije',
        description: 'Pracenje prihoda, troskova i stednje',
        theme_color: '#0f766e',
        background_color: '#0f766e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/finance-app/',
        start_url: '/finance-app/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache sve što treba za offline rad
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Stranice koje aplikacija koristi
        navigateFallback: '/finance-app/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Gemini AI API pozivi — ne cacheirati, ali ne blokiraj app ako nema neta
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  base: command === 'build' ? '/finance-app/' : '/',
}))
