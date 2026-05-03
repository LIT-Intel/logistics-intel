import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Internal Linking Bot — runs daily.
 *
 * For every blog post and glossary term, find related content based on
 * keyword overlap and update the doc's `relatedPosts` / `relatedGlossary`
 * arrays. Pure heuristic — no LLM needed. Strong internal linking is a
 * proven SEO lever; this bot keeps it tight without manual curation.
 */
export async function GET(req: NextRequest) {
  return runAgent("internal-linking", req, async () => {
    const posts = await sanityWriteClient.fetch<any[]>(
      `*[_type == "blogPost" && defined(slug.current)]{ _id, title, excerpt, "tags": tags[]->title, "categories": categories[]->title }`,
    );
    const terms = await sanityWriteClient.fetch<any[]>(
      `*[_type == "glossaryTerm" && defined(slug.current)]{ _id, term, shortDefinition }`,
    );

    let written = 0;
    for (const post of posts) {
      const tokens = tokens_of(`${post.title} ${post.excerpt || ""} ${(post.tags || []).join(" ")}`);
      // Find top-3 sibling posts by token overlap
      const siblings = posts
        .filter((p) => p._id !== post._id)
        .map((p) => ({ id: p._id, score: overlap(tokens, tokens_of(`${p.title} ${p.excerpt || ""} ${(p.tags || []).join(" ")}`)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((s) => s.score > 0);
      const related = terms
        .map((t) => ({ id: t._id, score: overlap(tokens, tokens_of(`${t.term} ${t.shortDefinition || ""}`)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .filter((s) => s.score > 0);

      await sanityWriteClient
        .patch(post._id)
        .set({
          relatedPosts: siblings.map((s) => ({ _type: "reference", _ref: s.id })),
          relatedGlossary: related.map((s) => ({ _type: "reference", _ref: s.id })),
        })
        .commit({ autoGenerateArrayKeys: true });
      written++;
    }

    return { scanned: posts.length, written };
  });
}

const STOP = new Set([
  "the","a","an","and","or","but","of","for","to","in","on","at","by","is","are","was","were","be","been",
  "has","have","had","this","that","these","those","you","your","we","our","they","their","it","its","i",
  "with","from","as","if","then","than","into","over","under","about","also","more","most","just","not",
]);

function tokens_of(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let c = 0;
  a.forEach((t) => {
    if (b.has(t)) c++;
  });
  return c;
}
