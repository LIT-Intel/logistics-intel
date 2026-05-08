import { sanityWriteClient } from "@/sanity/lib/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot migration: rewrite blog post body links from
 * /features/tariff-calculator → /tools/tariff-calculator so readers
 * land on the live working calculator instead of the feature
 * description page.
 *
 * Idempotent — only patches body blocks that contain the old href.
 *
 * REMOVE THIS ROUTE in the next deploy after running.
 */

const OLD_HREF = "/features/tariff-calculator";
const NEW_HREF = "/tools/tariff-calculator";

type Result =
  | { id: string; slug: string; status: "updated"; markDefsChanged: number }
  | { id: string; slug: string; status: "no_change" }
  | { id: string; slug?: string; status: "error"; error: string };

export async function POST() {
  const posts = await sanityWriteClient.fetch<
    Array<{ _id: string; slug: { current: string }; body: any[] }>
  >(`*[_type == "blogPost" && body[].markDefs[].href match "*tariff-calculator*"]{_id, slug, body}`);

  const results: Result[] = [];

  for (const p of posts) {
    try {
      let changes = 0;
      const newBody = (p.body || []).map((block) => {
        if (!block || !Array.isArray(block.markDefs)) return block;
        const newDefs = block.markDefs.map((d: any) => {
          if (d?._type === "link" && d.href === OLD_HREF) {
            changes += 1;
            return { ...d, href: NEW_HREF };
          }
          return d;
        });
        return { ...block, markDefs: newDefs };
      });

      if (changes === 0) {
        results.push({ id: p._id, slug: p.slug.current, status: "no_change" });
        continue;
      }

      await sanityWriteClient.patch(p._id).set({ body: newBody }).commit();
      results.push({
        id: p._id,
        slug: p.slug.current,
        status: "updated",
        markDefsChanged: changes,
      });
    } catch (e: any) {
      results.push({
        id: p._id,
        slug: p.slug?.current,
        status: "error",
        error: e?.message || "unknown",
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: results.every((r) => r.status !== "error"),
      total: results.length,
      updated: results.filter((r) => r.status === "updated").length,
      noChange: results.filter((r) => r.status === "no_change").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
