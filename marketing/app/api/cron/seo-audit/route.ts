import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/agents/runner";
import { sanityWriteClient } from "@/sanity/lib/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * SEO Health Auditor — runs Sundays 06:00 UTC.
 *
 * Scans every published doc and grades SEO completeness. Emits a list
 * of warnings the marketing team can fix from Studio. Stored as
 * siteSettings.seoAuditFindings[] and surfaced in a small admin badge
 * on each route's edit screen.
 */
type Finding = { id: string; type: string; title: string; warning: string };

export async function GET(req: NextRequest) {
  return runAgent("seo-audit", req, async () => {
    const docs = await sanityWriteClient.fetch<any[]>(
      `*[_type in ["blogPost","glossaryTerm","caseStudy","tradeLane","industry","useCase","comparison","port","hsCode"] && defined(slug.current)]{
        _id, _type, title, term, customer, name, headline, slug, seo, excerpt, shortDefinition, summary, body
      }`,
    );

    const findings: Finding[] = [];
    for (const d of docs) {
      const display = d.title || d.term || d.customer || d.name || d.headline || d._id;
      const desc = d.seo?.description || d.excerpt || d.shortDefinition || d.summary;
      const seoTitle = d.seo?.title || d.title || d.term || d.customer || d.name || d.headline;

      if (!desc) findings.push({ id: d._id, type: d._type, title: display, warning: "missing description" });
      else if (desc.length < 110) findings.push({ id: d._id, type: d._type, title: display, warning: `description is ${desc.length}c — aim for 140-160` });
      else if (desc.length > 175) findings.push({ id: d._id, type: d._type, title: display, warning: `description is ${desc.length}c — Google truncates over ~160` });

      if (!seoTitle) findings.push({ id: d._id, type: d._type, title: display, warning: "missing title" });
      else if (seoTitle.length > 65) findings.push({ id: d._id, type: d._type, title: display, warning: `title is ${seoTitle.length}c — aim for under 60` });

      // Body word count for posts
      if (d._type === "blogPost") {
        const bodyText = JSON.stringify(d.body || "").replace(/[^a-zA-Z\s]/g, " ");
        const wc = bodyText.split(/\s+/).filter(Boolean).length;
        if (wc < 600) findings.push({ id: d._id, type: d._type, title: display, warning: `body is ~${wc} words — most ranking posts are 1000+` });
      }

      if (!d.seo?.ogImage) findings.push({ id: d._id, type: d._type, title: display, warning: "no custom OG image (using /api/og fallback)" });
    }

    await sanityWriteClient
      .createOrReplace({
        _id: "siteSettings",
        _type: "siteSettings",
      })
      .catch(() => null);
    await sanityWriteClient
      .patch("siteSettings")
      .set({
        seoAuditFindings: findings,
        seoAuditRunAt: new Date().toISOString(),
      })
      .commit({ autoGenerateArrayKeys: true })
      .catch(() => null);

    return { scanned: docs.length, written: findings.length, notes: [`${findings.length} findings`] };
  });
}
