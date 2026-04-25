const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, apikey',
};

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;
const ALLOWED_UI_MODES = ['auto', 'companies', 'people'];

// Types
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

interface SearchResponse {
  ok: boolean;
  mode?: string;
  query?: string;
  meta?: {
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
  };
  data?: {
    results: unknown[];
  };
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
  searchUrl: string;
  enrichUrl: string;
}

// Helpers
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function getProviderConfig(): { config: ProviderConfig | null; error: string | null } {
  const apiKey = Deno.env.get('EXPLORIUM_API_KEY');
  const searchUrl = Deno.env.get('EXPLORIUM_SEARCH_URL');
  const enrichUrl = Deno.env.get('EXPLORIUM_ENRICH_URL');

  if (!apiKey) {
    return { config: null, error: 'EXPLORIUM_API_KEY not configured' };
  }
  if (!searchUrl) {
    return { config: null, error: 'EXPLORIUM_SEARCH_URL not configured' };
  }
  if (!enrichUrl) {
    return { config: null, error: 'EXPLORIUM_ENRICH_URL not configured' };
  }

  return {
    config: { apiKey, searchUrl, enrichUrl },
    error: null,
  };
}

function validateSearchInput(body: SearchRequest): { valid: boolean; error: string | null } {
  const query = body?.query;
  const ui_mode = body?.ui_mode || 'auto';

  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'query is required and must be a string' };
  }

  if (query.trim().length < MIN_QUERY_LENGTH) {
    return {
      valid: false,
      error: `query must be at least ${MIN_QUERY_LENGTH} characters`,
    };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `query must not exceed ${MAX_QUERY_LENGTH} characters`,
    };
  }

  if (!ALLOWED_UI_MODES.includes(ui_mode)) {
    return {
      valid: false,
      error: `ui_mode must be one of: ${ALLOWED_UI_MODES.join(', ')}`,
    };
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

async function callExploriumSearch(
  config: ProviderConfig,
  query: string,
  mode: string,
  requestId: string,
): Promise<{ data: unknown | null; error: string | null }> {
  try {
    const response = await fetch(config.searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({
        query,
        mode,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[${requestId}] Explorium search failed:`,
        response.status,
        text,
      );
      return {
        data: null,
        error: `Explorium API returned ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    console.error(`[${requestId}] Explorium search error:`, err);
    return {
      data: null,
      error: `Failed to call Explorium: ${String(err)}`,
    };
  }
}

async function callExploriumEnrich(
  config: ProviderConfig,
  prospectId: string,
  requestId: string,
): Promise<{ data: unknown | null; error: string | null }> {
  try {
    const response = await fetch(config.enrichUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({
        prospect_id: prospectId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[${requestId}] Explorium enrich failed:`,
        response.status,
        text,
      );
      return {
        data: null,
        error: `Explorium API returned ${response.status}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    console.error(`[${requestId}] Explorium enrich error:`, err);
    return {
      data: null,
      error: `Failed to call Explorium: ${String(err)}`,
    };
  }
}

const RESULT_MODES = ['companies', 'people', 'hybrid_people_over_company'];

function resolveResultMode(upstreamMode: unknown, uiMode: string): string {
  if (typeof upstreamMode === 'string' && RESULT_MODES.includes(upstreamMode)) {
    return upstreamMode;
  }
  if (uiMode === 'people') return 'people';
  return 'companies';
}

function mapSearchResults(
  upstreamData: unknown,
  query: string,
  uiMode: string,
): SearchResponse {
  // If upstream data is null or not an object, return empty results
  if (!upstreamData || typeof upstreamData !== 'object') {
    return {
      ok: true,
      mode: resolveResultMode(undefined, uiMode),
      query,
      meta: {
        total: 0,
        page: 1,
        pageSize: 0,
        requestedLimit: null,
        estimatedMarketSize: null,
        provider: 'explorium',
        partial: false,
        warnings: [],
        classificationReasons: [],
        matchedCompanyName: null,
      },
      data: {
        results: [],
      },
    };
  }

  const upstream = upstreamData as Record<string, unknown>;
  const warnings = Array.isArray(upstream.warnings)
    ? upstream.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const classificationReasons = Array.isArray(upstream.classificationReasons)
    ? upstream.classificationReasons.filter((r): r is string => typeof r === 'string')
    : [];

  return {
    ok: true,
    mode: resolveResultMode(upstream.mode, uiMode),
    query,
    meta: {
      total: typeof upstream.total === 'number' ? upstream.total : 0,
      page: typeof upstream.page === 'number' ? upstream.page : 1,
      pageSize: typeof upstream.pageSize === 'number' ? upstream.pageSize : 0,
      requestedLimit: typeof upstream.requestedLimit === 'number'
        ? upstream.requestedLimit
        : null,
      estimatedMarketSize: typeof upstream.estimatedMarketSize === 'number'
        ? upstream.estimatedMarketSize
        : null,
      provider: 'explorium',
      partial: Boolean(upstream.partial),
      warnings,
      classificationReasons,
      matchedCompanyName: typeof upstream.matchedCompanyName === 'string'
        ? upstream.matchedCompanyName
        : null,
    },
    data: {
      results: Array.isArray(upstream.results) ? upstream.results : [],
    },
  };
}

function mapEnrichResult(
  upstreamData: unknown,
): EnrichResponse {
  if (!upstreamData || typeof upstreamData !== 'object') {
    return {
      ok: true,
      data: {
        contact: {},
      },
    };
  }

  const upstream = upstreamData as Record<string, unknown>;
  const rawContact = upstream.contact;
  const contact: Record<string, unknown> =
    rawContact && typeof rawContact === 'object'
      ? (rawContact as Record<string, unknown>)
      : {};

  return {
    ok: true,
    data: {
      contact: {
        email: typeof contact.email === 'string' ? contact.email : undefined,
        phone: typeof contact.phone === 'string' ? contact.phone : undefined,
        linkedin_url: typeof contact.linkedin_url === 'string'
          ? contact.linkedin_url
          : undefined,
      },
    },
  };
}

async function handleSearchAction(
  body: SearchRequest,
  _token: string,
  requestId: string,
): Promise<SearchResponse> {
  // Validate input
  const validation = validateSearchInput(body);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'Invalid search request',
    };
  }

  // Get provider config
  const configResult = getProviderConfig();
  if (configResult.error) {
    return {
      ok: false,
      error: configResult.error,
    };
  }

  const config = configResult.config!;
  const query = body.query!.trim();
  const ui_mode = body.ui_mode || 'auto';

  console.log(`[${requestId}] Search: query="${query}", mode="${ui_mode}"`);

  // Call provider
  const result = await callExploriumSearch(config, query, ui_mode, requestId);
  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  // Map results
  return mapSearchResults(result.data, query, ui_mode);
}

async function handleEnrichAction(
  body: EnrichRequest,
  _token: string,
  requestId: string,
): Promise<EnrichResponse> {
  // Validate input
  const validation = validateEnrichInput(body);
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'Invalid enrich request',
    };
  }

  // Get provider config
  const configResult = getProviderConfig();
  if (configResult.error) {
    return {
      ok: false,
      error: configResult.error,
    };
  }

  const config = configResult.config!;
  const prospectId = body.prospect_id!;

  console.log(`[${requestId}] Enrich: prospect_id="${prospectId}"`);

  // Call provider
  const result = await callExploriumEnrich(config, prospectId, requestId);
  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  // Map results
  return mapEnrichResult(result.data);
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    // Parse request body
    let body: SearchRequest | EnrichRequest = {};
    try {
      body = await req.json();
    } catch (err) {
      console.error(`[${requestId}] JSON parse error:`, err);
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Extract and validate auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing or invalid authorization',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const token = authHeader.substring('Bearer '.length);

    // Dispatch based on action
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
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(
      `[${requestId}] Response: ok=${(response as Record<string, unknown>).ok}`,
    );

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[${requestId}] Unhandled error:`, err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
