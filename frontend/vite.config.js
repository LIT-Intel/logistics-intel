import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // allow imports like "@/pages/Layout"
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: '', // keep files next to index.html
    rollupOptions: {
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]', // keep .css/.svg extensions
      },
    },
  },
})
