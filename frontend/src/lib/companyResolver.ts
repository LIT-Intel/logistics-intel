/**
 * Phase 1 — CompanyResolver
 *
 * One function. Five matching strategies, in priority order:
 *   1. UUID                       → lit_companies.id
 *   2. company_key / slug         → lit_companies.source_company_key
 *                                   ∪ lit_company_directory.company_key
 *   3. canonical domain           → lit_companies.domain
 *                                   ∪ lit_company_directory.canonical_domain
 *   4. normalized name + city + state → lit_companies / lit_company_directory
 *   5. normalized name + country  → lit_companies / lit_company_directory
 *
 * Saved/CRM identity wins. ImportYeti / directory / source-metrics enrich.
 *
 * Pure-TS module; works in browser (RLS-aware via the user-scoped client)
 * AND in a Deno edge function (with the service-role client). Pass the
 * Supabase client in via `client` so this stays env-agnostic.
 */

import type {
  CompanyDisplay,
  CompanyEntity,
  CompanySources,
  ResolvedVia,
  ResolveCompanyError,
} from "./companyProfile.types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolveInput = {
  /** UUID, slug, "company/{slug}", domain, or "name@city,state". */
  id?: string | null;
  /** Optional explicit hints for matching strategies 3-5. */
  hints?: {
    domain?: string | null;
    name?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
};

export type ResolverClient = {
  from: (table: string) => any;
};

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value.trim());
}

export function normalizeCompanyKey(raw: string): string {
  const stripped = raw.replace(/^company\//i, "").trim();
  return stripped
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|ag|nv|bv|sas|sarl|plc)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

const EMPTY_DISPLAY: CompanyDisplay = {
  name: "",
  domain: null,
  website: null,
  phone: null,
  address: {
    line1: null,
    city: null,
    state: null,
    country: null,
    country_code: null,
    postal_code: null,
  },
  industry: null,
  headcount: null,
  revenue: null,
  logo_url: null,
};

const EMPTY_SOURCES: CompanySources = {
  saved: { present: false },
  importyeti: { present: false },
  directory: { present: false },
  metrics: {
    shipments_12m: null,
    teu_12m: null,
    fcl_shipments_12m: null,
    lcl_shipments_12m: null,
    est_spend_12m: null,
    last_shipment: null,
    top_route: null,
    primary_mode: null,
  },
  contacts: { count: 0, saved_count: 0 },
};

function pickFirst<T>(...candidates: Array<T | null | undefined>): T | null {
  for (const c of candidates) {
    if (c !== null && c !== undefined && c !== "") return c;
  }
  return null;
}

function parseCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const candidates = new Set<string>();
  candidates.add(trimmed);
  if (trimmed.startsWith("company/")) {
    candidates.add(trimmed.replace(/^company\//, ""));
  } else {
    candidates.add(`company/${trimmed}`);
  }
  const normalized = normalizeCompanyKey(trimmed);
  if (normalized) {
    candidates.add(normalized);
    candidates.add(`company/${normalized}`);
  }
  return Array.from(candidates);
}

async function tryUuid(client: ResolverClient, value: string) {
  const { data, error } = await client
    .from("lit_companies")
    .select("*")
    .eq("id", value)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

async function tryCompanyKey(client: ResolverClient, raw: string) {
  const candidates = parseCandidates(raw);
  if (!candidates.length) return null;

  const { data: companies } = await client
    .from("lit_companies")
    .select("*")
    .in("source_company_key", candidates)
    .limit(1);

  if (companies && companies.length > 0) {
    return { type: "saved" as const, row: companies[0] };
  }

  const { data: directory } = await client
    .from("lit_company_directory")
    .select("*")
    .in("company_key", candidates)
    .limit(1);

  if (directory && directory.length > 0) {
    return { type: "directory" as const, row: directory[0] };
  }

  return null;
}

async function tryDomain(client: ResolverClient, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  const { data: companies } = await client
    .from("lit_companies")
    .select("*")
    .eq("domain", domain)
    .limit(1);
  if (companies && companies.length > 0) {
    return { type: "saved" as const, row: companies[0] };
  }

  const { data: directory } = await client
    .from("lit_company_directory")
    .select("*")
    .or(`canonical_domain.eq.${domain},domain.eq.${domain}`)
    .limit(1);
  if (directory && directory.length > 0) {
    return { type: "directory" as const, row: directory[0] };
  }

  return null;
}

async function tryNameLocation(
  client: ResolverClient,
  name: string,
  city: string | null,
  state: string | null,
  country: string | null,
) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  let savedQuery = client
    .from("lit_companies")
    .select("*")
    .ilike("normalized_name", `%${normalized}%`);
  if (city) savedQuery = savedQuery.ilike("city", city);
  if (state) savedQuery = savedQuery.ilike("state", state);
  if (country) savedQuery = savedQuery.ilike("country_code", country);
  const { data: companies } = await savedQuery.limit(1);
  if (companies && companies.length > 0) {
    return { type: "saved" as const, row: companies[0], via: city && state ? "name_city_state" : "name_country" };
  }

  let dirQuery = client
    .from("lit_company_directory")
    .select("*")
    .ilike("normalized_name", `%${normalized}%`);
  if (city) dirQuery = dirQuery.ilike("city", city);
  if (state) dirQuery = dirQuery.ilike("state", state);
  if (country) dirQuery = dirQuery.ilike("country", country);
  const { data: directory } = await dirQuery.limit(1);
  if (directory && directory.length > 0) {
    return { type: "directory" as const, row: directory[0], via: city && state ? "name_city_state" : "name_country" };
  }

  return null;
}

function mergeFromCompanyRow(row: any): { display: CompanyDisplay; metrics: CompanySources["metrics"] } {
  return {
    display: {
      name: row?.name ?? "",
      domain: row?.domain ?? null,
      website: row?.website ?? null,
      phone: row?.phone ?? null,
      address: {
        line1: row?.address_line1 ?? null,
        city: row?.city ?? null,
        state: row?.state ?? null,
        country: null,
        country_code: row?.country_code ?? null,
        postal_code: row?.postal_code ?? null,
      },
      industry: row?.industry ?? null,
      headcount: row?.headcount ?? null,
      revenue: row?.revenue ?? null,
      logo_url: row?.logo_url ?? null,
    },
    metrics: {
      shipments_12m: row?.shipments_12m ?? null,
      teu_12m: row?.teu_12m ?? null,
      fcl_shipments_12m: row?.fcl_shipments_12m ?? null,
      lcl_shipments_12m: row?.lcl_shipments_12m ?? null,
      est_spend_12m: row?.est_spend_12m ?? null,
      last_shipment: row?.most_recent_shipment_date ?? null,
      top_route: row?.top_route_12m ?? row?.recent_route ?? null,
      primary_mode: row?.primary_mode ?? null,
    },
  };
}

function mergeFromDirectoryRow(row: any): { display: CompanyDisplay; directory: CompanySources["directory"] } {
  return {
    display: {
      name: row?.canonical_name ?? row?.company_name ?? "",
      domain: row?.canonical_domain ?? row?.domain ?? null,
      website: row?.website ?? null,
      phone: row?.phone ?? null,
      address: {
        line1: row?.address_line1 ?? null,
        city: row?.city ?? null,
        state: row?.state ?? null,
        country: row?.country ?? null,
        country_code: null,
        postal_code: row?.postal_code ?? null,
      },
      industry: row?.industry ?? null,
      headcount: row?.employee_count ?? null,
      revenue: row?.revenue ?? null,
      logo_url: null,
    },
    directory: {
      present: true,
      source: row?.source ?? null,
      enrichment_status: row?.enrichment_status ?? null,
      enriched_at: row?.enriched_at ?? null,
    },
  };
}

function mergeDisplay(primary: CompanyDisplay, fallback: CompanyDisplay): CompanyDisplay {
  return {
    name: primary.name || fallback.name,
    domain: pickFirst(primary.domain, fallback.domain),
    website: pickFirst(primary.website, fallback.website),
    phone: pickFirst(primary.phone, fallback.phone),
    address: {
      line1: pickFirst(primary.address.line1, fallback.address.line1),
      city: pickFirst(primary.address.city, fallback.address.city),
      state: pickFirst(primary.address.state, fallback.address.state),
      country: pickFirst(primary.address.country, fallback.address.country),
      country_code: pickFirst(primary.address.country_code, fallback.address.country_code),
      postal_code: pickFirst(primary.address.postal_code, fallback.address.postal_code),
    },
    industry: pickFirst(primary.industry, fallback.industry),
    headcount: pickFirst(primary.headcount, fallback.headcount),
    revenue: pickFirst(primary.revenue, fallback.revenue),
    logo_url: pickFirst(primary.logo_url, fallback.logo_url),
  };
}

export async function resolveCompany(
  client: ResolverClient,
  input: ResolveInput,
): Promise<{ ok: true; entity: CompanyEntity } | { ok: false; error: ResolveCompanyError }> {
  const raw = (input.id ?? "").trim();
  if (!raw && !input.hints?.domain && !input.hints?.name) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Empty company identifier and no hints provided." } };
  }

  let savedRow: any = null;
  let directoryRow: any = null;
  let resolvedVia: ResolvedVia = "company_key";

  if (raw && isUuid(raw)) {
    const row = await tryUuid(client, raw);
    if (row) {
      savedRow = row;
      resolvedVia = "uuid";
    }
  }

  if (!savedRow && raw) {
    const result = await tryCompanyKey(client, raw);
    if (result?.type === "saved") {
      savedRow = result.row;
      resolvedVia = "company_key";
    } else if (result?.type === "directory") {
      directoryRow = result.row;
      resolvedVia = "directory_id";
    }
  }

  const domainCandidate = input.hints?.domain ?? (raw && raw.includes(".") && !raw.includes("/") ? raw : null);
  if (!savedRow && !directoryRow && domainCandidate) {
    const result = await tryDomain(client, domainCandidate);
    if (result?.type === "saved") {
      savedRow = result.row;
      resolvedVia = "canonical_domain";
    } else if (result?.type === "directory") {
      directoryRow = result.row;
      resolvedVia = "canonical_domain";
    }
  }

  if (!savedRow && !directoryRow && input.hints?.name) {
    const result = await tryNameLocation(
      client,
      input.hints.name,
      input.hints.city ?? null,
      input.hints.state ?? null,
      input.hints.country ?? null,
    );
    if (result?.type === "saved") {
      savedRow = result.row;
      resolvedVia = result.via as ResolvedVia;
    } else if (result?.type === "directory") {
      directoryRow = result.row;
      resolvedVia = result.via as ResolvedVia;
    }
  }

  if (!savedRow && !directoryRow) {
    return {
      ok: false,
      error: {
        code: "COMPANY_NOT_FOUND",
        message: `Could not resolve company from input "${raw}".`,
        hint: "Tried UUID, company_key, canonical_domain, name+city+state, and name+country.",
      },
    };
  }

  let display = { ...EMPTY_DISPLAY };
  const sources: CompanySources = {
    saved: { present: false },
    importyeti: { present: false },
    directory: { present: false },
    metrics: { ...EMPTY_SOURCES.metrics },
    contacts: { count: 0, saved_count: 0 },
  };

  let canonicalId: string | null = null;
  let canonicalKey: string | null = null;

  if (savedRow) {
    const merged = mergeFromCompanyRow(savedRow);
    display = mergeDisplay(merged.display, display);
    sources.metrics = merged.metrics;
    canonicalId = savedRow.id ?? null;
    canonicalKey = savedRow.source_company_key ?? null;
  }

  if (directoryRow) {
    const merged = mergeFromDirectoryRow(directoryRow);
    display = mergeDisplay(display, merged.display);
    sources.directory = merged.directory;
    if (!canonicalKey) canonicalKey = directoryRow.company_key ?? null;
    if (!canonicalId) canonicalId = directoryRow.id ?? null;
  }

  return {
    ok: true,
    entity: {
      id: canonicalId,
      key: canonicalKey,
      display,
      sources,
      resolved_via: resolvedVia,
    },
  };
}
