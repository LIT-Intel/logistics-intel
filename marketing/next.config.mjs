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
    // The auth + app routes live on the marketing apex
    // (www.logisticintel.com) where the existing logistics-intel project
    // serves /login and /app/*. From the lit-marketing surface (currently
    // lit-marketing.vercel.app, soon to be aliased to logisticintel.com),
    // we only need to forward visitors hitting bare /login and /signup
    // toward the canonical login URL. The /app/* path will resolve
    // natively once domains are merged onto the same Vercel project.
    return [
      {
        source: "/login",
        destination: "https://www.logisticintel.com/login?next=/app/dashboard",
        permanent: false,
      },
      {
        source: "/signup",
        destination: "https://www.logisticintel.com/login?next=/app/dashboard",
        permanent: false,
      },
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
