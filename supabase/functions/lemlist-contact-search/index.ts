// lemlist-contact-search - company-scoped People Database discovery.
//
// This returns preview contacts only. Email enrichment happens later through
// lemlist-enrichment after the user selects contacts.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEMLIST_API_KEY =
  Deno.env.get("LEMLIST_API") ||
  Deno.env.get("LEMLIST_API_KEY") ||
  Deno.env.get("Lemlist_API") ||
  "";
const LEMLIST_BASE_URL = "https://api.lemlist.com/api";

type SearchBody = {
  company_id?: string | null;
  company_name?: string | null;
  domain?: string | null;
  titles?: string[] | null;
  seniorities?: string[] | null;
  departments?: string[] | null;
  recommended_only?: boolean | null;
  page?: number | null;
  per_page?: number | null;
};

type LemlistFilter = { filterId: string; in: string[]; out: string[] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`:${apiKey}`)}`;
}

function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] || null;
}

function nonEmptyStrings(values?: string[] | null): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
}

function mapSeniorities(values?: string[] | null): string[] {
  const out = new Set<string>();
  for (const value of nonEmptyStrings(values)) {
    const v = value.toLowerCase();
    if (v.includes("owner")) out.add("Ownership / Firm Leadership");
    else if (v.includes("vp") || v.includes("head")) out.add("Executive Leadership");
    else if (v.includes("director")) out.add("Department Leadership");
    else if (v.includes("manager")) out.add("People Management / Leadership");
  }
  return Array.from(out);
}

function mapDepartments(values?: string[] | null): string[] {
  const mapped = new Set<string>();
  for (const value of nonEmptyStrings(values)) {
    const v = value.toLowerCase();
    if (v.includes("procurement") || v.includes("purchasing") || v.includes("sourcing")) mapped.add("Purchasing");
    else if (
      v.includes("operation") ||
      v.includes("logistics") ||
      v.includes("supply") ||
      v.includes("transport")
    ) mapped.add("Operations");
    else if (v.includes("legal")) mapped.add("Legal");
  }
  return Array.from(mapped);
}

function lower(value?: string | null): string {
  return String(value || "").toLowerCase();
}

function recommendationScore(row: any): { score: number; reasons: string[]; recommended: boolean } {
  const exp = currentExperience(row);
  const title = lower(row?.current_title || exp?.title || row?.title);
  const department = lower(row?.department);
  const seniority = lower(row?.seniority);
  const reasons: string[] = [];
  let score = 0;

  if (/(logistics|supply chain|transport|transportation|import|customs|warehouse|distribution|fulfillment|operations|procurement|purchasing|sourcing)/.test(title)) {
    score += 45;
    reasons.push("role match");
  }
  if (/(owner|founder|president|chief|ceo|coo|vp|vice president|head|director|manager)/.test(title)) {
    score += 25;
    reasons.push("seniority match");
  }
  if (/(operations|purchasing|procurement|supply|logistics)/.test(department)) {
    score += 20;
    reasons.push("department match");
  }
  if (/(ownership|executive|leadership|management|director|vp|head|owner)/.test(seniority)) {
    score += 10;
    reasons.push("leadership signal");
  }

  return { score, reasons, recommended: score >= 35 };
}

function splitName(fullName?: string | null): { first_name: string | null; last_name: string | null } {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || null,
    last_name: parts.slice(1).join(" ") || null,
  };
}

function currentExperience(row: any): any {
  const experiences = Array.isArray(row?.experiences) ? row.experiences : [];
  return experiences[0] || {};
}

function inferDepartment(title?: string | null): string | null {
  const t = String(title || "").toLowerCase();
  if (/(procurement|purchasing|sourcing)/.test(t)) return "procurement";
  if (/(legal|counsel|compliance)/.test(t)) return "legal";
  if (/(logistics|supply|transport|warehouse|distribution|import|customs|operation)/.test(t)) return "operations";
  return null;
}

function toLinkedInUrl(row: any): string | null {
  if (row?.linkedin_url) return row.linkedin_url;
  if (row?.lead_linkedin_url) return row.lead_linkedin_url;
  if (row?.canonical_shorthand_name) return `https://www.linkedin.com/in/${row.canonical_shorthand_name}`;
  return null;
}

function toPreview(row: any) {
  const exp = currentExperience(row);
  const fullName = row?.full_name || row?.name || null;
  const names = splitName(fullName);
  const title = row?.current_title || exp?.title || row?.title || null;
  const company = exp?.company_name || row?.current_company_name || row?.company_name || null;
  const recommendation = recommendationScore(row);
  const companyWebsite =
    exp?.company_website ||
    exp?.company_website_url ||
    row?.current_company_website_url ||
    row?.company_website ||
    row?.company_website_url ||
    null;
  return {
    apollo_person_id: row?.lead_id ? String(row.lead_id) : row?.id ? String(row.id) : null,
    source_contact_key: row?.lead_id ? String(row.lead_id) : row?.id ? String(row.id) : null,
    full_name: fullName,
    first_name: row?.first_name || names.first_name,
    last_name: row?.last_name || names.last_name,
    title,
    department: row?.department || inferDepartment(title),
    seniority: row?.seniority || null,
    company,
    location: row?.location || exp?.location || row?.country || row?.current_country || null,
    city: row?.city || null,
    state: row?.state || null,
    country: row?.country || row?.current_country || null,
    country_code: row?.country_code || row?.country || null,
    phone: row?.phone || row?.phone_number || null,
    phone_status: row?.phone ? "available" : "disabled",
    email: row?.email || null,
    email_status: row?.email_status || row?.emailStatus || (row?.email ? "available" : "hidden"),
    linkedin_url: toLinkedInUrl(row),
    avatar_url: row?.picture || row?.photo_url || row?.avatar_url || row?.profile_picture_url || null,
    company_size: row?.company_size || exp?.company_size || row?.current_company_size || null,
    company_website: companyWebsite,
    company_industry: row?.company_industry || exp?.company_industry || row?.industry || row?.current_company_industry || null,
    fit_score: recommendation.score,
    fit_reasons: recommendation.reasons,
    recommended: recommendation.recommended,
    source: "lemlist",
    enrichment_status: "preview",
  };
}

async function hydrateCompany(supabase: ReturnType<typeof createClient>, body: SearchBody) {
  let companyName = body.company_name?.trim() || null;
  let domain = normalizeDomain(body.domain || null);
  if (body.company_id && (!companyName || !domain)) {
    const { data: company } = await supabase
      .from("lit_companies")
      .select("id, name, domain, website")
      .eq("id", body.company_id)
      .maybeSingle();
    if (company) {
      companyName = companyName || company.name || null;
      domain = domain || normalizeDomain(company.domain || company.website);
    }
  }
  return { companyName, domain };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!LEMLIST_API_KEY) return json({ ok: false, error: "LIT contact search is not configured", code: "PROVIDER_NOT_CONFIGURED" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

  const body: SearchBody = await req.json().catch(() => ({}));
  const { companyName, domain } = await hydrateCompany(supabase, body);
  if (!companyName && !domain) {
    return json({
      ok: false,
      code: "COMPANY_NOT_VERIFIED",
      message: "LIT could not confirm this company. Add a company name or website before searching contacts.",
    }, 400);
  }

  const filters: LemlistFilter[] = [];
  if (companyName) filters.push({ filterId: "currentCompany", in: [companyName], out: [] });
  else if (domain) filters.push({ filterId: "currentCompanyWebsiteUrl", in: [domain], out: [] });

  const titles = nonEmptyStrings(body.titles).slice(0, 15);
  if (titles.length) filters.push({ filterId: "currentTitle", in: titles, out: [] });

  const departments = mapDepartments(body.departments);
  if (departments.length) filters.push({ filterId: "department", in: departments, out: [] });

  const seniorities = mapSeniorities(body.seniorities);
  if (seniorities.length) filters.push({ filterId: "seniority", in: seniorities, out: [] });

  const page = Math.max(1, Number(body.page) || 1);
  const size = Math.min(100, Math.max(1, Number(body.per_page) || 25));

  const res = await fetch(`${LEMLIST_BASE_URL}/database/people`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": basicAuthHeader(LEMLIST_API_KEY),
    },
    body: JSON.stringify({ filters, page, size }),
  });
  const rawText = await res.text().catch(() => "");
  let raw: any = null;
  try { raw = rawText ? JSON.parse(rawText) : null; } catch { raw = rawText; }

  if (!res.ok) {
    return json({
      ok: false,
      provider: "lit",
      error: typeof raw === "string" ? raw : raw?.message || raw?.error || "LIT contact search failed",
      status: res.status,
    }, res.status);
  }

  const results = Array.isArray(raw?.results) ? raw.results : [];
  const allContacts = results
    .map(toPreview)
    .filter((c: any) => c.full_name || c.linkedin_url)
    .sort((a: any, b: any) => Number(b.fit_score || 0) - Number(a.fit_score || 0));
  const recommendedContacts = allContacts.filter((c: any) => c.recommended);
  const contacts = body.recommended_only === true && recommendedContacts.length >= 5
    ? recommendedContacts
    : allContacts;
  const matchMode = companyName ? "name_location_fallback" : "domain";
  const organization = companyName || domain ? { id: null, name: companyName, primary_domain: domain } : null;
  return json({
    ok: true,
    provider: "lit",
    contacts,
    people: contacts,
    recommended_count: recommendedContacts.length,
    total: raw?.totalCount ?? raw?.total ?? contacts.length,
    has_more: raw?.hasMore === true || results.length >= size,
    matchMode,
    match_mode: matchMode,
    organization,
    apollo_organization: organization,
    message: contacts.length === 0 ? "No LIT contacts matched this company and role filter." : null,
  });
});
