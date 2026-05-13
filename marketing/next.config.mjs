/**
 * APP_ORIGIN — where the auth + workspace UI is actually reachable.
 *
 * Default is `https://app.logisticintel.com` (the canonical workspace
 * domain). Override with NEXT_PUBLIC_APP_ORIGIN on the lit-marketing
 * Vercel project if the workspace ever moves.
 *
 * Do NOT default to logistics-intel.vercel.app — that hostname is on
 * Chrome's Safe Browsing list and breaks OAuth callback returns when
 * marketing's /app/* redirect proxies through it.
 */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://app.logisticintel.com";

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
    // /app/* deep links bounce off-site to the workspace. URL bar updates
    // to APP_ORIGIN — intentional: the workspace is a separate surface.
    const APEX_HOSTS = ["logisticintel.com", "www.logisticintel.com"];
    const appRedirects = APEX_HOSTS.map((value) => ({
      source: "/app/:path*",
      destination: `${APP_ORIGIN}/app/:path*`,
      permanent: false,
      has: [{ type: "host", value }],
    }));
    // Bare /privacy and /terms — common shorthand pasted into OAuth consent
    // screens, footer copy, etc. Canonical home is /legal/*.
    return [
      ...appRedirects,
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      // /affiliate-program is the alternate SEO route for the partner
      // program — keeps any inbound links resolving to /partners.
      { source: "/affiliate-program", destination: "/partners", permanent: true },
      // Old in-app affiliate apply URL — drive to the public landing.
      { source: "/partners/apply", destination: "/partners#apply", permanent: false },
    ];
  },
  async rewrites() {
    // Auth + auth-callback routes PROXY (rewrite, not redirect) from the
    // marketing apex through to the app project. The browser URL bar
    // stays on logisticintel.com so OAuth callbacks resolve there
    // (matches the Supabase allowlist).
    //
    // /assets/* is also proxied so the Vite app's static bundle resolves
    // when /login + /signup pages are rendered through this rewrite.
    //
    // Host-scoped to apex/www only — without this, when APP_ORIGIN points
    // at a domain attached to *this same Vercel project* the rewrite
    // re-fires on every hop and Vercel returns 508 INFINITE_LOOP_DETECTED.
    const APEX_HOSTS = ["logisticintel.com", "www.logisticintel.com"];
    const authRules = [
      { source: "/login", destination: `${APP_ORIGIN}/login` },
      { source: "/signup", destination: `${APP_ORIGIN}/signup` },
      { source: "/auth/:path*", destination: `${APP_ORIGIN}/auth/:path*` },
      { source: "/reset-password", destination: `${APP_ORIGIN}/reset-password` },
      // Vite app static asset paths — required so the rewritten pages
      // above can load CSS / JS bundles. Marketing uses /_next/* for
      // its own bundles so there is no conflict.
      { source: "/assets/:path*", destination: `${APP_ORIGIN}/assets/:path*` },
    ];
    return {
      beforeFiles: APEX_HOSTS.flatMap((value) =>
        authRules.map((rule) => ({
          ...rule,
          has: [{ type: "host", value }],
        })),
      ),
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
