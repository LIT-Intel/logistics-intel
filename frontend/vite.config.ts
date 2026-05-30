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
  // Release name preference: VITE_SENTRY_RELEASE > VERCEL_GIT_COMMIT_SHA > 'unknown'.
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN || ''
  const sentryOrg = env.SENTRY_ORG || 'lit-g0'
  const sentryProject = env.SENTRY_PROJECT || 'lit-frontend'
  const sentryRelease =
    env.VITE_SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || env.SENTRY_RELEASE || ''

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
