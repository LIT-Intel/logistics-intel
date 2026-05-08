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
// is unchanged.
const APOLLO_PEOPLE_URL =
  "https://api.apollo.io/api/v1/mixed_people/api_search";
const APOLLO_ORG_URL =
  "https://api.apollo.io/api/v1/mixed_companies/search";

// Plan-based preview caps. Super-admins bypass via isSuperAdmin().
const PLAN_PREVIEW_CAPS: Record<string, number> = {
  free_trial: 5,
  starter: 10,
  pro: 25,
  growth: 35,
  scale: 50,
  enterprise: 50,
};
const HARD_CAP = 50;

interface ApolloSearchRequest {
  company_id?: string;
  domain?: string;
  company_name?: string;
  city?: string;
  state?: string;
  country?: string;
  // Backwards-compat — older payload sent `locations[]` and we treated
  // it as organization_locations[].
  locations?: string[];
  // When true, scope by where the contact LIVES (person_locations[])
  // instead of the employer's HQ. Default false.
  use_person_locations?: boolean;
  include_similar_titles?: boolean;
  titles?: string[];
  seniorities?: string[];
  departments?: string[];
  email_statuses?: string[];
  page?: number;
  per_page?: number;
}

type MatchMode =
  | "organization_id"
  | "domain"
  | "name_location_fallback"
  | "none";

interface NormalizedContact {
  source: "apollo";
  source_contact_key: string;
  // Apollo person id surfaced explicitly so downstream enrich calls
  // can pass it as `id`. Without this, callers were forced to derive
  // it from source_contact_key (which they often missed), and the
  // enrich request fell back to fuzzy name+domain matching — Apollo
  // returns email_not_unlocked@... in that mode even when credits
  // are available.
  apollo_person_id: string | null;
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

// Apollo returns the locked-email marker with the actual company
// domain on some plan tiers (`email_not_unlocked@odfl.com`) and the
// literal "domain.com" string on others. Match the prefix only.
const APOLLO_LOCKED_EMAIL_PREFIX = "email_not_unlocked@";
function isLockedEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith(APOLLO_LOCKED_EMAIL_PREFIX);
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
  const apolloId = p.id || p.person_id || null;
  const rawEmail = p.email;
  const lockedEmail = isLockedEmail(rawEmail);

  return {
    source: "apollo",
    apollo_person_id: apolloId ? String(apolloId) : null,
    source_contact_key: String(apolloId || `${fullName}-${domain || ""}`),
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: p.title || null,
    department: Array.isArray(p.departments) ? p.departments[0] : p.departments || null,
    seniority: p.seniority || null,
    email: rawEmail && !lockedEmail ? rawEmail : null,
    email_status: lockedEmail ? "locked" : (p.email_status || null),
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

function normalizeDomain(input: unknown): string | null {
  if (!input) return null;
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0] || null;
}

function buildLocationStrings(
  city: string | null,
  state: string | null,
  country: string | null,
  legacyLocations: string[] | null,
): string[] {
  const out: string[] = [];
  // Combined city/state/country pairs Apollo recognizes (e.g. "San
  // Francisco, California, US"). We pass several variants so Apollo's
  // looser matcher catches whichever shape it prefers.
  const parts = [city, state, country].filter(Boolean) as string[];
  if (parts.length) out.push(parts.join(", "));
  if (city && country && (!state || state !== city)) {
    out.push(`${city}, ${country}`);
  }
  if (state && country) out.push(`${state}, ${country}`);
  if (country) out.push(country);
  if (Array.isArray(legacyLocations)) {
    for (const l of legacyLocations) {
      const v = String(l || "").trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return Array.from(new Set(out));
}

async function isSuperAdmin(adminClient: any, user: any): Promise<boolean> {
  if (!user) return false;
  try {
    const { data: row } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (row?.user_id) return true;
  } catch (_) {}
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const envList = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (envList.includes(email)) return true;
  }
  const appMeta = user.app_metadata || {};
  if (appMeta.is_super_admin === true) return true;
  const appRole = String(appMeta.role || "").toLowerCase();
  if (appRole === "super_admin" || appRole === "platform_admin") return true;
  for (const t of ["org_members", "org_memberships"] as const) {
    try {
      const { data } = await adminClient.from(t).select("role").eq("user_id", user.id);
      if (Array.isArray(data)) {
        for (const r of data) {
          const rr = String(r?.role || "").toLowerCase();
          if (rr === "owner" || rr === "admin" || rr === "super_admin") return true;
        }
      }
    } catch (_) {}
  }
  try {
    const { data } = await adminClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", user.id);
    if (Array.isArray(data)) {
      for (const r of data) {
        const rr = String(r?.org_role || "").toLowerCase();
        if (rr === "owner" || rr === "admin" || rr === "super_admin") return true;
      }
    }
  } catch (_) {}
  return false;
}

async function getOrgPlan(adminClient: any, userId: string): Promise<string> {
  for (const t of ["org_members", "org_memberships"] as const) {
    try {
      const { data: row } = await adminClient
        .from(t)
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (row?.org_id) {
        const { data: org } = await adminClient
          .from("organizations")
          .select("plan")
          .eq("id", row.org_id)
          .maybeSingle();
        if (org?.plan) return String(org.plan).toLowerCase();
      }
    } catch (_) {}
  }
  return "free_trial";
}

async function apolloPost(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw };
}

type OrgMatch = {
  id: string;
  name: string | null;
  primary_domain: string | null;
};

function pickBestOrg(
  orgs: any[],
  domain: string | null,
  companyName: string | null,
): OrgMatch | null {
  if (!Array.isArray(orgs) || orgs.length === 0) return null;
  const wantedName = (companyName || "").trim().toLowerCase();
  // 1. exact domain match
  if (domain) {
    const exact = orgs.find((o) => normalizeDomain(o?.primary_domain) === domain);
    if (exact?.id) {
      return {
        id: String(exact.id),
        name: exact.name ?? null,
        primary_domain: exact.primary_domain ?? null,
      };
    }
    const byWebsite = orgs.find(
      (o) => normalizeDomain(o?.website_url) === domain,
    );
    if (byWebsite?.id) {
      return {
        id: String(byWebsite.id),
        name: byWebsite.name ?? null,
        primary_domain: byWebsite.primary_domain ?? null,
      };
    }
  }
  // 2. exact / close company name match
  if (wantedName) {
    const exact = orgs.find(
      (o) => String(o?.name || "").trim().toLowerCase() === wantedName,
    );
    if (exact?.id) {
      return {
        id: String(exact.id),
        name: exact.name ?? null,
        primary_domain: exact.primary_domain ?? null,
      };
    }
    const includes = orgs.find((o) => {
      const n = String(o?.name || "").trim().toLowerCase();
      return n && (n.includes(wantedName) || wantedName.includes(n));
    });
    if (includes?.id) {
      return {
        id: String(includes.id),
        name: includes.name ?? null,
        primary_domain: includes.primary_domain ?? null,
      };
    }
  }
  // 3. first hit
  const first = orgs[0];
  if (first?.id) {
    return {
      id: String(first.id),
      name: first.name ?? null,
      primary_domain: first.primary_domain ?? null,
    };
  }
  return null;
}

async function resolveOrgByDomain(
  domain: string,
): Promise<{ org: OrgMatch | null; status: number }> {
  const r = await apolloPost(APOLLO_ORG_URL, {
    q_organization_domains_list: [domain],
    page: 1,
    per_page: 5,
  });
  if (!r.ok) return { org: null, status: r.status };
  const orgs: any[] = Array.isArray(r.data?.organizations)
    ? r.data.organizations
    : Array.isArray(r.data?.accounts)
      ? r.data.accounts
      : [];
  return { org: pickBestOrg(orgs, domain, null), status: r.status };
}

async function resolveOrgByNameLocation(
  companyName: string,
  organizationLocations: string[],
): Promise<{ org: OrgMatch | null; status: number }> {
  const body: Record<string, unknown> = {
    q_organization_name: companyName,
    page: 1,
    per_page: 5,
  };
  if (organizationLocations.length) {
    body.organization_locations = organizationLocations;
  }
  const r = await apolloPost(APOLLO_ORG_URL, body);
  if (!r.ok) return { org: null, status: r.status };
  const orgs: any[] = Array.isArray(r.data?.organizations)
    ? r.data.organizations
    : Array.isArray(r.data?.accounts)
      ? r.data.accounts
      : [];
  return { org: pickBestOrg(orgs, null, companyName), status: r.status };
}

function matchesEmployer(
  contact: NormalizedContact,
  apolloOrgId: string | null,
  expectedDomain: string | null,
  expectedName: string | null,
): boolean {
  const raw: any = contact.raw_payload;
  const org = raw?.organization || {};
  if (apolloOrgId) {
    const orgId = String(org?.id || raw?.organization_id || "").trim();
    if (orgId && orgId === apolloOrgId) return true;
    // Continue checking other signals — Apollo sometimes returns
    // people whose nested organization differs from the search org_id.
  }
  if (expectedDomain) {
    const orgDomain = normalizeDomain(
      org?.primary_domain || org?.website_url || contact.organization_domain,
    );
    if (orgDomain && orgDomain === expectedDomain) return true;
    // Match same root domain (e.g. oldnavy.gap.com → gap.com)
    if (orgDomain && expectedDomain && orgDomain.endsWith(`.${expectedDomain}`)) {
      return true;
    }
  }
  if (expectedName) {
    const wanted = expectedName.trim().toLowerCase();
    const got = String(org?.name || contact.organization_name || "")
      .trim()
      .toLowerCase();
    if (wanted && got && (got === wanted || got.includes(wanted) || wanted.includes(got))) {
      return true;
    }
  }
  return false;
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
        JSON.stringify({ ok: false, error: "Contact search is not configured.", code: "APOLLO_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: ApolloSearchRequest = await req.json().catch(() => ({}));

    let domain = normalizeDomain(body.domain ?? null);
    let companyName: string | null = body.company_name?.trim() || null;
    let resolvedCompanyId: string | null = body.company_id || null;

    // Hydrate company row when only company_id provided.
    if (body.company_id && (!domain || !companyName)) {
      const { data: company } = await supabase
        .from("lit_companies")
        .select("id, name, domain, website")
        .eq("id", body.company_id)
        .maybeSingle();
      if (company) {
        resolvedCompanyId = company.id;
        domain = domain || normalizeDomain(company.domain || company.website);
        companyName = companyName || company.name || null;
      }
    }

    const city = (body.city || "").trim() || null;
    const state = (body.state || "").trim() || null;
    const country = (body.country || "").trim() || null;
    const usePersonLocations = body.use_person_locations === true;

    // Build location arrays for both org-search and people-search.
    const orgLocations = buildLocationStrings(city, state, country, body.locations || null);

    // Refuse with a clear message when we have no hooks at all.
    if (!domain && !companyName) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "COMPANY_NOT_VERIFIED",
          message:
            "LIT could not confirm this company in the contact database. Try editing company name, website, or location.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve plan + super-admin bypass for per_page cap.
    const bypassLimits = await isSuperAdmin(supabase, user);
    const planCode = bypassLimits ? "enterprise" : await getOrgPlan(supabase, user.id);
    const planCap = bypassLimits
      ? HARD_CAP
      : PLAN_PREVIEW_CAPS[planCode] ?? PLAN_PREVIEW_CAPS.free_trial;
    const requestedPerPage = Math.min(
      HARD_CAP,
      Math.max(1, Number(body.per_page) || 25),
    );
    const perPage = Math.min(planCap, requestedPerPage);

    // ── Stage A: resolve org by domain ────────────────────────────────
    let matchMode: MatchMode = "none";
    let apolloOrg: OrgMatch | null = null;
    if (domain) {
      const r = await resolveOrgByDomain(domain);
      if (r.org) {
        apolloOrg = r.org;
        matchMode = "organization_id";
      }
    }

    // ── Stage B: resolve org by name + location ───────────────────────
    if (!apolloOrg && companyName) {
      const r = await resolveOrgByNameLocation(companyName, orgLocations);
      if (r.org) {
        apolloOrg = r.org;
        matchMode = "name_location_fallback";
      }
    }

    // Prepare common people-search filters.
    const titles = Array.isArray(body.titles) ? body.titles.filter(Boolean) : [];
    const seniorities = Array.isArray(body.seniorities)
      ? body.seniorities.filter(Boolean)
      : [];
    const departments = Array.isArray(body.departments)
      ? body.departments.filter(Boolean)
      : [];
    const emailStatuses = Array.isArray(body.email_statuses)
      ? body.email_statuses.filter(Boolean)
      : [];

    function buildPeopleBody(scopeFields: Record<string, unknown>): Record<string, unknown> {
      const b: Record<string, unknown> = {
        page: Math.max(1, Number(body.page) || 1),
        per_page: perPage,
        // Default false (strict). User can opt into broader matching.
        include_similar_titles: body.include_similar_titles === true,
        ...scopeFields,
      };
      if (titles.length) b.person_titles = titles;
      if (seniorities.length) b.person_seniorities = seniorities;
      if (departments.length) b.person_departments = departments;
      if (emailStatuses.length) b.contact_email_status = emailStatuses;
      // Locations: by default scope by employer HQ. Toggle moves it to
      // where the contact lives.
      if (orgLocations.length) {
        if (usePersonLocations) {
          b.person_locations = orgLocations;
        } else {
          b.organization_locations = orgLocations;
        }
      }
      return b;
    }

    let peopleData: any = null;
    let peopleStatus = 0;

    // ── Stage C/D: people search with org_id, falling back to domain,
    //              then name+location org-resolution if 0 hits ─────────
    if (apolloOrg?.id) {
      const r = await apolloPost(
        APOLLO_PEOPLE_URL,
        buildPeopleBody({ organization_ids: [apolloOrg.id] }),
      );
      peopleData = r.data;
      peopleStatus = r.status;
      if (!r.ok) {
        console.error(JSON.stringify({ fn: "apollo-contact-search", stage: "people_org", apolloStatus: r.status, body: r.raw.slice(0, 200) }));
      }
    }

    // If no org match yet OR org-scoped people-search returned 0, try
    // domain-scoped people-search as a safety net.
    if ((!apolloOrg || !Array.isArray(peopleData?.people) || peopleData.people.length === 0) && domain) {
      const r = await apolloPost(
        APOLLO_PEOPLE_URL,
        buildPeopleBody({ q_organization_domains_list: [domain] }),
      );
      if (r.ok && Array.isArray(r.data?.people) && r.data.people.length > 0) {
        peopleData = r.data;
        peopleStatus = r.status;
        if (!apolloOrg) matchMode = "domain";
      } else if (r.status >= 400 && peopleStatus === 0) {
        peopleStatus = r.status;
      }
    }

    // If still empty AND we have a name, try one more round: re-resolve
    // org via name + location and re-run people-search by org_id.
    if (
      (!Array.isArray(peopleData?.people) || peopleData.people.length === 0) &&
      companyName &&
      !apolloOrg
    ) {
      const r2 = await resolveOrgByNameLocation(companyName, orgLocations);
      if (r2.org) {
        apolloOrg = r2.org;
        matchMode = "name_location_fallback";
        const r = await apolloPost(
          APOLLO_PEOPLE_URL,
          buildPeopleBody({ organization_ids: [r2.org.id] }),
        );
        if (r.ok) {
          peopleData = r.data;
          peopleStatus = r.status;
        }
      }
    }

    if (peopleStatus !== 0 && peopleStatus >= 400 && peopleStatus !== 404) {
      // Apollo upstream error, surface a structured response.
      return new Response(
        JSON.stringify({
          ok: false,
          code: "APOLLO_API_ERROR",
          status: peopleStatus,
          message: `Upstream contact provider error (${peopleStatus}).`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawPeople: Record<string, any>[] = Array.isArray(peopleData?.people)
      ? peopleData.people
      : [];
    let normalized = rawPeople.map(normalizeApolloPerson);

    // Filter to current-employer match. If we resolved an org_id, we
    // require the contact's organization to be that org or a matching
    // domain / name. If we only had a domain, require domain match.
    const expectedDomain = apolloOrg?.primary_domain
      ? normalizeDomain(apolloOrg.primary_domain)
      : domain;
    const expectedName = apolloOrg?.name || companyName;
    const filtered = normalized.filter((c) =>
      matchesEmployer(c, apolloOrg?.id || null, expectedDomain, expectedName),
    );
    // If filtering removed everything but Apollo did return rows, fall
    // back to the raw set so we never silently swallow legitimate hits.
    const contacts = filtered.length > 0 ? filtered : normalized;
    const droppedCount = normalized.length - filtered.length;

    if (contacts.length === 0) {
      // Nothing came back at all — surface a precise empty state with
      // the search mode so the UI can suggest the right tweak.
      return new Response(
        JSON.stringify({
          ok: true,
          provider: "apollo",
          contacts: [],
          count: 0,
          match_mode: matchMode,
          apollo_organization: apolloOrg,
          plan: planCode,
          plan_cap: planCap,
          per_page: perPage,
          message:
            "No matching contacts found for this company and filter set.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("lit_activity_events").insert({
      user_id: user.id,
      event_type: "apollo_contact_search",
      company_id: resolvedCompanyId,
      metadata: {
        provider: "apollo",
        count: contacts.length,
        dropped_unrelated: droppedCount,
        page: Math.max(1, Number(body.page) || 1),
        per_page: perPage,
        plan: planCode,
        plan_cap: planCap,
        bypass_limits: bypassLimits,
        match_mode: matchMode,
        apollo_organization_id: apolloOrg?.id || null,
        apollo_organization_match: apolloOrg,
        filters: {
          domain,
          company_name: companyName,
          city,
          state,
          country,
          titles,
          seniorities,
          departments,
          email_statuses: emailStatuses,
          use_person_locations: usePersonLocations,
        },
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "apollo",
        contacts,
        count: contacts.length,
        match_mode: matchMode,
        apollo_organization: apolloOrg,
        plan: planCode,
        plan_cap: planCap,
        per_page: perPage,
        dropped_unrelated: droppedCount,
        pagination: peopleData?.pagination || null,
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
