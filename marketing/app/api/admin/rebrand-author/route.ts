import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/sanity/lib/client";
import { checkCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * One-shot admin endpoint to rebrand the founder author doc into a
 * neutral editorial handle. Runs against Sanity's mutation API using
 * SANITY_API_WRITE_TOKEN. Auth-gated by CRON_SECRET.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://lit-marketing.vercel.app/api/admin/rebrand-author
 *
 * Idempotent — safe to call multiple times. Removes the route file
 * after the rebrand is verified.
 */
export async function GET(req: NextRequest) {
  const auth = checkCron(req);
  if (auth) return auth;

  // Find any author with the personal name and rename in place.
  const authors = await sanityWriteClient.fetch<Array<{ _id: string; name: string }>>(
    `*[_type == "author" && (name match "Valesco*" || name match "Raymond*")]{ _id, name }`,
  );

  let renamed = 0;
  for (const a of authors) {
    await sanityWriteClient
      .patch(a._id)
      .set({
        name: "Logistic Intel Editorial",
        slug: { _type: "slug", current: "logistic-intel-editorial" },
        role: "Editorial Team",
        bio: "Operator-grade trade and freight commentary from the Logistic Intel editorial team. Real BOL data, current trade flows, and the playbooks revenue teams are using right now.",
      })
      .commit();
    renamed++;
  }

  // Also strip any stray "Valesco" mentions in blog post bodies.
  const posts = await sanityWriteClient.fetch<Array<{ _id: string }>>(
    `*[_type == "blogPost" && body[].children[].text match "Valesco*"]{ _id }`,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      renamedAuthors: renamed,
      foundPostsWithName: posts.length,
      note: posts.length
        ? "Posts contain the name in body text — review manually in Studio."
        : "No name references in body text.",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
