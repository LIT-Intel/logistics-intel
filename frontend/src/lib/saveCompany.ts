// Canonical client-side save-to-Command-Center helper.
//
// Every "save a company" action in the app routes through this function.
// It calls the `save-company` Edge Function, which is the only place that
// runs check_usage_limit + writes to lit_saved_companies. There is no
// browser-side insert path: that's by design, so the plan-limit gate
// cannot be bypassed.
//
// Returns one of:
//   { ok: true,  saved, company }                — success
//   { ok: false, code: 'LIMIT_EXCEEDED', ... }   — quota gate (HTTP 403)
//   { ok: false, code: 'UNAUTHORIZED' }           — no session (HTTP 401)
//   { ok: false, code: 'NETWORK', message }       — fetch failed
//   { ok: false, code, message }                  — anything else
//
// Callers should branch on `.ok`. They can also pass the full response to
// the shared LIMIT_EXCEEDED UI handler, which knows the contract.
//
// Migration note: this replaces the legacy paths
//   - frontend/src/lib/api.ts → saveCompanyDirectToSupabase (browser → DB)
//   - frontend/src/lib/supabaseApi.ts → saveCompany (browser → DB, wrong table)
//   - frontend/src/hooks/useSavedCompanies.js → /crm/saveCompany (CRM API)
//   - frontend/src/components/command-center/AddCompanyModal.tsx → localStorage
//   - frontend/src/pages/company/[company_id].tsx → /crm/saveCompany
// All five collapse into this one function.

import { supabase } from "@/auth/supabaseAuthClient";

export interface SaveCompanyInput {
  /** Existing lit_companies.id, if known */
  company_id?: string;
  /** External provider id (importyeti business_id, etc) */
  source_company_key?: string;
  /** Used to upsert into lit_companies if no row exists yet */
  company_data?: {
    source?: string;
    source_company_key?: string;
    name: string;
    domain?: string | null;
    website?: string | null;
    phone?: string | null;
    country_code?: string | null;
    address_line1?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    shipments_12m?: number | null;
    teu_12m?: number | null;
    fcl_shipments_12m?: number | null;
    lcl_shipments_12m?: number | null;
    est_spend_12m?: number | null;
    most_recent_shipment_date?: string | null;
    top_route_12m?: unknown;
    recent_route?: unknown;
    tags?: string[];
    primary_mode?: string | null;
    mode?: string | null;
    revenue_range?: string | null;
    risk_level?: string | null;
    raw_profile?: unknown;
    raw_stats?: unknown;
  };
  /** Defaults to 'prospect' */
  stage?: string;
}

export type SaveCompanyResult =
  | { ok: true; saved: unknown; company: unknown }
  | {
      ok: false;
      code: "LIMIT_EXCEEDED";
      feature: "saved_company";
      used: number;
      limit: number;
      plan: string;
      message: string;
      upgrade_url?: string;
      upgrade_required?: boolean;
    }
  | { ok: false; code: "UNAUTHORIZED"; message: string }
  | { ok: false; code: "NETWORK"; message: string }
  | { ok: false; code: string; message: string };

function getSupabaseUrl(): string | null {
  const env = (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env;
  return env?.VITE_SUPABASE_URL ?? null;
}

export async function saveCompany(input: SaveCompanyInput): Promise<SaveCompanyResult> {
  if (!supabase) {
    return { ok: false, code: "UNAUTHORIZED", message: "Supabase client not initialized" };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { ok: false, code: "UNAUTHORIZED", message: "Please sign in to save companies." };
  }

  const baseUrl = getSupabaseUrl();
  if (!baseUrl) {
    return { ok: false, code: "NETWORK", message: "Supabase URL not configured." };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/functions/v1/save-company`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        company_id: input.company_id,
        source_company_key: input.source_company_key,
        company_data: input.company_data,
        stage: input.stage ?? "prospect",
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network request failed";
    return { ok: false, code: "NETWORK", message: msg };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 403 && body?.code === "LIMIT_EXCEEDED") {
    return body as SaveCompanyResult;
  }
  if (res.status === 401) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: body?.error || body?.message || "Authentication required.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      code: body?.code || `HTTP_${res.status}`,
      message: body?.error || body?.message || `Save failed with status ${res.status}`,
    };
  }
  if (body?.ok === true) {
    return { ok: true, saved: body.saved, company: body.company };
  }

  return {
    ok: false,
    code: body?.code || "UNKNOWN",
    message: body?.error || body?.message || "Save failed.",
  };
}

/**
 * Type guard for the LIMIT_EXCEEDED branch.
 * Lets callers narrow without importing the full union type.
 */
export function isLimitExceeded(
  result: SaveCompanyResult,
): result is Extract<SaveCompanyResult, { code: "LIMIT_EXCEEDED" }> {
  return result.ok === false && result.code === "LIMIT_EXCEEDED";
}

/**
 * Tagged error class for legacy callers that use try/catch + throw.
 * Lets `try { await saveCompanyOrThrow(...) } catch (e) { if (e instanceof LimitExceededError) ... }`
 * detect quota errors without parsing message strings.
 */
export class LimitExceededError extends Error {
  readonly code = "LIMIT_EXCEEDED" as const;
  readonly feature: string;
  readonly used: number;
  readonly limit: number;
  readonly plan: string;
  readonly upgrade_url?: string;

  constructor(
    payload: Extract<SaveCompanyResult, { code: "LIMIT_EXCEEDED" }>,
  ) {
    super(payload.message);
    this.name = "LimitExceededError";
    this.feature = payload.feature;
    this.used = payload.used;
    this.limit = payload.limit;
    this.plan = payload.plan;
    this.upgrade_url = payload.upgrade_url;
  }
}

/**
 * Throwing variant. Returns the success payload on ok=true,
 * throws LimitExceededError on quota, throws Error on anything else.
 *
 * Use this in legacy throw-based callers; use saveCompany() above for
 * new code that wants to branch on the structured result.
 */
export async function saveCompanyOrThrow(input: SaveCompanyInput): Promise<{
  saved: unknown;
  company: unknown;
}> {
  const result = await saveCompany(input);
  if (result.ok) return { saved: result.saved, company: result.company };
  if (result.code === "LIMIT_EXCEEDED") {
    throw new LimitExceededError(
      result as Extract<SaveCompanyResult, { code: "LIMIT_EXCEEDED" }>,
    );
  }
  throw new Error(result.message || "Save failed");
}
