import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Pages are already React.lazy()-split per route in App.tsx; this
          // only pulls the two heavy libraries shared *across* those page
          // chunks (echarts: nearly every page; maplibre-gl: StopsPage) out
          // of Vite's auto-named shared chunk into their own vendor chunks.
          if (id.includes('node_modules')) {
            if (id.includes('echarts')) return 'vendor-echarts'
            if (id.includes('maplibre-gl')) return 'vendor-maplibre'
          }
        },
      },
    },
  },
})
