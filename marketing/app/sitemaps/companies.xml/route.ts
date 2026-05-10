import { listCompanySlugs } from "@/lib/companies";

export const dynamic = "force-dynamic";
export const revalidate = 21600; // 6h

/**
 * Dedicated sitemap for /companies/[slug] (~27,000 URLs and growing).
 *
 * Why this lives separately from `/sitemap.xml`:
 *   - Google's sitemap limit is 50,000 URLs or 50MB per file.
 *   - Mixing programmatic-SEO pages with the small static surface
 *     muddies crawl priority and slows the main sitemap.
 *
 * The main sitemap (or the future sitemap index) references this URL
 * via <sitemap><loc>…</loc></sitemap>.
 *
 * Output: raw XML, public, cached at the edge with 6h SWR.
 */
const SITE_URL = "https://logisticintel.com";

export async function GET() {
  const slugs = await listCompanySlugs({ limit: 50000, offset: 0 });

  const now = new Date().toISOString();
  const urls = slugs.map((row) => {
    const last = row.updated_at || now;
    return `  <url>
    <loc>${SITE_URL}/companies/${escape(row.seo_slug)}</loc>
    <lastmod>${last}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}

/** Escape the small set of XML-reserved characters we might see in
 *  slugs (mostly &, <, >). Slugs are kebab-case lowercase alphanumeric
 *  so this is almost a no-op in practice but defensive. */
function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
