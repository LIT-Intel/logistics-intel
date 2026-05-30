import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayTarget = (env.API_GATEWAY_BASE || env.VITE_API_BASE || env.NEXT_PUBLIC_API_BASE || 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev').trim()

  if (!env.API_GATEWAY_BASE && !env.VITE_API_BASE && !env.NEXT_PUBLIC_API_BASE) {
    console.warn('⚠️  No API gateway env var found, using default:', gatewayTarget)
  }

  // Sentry source-map upload: only runs when SENTRY_AUTH_TOKEN is present in
  // the build environment (set in Vercel for production / preview). The plugin
  // is a no-op without the token — local dev builds keep working without it.
  //
  // IMPORTANT: read from process.env (NOT loadEnv). Vite's loadEnv reads from
  // .env* files in envDir, not from the runtime process env. Vercel injects
  // env vars into process.env at build time and does NOT write .env files —
  // so loadEnv would return empty for SENTRY_AUTH_TOKEN even when set in
  // Vercel. Same for VERCEL_GIT_COMMIT_SHA which Vercel auto-sets.
  // Release name preference: VITE_SENTRY_RELEASE > VERCEL_GIT_COMMIT_SHA > SENTRY_RELEASE.
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || ''
  const sentryOrg = process.env.SENTRY_ORG || 'lit-g0'
  const sentryProject = process.env.SENTRY_PROJECT || 'lit-frontend'
  const sentryRelease =
    process.env.VITE_SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SENTRY_RELEASE ||
    ''

  // Debug line — visible in Vercel build logs so we can confirm the plugin is
  // configured correctly without checking env-var UI. Just emits a boolean.
  console.log(`[sentry-vite-plugin] auth_token=${Boolean(sentryAuthToken)} org=${sentryOrg} project=${sentryProject} release=${sentryRelease || '(none)'}`)

  return {
    plugins: [
      react(),
      // Plugin auto-skips when authToken is empty (silentWhenNoAuth handles
      // the warning). Source maps are emitted via build.sourcemap then
      // uploaded + deleted from the dist bundle so they don't ship to users.
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
      // deletes the .map files from dist/ after upload (filesToDeleteAfterUpload
      // above), so end users never download them.
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
