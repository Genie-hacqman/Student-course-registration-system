import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Where the SCRS-backend dev server listens (its .env PORT). Override in .env.local.
  const apiTarget = loadEnv(mode, process.cwd(), '').API_TARGET || 'http://localhost:5000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // The proxy puts the API on the app's own origin, so the httpOnly refresh
      // cookie (path=/api/auth, SameSite=Strict) is sent without any CORS setup.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
  }
})
