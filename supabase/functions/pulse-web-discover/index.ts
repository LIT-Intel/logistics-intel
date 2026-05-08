// pulse-web-discover — Layer 3 of the Pulse search cascade.
//
// Cascade order (Pulse search policy):
//   L1: lit_companies + lit_saved_companies (saved/CRM accounts)        — free
//   L2: lit_company_directory + lit_company_source_metrics              — free
//   L3: this function — web discovery via Tavily                        — cheap
//   L4: searchLeads (Apollo)                                            — expensive
//
// Goal: when L1+L2 return < N results, surface real company names from
// the public web (LinkedIn company pages, Crunchbase, ZoomInfo
// directory, RocketReach, D&B, etc.) BEFORE falling through to Apollo.
// Each new company we discover gets persisted to lit_company_directory
// with source='web_discovery', so tomorrow's same query hits L2 — the
// search engine compounds.
//
// Auth: requires user JWT (same pattern as searchLeads). Service-role
// client is used for the lit_company_directory upsert so RLS on user
// writes doesn't block discovery seeding.
//
// Request body:
//   {
//     query: string,                       // raw NL query
//     entities?: ParsedEntities,           // optional, from pulse-coach-classify
//     limit?: number,                      // default 12, max 30
//     persist?: boolean                    // default true; set false to dry-run
//   }
//
// Response:
//   {
//     ok: true,
//     query: string,
//     results: Array<{
//       name: string,
//       domain: string | null,
//       website: string,
//       title: string,                     // page title from web search
//       snippet: string,                   // page snippet
//       provenance: 'web' | 'directory_existing',
//       directory_id: string | null,       // populated when we matched/saved
//       inferred_industry: string | null,
//       inferred_location: { city: string | null, state: string | null, country: string | null },
//     }>,
//     meta: {
//       total: number,
//       persisted: number,
//       deduped_against_directory: number,
//       provider: 'tavily',
//       search_query: string,              // the actual Tavily query we built
//       credits_used: 1
//     }
//   }
//
// Errors return { ok: false, code: string, message: string }:
//   TAVILY_NOT_CONFIGURED, INVALID_QUERY, UNAUTHORIZED, INTERNAL

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Sites we PREFER for company discovery (high signal-to-noise for B2B)
// vs. sites we EXCLUDE because they pollute results with non-company
// pages (Wikipedia articles, news, social homepages, generic directories).
const INCLUDE_DOMAINS = [
  "linkedin.com/company",
  "zoominfo.com/c",
  "rocketreach.co/company",
  "crunchbase.com/organization",
  "dnb.com/business-directory",
  "thomasnet.com/companies",
  "globalsources.com",
  "manta.com",
  "bbb.org",
  "buzzfile.com",
];

// Domains we strip out — these are about companies but not company
// homepages, so the URL never gives us a clean canonical_domain.
const EXCLUDE_HOSTS = new Set([
  "wikipedia.org",
  "youtube.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "reddit.com",
  "indeed.com",
  "glassdoor.com",
  "yelp.com",
  "amazon.com",
  "google.com",
  "bing.com",
  "yahoo.com",
  "logisticintel.com",
]);

interface DiscoverRequest {
  query?: string;
  entities?: Record<string, any>;
  limit?: number;
  persist?: boolean;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface DiscoveredCompany {
  name: string;
  domain: string | null;
  website: string;
  title: string;
  snippet: string;
  provenance: "web" | "directory_existing";
  directory_id: string | null;
  inferred_industry: string | null;
  inferred_location: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s*\b(inc|llc|corp|corporation|ltd|limited|co\.|co|company|gmbh|s\.a\.|s\.a|sa|ag|plc|holdings)\.?\s*$/i, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomainFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (EXCLUDE_HOSTS.has(host)) return null;
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Extract a company name from a search-result title. Most B2B directory
 * pages follow predictable title patterns:
 *   "Acme Logistics — Company Profile | LinkedIn"
 *   "ABC Freight Brokerage — Crunchbase"
 *   "Atlanta Cargo Inc | ZoomInfo.com"
 *   "Acme Logistics — Locations, Phone Numbers, Reviews | Manta"
 * We split on common separators and take the first segment, then strip
 * trailing site/service identifiers like "Profile" / "Overview" /
 * "Reviews".
 */
function extractCompanyNameFromTitle(title: string, host: string): string | null {
  if (!title) return null;
  // Split on common delimiters (em-dash, en-dash, pipe, hyphen, colon).
  // First non-empty segment is the company name 95% of the time.
  const segments = title
    .split(/\s*[–—‒|:]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  let candidate = segments[0];

  // If the first segment is the host name itself ("LinkedIn"), use the
  // second segment instead.
  const hostBrand = host.split(".")[0]; // e.g. "linkedin", "crunchbase"
  if (
    hostBrand &&
    candidate.toLowerCase().includes(hostBrand) &&
    segments.length > 1
  ) {
    candidate = segments[1];
  }

  // Strip trailing noise like "Company Profile", "Overview", "Reviews".
  candidate = candidate
    .replace(/\b(company\s+profile|profile|overview|reviews|locations|phone\s+numbers?)\b.*$/i, "")
    .trim();

  // Filter out obvious non-company titles (news, list articles).
  if (candidate.length < 2 || candidate.length > 90) return null;
  if (/^(top|best|the|how|why|what|when|where)\s+\d+/i.test(candidate)) return null;

  return candidate;
}

/**
 * Build a Tavily search query that biases toward company directory
 * pages. We bias to include_domains so 80% of results are clean B2B
 * profile pages; the other 20% leaks through as raw web hits we still
 * try to parse.
 */
function buildSearchQuery(
  rawQuery: string,
  entities: Record<string, any> | undefined,
): string {
  const parts: string[] = [rawQuery];

  // Augment with explicit location hints from the parser so Tavily's
  // ranking knows the geographic intent. Helps disambiguate "Georgia"
  // (state vs country) when origins/destinations are present.
  if (entities) {
    const dests = Array.isArray(entities.destinations)
      ? entities.destinations
      : [];
    const origins = Array.isArray(entities.origins) ? entities.origins : [];
    const states = Array.isArray(entities.states) ? entities.states : [];
    const metros = Array.isArray(entities.metros) ? entities.metros : [];
    const locationHints: string[] = [];
    for (const d of dests) {
      const name = typeof d === "string" ? d : d?.name;
      if (name) locationHints.push(name);
    }
    for (const o of origins) {
      const name = typeof o === "string" ? o : o?.name;
      if (name) locationHints.push(`from ${name}`);
    }
    for (const s of states) locationHints.push(s);
    for (const m of metros) locationHints.push(m);
    if (locationHints.length > 0) {
      const dedup = Array.from(new Set(locationHints)).slice(0, 4);
      parts.push(...dedup);
    }
  }

  return parts.join(" ");
}

async function callTavily(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<{
  ok: boolean;
  results: TavilyResult[];
  error?: string;
}> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: Math.min(20, maxResults),
        include_domains: INCLUDE_DOMAINS,
        // We don't ask for the answer — we want raw result rows.
        include_answer: false,
        include_raw_content: false,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return {
        ok: false,
        results: [],
        error: `Tavily ${res.status}: ${txt.slice(0, 200)}`,
      };
    }
    const data = await res.json();
    const results = Array.isArray(data?.results)
      ? (data.results as TavilyResult[])
      : [];
    return { ok: true, results };
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err instanceof Error ? err.message : "tavily_threw",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!TAVILY_API_KEY) {
    return jsonResponse(
      {
        ok: false,
        code: "TAVILY_NOT_CONFIGURED",
        message:
          "Web discovery is not configured. Ask your admin to set TAVILY_API_KEY in Supabase secrets.",
      },
      503,
    );
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, code: "ENV_MISSING" }, 500);
  }

  // Auth — same pattern searchLeads + apollo-contact-search use.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResp } = await userClient.auth.getUser();
  if (!userResp?.user) {
    return jsonResponse({ ok: false, code: "UNAUTHORIZED" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: DiscoverRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, code: "INVALID_JSON_BODY" },
      400,
    );
  }

  const rawQuery = (body.query || "").trim();
  if (!rawQuery || rawQuery.length < 3) {
    return jsonResponse(
      { ok: false, code: "INVALID_QUERY", message: "Query must be at least 3 characters." },
      400,
    );
  }
  const limit = Math.min(30, Math.max(1, Number(body.limit) || 12));
  const persist = body.persist !== false;

  const tavilyQuery = buildSearchQuery(rawQuery, body.entities);
  const tavilyResp = await callTavily(tavilyQuery, TAVILY_API_KEY, limit);
  if (!tavilyResp.ok) {
    console.error("[pulse-web-discover] tavily failed", tavilyResp.error);
    return jsonResponse(
      { ok: false, code: "PROVIDER_ERROR", message: tavilyResp.error || "Web search failed" },
      502,
    );
  }

  // 1. Extract company candidates from search results.
  const candidates: DiscoveredCompany[] = [];
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  for (const r of tavilyResp.results) {
    const url = String(r.url || "").trim();
    if (!url) continue;
    const host = extractDomainFromUrl(url);
    if (!host) continue;
    // Use the URL hostname as a hint for parsing the title — if the
    // host is a directory aggregator (linkedin.com), the company
    // domain isn't here; we only have a name.
    const isDirectoryHost = INCLUDE_DOMAINS.some((d) => host.includes(d.split("/")[0]));
    const companyName = extractCompanyNameFromTitle(r.title, host);
    if (!companyName) continue;
    const normalized = normalizeCompanyName(companyName);
    if (!normalized || seenNames.has(normalized)) continue;
    seenNames.add(normalized);

    // For directory aggregator results we don't get a company domain
    // (the URL is just linkedin.com/company/foo). For results from
    // the company's own homepage we DO get the canonical domain.
    const cleanDomain = isDirectoryHost ? null : host;
    if (cleanDomain && seenDomains.has(cleanDomain)) continue;
    if (cleanDomain) seenDomains.add(cleanDomain);

    candidates.push({
      name: companyName,
      domain: cleanDomain,
      website: cleanDomain ? `https://${cleanDomain}` : url,
      title: r.title,
      snippet: r.content?.slice(0, 240) || "",
      provenance: "web",
      directory_id: null,
      inferred_industry: null,
      inferred_location: { city: null, state: null, country: null },
    });
    if (candidates.length >= limit) break;
  }

  if (candidates.length === 0) {
    return jsonResponse({
      ok: true,
      query: rawQuery,
      results: [],
      meta: {
        total: 0,
        persisted: 0,
        deduped_against_directory: 0,
        provider: "tavily",
        search_query: tavilyQuery,
        credits_used: 1,
      },
    });
  }

  // 2. Dedup against existing directory + companies. We match by
  // normalized name (loose) AND by canonical_domain (strict).
  const candidateNames = candidates.map((c) => normalizeCompanyName(c.name));
  const candidateDomains = candidates
    .map((c) => c.domain)
    .filter(Boolean) as string[];

  const [{ data: directoryHits }, { data: companyHits }] = await Promise.all([
    admin
      .from("lit_company_directory")
      .select("id, company_name, normalized_name, canonical_name, domain, canonical_domain")
      .or(
        [
          candidateNames.length
            ? `normalized_name.in.(${candidateNames.map((n) => `"${n.replace(/"/g, '""')}"`).join(",")})`
            : "",
          candidateDomains.length
            ? `domain.in.(${candidateDomains.map((d) => `"${d}"`).join(",")})`
            : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(200),
    admin
      .from("lit_companies")
      .select("id, name, domain")
      .or(
        candidateDomains.length
          ? `domain.in.(${candidateDomains.map((d) => `"${d}"`).join(",")})`
          : "id.eq.00000000-0000-0000-0000-000000000000",
      )
      .limit(50),
  ]);

  const directoryByName = new Map<string, any>();
  const directoryByDomain = new Map<string, any>();
  for (const row of directoryHits ?? []) {
    if (row.normalized_name) directoryByName.set(row.normalized_name, row);
    const d = (row.canonical_domain || row.domain || "").toLowerCase();
    if (d) directoryByDomain.set(d, row);
  }
  const companyByDomain = new Map<string, any>();
  for (const row of companyHits ?? []) {
    if (row.domain) companyByDomain.set(row.domain.toLowerCase(), row);
  }

  let dedupedCount = 0;
  let persistedCount = 0;
  const newRows: any[] = [];

  for (const c of candidates) {
    const norm = normalizeCompanyName(c.name);
    const dirHit =
      directoryByName.get(norm) ||
      (c.domain ? directoryByDomain.get(c.domain) : null);
    const companyHit = c.domain ? companyByDomain.get(c.domain) : null;
    if (dirHit) {
      c.provenance = "directory_existing";
      c.directory_id = dirHit.id;
      dedupedCount++;
      continue;
    }
    if (companyHit) {
      // Already saved as a real lit_companies row — also dedup.
      c.provenance = "directory_existing";
      c.directory_id = null;
      dedupedCount++;
      continue;
    }
    // Genuinely new company. Queue for insert.
    if (persist) {
      newRows.push({
        source: "web_discovery",
        source_file: "pulse_web_discover",
        external_id: c.domain || `web:${norm}`,
        company_name: c.name,
        normalized_name: norm,
        canonical_name: c.name,
        domain: c.domain,
        canonical_domain: c.domain,
        website: c.website,
        description: c.snippet,
        is_enriched: false,
        enrichment_status: "discovered",
        enriched_at: new Date().toISOString(),
        raw_json: {
          discovered_via: "tavily",
          query: rawQuery,
          page_title: c.title,
          page_url: c.website,
        },
      });
    }
  }

  if (newRows.length > 0 && persist) {
    // Upsert by (source, external_id) — composite uniqueness via the
    // existing source_company_key conventions. The directory table has
    // a uniqueness check on company_key when present; we leave that
    // null for web discoveries until a later enrich pass.
    const { data: inserted, error: insertErr } = await admin
      .from("lit_company_directory")
      .insert(newRows)
      .select("id, company_name, normalized_name");
    if (insertErr) {
      console.warn("[pulse-web-discover] insert warned", insertErr.code, insertErr.message);
    } else if (Array.isArray(inserted)) {
      persistedCount = inserted.length;
      // Backfill directory_id on the candidates we just persisted so
      // the response mirrors what L2 will see on the next search.
      const insertedByName = new Map<string, string>();
      for (const ins of inserted) {
        if (ins.normalized_name) insertedByName.set(ins.normalized_name, ins.id);
      }
      for (const c of candidates) {
        if (c.directory_id) continue;
        const id = insertedByName.get(normalizeCompanyName(c.name));
        if (id) c.directory_id = id;
      }
    }
  }

  return jsonResponse({
    ok: true,
    query: rawQuery,
    results: candidates,
    meta: {
      total: candidates.length,
      persisted: persistedCount,
      deduped_against_directory: dedupedCount,
      provider: "tavily",
      search_query: tavilyQuery,
      credits_used: 1,
    },
  });
});
