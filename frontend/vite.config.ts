import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Proxy /api/lit/* -> API_GATEWAY_BASE/*
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API_BASE = env.API_GATEWAY_BASE;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 8080,
      proxy: {
        "/api/lit": {
          target: API_BASE,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api\/lit/, ""),
        },
      },
    },
    preview: { port: 8080 },
  };
});
