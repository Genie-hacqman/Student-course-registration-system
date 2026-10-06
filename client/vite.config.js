import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// The pages search engines may list. Everything else sits behind a sign-in (see src/lib/pageMeta.js).
const INDEXABLE_PATHS = ['/login', '/apply', '/privacy', '/terms']

/**
 * Fills in the public site URL (VITE_SITE_URL) where crawlers need an absolute one: the share tags in index.html,
 * robots.txt and sitemap.xml. Without it the share image can't be found by social networks, so the build warns.
 */
function seo(siteUrl) {
  return {
    name: 'unireg-seo',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('__SITE_URL__', siteUrl) },
    buildStart() {
      if (!siteUrl) this.warn('VITE_SITE_URL is not set: share previews will not work and sitemap.xml is skipped.')
    },
    generateBundle() {
      // Private pages are kept out of search with noindex headers/meta rather than a Disallow rule: a crawler that is
      // blocked from a page never sees its noindex, and could still list the bare URL.
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
  // Where the SCRS-backend dev server listens (its .env PORT). Override in .env.local.
  const apiTarget = env.API_TARGET || 'http://localhost:5000'
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')

  return {
    plugins: [react(), tailwindcss(), seo(siteUrl)],
    // Ties browser error reports to the deployed commit (Vercel sets VERCEL_GIT_COMMIT_SHA at build time).
    define: { 'import.meta.env.VITE_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? '') },
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
