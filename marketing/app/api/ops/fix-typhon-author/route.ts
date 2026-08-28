import { NextRequest } from "next/server";
import { createClient } from "@sanity/client";

export const dynamic = "force-dynamic";

const KEY = "fix-typhon-author-2026-08-28";
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "w0whm6ow",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-10-15",
  token: process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
});

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== KEY) return Response.json({ ok: false }, { status: 404 });
  if (!process.env.SANITY_API_WRITE_TOKEN) return Response.json({ ok: false, error: "missing write token" }, { status: 500 });

  const authors = await client.fetch(`*[_type == "author" && (name match "Sara*" || name match "Sarah*")] | order(name asc){_id,name,slug,role}`);
  if (!Array.isArray(authors) || authors.length === 0) {
    return Response.json({ ok: false, error: "No existing Sara/Sarah author found. No author was created." }, { status: 409 });
  }

  const exactSara = authors.find((a: any) => String(a.name || "").trim().toLowerCase() === "sara");
  const saraNamed = authors.filter((a: any) => String(a.name || "").trim().toLowerCase().startsWith("sara"));
  const chosen = exactSara || (saraNamed.length === 1 ? saraNamed[0] : (authors.length === 1 ? authors[0] : null));
  if (!chosen) {
    return Response.json({ ok: false, error: "Multiple Sara/Sarah authors found; refusing to guess.", authors }, { status: 409 });
  }

  const articleId = "blog-typhon-china-supply-chain-risk-2026";
  await client.patch(articleId)
    .set({ author: { _type: "reference", _ref: chosen._id } })
    .unset(["agentMetadata"])
    .commit();

  const remainingMiraRefs = await client.fetch(`count(*[references("author-mira-chen")])`);
  if (remainingMiraRefs === 0) {
    const mira = await client.getDocument("author-mira-chen");
    if (mira) await client.delete("author-mira-chen");
  }

  const updated = await client.fetch(`*[_id == $id][0]{title,slug,"author":author->{_id,name,role},agentMetadata}`, { id: articleId });
  return Response.json({ ok: true, candidates: authors, updated, removedInventedMiraAuthor: remainingMiraRefs === 0 });
}
