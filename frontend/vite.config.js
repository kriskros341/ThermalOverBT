import { defineConfig } from 'vite'

// Build into ../web so FastAPI can serve it at /ui
export default defineConfig(({ command }) => ({
  // In dev, serve at root ('/'); in build, emit assets under '/ui/'
  base: command === 'build' ? '/ui/' : '/',
  build: {
    outDir: '../web',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    // Proxy API calls to FastAPI dev server
    proxy: {
      '/status': 'http://localhost:8000',
      '/connect': 'http://localhost:8000',
      '/disconnect': 'http://localhost:8000',
      '/print': 'http://localhost:8000'
    }
  }
}))
