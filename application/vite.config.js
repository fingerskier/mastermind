import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { readDashboardConfig } from './scripts/dashboard-config.js'

const dashboard = readDashboardConfig()

export default defineConfig({
  plugins: [react()],
  root: 'ui',
  server: {
    host: dashboard.host,
    port: Number(dashboard.uiPort),
    strictPort: true,
    proxy: {
      '/api': {
        target: dashboard.apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/dashboard',
    emptyOutDir: true,
  },
})
