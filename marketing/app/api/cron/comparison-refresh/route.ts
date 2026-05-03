import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";
import { complete, DEFAULT_MODEL } from "@/lib/anthropic";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Comparison Refresher — runs first of each month, 08:00 UTC.
 *
 * For every /vs/<competitor> page, re-evaluates the comparison table
 * against Claude's knowledge of the competitor and flags rows that
 * need a human review. Does NOT auto-publish — produces a `pendingReview`
 * patch on the doc that the marketing team approves in Studio.
 *
 * Keeps comparison pages credible — competitors ship features and an
 * outdated table is the worst possible bottom-funnel signal.
 */
const SYSTEM = `You audit competitive comparison pages for accuracy. You will be given LIT vs <competitor> rows. For each row, decide if the competitor's stated capability is still accurate (as of your training cutoff). If not, suggest a corrected value. If you're not sure, say so explicitly — never guess.

Output JSON: { "rows": [{ "feature": string, "currentCompetitorValue": string, "suggestion": string, "confidence": "high" | "medium" | "low" }] }`;

export async function GET(req: NextRequest) {
  return runAgent(
    "comparison-refresh",
    req,
    async () => {
      const comps = await sanityWriteClient.fetch<any[]>(
        `*[_type == "comparison"]{ _id, competitorName, comparisonTable }`,
      );
      let written = 0;
      const notes: string[] = [];
      for (const c of comps) {
        if (!c.comparisonTable?.length) continue;
        const flatRows = c.comparisonTable.flatMap((s: any) =>
          (s.rows || []).map((r: any) => ({ feature: r.feature, currentCompetitorValue: r.competitorValue })),
        );
        const text = await complete({
          system: SYSTEM,
          prompt: `Competitor: ${c.competitorName}\nRows:\n${JSON.stringify(flatRows, null, 2)}`,
          model: DEFAULT_MODEL,
          maxTokens: 3000,
          temperature: 0.2,
        });
        if (!text) continue;
        try {
          const parsed = JSON.parse(text);
          await sanityWriteClient
            .patch(c._id)
            .set({
              pendingReview: {
                generatedAt: new Date().toISOString(),
                model: DEFAULT_MODEL,
                rows: parsed.rows,
              },
              lastReviewedAt: new Date().toISOString(),
            })
            .commit();
          written++;
          notes.push(`${c.competitorName}: ${parsed.rows.length} suggestions`);
        } catch (e: any) {
          notes.push(`${c.competitorName}: parse error — ${e.message}`);
        }
      }
      return { scanned: comps.length, written, notes };
    },
    { requireClaude: true },
  );
}
