// _shared/apollo.ts — DIRECT Apollo REST helpers for autonomous (no-human) paths.
//
// These are thin wrappers around the SAME Apollo endpoints + auth header the
// member-gated apollo-contact-search / apollo-contact-enrich edge functions use.
// They exist so an autonomous cron path (e.g. harvey-prospect) can source and
// reveal contacts WITHOUT a forwardable member JWT — using the service-role
// context + the APOLLO_API_KEY env var directly.
//
// Endpoints + auth header are COPIED verbatim from the existing apollo-* fns
// (do NOT invent):
//   - People search : POST https://api.apollo.io/api/v1/mixed_people/api_search
//   - Org search    : POST https://api.apollo.io/api/v1/mixed_companies/search
//   - People match  : POST https://api.apollo.io/api/v1/people/match
//   - Auth header   : "X-Api-Key": APOLLO_API_KEY
//
// Invariants:
//   - Every helper returns [] / null gracefully on non-200 and NEVER throws.
//   - Locked emails (email_not_unlocked@…) are normalized to null + status
//     "locked" so callers never store a fake address.
//   - Callers are responsible for metering (recordProviderUsage) — these helpers
//     do no ledger writes and hold no Supabase client.

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") || "";

// Endpoint URLs — must match the existing apollo-* functions exactly.
const APOLLO_PEOPLE_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search";
const APOLLO_ORG_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_companies/search";
const APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match";

// Apollo returns locked-email markers with the literal "domain.com" suffix on
// free/older plans, but the real company domain substituted on others — e.g.
// `email_not_unlocked@olddominion.com`. Match the prefix only so we never store
// a fake email. (Same rule as apollo-contact-search / apollo-contact-enrich.)
const APOLLO_LOCKED_EMAIL_PREFIX = "email_not_unlocked@";
function isLockedEmail(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(APOLLO_LOCKED_EMAIL_PREFIX);
}

/** True when the APOLLO_API_KEY env var is present (direct path is possible). */
export function apolloConfigured(): boolean {
  return Boolean(APOLLO_API_KEY);
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

/**
 * Single Apollo POST with the exact header the existing fns use plus a 15s hard
 * timeout (mirrors apollo-contact-enrich, which added the timeout after a hang
 * blew past the edge wall-clock). NEVER throws — returns ok:false on any error.
 */
async function apolloPost(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  if (!APOLLO_API_KEY) return { ok: false, status: 0, data: null };
  const ac = new AbortController();
  const killer = setTimeout(() => ac.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": APOLLO_API_KEY,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (_err) {
    clearTimeout(killer);
    return { ok: false, status: 0, data: null };
  }
  clearTimeout(killer);
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_) {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

// ─── organizations ─────────────────────────────────────────────────────────

export type ApolloOrganization = {
  apollo_organization_id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
};

/**
 * Company discovery via the SAME org endpoint apollo-contact-search uses
 * (mixed_companies/search). Returns [] on any non-200 / error.
 * `keywords` are OR'd into the org keyword-tags filter; `location` (optional)
 * scopes by org HQ.
 */
export async function apolloSearchOrganizations(args: {
  keywords: string[];
  location?: string;
  perPage?: number;
}): Promise<ApolloOrganization[]> {
  const keywords = (args.keywords ?? []).map((k) => String(k ?? "").trim()).filter(Boolean);
  if (keywords.length === 0) return [];
  const perPage = Math.min(50, Math.max(1, Number(args.perPage) || 10));
  const body: Record<string, unknown> = {
    q_organization_keyword_tags: keywords,
    page: 1,
    per_page: perPage,
  };
  const loc = String(args.location ?? "").trim();
  if (loc) body.organization_locations = [loc];

  const r = await apolloPost(APOLLO_ORG_SEARCH_URL, body);
  if (!r.ok) return [];
  const orgs: any[] = Array.isArray(r.data?.organizations)
    ? r.data.organizations
    : Array.isArray(r.data?.accounts)
      ? r.data.accounts
      : [];
  const out: ApolloOrganization[] = [];
  for (const o of orgs) {
    const id = o?.id ? String(o.id) : null;
    if (!id) continue;
    out.push({
      apollo_organization_id: id,
      name: o?.name ?? null,
      domain: normalizeDomain(o?.primary_domain || o?.website_url),
      industry: o?.industry ?? null,
      employee_count: Number.isFinite(Number(o?.estimated_num_employees))
        ? Number(o.estimated_num_employees)
        : Number.isFinite(Number(o?.employee_count))
          ? Number(o.employee_count)
          : null,
    });
  }
  return out;
}

// ─── people search ─────────────────────────────────────────────────────────

export type ApolloPerson = {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  email: string | null; // null when locked/absent
  email_status: string | null; // "locked" when Apollo returned a locked marker
  linkedin_url: string | null;
  apollo_person_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_domain: string | null;
};

function normalizePerson(p: Record<string, any>): ApolloPerson {
  const firstName = p.first_name || null;
  const lastName = p.last_name || null;
  const fullName =
    p.name || [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const org = p.organization || {};
  const apolloId = p.id || p.person_id || null;
  const rawEmail = p.email;
  const locked = isLockedEmail(rawEmail);
  const orgId = org?.id || p.organization_id || null;
  return {
    name: fullName,
    first_name: firstName,
    last_name: lastName,
    title: p.title || null,
    seniority: p.seniority || null,
    email: rawEmail && !locked ? rawEmail : null,
    email_status: locked ? "locked" : (p.email_status || null),
    linkedin_url: p.linkedin_url || null,
    apollo_person_id: apolloId ? String(apolloId) : null,
    organization_id: orgId ? String(orgId) : null,
    organization_name: org?.name || null,
    organization_domain: normalizeDomain(org?.primary_domain || org?.website_url),
  };
}

/**
 * People search via mixed_people/api_search (the migrated path — same as
 * apollo-contact-search). Scope by organizationId (preferred), else domain.
 * Returns [] on any non-200 / error or when no scope is provided.
 */
export async function apolloSearchPeople(args: {
  domain?: string | null;
  organizationId?: string | null;
  companyName?: string | null;
  titles: string[];
  seniorities: string[];
  perPage?: number;
}): Promise<ApolloPerson[]> {
  const perPage = Math.min(50, Math.max(1, Number(args.perPage) || 5));
  const domain = normalizeDomain(args.domain);
  const orgId = args.organizationId ? String(args.organizationId).trim() : "";

  const scope: Record<string, unknown> = {};
  if (orgId) scope.organization_ids = [orgId];
  else if (domain) scope.q_organization_domains_list = [domain];
  else return []; // no reliable scope — refuse rather than blast a broad search

  const body: Record<string, unknown> = {
    page: 1,
    per_page: perPage,
    include_similar_titles: false,
    ...scope,
  };
  const titles = (args.titles ?? []).filter(Boolean);
  const seniorities = (args.seniorities ?? []).filter(Boolean);
  if (titles.length) body.person_titles = titles;
  if (seniorities.length) body.person_seniorities = seniorities;

  const r = await apolloPost(APOLLO_PEOPLE_SEARCH_URL, body);
  if (!r.ok) return [];
  const people: any[] = Array.isArray(r.data?.people) ? r.data.people : [];
  return people.map(normalizePerson);
}

// ─── people enrich (email reveal) ──────────────────────────────────────────

export type ApolloEnrichResult = {
  email: string | null;
  email_status: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  linkedin_url: string | null;
  apollo_person_id: string | null;
  organization_name: string | null;
  organization_domain: string | null;
};

/**
 * Single-person enrichment via people/match (1 credit — reveals email). Mirrors
 * apollo-contact-enrich's singleMatch: reveal_personal_emails=true, phone left
 * OFF (async pipeline). Returns null on any non-200 / no-match / error.
 *
 * Requires a strong identifier (apollo_person_id, linkedin_url, or full name +
 * domain/org) — otherwise returns null WITHOUT calling Apollo, so a credit is
 * never wasted on a match that Apollo would reject.
 */
export async function apolloEnrichPerson(args: {
  first_name?: string | null;
  last_name?: string | null;
  domain?: string | null;
  organization_name?: string | null;
  linkedin_url?: string | null;
  apollo_person_id?: string | null;
}): Promise<ApolloEnrichResult | null> {
  const firstName = args.first_name || null;
  const lastName = args.last_name || null;
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const domain = normalizeDomain(args.domain);
  const orgName = args.organization_name || null;
  const linkedin = args.linkedin_url || null;
  const apolloId = args.apollo_person_id ? String(args.apollo_person_id) : null;

  // Refuse weak identifiers before spending a credit (mirrors
  // apollo-contact-enrich.buildIdentifierBlock hasStrongId).
  const hasStrongId = Boolean(
    apolloId ||
      linkedin ||
      (name && (domain || orgName)) ||
      (firstName && lastName && (domain || orgName)),
  );
  if (!hasStrongId) return null;

  const body: Record<string, unknown> = { reveal_personal_emails: true };
  if (apolloId) body.id = apolloId;
  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (name) body.name = name;
  if (linkedin) body.linkedin_url = linkedin;
  if (domain) body.domain = domain;
  if (orgName) body.organization_name = orgName;

  const r = await apolloPost(APOLLO_MATCH_URL, body);
  if (!r.ok) return null;
  const person = r.data?.person || r.data?.match || null;
  if (!person) return null;

  const org = person.organization || {};
  const rawEmail = person.email;
  const locked = isLockedEmail(rawEmail);
  const pid = person.id || person.person_id || null;
  return {
    email: rawEmail && !locked ? rawEmail : null,
    email_status: locked ? "locked" : (person.email_status || null),
    phone:
      (Array.isArray(person.phone_numbers) && person.phone_numbers[0]?.sanitized_number) ||
      person.phone || null,
    first_name: person.first_name || firstName,
    last_name: person.last_name || lastName,
    name:
      person.name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
      name,
    title: person.title || null,
    linkedin_url: person.linkedin_url || linkedin,
    apollo_person_id: pid ? String(pid) : apolloId,
    organization_name: org?.name || orgName,
    organization_domain: normalizeDomain(org?.primary_domain || org?.website_url) || domain,
  };
}
