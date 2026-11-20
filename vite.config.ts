/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base so the same build works on GitHub Pages, Firebase Hosting or any other host.
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
  build: {
    rolldownOptions: {
      // order.html is the page customers open from an order link (small, separate from the app).
      input: { main: 'index.html', order: 'order.html' },
      output: {
        advancedChunks: {
          groups: [
            // The parts every Firebase page needs, apart, so the customer order page (Firestore lite) skips the app's big Firebase chunk.
            { name: 'firebase-core', test: /node_modules[\\/](@firebase[\\/](app|util|component|logger)|firebase[\\/]app)[\\/]/, priority: 2 },
            { name: 'firestore-lite', test: /node_modules[\\/](@firebase[\\/]firestore[\\/]dist[\\/]lite|firebase[\\/]firestore[\\/]lite)[\\/]/, priority: 2 },
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 1 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // The customer order page is never answered with the app's page.
      workbox: { navigateFallbackDenylist: [/order\.html/] },
      includeAssets: ['favicon.png', 'favicon-32.png', 'apple-touch-icon.png', 'static-mark.png', 'static-logo.png'],
      manifest: {
        name: 'Static OS',
        short_name: 'Static OS',
        description: "Static's workspace: prices, PC builds and quotations, offers and posters.",
        theme_color: '#283890',
        background_color: '#f3f5f9',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
