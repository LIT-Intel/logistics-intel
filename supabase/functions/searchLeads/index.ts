const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, apikey',
};

const APOLLO_API_BASE_DEFAULT = 'https://api.apollo.io';
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;
const ALLOWED_UI_MODES = ['auto', 'companies', 'people'];
const RESULT_MODES = ['companies', 'people', 'hybrid_people_over_company'];
// Page size doubled from 25 → 50 per product call. Pulse is the
// freight-broker / freight-forwarder lead-gen surface; users want a
// fuller initial result set per request. Anything past the first page
// flows through `page=2`, `page=3`, … via the existing pagination metadata.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const PROVIDER_NAME = 'apollo';
const APOLLO_LOCKED_EMAIL_MARKER = 'email_not_unlocked@';

interface ParsedLocation {
  name: string;
  code?: string;
  kind: 'country' | 'us_state' | 'metro';
}

interface ParsedEntities {
  intent?: string;
  direction?: string | null;
  quantity?: number | null;
  products?: string[];
  industries?: string[];
  roles?: string[];
  origins?: ParsedLocation[];
  destinations?: ParsedLocation[];
  countries?: ParsedLocation[];
  states?: ParsedLocation[];
  metros?: ParsedLocation[];
  similarTo?: string | null;
}

interface SearchRequest {
  query?: string;
  ui_mode?: string;
  page?: number;
  pageSize?: number;
  // Optional: classifier output from Pulse Coach (heuristic + LLM merged
  // on the client). When present we map it to Apollo's structured
  // filter params instead of relying on weak keyword matching alone.
  entities?: ParsedEntities;
}

interface EnrichRequest {
  action: string;
  prospect_id?: string;
}

interface SearchMeta {
  total: number;
  page: number;
  pageSize: number;
  requestedLimit: number | null;
  estimatedMarketSize: number | null;
  provider: string;
  partial: boolean;
  warnings: string[];
  classificationReasons: string[];
  matchedCompanyName: string | null;
}

interface SearchResponse {
  ok: boolean;
  mode?: string;
  query?: string;
  meta?: SearchMeta;
  data?: { results: unknown[] };
  error?: string;
}

interface EnrichResponse {
  ok: boolean;
  data?: {
    contact: {
      email?: string;
      phone?: string;
      linkedin_url?: string;
    };
  };
  error?: string;
}

interface ProviderConfig {
  apiKey: string;
  apiBase: string;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function getProviderConfig(): { config: ProviderConfig | null; error: string | null } {
  const apiKey = Deno.env.get('APOLLO_API_KEY');
  if (!apiKey) {
    return { config: null, error: 'APOLLO_API_KEY not configured' };
  }
  const apiBase = (Deno.env.get('APOLLO_API_BASE') || APOLLO_API_BASE_DEFAULT).replace(/\/$/, '');
  return { config: { apiKey, apiBase }, error: null };
}

function clampPageSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  const rounded = Math.floor(value);
  if (rounded < 1) return DEFAULT_PAGE_SIZE;
  if (rounded > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return rounded;
}

function clampPage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const rounded = Math.floor(value);
  return rounded < 1 ? 1 : rounded;
}

function validateSearchInput(body: SearchRequest): { valid: boolean; error: string | null } {
  const query = body?.query;
  const ui_mode = body?.ui_mode || 'auto';

  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'query is required and must be a string' };
  }
  if (query.trim().length < MIN_QUERY_LENGTH) {
    return { valid: false, error: `query must be at least ${MIN_QUERY_LENGTH} characters` };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: `query must not exceed ${MAX_QUERY_LENGTH} characters` };
  }
  if (!ALLOWED_UI_MODES.includes(ui_mode)) {
    return { valid: false, error: `ui_mode must be one of: ${ALLOWED_UI_MODES.join(', ')}` };
  }
  return { valid: true, error: null };
}

function validateEnrichInput(body: EnrichRequest): { valid: boolean; error: string | null } {
  const prospectId = body?.prospect_id;
  if (!prospectId || typeof prospectId !== 'string') {
    return { valid: false, error: 'prospect_id is required and must be a string' };
  }
  return { valid: true, error: null };
}

type ApolloCallResult = {
  data: Record<string, unknown> | null;
  error: string | null;
  status: number | null;
};

async function callApolloEndpoint(
  config: ProviderConfig,
  endpoint: string,
  body: Record<string, unknown>,
  requestId: string,
): Promise<ApolloCallResult> {
  const url = `${config.apiBase}${endpoint}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(body),
    });

    const status = response.status;
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[${requestId}] Apollo ${endpoint} ${status}:`,
        text.slice(0, 500),
      );
      return {
        data: null,
        error: `Apollo ${endpoint} returned ${status}`,
        status,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { data, error: null, status };
  } catch (err) {
    console.error(`[${requestId}] Apollo ${endpoint} network error:`, err);
    return {
      data: null,
      error: `Failed to call Apollo ${endpoint}: ${String(err)}`,
      status: null,
    };
  }
}

function callApolloMixedCompanies(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/mixed_companies/search',
    { ...body, page, per_page: pageSize },
    requestId,
  );
}

function callApolloAccounts(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/accounts/search',
    { ...body, page, per_page: pageSize },
    requestId,
  );
}

function callApolloMixedPeople(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    // Apollo deprecated `/mixed_people/search` for API-key callers in
    // favor of `/mixed_people/api_search` (same shape).
    '/api/v1/mixed_people/api_search',
    { ...body, page, per_page: pageSize },
    requestId,
  );
}

function callApolloContacts(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/contacts/search',
    { ...body, page, per_page: pageSize },
    requestId,
  );
}

/* ─── Entity → Apollo filter mappers ─────────────────────────────── */

function locationStringFor(loc: ParsedLocation): string {
  if (loc.kind === 'us_state') return `${loc.name}, US`;
  return loc.name;
}

function buildLocationsArray(entities: ParsedEntities): string[] {
  const out: string[] = [];
  // Destinations are where the target COMPANY lives. Use them first.
  for (const d of entities.destinations || []) out.push(locationStringFor(d));
  if (out.length) return out;
  // Fall back to standalone state/metro hits (also represent company HQ).
  for (const s of entities.states || []) out.push(`${s.name}, US`);
  for (const m of entities.metros || []) out.push(m.name);
  if (out.length) return out;
  // Standalone countries are ONLY safe when no origins were parsed
  // (otherwise they'd be sourcing geography, not company HQ).
  if (!(entities.origins || []).length) {
    for (const c of entities.countries || []) out.push(c.name);
  }
  return out;
}

// Freight-industry vocabulary the deterministic parser misses. Pulse is
// the freight-broker / freight-forwarder lead-gen surface, so when the
// raw query mentions any of these, inject the right Apollo keyword tags
// AND keep the verbatim phrase in q_keywords so name/website matches
// (e.g. "ABC Freight Brokerage") still surface even when categorization
// is patchy.
const FREIGHT_INDUSTRY_DETECTORS: Array<{
  rx: RegExp;
  tags: string[];
}> = [
  {
    rx: /\b(freight\s+brokers?|truck\s+brokers?|load\s+brokers?)\b/i,
    tags: ['logistics', 'transportation', 'freight'],
  },
  {
    rx: /\b(freight\s+forwarders?|forwarders?|nvocc|ocean\s+forwarder|air\s+forwarder)\b/i,
    tags: ['freight forwarder', 'logistics', 'transportation'],
  },
  {
    rx: /\b(3pl|third[\s-]?party\s+logistics|fourth[\s-]?party\s+logistics|4pl)\b/i,
    tags: ['third-party logistics', 'logistics', 'supply chain'],
  },
  {
    rx: /\b(customs\s+brokers?|customs\s+brokerage|customs\s+clearance|licensed\s+broker)\b/i,
    tags: ['customs brokerage', 'customs', 'trade compliance'],
  },
  {
    rx: /\b(drayage|cartage|port\s+drayage|container\s+trucking)\b/i,
    tags: ['drayage', 'trucking', 'logistics'],
  },
  {
    rx: /\b(warehouse|warehousing|3pl\s+warehouse|distribution\s+center|fulfillment)\b/i,
    tags: ['warehousing', 'logistics', 'distribution'],
  },
  {
    rx: /\b(logistics\s+provider|logistics\s+companies|supply\s+chain\s+companies|supply\s+chain\s+management)\b/i,
    tags: ['logistics', 'supply chain'],
  },
  {
    rx: /\b(shipper|shippers|importers?|exporters?)\b/i,
    tags: ['logistics', 'supply chain', 'trade'],
  },
];

function detectFreightIndustryTags(rawQuery: string): string[] {
  if (!rawQuery) return [];
  const tags = new Set<string>();
  for (const { rx, tags: t } of FREIGHT_INDUSTRY_DETECTORS) {
    if (rx.test(rawQuery)) {
      for (const tag of t) tags.add(tag);
    }
  }
  return Array.from(tags);
}

function buildApolloCompaniesBody(
  query: string,
  entities: ParsedEntities | undefined,
): Record<string, unknown> {
  // Lookalike intent → Apollo can search by company name fragment.
  if (entities?.similarTo) {
    return { q_organization_name: entities.similarTo };
  }

  const body: Record<string, unknown> = {};

  const locations = entities ? buildLocationsArray(entities) : [];
  if (locations.length) body.organization_locations = locations;

  // Merge structured industries (from classifier) with freight-vocabulary
  // tags detected directly from the raw prompt. This is what makes
  // "freight brokers in Atlanta Georgia" actually filter to brokers
  // instead of every Atlanta company.
  const freightTags = detectFreightIndustryTags(query);
  const industryTags = Array.isArray(entities?.industries) ? entities!.industries : [];
  const allTags = Array.from(new Set([...industryTags, ...freightTags]));
  if (allTags.length) {
    body.q_organization_keyword_tags = allTags;
  }

  // Products go into q_keywords (Apollo has no product taxonomy). When
  // the user query already has freight-vocabulary terms, ALSO pass the
  // raw query through as q_keywords so company names containing
  // "freight" / "brokerage" / "forwarder" still match by text. Apollo
  // ANDs structured filters with the keyword text — so a richer keyword
  // signal narrows results, it doesn't broaden them.
  const productKw = (entities?.products || []).join(' ').trim();
  const includeRawAsKeywords = freightTags.length > 0 && !productKw;
  if (productKw) {
    body.q_keywords = productKw;
  } else if (includeRawAsKeywords) {
    body.q_keywords = query;
  } else if (!locations.length && !body.q_organization_keyword_tags) {
    // No structured filter at all — keep the keyword fallback so we
    // don't hand Apollo an empty search.
    body.q_keywords = query;
  }

  return body;
}

const ROLE_TO_SENIORITY: Array<{ rx: RegExp; seniority: string }> = [
  { rx: /\b(c[\s_-]?suite|chief|cxo|ce[o]\b|cf[o]\b|ct[o]\b|co[o]\b|cm[o]\b|cio\b|cro\b)\b/i, seniority: 'c_suite' },
  { rx: /\bfounder\b/i, seniority: 'founder' },
  { rx: /\bowner\b/i, seniority: 'owner' },
  { rx: /\bpartner\b/i, seniority: 'partner' },
  { rx: /\bvp\b/i, seniority: 'vp' },
  { rx: /\bhead( of)?\b/i, seniority: 'head' },
  { rx: /\bdirector\b/i, seniority: 'director' },
  { rx: /\bmanager\b/i, seniority: 'manager' },
];

function rolesToSeniorities(roles: string[]): string[] {
  const set = new Set<string>();
  for (const role of roles) {
    for (const { rx, seniority } of ROLE_TO_SENIORITY) {
      if (rx.test(role)) set.add(seniority);
    }
  }
  return Array.from(set);
}

function buildApolloPeopleBody(
  query: string,
  entities: ParsedEntities | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const locations = entities ? buildLocationsArray(entities) : [];
  if (locations.length) body.organization_locations = locations;

  // Same freight-vocabulary detection as the company body so people
  // queries like "supply chain managers at freight brokers in Atlanta"
  // narrow to broker employees, not every Atlanta supply-chain manager.
  const freightTags = detectFreightIndustryTags(query);
  const industryTags = Array.isArray(entities?.industries) ? entities!.industries : [];
  const allTags = Array.from(new Set([...industryTags, ...freightTags]));
  if (allTags.length) {
    body.q_organization_keyword_tags = allTags;
  }

  if (Array.isArray(entities?.roles) && entities!.roles.length) {
    body.person_titles = entities!.roles;
    const seniorities = rolesToSeniorities(entities!.roles);
    if (seniorities.length) body.person_seniorities = seniorities;
  }

  const productKw = (entities?.products || []).join(' ').trim();
  if (productKw) {
    body.q_keywords = productKw;
  } else if (
    !locations.length &&
    !body.person_titles &&
    !body.q_organization_keyword_tags
  ) {
    body.q_keywords = query;
  }

  return body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unlockedEmail(value: unknown): string | null {
  const email = asString(value);
  if (!email) return null;
  if (email.startsWith(APOLLO_LOCKED_EMAIL_MARKER)) return null;
  return email;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && v.trim()) {
      out.push(v.trim());
    } else if (v && typeof v === 'object') {
      const name = asString((v as Record<string, unknown>).name)
        || asString((v as Record<string, unknown>).uid);
      if (name) out.push(name);
    }
  }
  // Dedupe while preserving order
  return Array.from(new Set(out));
}

function mapApolloCompany(orgRaw: unknown): Record<string, unknown> {
  const org = asRecord(orgRaw) || {};
  // Apollo returns tech detection on either `technology_names`
  // (string[]) or `technologies` (array of {name, uid, ...}). We
  // surface a deduped string array so the UI can render brand icons.
  const techStack = asStringArray(org.technology_names || org.technologies);
  return {
    id: asString(org.id),
    business_id: asString(org.id),
    name: asString(org.name),
    domain:
      asString(org.primary_domain) ||
      asString(org.domain) ||
      asString(org.website_url),
    website: asString(org.website_url),
    linkedin_url: asString(org.linkedin_url),
    phone: asString(org.phone) || asString(org.sanitized_phone),
    city: asString(org.city),
    state: asString(org.state),
    country: asString(org.country),
    industry: asString(org.industry),
    employee_count: asNumber(org.estimated_num_employees),
    annual_revenue: asNumber(org.annual_revenue),
    summary: asString(org.short_description),
    keywords: asStringArray(org.keywords),
    tech_stack: techStack,
    founded_year: asNumber(org.founded_year),
    status: 'Prospect',
    contacts_count: 0,
    contacts: [],
  };
}

function mapApolloPerson(personRaw: unknown): Record<string, unknown> {
  const person = asRecord(personRaw) || {};
  const orgRaw = person.organization ?? person.account;
  const org = asRecord(orgRaw) || {};
  const departments = Array.isArray(person.departments)
    ? (person.departments.filter((d) => typeof d === 'string') as string[])
    : [];

  return {
    id: asString(person.id),
    prospect_id: asString(person.id),
    full_name: asString(person.name),
    title: asString(person.title) || asString(person.headline),
    department: departments[0] || null,
    seniority: asString(person.seniority),
    email: unlockedEmail(person.email),
    phone: asString(person.phone_number) || asString(person.phone),
    linkedin_url: asString(person.linkedin_url),
    company: {
      id: asString(org.id),
      business_id: asString(org.id),
      name: asString(org.name),
      domain:
        asString(org.primary_domain) ||
        asString(org.domain) ||
        asString(org.website_url),
      website: asString(org.website_url),
      city: asString(org.city) || asString(person.city),
      state: asString(org.state) || asString(person.state),
      country: asString(org.country) || asString(person.country),
      industry: asString(org.industry),
      employee_count: asNumber(org.estimated_num_employees),
      annual_revenue: asNumber(org.annual_revenue),
      status: 'Prospect',
    },
  };
}

function readPagination(upstream: Record<string, unknown>): {
  page: number;
  pageSize: number;
  totalEntries: number;
} {
  const pagination = asRecord(upstream.pagination) || {};
  const page = asNumber(pagination.page) ?? 1;
  const pageSize = asNumber(pagination.per_page) ?? DEFAULT_PAGE_SIZE;
  const totalEntries = asNumber(pagination.total_entries) ?? 0;
  return { page, pageSize, totalEntries };
}

function resolveSearchMode(uiMode: string): 'companies' | 'people' {
  if (uiMode === 'people') return 'people';
  return 'companies';
}

function buildEmptySearchResponse(
  query: string,
  mode: string,
  warnings: string[],
): SearchResponse {
  return {
    ok: true,
    mode,
    query,
    meta: {
      total: 0,
      page: 1,
      pageSize: 0,
      requestedLimit: null,
      estimatedMarketSize: 0,
      provider: PROVIDER_NAME,
      partial: false,
      warnings,
      classificationReasons: [],
      matchedCompanyName: null,
    },
    data: { results: [] },
  };
}

function buildSearchResponse(
  query: string,
  mode: string,
  results: unknown[],
  meta: SearchMeta,
): SearchResponse {
  const safeMode = RESULT_MODES.includes(mode) ? mode : 'companies';
  return {
    ok: true,
    mode: safeMode,
    query,
    meta: { ...meta, provider: PROVIDER_NAME },
    data: { results },
  };
}

type ResolvedSearch = {
  upstream: Record<string, unknown>;
  items: unknown[];
  endpointUsed: string;
  fallbackUsed: boolean;
};

async function searchCompaniesWithFallback(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
  warnings: string[],
  skipMixed: boolean,
): Promise<{ resolved?: ResolvedSearch; error?: string }> {
  const tryAccountsFallback = async (): Promise<{ resolved?: ResolvedSearch; error?: string }> => {
    const fb = await callApolloAccounts(config, body, page, pageSize, requestId);
    if (fb.error) {
      if (fb.status === 403) {
        return {
          error:
            'Provider permission issue: Apollo /api/v1/mixed_companies/search and /api/v1/accounts/search both returned 403. Apollo endpoint forbidden — check API key scopes/plan.',
        };
      }
      return { error: fb.error };
    }
    warnings.push(
      'Using Apollo CRM /api/v1/accounts/search fallback. Full Apollo prospect database requires mixed_companies/search access on the API key.',
    );
    const data = fb.data || {};
    const accts = Array.isArray(data.accounts) ? data.accounts : [];
    return {
      resolved: {
        upstream: data,
        items: accts,
        endpointUsed: '/api/v1/accounts/search',
        fallbackUsed: true,
      },
    };
  };

  if (skipMixed) {
    return tryAccountsFallback();
  }

  const primary = await callApolloMixedCompanies(config, body, page, pageSize, requestId);
  if (!primary.error) {
    const data = primary.data || {};
    const orgs = Array.isArray(data.organizations) ? data.organizations : [];
    return {
      resolved: {
        upstream: data,
        items: orgs,
        endpointUsed: '/api/v1/mixed_companies/search',
        fallbackUsed: false,
      },
    };
  }

  if (primary.status === 403) {
    warnings.push(
      'Apollo /api/v1/mixed_companies/search returned 403 (forbidden). Falling back to /api/v1/accounts/search (Apollo CRM only).',
    );
    return tryAccountsFallback();
  }

  return { error: primary.error };
}

async function searchPeopleWithFallback(
  config: ProviderConfig,
  body: Record<string, unknown>,
  page: number,
  pageSize: number,
  requestId: string,
  warnings: string[],
  skipMixed: boolean,
): Promise<{ resolved?: ResolvedSearch; error?: string }> {
  const tryContactsFallback = async (): Promise<{ resolved?: ResolvedSearch; error?: string }> => {
    const fb = await callApolloContacts(config, body, page, pageSize, requestId);
    if (fb.error) {
      if (fb.status === 403) {
        return {
          error:
            'Provider permission issue: Apollo /api/v1/mixed_people/api_search and /api/v1/contacts/search both returned 403. Apollo endpoint forbidden — check API key scopes/plan.',
        };
      }
      return { error: fb.error };
    }
    warnings.push(
      'Using Apollo CRM /api/v1/contacts/search fallback. Full Apollo prospect database requires mixed_people/search access on the API key.',
    );
    const data = fb.data || {};
    const contacts = Array.isArray(data.contacts) ? data.contacts : [];
    return {
      resolved: {
        upstream: data,
        items: contacts,
        endpointUsed: '/api/v1/contacts/search',
        fallbackUsed: true,
      },
    };
  };

  if (skipMixed) {
    return tryContactsFallback();
  }

  const primary = await callApolloMixedPeople(config, body, page, pageSize, requestId);
  if (!primary.error) {
    const data = primary.data || {};
    const people = Array.isArray(data.people) ? data.people : [];
    return {
      resolved: {
        upstream: data,
        items: people,
        endpointUsed: '/api/v1/mixed_people/api_search',
        fallbackUsed: false,
      },
    };
  }

  if (primary.status === 403) {
    warnings.push(
      'Apollo /api/v1/mixed_people/api_search returned 403 (forbidden). Falling back to /api/v1/contacts/search (Apollo CRM only).',
    );
    return tryContactsFallback();
  }

  return { error: primary.error };
}

async function handleSearchAction(
  body: SearchRequest,
  _token: string,
  requestId: string,
): Promise<SearchResponse> {
  const validation = validateSearchInput(body);
  if (!validation.valid) {
    return { ok: false, error: validation.error || 'Invalid search request' };
  }

  const configResult = getProviderConfig();
  if (configResult.error || !configResult.config) {
    return { ok: false, error: configResult.error || 'Provider config error' };
  }

  const config = configResult.config;
  const query = body.query!.trim();
  const uiMode = body.ui_mode || 'auto';
  const page = clampPage(body.page);
  const pageSize = clampPageSize(body.pageSize);
  const mode = resolveSearchMode(uiMode);
  const skipMixed = Deno.env.get('APOLLO_DISABLE_MIXED') === 'true';
  const entities = body.entities;

  // Build the Apollo request body. When entities (from the Coach
  // classifier) are present we use Apollo's structured filter params;
  // otherwise we fall back to plain keyword text. This is the bridge
  // between Pulse's NL UX and Apollo's structured search API.
  const apolloBody = mode === 'people'
    ? buildApolloPeopleBody(query, entities)
    : buildApolloCompaniesBody(query, entities);

  console.log(
    `[${requestId}] Apollo search: query="${query}", ui_mode="${uiMode}", mode="${mode}", page=${page}, per_page=${pageSize}, skipMixed=${skipMixed}, structured=${entities ? 'yes' : 'no'}, body_keys=${Object.keys(apolloBody).join(',')}`,
  );

  const warnings: string[] = [];
  if (uiMode === 'auto') {
    warnings.push(
      'auto/both currently routes to Apollo company search; specify People to search contacts directly.',
    );
  }
  if (!entities) {
    warnings.push(
      'Pulse classifier output not provided — falling back to keyword search.',
    );
  }

  const search =
    mode === 'people'
      ? await searchPeopleWithFallback(config, apolloBody, page, pageSize, requestId, warnings, skipMixed)
      : await searchCompaniesWithFallback(config, apolloBody, page, pageSize, requestId, warnings, skipMixed);

  if (search.error || !search.resolved) {
    return { ok: false, error: search.error || 'Apollo search failed' };
  }

  const { upstream, items, endpointUsed } = search.resolved;
  const mapper = mode === 'people' ? mapApolloPerson : mapApolloCompany;
  const responseMode: 'companies' | 'people' = mode === 'people' ? 'people' : 'companies';

  if (items.length === 0) {
    return buildEmptySearchResponse(query, responseMode, warnings);
  }

  const mapped = items.map(mapper);
  const pag = readPagination(upstream);
  if (pag.totalEntries > mapped.length) {
    warnings.push(
      `Showing first ${mapped.length} of ${pag.totalEntries} matches via ${endpointUsed}. Pagination ships in the next phase.`,
    );
  }
  const partial =
    Boolean(upstream.partial_results_only) || pag.totalEntries > mapped.length;

  return buildSearchResponse(query, responseMode, mapped, {
    total: pag.totalEntries || mapped.length,
    page: pag.page,
    pageSize: mapped.length,
    requestedLimit: pageSize,
    estimatedMarketSize: pag.totalEntries || null,
    provider: PROVIDER_NAME,
    partial,
    warnings,
    classificationReasons: [],
    matchedCompanyName: null,
  });
}

async function handleEnrichAction(
  body: EnrichRequest,
  _token: string,
  requestId: string,
): Promise<EnrichResponse> {
  const validation = validateEnrichInput(body);
  if (!validation.valid) {
    return { ok: false, error: validation.error || 'Invalid enrich request' };
  }
  console.log(
    `[${requestId}] Enrich: prospect_id="${body.prospect_id}" — Apollo enrichment not implemented yet`,
  );
  return { ok: false, error: 'Apollo contact enrichment not implemented yet' };
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    let body: SearchRequest | EnrichRequest = {};
    try {
      body = await req.json();
    } catch (err) {
      console.error(`[${requestId}] JSON parse error:`, err);
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.substring('Bearer '.length);
    const action = (body as Record<string, unknown>).action || 'search';

    let response: unknown;
    if (action === 'search') {
      response = await handleSearchAction(body as SearchRequest, token, requestId);
    } else if (action === 'enrich_contact') {
      response = await handleEnrichAction(body as EnrichRequest, token, requestId);
    } else {
      console.log(`[${requestId}] Unknown action: ${action}`);
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[${requestId}] Response: ok=${(response as Record<string, unknown>).ok}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[${requestId}] Unhandled error:`, err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});