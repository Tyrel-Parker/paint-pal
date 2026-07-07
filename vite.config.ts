import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves project sites from /<repo-name>/, so the base path
// must match the repo name. Set to '/' instead if you switch to a custom domain.
export default defineConfig({
  base: '/paint-pal/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The onnxruntime/background-removal chunks (incl. a ~24MB wasm) only load when
        // someone uses "Add your photo" — keep them out of the install-time
        // precache; the browser's HTTP cache handles them after first use.
        globIgnores: ['**/ort*', '**/*.wasm', '**/*.onnx'],
      },
      manifest: {
        name: 'PaintPal',
        short_name: 'PaintPal',
        description: 'Color by numbers, made from your own photos.',
        theme_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
