import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build sai em ../app/web/spa — o FastAPI serve como SPA estática.
export default defineConfig({
  plugins: [react()],
  base: '/static/spa/',
  build: {
    outDir: '../app/web/static/spa',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8777',
      '/auth': 'http://127.0.0.1:8777',
      '/r': 'http://127.0.0.1:8777',
      '/login': 'http://127.0.0.1:8777',
      '/logout': 'http://127.0.0.1:8777',
      '/buscar-agora': 'http://127.0.0.1:8777',
    },
  },
})
