import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { ServerOptions } from 'http-proxy'

const GWHOST = 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/src': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/api': path.resolve(__dirname, './src/api'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@pages': path.resolve(__dirname, './src/pages')
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api/lit': {
        target: GWHOST,
        changeOrigin: true,
        secure: false,
        ws: false,
        rewrite: (p: string) => p.replace(/^\/api\/lit/, ''),
        configure: (proxy: any, _options: ServerOptions) => {
          proxy.on('error', (err: any, req: any) => {
            console.error('[proxy:error]', req?.method, req?.url, err?.message)
          })
          proxy.on('proxyReq', (proxyReq: any, req: any) => {
            console.log('[proxy:req ]', req.method, req.url, '->', GWHOST + req.url.replace(/^\/api\/lit/, ''))
            if (!proxyReq.getHeader('content-type')) {
              proxyReq.setHeader('content-type', 'application/json')
            }
          })
          proxy.on('proxyRes', (proxyRes: any, req: any) => {
            console.log('[proxy:res ]', req.method, req.url, 'status=', proxyRes.statusCode)
          })
        }
      }
    }
  }
})
