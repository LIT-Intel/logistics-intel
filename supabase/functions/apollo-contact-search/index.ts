import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";
// Apollo migrated their people-search endpoint from
// `/api/v1/mixed_people/search` to `/api/v1/mixed_people/api_search` —
// API keys now require the `api_search` path. Request/response shape
// is unchanged. See https://docs.apollo.io/reference/people-search
const APOLLO_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";

interface ApolloSearchRequest {
  company_id?: string;
  domain?: string;
  company_name?: string;
  titles?: string[];
  seniorities?: string[];
  departments?: string[];
  locations?: string[];
  page?: number;
  per_page?: number;
}

interface NormalizedContact {
  source: "apollo";
  source_contact_key: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  department: string | null;
  seniority: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  organization_name: string | null;
  organization_domain: string | null;
  raw_payload: Record<string, unknown>;
}

function normalizeApolloPerson(p: Record<string, any>): NormalizedContact {
  const firstName = p.first_name || null;
  const lastName = p.last_name || null;
  const fullName =
    p.name ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;

  const org = p.organization || {};
  const domain = org.primary_domain || org.website_url || null;

  return {
    source: "apollo",
    source_contact_key: String(p.id || p.person_id || `${fullName}-${domain || ""}`),
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: p.title || null,
    department: Array.isArray(p.departments) ? p.departments[0] : p.departments || null,
    seniority: p.seniority || null,
    email: p.email && p.email !== "email_not_unlocked@domain.com" ? p.email : null,
    email_status: p.email_status || null,
    phone:
      (Array.isArray(p.phone_numbers) && p.phone_numbers[0]?.sanitized_number) ||
      p.phone || null,
    linkedin_url: p.linkedin_url || null,
    city: p.city || null,
    state: p.state || null,
    country_code: p.country || null,
    organization_name: org.name || null,
    organization_domain: domain,
    raw_payload: p,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!APOLLO_API_KEY) {
      console.error(JSON.stringify({ fn: "apollo-contact-search", error: "APOLLO_API_KEY not configured" }));
      return new Response(
        JSON.stringify({ ok: false, error: "Apollo API key not configured", code: "APOLLO_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: ApolloSearchRequest = await req.json().catch(() => ({}));
    const {
      company_id,
      domain: bodyDomain,
      company_name: bodyCompanyName,
      titles,
      seniorities,
      departments,
      locations,
      page = 1,
      per_page = 10,
    } = body;

    let domain = bodyDomain || null;
    let companyName = bodyCompanyName || null;
    let resolvedCompanyId: string | null = company_id || null;

    if (company_id && (!domain || !companyName)) {
      const { data: company } = await supabase
        .from("lit_companies")
        .select("id, name, domain, website")
        .eq("id", company_id)
        .maybeSingle();
      if (company) {
        resolvedCompanyId = company.id;
        domain = domain || company.domain || (company.website || "").replace(/^https?:\/\//, "").split("/")[0] || null;
        companyName = companyName || company.name || null;
      }
    }

    const apolloBody: Record<string, unknown> = {
      page: Math.max(1, Number(page) || 1),
      per_page: Math.min(100, Math.max(1, Number(per_page) || 10)),
    };
    if (domain) apolloBody.q_organization_domains_list = [domain];
    if (!domain && companyName) apolloBody.q_organization_name = companyName;
    if (Array.isArray(titles) && titles.length) apolloBody.person_titles = titles;
    if (Array.isArray(seniorities) && seniorities.length) apolloBody.person_seniorities = seniorities;
    if (Array.isArray(departments) && departments.length) apolloBody.person_departments = departments;
    if (Array.isArray(locations) && locations.length) apolloBody.person_locations = locations;

    const apolloRes = await fetch(APOLLO_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(apolloBody),
    });

    if (!apolloRes.ok) {
      const errText = await apolloRes.text().catch(() => apolloRes.statusText);
      console.error(JSON.stringify({ fn: "apollo-contact-search", apolloStatus: apolloRes.status, error: errText }));
      return new Response(
        JSON.stringify({ ok: false, error: `Apollo API error (${apolloRes.status})`, code: "APOLLO_API_ERROR" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apolloData = await apolloRes.json();
    const rawPeople: Record<string, any>[] = Array.isArray(apolloData?.people) ? apolloData.people : [];
    const contacts = rawPeople.map(normalizeApolloPerson);

    await supabase.from("lit_activity_events").insert({
      user_id: user.id,
      event_type: "apollo_contact_search",
      company_id: resolvedCompanyId,
      metadata: {
        provider: "apollo",
        count: contacts.length,
        page: apolloBody.page,
        per_page: apolloBody.per_page,
        filters: { domain, companyName, titles, seniorities, departments, locations },
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "apollo",
        contacts,
        count: contacts.length,
        pagination: apolloData?.pagination || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(JSON.stringify({ fn: "apollo-contact-search", error: error?.message || String(error) }));
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
