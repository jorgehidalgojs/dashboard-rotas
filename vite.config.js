import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-map': ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
          'vendor-ui': ['framer-motion', '@tanstack/react-virtual', '@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['leaflet', 'leaflet.markercluster'],
  },
})
