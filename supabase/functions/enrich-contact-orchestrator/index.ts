// enrich-contact-orchestrator — multi-provider contact enrichment cascade.
//
// Current LIT strategy: Lemlist first, Apollo fallback. Lusha is intentionally
// inactive while LIT evaluates the best enrichment provider. Lemlist may return
// pending=true because its enrichment workflow is asynchronous; when that
// happens the cascade stops because the request was accepted.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("enrich-contact-orchestrator");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ProviderName = "lemlist" | "apollo" | "tier3";

const DEFAULT_ORDER: ProviderName[] = ["lemlist", "apollo"];
const VALID_PROVIDERS = new Set<ProviderName>(["lemlist", "apollo", "tier3"]);

const PROVIDER_FN: Record<ProviderName, string> = {
  lemlist: "lemlist-enrichment",
  apollo: "apollo-contact-enrich",
  tier3: "tier3-enrichment",
};

interface OrchestratorTarget {
  id?: string | null;
  apollo_id?: string | null;
  apollo_person_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  domain?: string | null;
  organization_name?: string | null;
  company_name?: string | null;
  title?: string | null;
  company_id?: string | null;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

interface OrchestratorRequest {
  contacts?: OrchestratorTarget[];
  contact?: OrchestratorTarget;
  company_id?: string | null;
  domain?: string | null;
  company_name?: string | null;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  unlock_phone?: boolean;
  source_context?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  enrichment_requests?: string[];
  provider_order?: string[];
}

interface ProviderResult {
  ok: boolean;
  status: number;
  provider: ProviderName;
  contacts: any[];
  count: number;
  pending?: boolean;
  submitted?: number;
  jobs?: any[];
  error?: string;
  code?: string;
  raw?: any;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildProviderUrl(fnName: string): string {
  return `${SUPABASE_URL}/functions/v1/${fnName}`;
}

async function callProvider(
  provider: ProviderName,
  payload: Record<string, unknown>,
  authHeader: string,
): Promise<ProviderResult> {
  try {
    const res = await fetch(buildProviderUrl(PROVIDER_FN[provider]), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    const contacts: any[] = Array.isArray(data?.contacts) ? data.contacts : [];
    return {
      ok: res.ok && data?.ok !== false,
      status: res.status,
      provider,
      contacts,
      count: contacts.length,
      pending: data?.pending === true,
      submitted: Number(data?.submitted || 0),
      jobs: Array.isArray(data?.jobs) ? data.jobs : [],
      error: data?.error || data?.message || undefined,
      code: data?.code || undefined,
      raw: data,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      provider,
      contacts: [],
      count: 0,
      error: err?.message || String(err),
      code: "PROVIDER_FETCH_FAILED",
    };
  }
}

function buildImmediatePayload(req: OrchestratorRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (req.contacts) out.contacts = req.contacts;
  if (req.contact) out.contact = req.contact;
  if (req.company_id !== undefined) out.company_id = req.company_id;
  if (req.domain !== undefined) out.domain = req.domain;
  if (req.company_name !== undefined) out.company_name = req.company_name;
  if (req.reveal_personal_emails !== undefined) out.reveal_personal_emails = req.reveal_personal_emails;
  if (req.reveal_phone_number !== undefined) out.reveal_phone_number = req.reveal_phone_number;
  if (req.unlock_phone !== undefined) out.unlock_phone = req.unlock_phone;
  return out;
}

function buildLemlistPayload(req: OrchestratorRequest): Record<string, unknown> {
  const out: Record<string, unknown> = buildImmediatePayload(req);
  out.source_context = req.source_context || "orchestrator";
  if (req.source_entity_type !== undefined) out.source_entity_type = req.source_entity_type;
  if (req.source_entity_id !== undefined) out.source_entity_id = req.source_entity_id;
  if (req.enrichment_requests !== undefined) out.enrichment_requests = req.enrichment_requests;
  return out;
}

function payloadForProvider(provider: ProviderName, req: OrchestratorRequest): Record<string, unknown> | null {
  if (provider === "lemlist") return buildLemlistPayload(req);
  if (provider === "apollo") return buildImmediatePayload(req);
  if (provider === "tier3") return buildImmediatePayload(req);
  return null;
}

function isNoMatch(result: ProviderResult): boolean {
  if (result.count > 0 || result.pending) return false;
  if (result.ok) return true;
  if (result.status === 404) return true;
  const errs = Array.isArray(result.raw?.errors) ? result.raw.errors : [];
  return errs.length > 0 && errs.every((e: any) => e?.error === "no_match");
}

function shouldStopCascade(result: ProviderResult): boolean {
  if (result.code === "PROVIDER_NOT_CONFIGURED") return false;
  if (result.code === "CREDIT_QUOTA_EXCEEDED") return true;
  if (result.code === "USER_RATE_LIMITED") return true;
  if (result.code === "LIMIT_EXCEEDED") return true;
  if (result.status === 401 || result.status === 403) return true;
  if (result.status === 429) return true;
  if (result.status >= 500 && !result.ok) return true;
  if (result.code === "PROVIDER_FETCH_FAILED") return true;
  return false;
}

async function loadOrgSettings(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ orgId: string | null; order: ProviderName[]; enableTier3: boolean }> {
  let orgId: string | null = null;
  try {
    const { data: omRow } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = (omRow as any)?.org_id ?? null;
  } catch (_) {}

  if (!orgId) return { orgId: null, order: DEFAULT_ORDER, enableTier3: false };

  try {
    const { data } = await supabase
      .from("lit_org_enrichment_settings")
      .select("provider_order, enable_tier3")
      .eq("org_id", orgId)
      .maybeSingle();
    if (data) {
      const rawOrder = Array.isArray((data as any).provider_order) ? (data as any).provider_order : [];
      const order = rawOrder
        .map((p: unknown) => String(p).trim().toLowerCase() as ProviderName)
        .filter((p: ProviderName) => VALID_PROVIDERS.has(p));
      return { orgId, order: order.length ? order : DEFAULT_ORDER, enableTier3: (data as any).enable_tier3 === true };
    }
  } catch (_) {}

  return { orgId, order: DEFAULT_ORDER, enableTier3: false };
}

async function tagSourceProvider(
  supabase: ReturnType<typeof createClient>,
  provider: ProviderName,
  contacts: any[],
): Promise<void> {
  for (const c of contacts) {
    try {
      const key = (c as any)?.source_contact_key;
      const id = (c as any)?.id;
      const patch = { source_provider: provider, enrichment_provider: provider };
      if (key) await supabase.from("lit_contacts").update(patch).eq("source_contact_key", key);
      else if (id) await supabase.from("lit_contacts").update(patch).eq("id", id);
    } catch (_) {}
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization header", code: "UNAUTHENTICATED" }, 401);

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, 401);

    const body: OrchestratorRequest = await req.json().catch(() => ({}));
    const targets = Array.isArray(body.contacts) ? body.contacts : body.contact ? [body.contact] : [];
    if (!targets.length && !body.company_id) {
      return json({ ok: false, error: "No contacts or company_id provided", code: "NO_TARGETS" }, 400);
    }

    const { orgId, order: orgOrder, enableTier3 } = await loadOrgSettings(supabase, user.id);
    let providerOrder: ProviderName[] = Array.isArray(body.provider_order) && body.provider_order.length
      ? body.provider_order
          .map((p) => String(p).trim().toLowerCase() as ProviderName)
          .filter((p) => VALID_PROVIDERS.has(p))
      : orgOrder;

    if (!enableTier3) providerOrder = providerOrder.filter((p) => p !== "tier3");
    if (!providerOrder.length) providerOrder = DEFAULT_ORDER;

    const cascade: Array<{ provider: ProviderName; status: number; count: number; pending?: boolean; code?: string; error?: string }> = [];

    for (const provider of providerOrder) {
      const payload = payloadForProvider(provider, body);
      if (!payload) {
        cascade.push({ provider, status: 0, count: 0, code: "INSUFFICIENT_PAYLOAD" });
        continue;
      }

      const result = await callProvider(provider, payload, authHeader);
      cascade.push({ provider, status: result.status, count: result.count, pending: result.pending, code: result.code, error: result.error });

      if (result.ok && result.pending) {
        log.info("cascade_pending", { user_id: user.id, org_id: orgId, provider, submitted: result.submitted });
        return json({
          ok: true,
          provider,
          pending: true,
          submitted: result.submitted,
          jobs: result.jobs,
          contacts: [],
          count: 0,
          cascade,
          provider_order: providerOrder,
          enable_tier3: enableTier3,
          raw_provider_response: result.raw,
        });
      }

      if (result.ok && result.count > 0) {
        await tagSourceProvider(supabase, provider, result.contacts);
        const taggedContacts = result.contacts.map((c) => ({ ...c, source_provider: provider, enrichment_provider: provider }));
        log.info("cascade_hit", { user_id: user.id, org_id: orgId, provider, count: result.count });
        return json({ ok: true, provider, contacts: taggedContacts, count: result.count, cascade, provider_order: providerOrder, enable_tier3: enableTier3, raw_provider_response: result.raw });
      }

      if (shouldStopCascade(result)) {
        log.warn("cascade_terminated", { user_id: user.id, provider, code: result.code, status: result.status });
        return json({
          ok: false,
          error: result.error || "Provider returned a terminal error",
          code: result.code || "PROVIDER_ERROR",
          provider,
          cascade,
          provider_order: providerOrder,
          raw_provider_response: result.raw,
        }, result.status || 502);
      }

      if (!isNoMatch(result)) {
        log.warn("cascade_non_match_continue", { user_id: user.id, provider, status: result.status, code: result.code });
      }
    }

    log.info("cascade_exhausted", { user_id: user.id, org_id: orgId, cascade_path: cascade.map((c) => c.provider).join(",") });
    return json({ ok: true, provider: null, contacts: [], count: 0, exhausted: true, cascade, provider_order: providerOrder, enable_tier3: enableTier3 });
  } catch (error: any) {
    log.error("orchestrator_unexpected_error", { err: String(error?.message ?? error) });
    return json({ ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }, 500);
  }
});
