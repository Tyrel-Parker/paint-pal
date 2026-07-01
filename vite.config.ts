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
      manifest: {
        name: 'PaintPal',
        short_name: 'PaintPal',
        description: 'Color by numbers, made from your own photos.',
        theme_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [],
      },
    }),
  ],
})
