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
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PROVIDER_NAME = 'apollo';
const APOLLO_LOCKED_EMAIL_MARKER = 'email_not_unlocked@';

interface SearchRequest {
  query?: string;
  ui_mode?: string;
  page?: number;
  pageSize?: number;
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
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/mixed_companies/search',
    { q_organization_name: query, page, per_page: pageSize },
    requestId,
  );
}

function callApolloAccounts(
  config: ProviderConfig,
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/accounts/search',
    { q_keywords: query, page, per_page: pageSize },
    requestId,
  );
}

function callApolloMixedPeople(
  config: ProviderConfig,
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/mixed_people/search',
    { q_keywords: query, page, per_page: pageSize },
    requestId,
  );
}

function callApolloContacts(
  config: ProviderConfig,
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<ApolloCallResult> {
  return callApolloEndpoint(
    config,
    '/api/v1/contacts/search',
    { q_keywords: query, page, per_page: pageSize },
    requestId,
  );
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

function mapApolloCompany(orgRaw: unknown): Record<string, unknown> {
  const org = asRecord(orgRaw) || {};
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
    city: asString(org.city),
    state: asString(org.state),
    country: asString(org.country),
    industry: asString(org.industry),
    employee_count: asNumber(org.estimated_num_employees),
    annual_revenue: asNumber(org.annual_revenue),
    summary: asString(org.short_description),
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
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
  warnings: string[],
  skipMixed: boolean,
): Promise<{ resolved?: ResolvedSearch; error?: string }> {
  const tryAccountsFallback = async (): Promise<{ resolved?: ResolvedSearch; error?: string }> => {
    const fb = await callApolloAccounts(config, query, page, pageSize, requestId);
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

  const primary = await callApolloMixedCompanies(config, query, page, pageSize, requestId);
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
  query: string,
  page: number,
  pageSize: number,
  requestId: string,
  warnings: string[],
  skipMixed: boolean,
): Promise<{ resolved?: ResolvedSearch; error?: string }> {
  const tryContactsFallback = async (): Promise<{ resolved?: ResolvedSearch; error?: string }> => {
    const fb = await callApolloContacts(config, query, page, pageSize, requestId);
    if (fb.error) {
      if (fb.status === 403) {
        return {
          error:
            'Provider permission issue: Apollo /api/v1/mixed_people/search and /api/v1/contacts/search both returned 403. Apollo endpoint forbidden — check API key scopes/plan.',
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

  const primary = await callApolloMixedPeople(config, query, page, pageSize, requestId);
  if (!primary.error) {
    const data = primary.data || {};
    const people = Array.isArray(data.people) ? data.people : [];
    return {
      resolved: {
        upstream: data,
        items: people,
        endpointUsed: '/api/v1/mixed_people/search',
        fallbackUsed: false,
      },
    };
  }

  if (primary.status === 403) {
    warnings.push(
      'Apollo /api/v1/mixed_people/search returned 403 (forbidden). Falling back to /api/v1/contacts/search (Apollo CRM only).',
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

  console.log(
    `[${requestId}] Apollo search: query="${query}", ui_mode="${uiMode}", mode="${mode}", page=${page}, per_page=${pageSize}, skipMixed=${skipMixed}`,
  );

  const warnings: string[] = [];
  if (uiMode === 'auto') {
    warnings.push(
      'auto/both currently routes to Apollo company search; specify People to search contacts directly.',
    );
  }
  warnings.push(
    'Pulse passed your prompt to Apollo as a single keyword. Structured filter parsing ships in the next phase.',
  );

  const search =
    mode === 'people'
      ? await searchPeopleWithFallback(config, query, page, pageSize, requestId, warnings, skipMixed)
      : await searchCompaniesWithFallback(config, query, page, pageSize, requestId, warnings, skipMixed);

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