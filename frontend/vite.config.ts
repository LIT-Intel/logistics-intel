import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gatewayTarget = (env.API_GATEWAY_BASE || env.VITE_API_BASE || env.NEXT_PUBLIC_API_BASE || '').trim()

  if (!gatewayTarget) {
    throw new Error('API_GATEWAY_BASE env var is required for the /api/lit proxy')
  }

  return {
    plugins: [react()],
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
