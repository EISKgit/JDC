/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Adds a Content-Security-Policy to the built index.html. The login token lives in
 * localStorage, so the main defence is making injected scripts unable to run or to
 * send anything anywhere: only our own bundled scripts may run, and the page may only
 * talk to itself and the API. Build-only, because Vite's dev server injects inline
 * scripts for hot reload.
 *
 * Hosting note: a <meta> CSP can't set frame-ancestors; when deploying, also send
 * `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`
 * as HTTP headers from the web server.
 */
function contentSecurityPolicy(apiBaseUrl: string): Plugin {
  const apiOrigin = new URL(apiBaseUrl).origin
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'jdc-content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
  return {
    plugins: [react(), contentSecurityPolicy(apiBaseUrl)],
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  }
})
