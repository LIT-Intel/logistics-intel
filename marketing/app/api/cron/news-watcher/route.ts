import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";
import { complete, FAST_MODEL } from "@/lib/anthropic";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * News-Watcher — runs daily (was hourly on Pro plan).
 *
 * Pulls headlines from configured RSS feeds (trade press, supply chain
 * news, freight). For each headline, decides if it's relevant to LIT's
 * audience and worth turning into a "Pulse Coach insight" — a small
 * branded callout that surfaces in-app and on the homepage feed.
 *
 * Stores findings as siteSettings.newsCallouts[] (capped at 5, FIFO).
 */
const FEEDS = [
  "https://www.joc.com/rss/index.xml",
  "https://www.freightwaves.com/feed",
  "https://www.supplychaindive.com/feeds/news/",
];

const SYSTEM = `You triage trade-press headlines for Logistic Intel. For each headline, decide if it would matter to a revenue team selling logistics SaaS or freight services. If yes, write a 2-sentence "Coach insight" that frames it as actionable signal — never as news. If no, return null.

Output JSON: { "relevant": boolean, "coachInsight": string | null, "tag": string | null }`;

type Item = { title: string; link: string; pubDate?: string; source?: string };

export async function GET(req: NextRequest) {
  return runAgent(
    "news-watcher",
    req,
    async () => {
      const items: Item[] = [];
      for (const feed of FEEDS) {
        try {
          const r = await fetch(feed, { next: { revalidate: 0 } });
          const text = await r.text();
          // crude RSS parse — works for the targeted feeds without an extra dep
          const matches = [...text.matchAll(
            /<item[^>]*>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?<\/title>[\s\S]*?<link>([^<]+)<\/link>(?:[\s\S]*?<pubDate>([^<]+)<\/pubDate>)?[\s\S]*?<\/item>/g,
          )];
          matches.slice(0, 10).forEach((m) => {
            items.push({ title: m[1].trim(), link: m[2].trim(), pubDate: m[3]?.trim(), source: feed });
          });
        } catch {
          /* skip failing feed */
        }
      }
      if (!items.length) return { skipped: 1, notes: ["No items pulled — feeds unreachable?"] };

      const callouts: any[] = [];
      // Triage just the top 8 to keep latency low
      for (const item of items.slice(0, 8)) {
        const text = await complete({
          system: SYSTEM,
          prompt: `Headline: "${item.title}"\nSource: ${item.source}\nDate: ${item.pubDate || "unknown"}`,
          model: FAST_MODEL,
          maxTokens: 250,
          temperature: 0.3,
        });
        if (!text) continue;
        try {
          const j = JSON.parse(text);
          if (j.relevant && j.coachInsight) {
            callouts.push({
              _key: hash(item.link),
              title: item.title,
              link: item.link,
              insight: j.coachInsight,
              tag: j.tag,
              addedAt: new Date().toISOString(),
            });
          }
        } catch {
          /* malformed JSON — skip */
        }
      }

      // Merge into siteSettings — keep last 5
      const id = "siteSettings";
      await sanityWriteClient
        .patch(id)
        .setIfMissing({ newsCallouts: [] })
        .set({
          newsCallouts: callouts.slice(0, 5),
        })
        .commit({ autoGenerateArrayKeys: true })
        .catch(async (e) => {
          // siteSettings may not exist yet — create it
          if (e?.message?.includes("does not exist")) {
            await sanityWriteClient.createIfNotExists({
              _id: id,
              _type: "siteSettings",
              newsCallouts: callouts.slice(0, 5),
            });
          } else throw e;
        });

      return { scanned: items.length, written: callouts.length };
    },
    { requireClaude: true },
  );
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
