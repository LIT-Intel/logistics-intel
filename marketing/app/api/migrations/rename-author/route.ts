import { sanityWriteClient } from "@/sanity/lib/client";

export const dynamic = "force-dynamic";

/**
 * One-shot migration: rename the author doc from "Valesco Raymond" to
 * the alias "Gabriel K." Idempotent — bails early if the rename already
 * landed. This route is intentionally narrow: it patches a single
 * known doc with a single known value pair and nothing else.
 *
 * REMOVE THIS ROUTE in the next deploy after running it once.
 */
const AUTHOR_DOC_ID = "5e190bf9-5e4d-4855-b2c9-6d491ee67966";

export async function POST() {
  try {
    const current = await sanityWriteClient.getDocument(AUTHOR_DOC_ID);
    if (!current) {
      return json({ ok: false, error: "doc_not_found" }, 404);
    }
    if (current.name === "Gabriel K.") {
      return json({ ok: true, status: "already_renamed", name: current.name });
    }
    const patched = await sanityWriteClient
      .patch(AUTHOR_DOC_ID)
      .set({
        name: "Gabriel K.",
        slug: { _type: "slug", current: "gabriel-k" },
      })
      .commit();
    return json({ ok: true, status: "renamed", before: current.name, after: patched.name });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "unknown" }, 500);
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
