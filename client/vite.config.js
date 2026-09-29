import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Where the SCRS-backend dev server listens (its .env PORT). Override in .env.local.
  const apiTarget = loadEnv(mode, process.cwd(), '').API_TARGET || 'http://localhost:5000'

  return {
    plugins: [react(), tailwindcss()],
    // Vitest's own esbuild transform defaults to the classic JSX runtime unless told otherwise —
    // without this, component tests fail with "React is not defined" even though the app itself
    // (built via the same react() plugin) never needs an explicit React import.
    esbuild: { jsx: 'automatic' },
    server: {
      port: 5173,
      // The proxy puts the API on the app's own origin, so the httpOnly refresh
      // cookie (path=/api/auth, SameSite=Strict) is sent without any CORS setup.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
    // Component tests only (`npm run test:components`) — the plain-function tests in src/lib use
    // Node's own test runner instead (`npm test`) and need no DOM, so they're left out of this config.
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.jsx'],
    },
  }
})
