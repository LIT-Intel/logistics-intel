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
    return [
      // Anyone hitting the marketing root looking for the app gets bounced
      { source: "/app/:path*", destination: "https://app.logisticintel.com/:path*", permanent: false },
      { source: "/login", destination: "https://app.logisticintel.com/login", permanent: false },
      { source: "/signup", destination: "https://app.logisticintel.com/signup", permanent: false },
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
