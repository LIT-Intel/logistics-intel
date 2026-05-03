import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Press Citation Watcher — runs daily.
 *
 * Watches for mentions of "Logistic Intel" or "LIT" across configured
 * publication sources (free APIs, public RSS). Stores citations in
 * siteSettings.pressCitations[] which the homepage + /about page render
 * as a "Featured in" rail.
 *
 * Pure data-pull — no LLM needed. Source list is intentionally small
 * to start; the user expands it as PR coverage grows.
 */
const SOURCES: string[] = [
  // Hand-pickable feeds where LIT might get covered. Empty list is fine —
  // the agent no-ops gracefully and you wire feeds when a press hit lands.
  // "https://example-trade-pub.com/feed",
];

const SEARCH_TERMS = [/logistic\s+intel/i, /\blit\b\s+platform/i];

type Citation = { _key: string; publication: string; title: string; url: string; foundAt: string };

export async function GET(req: NextRequest) {
  return runAgent("press-citations", req, async () => {
    if (!SOURCES.length) {
      return { skipped: 1, notes: ["No press feeds configured. Add to SOURCES in route.ts when you have coverage."] };
    }
    const found: Citation[] = [];
    for (const url of SOURCES) {
      try {
        const r = await fetch(url, { next: { revalidate: 0 } });
        const text = await r.text();
        const matches = [...text.matchAll(
          /<item[^>]*>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/g,
        )];
        for (const m of matches) {
          const title = m[1].trim();
          const link = m[2].trim();
          if (SEARCH_TERMS.some((re) => re.test(title))) {
            found.push({
              _key: hash(link),
              publication: new URL(url).hostname,
              title,
              url: link,
              foundAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* skip */
      }
    }
    if (found.length) {
      await sanityWriteClient.createIfNotExists({ _id: "siteSettings", _type: "siteSettings" });
      await sanityWriteClient
        .patch("siteSettings")
        .setIfMissing({ pressCitations: [] })
        .insert("after", "pressCitations[-1]", found)
        .commit({ autoGenerateArrayKeys: true })
        .catch(() => null);
    }
    return { scanned: SOURCES.length, written: found.length };
  });
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
