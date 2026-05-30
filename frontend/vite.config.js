import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'

// Read Sentry env vars at MODULE LOAD time. Vite suppresses console.* output
// inside the defineConfig callback (it routes through Vite's own logger which
// filters info-level messages), so a log emitted from inside the callback
// produces no visible output in Vercel build logs. Reading + logging here, at
// the top of the file, runs before Vite's logger is constructed.
//
// Read from process.env (NOT loadEnv). Vite's loadEnv reads .env* files in
// envDir, not the runtime process env. Vercel injects env vars into process.env
// at build time and does NOT write .env files, so loadEnv would return empty
// for SENTRY_AUTH_TOKEN / VERCEL_GIT_COMMIT_SHA even when they are set in
// Vercel project settings.
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
      // Plugin auto-skips when authToken is empty (disable: !sentryAuthToken).
      // Source maps are emitted via build.sourcemap then uploaded + deleted
      // from the dist bundle so they don't ship to users.
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
      // Emit source maps so the Sentry plugin can upload them. The plugin
      // deletes the .map files from dist/ after upload
      // (filesToDeleteAfterUpload above), so end users never download them.
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
          rewrite: (p) => p.replace(/^\/api\/lit/, ''),
        },
      },
    },
  }
})
