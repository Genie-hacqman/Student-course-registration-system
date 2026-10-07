import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

const INDEXABLE_PATHS = ['/login', '/apply', '/privacy', '/terms']

function seo(siteUrl) {
  return {
    name: 'unireg-seo',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('__SITE_URL__', siteUrl) },
    buildStart() {
      if (!siteUrl) this.warn('VITE_SITE_URL is not set: share previews will not work and sitemap.xml is skipped.')
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : [])].join('\n') + '\n'
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      if (!siteUrl) return
      const urls = INDEXABLE_PATHS.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n')
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.API_TARGET || 'http://localhost:5000'
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')

  return {
    plugins: [react(), tailwindcss(), seo(siteUrl)],
    define: { 'import.meta.env.VITE_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? '') },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.jsx'],
    },
  }
})
