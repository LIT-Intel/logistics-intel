import { NextRequest } from "next/server";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { checkCron } from "@/lib/cron-auth";
import { FEATURE_PAGES } from "@/app/features/_data";
import { SOLUTION_PAGES } from "@/app/solutions/_data";
import { ALTERNATIVE_PAGES } from "@/app/alternatives/_data";
import { BEST_LIST_PAGES } from "@/app/best/_data";
import { listCompanySlugs } from "@/lib/companies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/indexnow-submit
 *
 * Pushes the site's full URL inventory to the IndexNow protocol so
 * Bing / Yandex / Naver / Seznam / Yep get instant-index notifications
 * on changed content. Google does NOT participate in IndexNow but
 * picks up changes via the sitemap (already submitted via GSC) so
 * we cover both surfaces.
 *
 * Auth: CRON_SECRET via Authorization: Bearer header (per checkCron).
 *
 * Scheduling: invoke from Vercel Cron daily — see vercel.json.
 *
 * Required env:
 *   INDEXNOW_KEY       — 8-128 char alphanumeric+hyphen key. Must match
 *                        the filename hosted at /<key>.txt at site root.
 *                        Generated once with `crypto.randomBytes(24).toString('hex')`.
 *
 * Endpoint: https://api.indexnow.org/indexnow (canonical aggregator).
 * Bing also accepts at https://bing.com/indexnow but the aggregator
 * fans out to all participating engines in one call.
 */

const SITE_URL = "https://logisticintel.com";
const SITE_HOST = "logisticintel.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Hard upper bound on a single IndexNow submission per the spec
 *  (10,000 URLs per request). We chunk to 1,000 for politeness and
 *  to make any failure recoverable. */
const CHUNK_SIZE = 1000;

const STATIC_PATHS = [
  "/",
  "/features",
  "/solutions",
  "/vs",
  "/alternatives",
  "/best",
  "/resources",
  "/lanes",
  "/ports",
  "/hs",
  "/tools",
  "/tools/tariff-calculator",
  "/companies",
  "/customers",
  "/glossary",
  "/blog",
  "/faq",
  "/pulse",
  "/company-intelligence",
  "/contact-intelligence",
  "/trade-intelligence",
  "/command-center",
  "/outbound-engine",
  "/rate-benchmark",
  "/revenue-opportunity",
  "/products",
  "/integrations",
  "/security",
  "/about",
  "/careers",
  "/demo",
  "/contact",
];

export async function GET(req: NextRequest) {
  const auth = checkCron(req);
  if (auth) return auth;

  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return json({ ok: false, error: "indexnow_key_unset" }, 500);
  }

  // Collect every public URL we care to surface for re-indexing.
  const urls = new Set<string>();
  for (const p of STATIC_PATHS) urls.add(`${SITE_URL}${p}`);

  // Programmatic routes — features / solutions / alternatives / best
  // ship from code-co-located data files, so we can iterate those
  // directly without a Sanity hit.
  for (const f of FEATURE_PAGES) urls.add(`${SITE_URL}/features/${f.slug}`);
  for (const s of SOLUTION_PAGES) urls.add(`${SITE_URL}/solutions/${s.slug}`);
  for (const a of ALTERNATIVE_PAGES) urls.add(`${SITE_URL}/alternatives/${a.slug}`);
  for (const b of BEST_LIST_PAGES) urls.add(`${SITE_URL}/best/${b.slug}`);

  // Sanity-backed routes — blog, glossary, comparisons, lanes, ports,
  // HS codes, customer stories, free tools. Fail silently per route
  // group: a single Sanity hiccup shouldn't drop the submission.
  type SlugRow = { slug: string };
  const sanitySlugs = await Promise.all([
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="blogPost" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="glossaryTerm" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="comparison" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="tradeLane" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="port" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="hsCode" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="caseStudy" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
    sanityClient
      .fetch<SlugRow[]>(groq`*[_type=="freeTool" && defined(slug.current)]{"slug": slug.current}`)
      .catch(() => []),
  ]);
  const [blog, glossary, comparisons, lanes, ports, hs, customers, freeTools] = sanitySlugs;
  for (const r of blog) urls.add(`${SITE_URL}/blog/${r.slug}`);
  for (const r of glossary) urls.add(`${SITE_URL}/glossary/${r.slug}`);
  for (const r of comparisons) urls.add(`${SITE_URL}/vs/${r.slug}`);
  for (const r of lanes) urls.add(`${SITE_URL}/lanes/${r.slug}`);
  for (const r of ports) urls.add(`${SITE_URL}/ports/${r.slug}`);
  for (const r of hs) urls.add(`${SITE_URL}/hs/${r.slug}`);
  for (const r of customers) urls.add(`${SITE_URL}/customers/${r.slug}`);
  for (const r of freeTools) urls.add(`${SITE_URL}/tools/${r.slug}`);

  // /companies/[slug] — programmatic importer profile pages (~27K).
  // Submit in bulk; IndexNow accepts up to 10K URLs per request.
  const companySlugs = await listCompanySlugs({ limit: 50000 }).catch(() => []);
  for (const row of companySlugs) {
    if (row.seo_slug) urls.add(`${SITE_URL}/companies/${row.seo_slug}`);
  }

  const urlList = Array.from(urls);
  const chunks: string[][] = [];
  for (let i = 0; i < urlList.length; i += CHUNK_SIZE) {
    chunks.push(urlList.slice(i, i + CHUNK_SIZE));
  }

  const results: Array<{ chunk: number; submitted: number; status: number }> = [];
  for (let i = 0; i < chunks.length; i++) {
    const body = {
      host: SITE_HOST,
      key,
      keyLocation: `${SITE_URL}/${key}.txt`,
      urlList: chunks[i],
    };
    try {
      const r = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });
      results.push({ chunk: i + 1, submitted: chunks[i].length, status: r.status });
    } catch (e: any) {
      console.error("[indexnow] chunk failed", i, e?.message || e);
      results.push({ chunk: i + 1, submitted: 0, status: 0 });
    }
  }

  return json({
    ok: results.every((r) => r.status >= 200 && r.status < 400),
    totalUrls: urlList.length,
    chunks: results,
  });
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
