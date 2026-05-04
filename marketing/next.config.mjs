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
    // Marketing site at logisticintel.com / www.logisticintel.com forwards
    // all auth + app routes to the LIT app at app.logisticintel.com.
    //
    // The `has` host conditions are CRITICAL: they prevent a redirect loop
    // when `app.logisticintel.com` falls back to this project (e.g. while
    // the operator is mid-attaching the subdomain to the app project on
    // Vercel). Without these conditions, /login on app.logisticintel.com
    // would 307 to itself indefinitely.
    const APEX_HOSTS = ["logisticintel.com", "www.logisticintel.com"];
    return [
      // /app/* → app.logisticintel.com/* (one entry per apex host)
      ...APEX_HOSTS.map((value) => ({
        source: "/app/:path*",
        destination: "https://app.logisticintel.com/:path*",
        permanent: false,
        has: [{ type: "host" as const, value }],
      })),
      // /login → app.logisticintel.com/login
      ...APEX_HOSTS.map((value) => ({
        source: "/login",
        destination: "https://app.logisticintel.com/login",
        permanent: false,
        has: [{ type: "host" as const, value }],
      })),
      // /signup → app.logisticintel.com/signup
      ...APEX_HOSTS.map((value) => ({
        source: "/signup",
        destination: "https://app.logisticintel.com/signup",
        permanent: false,
        has: [{ type: "host" as const, value }],
      })),
    ];
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
