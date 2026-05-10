/**
 * Public companies surface — read-only client over the
 * `lit_company_directory` table.
 *
 * RLS allows anon SELECT on `is_active = true` rows, so we use the
 * anon key here rather than a service role key. The dataset is
 * sourced from US Customs Bill of Lading filings — already public
 * trade records — so anon read is appropriate.
 *
 * URL convention:
 *   /companies/[seo_slug]
 *
 * `seo_slug` is a generated column derived from `company_key`
 * (the canonical `panjiva:<name>:<city>:<state>:<zip>` tuple).
 * Uniqueness is guaranteed by a partial unique index on
 * (seo_slug) where is_active = true.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

/** Lazily-created Supabase client. Falls back to a null-returning stub
 *  when env is unset (build-time safety; no runtime explosions). */
function client() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    db: { schema: "public" },
  });
}

/** Fields the marketing /companies/[slug] page renders. */
export type PublicCompany = {
  seo_slug: string;
  company_name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  industry: string | null;
  website: string | null;
  domain: string | null;
  linkedin_url: string | null;
  description: string | null;
  ultimate_parent_name: string | null;
  shipments: number | null;
  kg: number | null;
  value_usd: number | null;
  teu: number | null;
  lcl: number | null;
  enrichment_status: string | null;
};

const FIELDS = [
  "seo_slug",
  "company_name",
  "city",
  "state",
  "country",
  "postal_code",
  "industry",
  "website",
  "domain",
  "linkedin_url",
  "description",
  "ultimate_parent_name",
  "shipments",
  "kg",
  "value_usd",
  "teu",
  "lcl",
  "enrichment_status",
].join(", ");

/** Look up a company by its seo_slug. Returns null when missing. */
export async function getCompanyBySlug(
  slug: string,
): Promise<PublicCompany | null> {
  const c = client();
  if (!c) return null;
  const { data, error } = await c
    .from("lit_company_directory")
    .select(FIELDS)
    .eq("is_active", true)
    .eq("seo_slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[companies.getCompanyBySlug]", slug, error.message);
    return null;
  }
  return (data as PublicCompany | null) || null;
}

/**
 * Top N companies by TEU. Used to pre-render the most-trafficked pages
 * via generateStaticParams and to seed the /companies hub page.
 */
export async function getTopCompanies(limit = 100): Promise<PublicCompany[]> {
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("lit_company_directory")
    .select(FIELDS)
    .eq("is_active", true)
    .not("seo_slug", "is", null)
    .order("teu", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error("[companies.getTopCompanies]", error.message);
    return [];
  }
  return (data as PublicCompany[]) || [];
}

/**
 * All active slugs — used for the dedicated companies sitemap. Paginated
 * via offset so we can drive a multi-page sitemap if/when the corpus
 * grows past the 50K Google limit per sitemap.
 */
export async function listCompanySlugs(opts: {
  limit?: number;
  offset?: number;
} = {}): Promise<Array<{ seo_slug: string; updated_at: string | null }>> {
  const { limit = 50000, offset = 0 } = opts;
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("lit_company_directory")
    .select("seo_slug, updated_at")
    .eq("is_active", true)
    .not("seo_slug", "is", null)
    .order("teu", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[companies.listCompanySlugs]", error.message);
    return [];
  }
  return (data || []) as Array<{ seo_slug: string; updated_at: string | null }>;
}

/**
 * Total active row count. Used for sitemap pagination calculation
 * and for "X importers tracked" displays on the hub.
 */
export async function countActiveCompanies(): Promise<number> {
  const c = client();
  if (!c) return 0;
  const { count, error } = await c
    .from("lit_company_directory")
    .select("seo_slug", { count: "exact", head: true })
    .eq("is_active", true)
    .not("seo_slug", "is", null);
  if (error) {
    console.error("[companies.countActiveCompanies]", error.message);
    return 0;
  }
  return count || 0;
}

/** Format the row's headquarters as a single string for display. */
export function formatHeadquarters(c: PublicCompany): string {
  return [c.city, c.state, c.country].filter(Boolean).join(", ");
}

/** Format a numeric metric with US-style commas; falls back to "—". */
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/** Format USD with abbreviated suffixes (1.2M, 8.4K). */
export function formatUsdShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
