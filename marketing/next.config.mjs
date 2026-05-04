/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Sanity-hosted assets
      { protocol: "https", hostname: "cdn.sanity.io" },
      // logo.dev for company logos (mentioned in the strategic plan)
      { protocol: "https", hostname: "img.logo.dev" },
      // Unsplash for blog hero images until custom photography is shot
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      // Generic catch-all for content team uploads through CDN
      { protocol: "https", hostname: "**.vercel-storage.com" },
    ],
    minimumCacheTTL: 31536000,
  },
  experimental: {
    // taskOrigin must be set for OG image route to work in dev
    serverActions: { allowedOrigins: ["localhost:3001", "logisticintel.com"] },
  },
  async redirects() {
    // /app/* deep links bounce off-site to the workspace subdomain. The
    // browser URL bar updates to app.logisticintel.com/app/... — that's
    // intentional, the workspace is a different surface from marketing.
    const APEX_HOSTS = ["logisticintel.com", "www.logisticintel.com"];
    return APEX_HOSTS.map((value) => ({
      source: "/app/:path*",
      destination: "https://app.logisticintel.com/:path*",
      permanent: false,
      has: [{ type: "host", value }],
    }));
  },
  async rewrites() {
    // Auth + auth-callback routes proxy from the marketing apex through to
    // the app project at app.logisticintel.com. The browser URL bar STAYS
    // on logisticintel.com (this is what makes /login look native to
    // marketing visitors), and the app's auth UI streams back transparently.
    //
    // /assets/* is also proxied so the Vite app's static bundle resolves
    // when /login + /signup pages are rendered through this rewrite.
    return {
      beforeFiles: [
        {
          source: "/login",
          destination: "https://app.logisticintel.com/login",
        },
        {
          source: "/signup",
          destination: "https://app.logisticintel.com/signup",
        },
        {
          source: "/auth/:path*",
          destination: "https://app.logisticintel.com/auth/:path*",
        },
        {
          source: "/reset-password",
          destination: "https://app.logisticintel.com/reset-password",
        },
        // Vite app static asset paths — required for the rewritten pages
        // above to load CSS / JS bundles. Marketing itself uses /_next/*
        // for its bundles so there is no conflict.
        {
          source: "/assets/:path*",
          destination: "https://app.logisticintel.com/assets/:path*",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Static assets get aggressive caching
        source: "/(.*)\\.(jpg|jpeg|png|gif|svg|webp|avif|woff|woff2|ttf|otf|eot|ico)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
