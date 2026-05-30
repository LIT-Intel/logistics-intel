// NOTE: this .ts file is a duplicate of vite.config.js and is currently
// IGNORED by Vite — Vite's config resolution picks vite.config.js first when
// both exist (vite.config.js > vite.config.mjs > vite.config.ts in order).
// The .js file is the source of truth. Kept in sync here so renaming/deleting
// either file in the future is straightforward.
//
// To make this file authoritative, delete vite.config.js. (Auto-mode blocked
// that deletion when first discovered on 2026-05-30, so we kept both.)
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || ''
const sentryOrg = process.env.SENTRY_ORG || 'lit-g0'
const sentryProject = process.env.SENTRY_PROJECT || 'lit-frontend'
const sentryRelease =
  process.env.VITE_SENTRY_RELEASE ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SENTRY_RELEASE ||
  ''

process.stdout.write(
  `[sentry-vite-plugin] auth_token=${Boolean(sentryAuthToken)} org=${sentryOrg} project=${sentryProject} release=${sentryRelease || '(none)'} sourcemap_upload=${sentryAuthToken ? 'enabled' : 'disabled'}\n`,
)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayTarget = (env.API_GATEWAY_BASE || env.VITE_API_BASE || env.NEXT_PUBLIC_API_BASE || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev').trim()

  if (!env.API_GATEWAY_BASE && !env.VITE_API_BASE && !env.NEXT_PUBLIC_API_BASE) {
    console.warn('⚠️  No API gateway env var found, using default:', gatewayTarget)
  }

  return {
    plugins: [
      react(),
      sentryVitePlugin({
        org: sentryOrg,
        project: sentryProject,
        authToken: sentryAuthToken,
        release: sentryRelease ? { name: sentryRelease, inject: true } : undefined,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
        disable: !sentryAuthToken,
      }),
    ],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/src': path.resolve(__dirname, './src'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/api': path.resolve(__dirname, './src/api'),
        '@/lib': path.resolve(__dirname, './src/lib'),
        '@pages': path.resolve(__dirname, './src/pages'),
      },
    },
    optimizeDeps: {
      include: ['@supabase/supabase-js'],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      commonjsOptions: {
        include: [/@supabase\/supabase-js/, /node_modules/],
      },
    },
    server: {
      host: '0.0.0.0',
      port: 8080,
      proxy: {
        '/api/lit': {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (p: string) => p.replace(/^\/api\/lit/, ''),
        },
      },
    },
  }
})
