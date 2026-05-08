import { sanityWriteClient } from "@/sanity/lib/client";
import articles from "../../../../scripts/blog-articles-2026-05.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot migration: publish the May 2026 blog batch (10 articles).
 *
 * Reads `scripts/blog-articles-2026-05.json` (committed to the repo so
 * it goes through normal review) and creates each as a published
 * Sanity blogPost. Idempotent — looks up by slug first; if a doc
 * with that slug already exists it skips and reports `already_exists`.
 *
 * REMOVE THIS ROUTE + THE JSON FILE in the next deploy after running.
 */
type PublishResult =
  | { slug: string; status: "created"; id: string }
  | { slug: string; status: "already_exists"; id: string }
  | { slug: string; status: "error"; error: string };

export async function POST() {
  const list = articles as Array<{ type: string; content: any }>;
  const results: PublishResult[] = [];

  for (const item of list) {
    const slug = item?.content?.slug?.current;
    if (!slug) {
      results.push({ slug: "(unknown)", status: "error", error: "missing slug" });
      continue;
    }
    try {
      const existing = await sanityWriteClient.fetch<{ _id: string } | null>(
        `*[_type == "blogPost" && slug.current == $slug][0]{_id}`,
        { slug },
      );
      if (existing?._id) {
        results.push({ slug, status: "already_exists", id: existing._id });
        continue;
      }
      const created = await sanityWriteClient.create({
        _type: "blogPost",
        ...item.content,
      });
      results.push({ slug, status: "created", id: created._id });
    } catch (e: any) {
      results.push({ slug, status: "error", error: e?.message || "unknown" });
    }
  }

  return new Response(
    JSON.stringify({
      ok: results.every((r) => r.status !== "error"),
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "already_exists").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
