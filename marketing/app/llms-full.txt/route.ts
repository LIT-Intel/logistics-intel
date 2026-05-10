import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { FEATURE_PAGES } from "@/app/features/_data";
import { SOLUTION_PAGES } from "@/app/solutions/_data";
import { BEST_LIST_PAGES } from "@/app/best/_data";
import { ALTERNATIVE_PAGES } from "@/app/alternatives/_data";

/**
 * /llms-full.txt — full-text companion to /llms.txt.
 *
 * llms.txt gives AI crawlers a link index with one-line descriptions;
 * llms-full.txt ships the actual content concatenated as a single
 * markdown bundle so an LLM can ingest the site in one fetch. Spec
 * authored by Jeremy Howard (fast.ai), supported by Cursor, Continue,
 * Mintlify, GitBook MCP, and growing adoption at Anthropic / Vercel /
 * Cloudflare / Stripe.
 *
 * What's bundled here:
 *   - About + canonical URLs
 *   - All published blog posts (title + excerpt + full body as markdown)
 *   - All glossary terms (definition + plain-text body)
 *   - All feature pages (short answer + capabilities + FAQs)
 *   - All solution pages (short answer + capabilities + FAQs)
 *   - All alternative comparisons (short answer + mini-compare)
 *   - All best-of listicles (short answer + ranked entries)
 *   - Comparison pages from Sanity
 *
 * Refreshed via ISR every 6 hours.
 */

export const runtime = "nodejs";
export const revalidate = 21600; // 6h

const SITE_URL = "https://logisticintel.com";

const BLOG_QUERY = groq`*[_type == "blogPost" && defined(slug.current)] | order(publishedAt desc){
  title, "slug": slug.current, excerpt, publishedAt, body,
  "author": author->{name},
  "categories": categories[]->title
}`;

const GLOSSARY_QUERY = groq`*[_type == "glossaryTerm" && defined(slug.current)] | order(term asc){
  term, abbreviation, "slug": slug.current, shortDefinition, body
}`;

const COMPARISON_QUERY = groq`*[_type == "comparison" && defined(slug.current)] | order(competitorName asc){
  competitorName, "slug": slug.current, subhead, tldr, whenToChooseLit, whenToChooseCompetitor
}`;

/** Flatten Sanity portable-text blocks into plain markdown. Headers
 *  become "## " lines, paragraphs are joined with blank lines,
 *  bullet items become "- " items. Links rendered as [text](href).
 *  This is intentionally lossy: we want LLM-readable prose, not a
 *  perfect HTML reconstruction. */
function portableTextToMarkdown(blocks: any[] | undefined): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block._type !== "block" || !Array.isArray(block.children)) continue;
    const text = block.children
      .map((child: any) => {
        if (typeof child?.text !== "string") return "";
        if (!child.marks?.length) return child.text;
        // Resolve link marks from block.markDefs.
        const linkDef = block.markDefs?.find(
          (d: any) => d?._type === "link" && child.marks.includes(d._key),
        );
        if (linkDef?.href) return `[${child.text}](${linkDef.href})`;
        if (child.marks.includes("strong")) return `**${child.text}**`;
        return child.text;
      })
      .join("");
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (block.style === "h1") lines.push(`# ${trimmed}`);
    else if (block.style === "h2") lines.push(`## ${trimmed}`);
    else if (block.style === "h3") lines.push(`### ${trimmed}`);
    else if (block.listItem === "bullet") lines.push(`- ${trimmed}`);
    else if (block.listItem === "number") lines.push(`1. ${trimmed}`);
    else lines.push(trimmed);
  }
  return lines.join("\n\n");
}

function header(title: string, url: string, meta?: string): string {
  const out = [`## ${title}`, ``, `URL: ${url}`];
  if (meta) out.push(meta);
  out.push(``);
  return out.join("\n");
}

export async function GET() {
  const [blogPosts, glossary, comparisons] = await Promise.all([
    sanityClient.fetch<any[]>(BLOG_QUERY).catch(() => []),
    sanityClient.fetch<any[]>(GLOSSARY_QUERY).catch(() => []),
    sanityClient.fetch<any[]>(COMPARISON_QUERY).catch(() => []),
  ]);

  const sections: string[] = [];

  // ── Top matter ──────────────────────────────────────────────
  sections.push(
    [
      `# Logistic Intel (LIT) — llms-full.txt`,
      ``,
      `> Full-text content bundle for AI ingestion. This file concatenates the public marketing surface — blog, glossary, features, solutions, comparisons, and alternatives — into one markdown document so language models can ingest the site in a single fetch.`,
      ``,
      `**Last refreshed:** ${new Date().toISOString()}`,
      `**Canonical site:** ${SITE_URL}`,
      `**llms.txt index:** ${SITE_URL}/llms.txt`,
      ``,
      `LIT is a freight revenue intelligence platform for logistics sales teams, freight forwarders, freight brokers, 3PLs, customs brokers, and import/export sales teams. The platform combines live Bill of Lading data (124M+ filings), verified buyer-side contacts (42M+, deliverability >95%), a freight-native CRM (Command Center), Pulse AI for natural-language search and account briefs, and an outbound engine that grounds every sequence step in real shipment context.`,
      ``,
    ].join("\n"),
  );

  // ── Features ────────────────────────────────────────────────
  sections.push(`---\n\n# Features\n`);
  for (const f of FEATURE_PAGES) {
    const url = `${SITE_URL}/features/${f.slug}`;
    const meta = `Eyebrow: ${f.eyebrow}`;
    sections.push(header(f.title.replace(/—\s*$/, "").trim(), url, meta));
    sections.push(`**Short answer.** ${f.shortAnswer}\n`);
    sections.push(`**Problem.** ${f.problem}\n`);
    sections.push(`**Solution.** ${f.solution}\n`);
    if (f.capabilities?.length) {
      sections.push(`**Capabilities.**`);
      for (const c of f.capabilities) sections.push(`- ${c.title}: ${c.body}`);
      sections.push(``);
    }
    if (f.workflow?.length) {
      sections.push(`**Workflow.**`);
      f.workflow.forEach((s, i) => sections.push(`${i + 1}. ${s.step}: ${s.body}`));
      sections.push(``);
    }
    if (f.whoItsFor?.length) {
      sections.push(`**Who it's for.**`);
      for (const w of f.whoItsFor) sections.push(`- ${w}`);
      sections.push(``);
    }
    if (f.faqs?.length) {
      sections.push(`**FAQs.**`);
      for (const q of f.faqs) sections.push(`- Q: ${q.q}\n  A: ${q.a}`);
      sections.push(``);
    }
  }

  // ── Solutions ───────────────────────────────────────────────
  sections.push(`---\n\n# Solutions\n`);
  for (const s of SOLUTION_PAGES) {
    const url = `${SITE_URL}/solutions/${s.slug}`;
    const meta = `Audience: ${s.eyebrow}`;
    sections.push(header(s.title.replace(/—\s*$/, "").trim(), url, meta));
    sections.push(`**Short answer.** ${s.shortAnswer}\n`);
    sections.push(`**Lede.** ${s.lede}\n`);
    if (s.capabilities?.length) {
      sections.push(`**Capabilities.**`);
      for (const c of s.capabilities) sections.push(`- ${c.title}: ${c.body}`);
      sections.push(``);
    }
    if (s.faqs?.length) {
      sections.push(`**FAQs.**`);
      for (const q of s.faqs) sections.push(`- Q: ${q.q}\n  A: ${q.a}`);
      sections.push(``);
    }
  }

  // ── Comparisons ─────────────────────────────────────────────
  sections.push(`---\n\n# Comparisons (LIT vs each tool)\n`);
  for (const c of comparisons) {
    const url = `${SITE_URL}/vs/${c.slug}`;
    sections.push(header(`LIT vs ${c.competitorName}`, url));
    if (c.tldr) sections.push(`**TL;DR.** ${c.tldr}\n`);
    if (c.subhead) sections.push(`${c.subhead}\n`);
    if (Array.isArray(c.whenToChooseLit) && c.whenToChooseLit.length) {
      sections.push(`**When to choose LIT.**`);
      for (const w of c.whenToChooseLit) sections.push(`- ${w}`);
      sections.push(``);
    }
    if (
      Array.isArray(c.whenToChooseCompetitor) &&
      c.whenToChooseCompetitor.length
    ) {
      sections.push(`**When to choose ${c.competitorName}.**`);
      for (const w of c.whenToChooseCompetitor) sections.push(`- ${w}`);
      sections.push(``);
    }
  }

  // ── Alternatives ────────────────────────────────────────────
  sections.push(`---\n\n# Alternatives (LIT as the alternative)\n`);
  for (const a of ALTERNATIVE_PAGES) {
    const url = `${SITE_URL}/alternatives/${a.slug}`;
    sections.push(header(`${a.competitor} alternative`, url, `Category: ${a.category}`));
    sections.push(`**Short answer.** ${a.shortAnswer}\n`);
    if (a.switchReasons?.length) {
      sections.push(`**Why teams switch.**`);
      for (const r of a.switchReasons) sections.push(`- ${r.title}: ${r.body}`);
      sections.push(``);
    }
    if (a.miniCompare?.length) {
      sections.push(`**Side-by-side.**`);
      for (const row of a.miniCompare) {
        sections.push(`- ${row.dimension} — LIT: ${row.lit} | ${a.competitor}: ${row.competitor}`);
      }
      sections.push(``);
    }
  }

  // ── Best-of listicles ───────────────────────────────────────
  sections.push(`---\n\n# Best-of rankings\n`);
  for (const b of BEST_LIST_PAGES) {
    const url = `${SITE_URL}/best/${b.slug}`;
    sections.push(header(b.title, url, `Category: ${b.eyebrow}`));
    sections.push(`**Short answer.** ${b.shortAnswer}\n`);
    sections.push(`**Methodology.** ${b.methodology}\n`);
    sections.push(`**Ranking.**`);
    for (const e of b.entries) {
      sections.push(`${e.rank}. **${e.name}** — ${e.pitch}`);
      sections.push(`   When to pick: ${e.whenToPick}`);
    }
    sections.push(``);
  }

  // ── Glossary ────────────────────────────────────────────────
  sections.push(`---\n\n# Glossary\n`);
  for (const g of glossary) {
    const url = `${SITE_URL}/glossary/${g.slug}`;
    const title = g.abbreviation ? `${g.term} (${g.abbreviation})` : g.term;
    sections.push(header(title, url));
    if (g.shortDefinition) sections.push(`${g.shortDefinition}\n`);
    const body = portableTextToMarkdown(g.body);
    if (body) sections.push(`${body}\n`);
  }

  // ── Blog posts ──────────────────────────────────────────────
  sections.push(`---\n\n# Blog posts\n`);
  for (const p of blogPosts) {
    const url = `${SITE_URL}/blog/${p.slug}`;
    const meta = `Published: ${p.publishedAt} | Author: ${p.author?.name || "—"} | Categories: ${(p.categories || []).join(", ")}`;
    sections.push(header(p.title, url, meta));
    if (p.excerpt) sections.push(`${p.excerpt}\n`);
    const body = portableTextToMarkdown(p.body);
    if (body) sections.push(`${body}\n`);
  }

  const content = sections.join("\n") + "\n";

  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
      "x-robots-tag": "all",
    },
  });
}
