/**
 * publish-pulse-digest.ts
 *
 * Weekly publishing helper for the LIT Pulse Company Report Digest.
 *
 * This file is a TYPED SKELETON. It does not execute. The actual
 * weekly publish run is performed inline in the main agent loop via
 * MCP tools (Supabase, Sanity, Google Drive) — this file exists so
 * that the data shape, URL construction, and pipeline steps are
 * codified and reviewable.
 *
 * Pipeline:
 *  1. Query Supabase for the company brief (lit_unified_shipments +
 *     lit_company_directory) → CompanyBrief
 *  2. Build the card URLs (linkedin + instagram + og) by constructing
 *     encoded query strings for /api/og/pulse-digest
 *  3. Create a Sanity blogPost document via MCP
 *     (mcp__claude_ai_Sanity__create_documents_from_json) with the OG
 *     card URL as heroImageUrl
 *  4. Fetch the rendered card PNGs (via the deployed route)
 *  5. Upload PNGs + captions to Google Drive via MCP into the folder
 *     "Pulse Digest <week>" under "Blog Articles"
 *     (1ibW48Yq-G2KR78u89bewqcSwge_DhG9v)
 *  6. Publish the Sanity post
 */

export type CompanyBrief = {
  /** URL slug used for the Sanity post + card identifier, e.g. "sk-battery-america" */
  companySlug: string;
  /** Display name, e.g. "SK Battery America" */
  companyName: string;
  /** Parent line, e.g. "Subsidiary of SK On" */
  parent?: string;
  /** HQ city, e.g. "Commerce, GA" */
  city: string;
  /** ISO week stamp, e.g. "2026-W24" */
  week: string;
  /** Top stat 1: TEU sampled */
  teu: { value: string; label: string };
  /** Top stat 2: top origin */
  origin: { value: string; label: string };
  /** Top stat 3: top destination */
  dest: { value: string; label: string };
  /** Numbered story hook */
  hook: { index: string; title: string; body: string };
  /** Pre-formatted HS-4 lines, e.g. "7607 Aluminum foil (battery casing)" */
  hsCodes: string[];
  /** Top 3 carriers by share of the company's shipments */
  carriers: { name: string; pct: string }[];
};

export type CardUrls = {
  linkedin: string;
  instagram: string;
  og: string;
};

/**
 * Build the three card image URLs for a brief. Encodes every field
 * onto the query string so the edge route stays a pure render.
 */
export function buildCardUrls(brief: CompanyBrief, siteUrl: string): CardUrls {
  const base = `${siteUrl.replace(/\/+$/, "")}/api/og/pulse-digest`;

  const params = new URLSearchParams({
    company: brief.companyName,
    parent: brief.parent ?? "",
    city: brief.city,
    week: brief.week,
    teu: brief.teu.value,
    teuLabel: brief.teu.label,
    origin: brief.origin.value,
    originLabel: brief.origin.label,
    dest: brief.dest.value,
    destLabel: brief.dest.label,
    hookIndex: brief.hook.index,
    hookTitle: brief.hook.title,
    hookBody: brief.hook.body,
    hs1: brief.hsCodes[0] ?? "",
    hs2: brief.hsCodes[1] ?? "",
    hs3: brief.hsCodes[2] ?? "",
    carrier1name: brief.carriers[0]?.name ?? "",
    carrier1pct: brief.carriers[0]?.pct ?? "",
    carrier2name: brief.carriers[1]?.name ?? "",
    carrier2pct: brief.carriers[1]?.pct ?? "",
    carrier3name: brief.carriers[2]?.name ?? "",
    carrier3pct: brief.carriers[2]?.pct ?? "",
  });

  const qs = params.toString();
  return {
    linkedin: `${base}?${qs}&size=linkedin`,
    instagram: `${base}?${qs}&size=instagram`,
    og: `${base}?${qs}&size=og`,
  };
}

/**
 * Drive folder ID for "Blog Articles" — weekly subfolders are created
 * under this parent with the name "Pulse Digest <week>".
 */
export const BLOG_ARTICLES_DRIVE_FOLDER_ID = "1ibW48Yq-G2KR78u89bewqcSwge_DhG9v";

/**
 * TODO — publishPulseDigest(brief): runs steps 3-6.
 *
 * Step 3: mcp__claude_ai_Sanity__create_documents_from_json
 *   - _type: "blogPost"
 *   - title: `${brief.companyName} — Pulse Company Report (${brief.week})`
 *   - slug.current: `pulse-${brief.week}-${brief.companySlug}`
 *   - heroImageUrl: cardUrls.og
 *   - body: portable text generated from brief.hook + brief.hsCodes
 *
 * Step 4: fetch(cardUrls.linkedin), fetch(cardUrls.instagram),
 *         fetch(cardUrls.og) → ArrayBuffer
 *
 * Step 5: For each PNG, mcp__claude_ai_Google_Drive__create_file
 *   - parent: subfolder "Pulse Digest <week>" under
 *     BLOG_ARTICLES_DRIVE_FOLDER_ID
 *   - name: `${brief.companySlug}-${variant}.png`
 *   Plus a captions.md sibling with LinkedIn + Instagram caption drafts.
 *
 * Step 6: mcp__claude_ai_Sanity__publish_documents on the draft from
 *         step 3.
 */
// export async function publishPulseDigest(brief: CompanyBrief, siteUrl: string) { ... }
