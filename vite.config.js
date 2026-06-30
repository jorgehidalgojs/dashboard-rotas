import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    // Increase warning limit — leaflet + markercluster is inherently large
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Split vendor libs from app code for better caching
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('leaflet')) return 'vendor-map'
          if (id.includes('framer-motion') || id.includes('@tanstack')) return 'vendor-ui'
          if (id.includes('lucide-react')) return 'vendor-icons'
        },
      },
    },

    // Ensure source maps are off in production (no internal code exposure)
    sourcemap: false,

    // Minify with OXC (Vite 8 default)
    minify: 'oxc',

    // Target modern browsers (Chromium-based, for internal ops tool)
    target: 'es2020',
  },

  // Optimise cold-start HMR in dev
  optimizeDeps: {
    include: ['leaflet', 'leaflet.markercluster'],
  },
})
