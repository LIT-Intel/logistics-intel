import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";
import { complete, DEFAULT_MODEL } from "@/lib/anthropic";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Blog Drafter — runs Mondays 06:00 UTC.
 *
 * Picks one trending lane / industry / HS code from this week's signals
 * and drafts a 1200-word blog post in the LIT voice. The post is created
 * as a DRAFT in Sanity (not published) — a human reviews + publishes it
 * from Studio. The author reference is an AI-agent persona.
 */
const SYSTEM_PROMPT = `You are an expert B2B trade-data writer drafting weekly posts for Logistic Intel (LIT). Your voice is operator-grade, specific, and lightly contrarian — never marketing fluff. You write for revenue teams at logistics-adjacent SaaS, freight, supply-chain, and import/export companies.

Hard rules:
- 1100–1300 words.
- Lead with a specific number or contrarian claim — never a definition.
- Use H2s every ~200 words.
- One pull-quote in the middle.
- End with a "What this means for your team" 3-bullet section.
- No em dashes. Use hyphens or commas instead.
- No words like "leverage", "synergy", "unlock", "robust".
- Never claim certainty about figures unless given. Phrase carefully.

Output as JSON: { "title": string, "excerpt": string, "slug": string, "body": [PortableTextBlock array] }.`;

export async function GET(req: NextRequest) {
  return runAgent(
    "blog-drafter",
    req,
    async () => {
      // Pick a trending topic. In production this would query trending
      // lanes / fastest-growing industries / new HS codes from signals.
      // For now we cycle through a curated topic pool.
      const topics = [
        "How to spot a reshoring shipper before your competitors do",
        "Five trade signals that predict pipeline 60 days out",
        "The carrier-pivot playbook: turning OOCL → MSC into a meeting",
        "Why HS codes are the most underrated ABM filter",
        "Reading port congestion as a buying signal",
      ];
      const today = new Date().toISOString().slice(0, 10);
      const pick = topics[new Date().getUTCDate() % topics.length];

      const text = await complete({
        system: SYSTEM_PROMPT,
        prompt: `Draft this week's post on: "${pick}". Today is ${today}. Use realistic-sounding-but-anonymized examples; never name a real company without disclaimer.`,
        model: DEFAULT_MODEL,
        maxTokens: 6000,
        temperature: 0.55,
      });
      if (!text) return { skipped: 1, notes: ["Claude returned no content"] };

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to extract JSON from a fenced block
        const m = text.match(/```(?:json)?\s*([\s\S]+?)```/);
        if (m) parsed = JSON.parse(m[1]);
        else throw new Error("Drafter output was not valid JSON");
      }

      const slug = (parsed.slug || parsed.title || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
      const docId = `drafts.blog-${slug}`;
      await sanityWriteClient.createOrReplace({
        _id: docId,
        _type: "blogPost",
        title: parsed.title,
        slug: { current: slug, _type: "slug" },
        excerpt: parsed.excerpt,
        body: parsed.body,
        agentMetadata: {
          draftedBy: "Pulse Coach (auto)",
          draftedAt: new Date().toISOString(),
          modelVersion: DEFAULT_MODEL,
          sourcePrompt: pick,
        },
      });
      return { written: 1, notes: [`drafted: ${parsed.title}`] };
    },
    { requireClaude: true },
  );
}
