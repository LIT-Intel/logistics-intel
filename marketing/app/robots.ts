import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

/**
 * robots.txt — full AI-crawler allowlist per the SEO strategy. We *want*
 * ChatGPT, Perplexity, Claude, Gemini, and Google's AI features to read
 * and cite this site, so every major answer-engine crawler is allowed.
 *
 * Private app routes (login/signup/onboarding plus the embedded /studio
 * Sanity Studio and cron/preview API endpoints) are disallowed so they
 * never enter Google's index.
 */
export default function robots(): MetadataRoute.Robots {
  const PRIVATE: string[] = [
    "/studio/",
    "/api/cron/",
    "/api/preview",
    "/login",
    "/signup",
    "/onboarding",
    "/app/",
    "/dashboard/",
    "/admin/",
    "/settings/",
    "/campaigns/",
  ];

  return {
    rules: [
      // Default — every crawler that doesn't match a more specific rule.
      { userAgent: "*", allow: "/", disallow: PRIVATE },

      // OpenAI surface — both the search/index bot and the on-demand
      // user-attributed fetch.
      { userAgent: "GPTBot", allow: "/", disallow: PRIVATE },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: PRIVATE },
      { userAgent: "ChatGPT-User", allow: "/", disallow: PRIVATE },

      // Anthropic — search index + per-conversation fetcher + legacy.
      { userAgent: "ClaudeBot", allow: "/", disallow: PRIVATE },
      { userAgent: "Claude-SearchBot", allow: "/", disallow: PRIVATE },
      { userAgent: "Claude-User", allow: "/", disallow: PRIVATE },
      { userAgent: "Claude-Web", allow: "/", disallow: PRIVATE },
      { userAgent: "anthropic-ai", allow: "/", disallow: PRIVATE },

      // Perplexity — index bot + user-attributed fetch.
      { userAgent: "PerplexityBot", allow: "/", disallow: PRIVATE },
      { userAgent: "Perplexity-User", allow: "/", disallow: PRIVATE },

      // Google — standard crawl + the AI-Overviews/Gemini opt-in.
      { userAgent: "Googlebot", allow: "/", disallow: PRIVATE },
      { userAgent: "Google-Extended", allow: "/", disallow: PRIVATE },

      // Microsoft / Bing.
      { userAgent: "Bingbot", allow: "/", disallow: PRIVATE },

      // Common Crawl — used to train older models. Block to keep training
      // data scoped to direct opt-ins above.
      { userAgent: "CCBot", disallow: "/" },
    ],
    // Sitemaps — main urlset + dedicated companies sub-sitemap (~27K
    // programmatic importer profile URLs). Single canonical host (apex);
    // www variant resolves through the same Vercel deploy.
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemaps/companies.xml`],
    host: SITE_URL,
  };
}
