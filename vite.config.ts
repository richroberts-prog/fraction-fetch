import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the same build works on GitHub Pages (/fraction-fetch/) and a local preview.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['art/*.webp', 'icons/*.png'],
      manifest: {
        name: 'Fraction Fetch',
        short_name: 'Fraction Fetch',
        description: 'A dog-themed match-3 game for learning Year 5 fractions.',
        theme_color: '#5fd38d',
        background_color: '#bfe9c9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,webp,png,woff,woff2}'] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
