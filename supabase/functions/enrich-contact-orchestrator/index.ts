// enrich-contact-orchestrator — Phase 4 multi-provider cascade
//
// Tries each provider in the org's configured order until one returns
// non-empty contacts. Defaults: ['apollo','lusha']. Tier-3 (ZoomInfo /
// Cognism stub) only runs when `lit_org_enrichment_settings.enable_tier3
// = true` even if 'tier3' is in `provider_order`.
//
// Design notes:
//   - The orchestrator forwards the caller's Authorization header to each
//     provider fn. That means per-user phone rate limits, org credit
//     quotas, and ledger writes all happen INSIDE the provider fn — no
//     duplicate gating logic here. The orchestrator is purely a router.
//   - "No match" is detected by `count === 0` OR `errors.every(e => e.error === 'no_match')`.
//     A 4xx/5xx from a provider stops the cascade (don't burn fallback
//     credits on a real outage) and is surfaced as `provider_error`.
//   - When a provider yields contacts, the orchestrator patches
//     `lit_contacts.source_provider` on each persisted row so analytics
//     can attribute matches per provider. Each provider fn already
//     persists rows; the patch is a follow-up UPDATE keyed by
//     (source, source_contact_key).
//
// Frontend migration path: switch `frontend/src/lib/api.ts`'s
// `enrichApolloContacts` to invoke this fn instead of `apollo-contact-enrich`
// — the request shape is identical. Tracked as a follow-up to keep this
// PR small.

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

type ProviderName = "apollo" | "lusha" | "tier3";

const DEFAULT_ORDER: ProviderName[] = ["apollo", "lusha"];
const VALID_PROVIDERS = new Set<ProviderName>(["apollo", "lusha", "tier3"]);

// Map provider name → edge function name. Lusha's enrichment fn takes a
// different request shape (single company_id + optional contact identifiers)
// vs Apollo's bulk `contacts[]`. We adapt below.
const PROVIDER_FN: Record<ProviderName, string> = {
  apollo: "apollo-contact-enrich",
  lusha: "lusha-enrichment",
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
  /** Optional override — if set, ignores the org's stored order. */
  provider_order?: ProviderName[];
}

interface ProviderResult {
  ok: boolean;
  status: number;
  provider: ProviderName;
  contacts: any[];
  count: number;
  error?: string;
  code?: string;
  raw?: any;
}

function buildProviderUrl(fnName: string): string {
  return `${SUPABASE_URL}/functions/v1/${fnName}`;
}

async function callProvider(
  provider: ProviderName,
  payload: Record<string, unknown>,
  authHeader: string,
): Promise<ProviderResult> {
  const url = buildProviderUrl(PROVIDER_FN[provider]);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = null;
    }
    const contacts: any[] = Array.isArray(data?.contacts) ? data.contacts : [];
    return {
      ok: res.ok && data?.ok !== false,
      status: res.status,
      provider,
      contacts,
      count: contacts.length,
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

function buildApolloPayload(req: OrchestratorRequest): Record<string, unknown> {
  // Apollo's fn already accepts the orchestrator's payload shape verbatim.
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

function buildLushaPayload(req: OrchestratorRequest): Record<string, unknown> | null {
  // Lusha's fn expects a single contact identifier shape:
  //   { company_id, domain?, linkedin_url?, first_name?, last_name?, title?, unlock_phone? }
  // We adapt from the orchestrator's `contacts[]` by taking the first target.
  const first = req.contact || (req.contacts && req.contacts[0]) || null;
  if (!req.company_id && !first?.company_id) return null;
  const out: Record<string, unknown> = {
    company_id: req.company_id || first?.company_id,
  };
  const domain = req.domain || first?.domain;
  if (domain) out.domain = domain;
  if (first?.linkedin_url) out.linkedin_url = first.linkedin_url;
  if (first?.first_name) out.first_name = first.first_name;
  if (first?.last_name) out.last_name = first.last_name;
  if (first?.title) out.title = first.title;
  if (req.unlock_phone || req.reveal_phone_number) out.unlock_phone = true;
  return out;
}

function buildTier3Payload(req: OrchestratorRequest): Record<string, unknown> {
  // Tier-3 stub accepts the same shape as Apollo (forward compatible).
  return buildApolloPayload(req);
}

function payloadForProvider(provider: ProviderName, req: OrchestratorRequest): Record<string, unknown> | null {
  if (provider === "apollo") return buildApolloPayload(req);
  if (provider === "lusha") return buildLushaPayload(req);
  if (provider === "tier3") return buildTier3Payload(req);
  return null;
}

function isNoMatch(result: ProviderResult): boolean {
  if (result.count > 0) return false;
  // OK responses with empty contacts are a no_match — fall through.
  if (result.ok) return true;
  // 404 from a provider counts as no_match.
  if (result.status === 404) return true;
  // Apollo's per-contact `no_match` is surfaced via the response body's
  // `errors[]`. When the top-level `ok` is true but every error is no_match,
  // it's still a fall-through candidate.
  const errs = Array.isArray(result.raw?.errors) ? result.raw.errors : [];
  if (errs.length > 0 && errs.every((e: any) => e?.error === "no_match")) return true;
  return false;
}

function shouldStopCascade(result: ProviderResult): boolean {
  // Quota / rate-limit / auth failures are terminal — don't burn fallback
  // credits when the user is already over their cap or the upstream is down.
  if (result.code === "CREDIT_QUOTA_EXCEEDED") return true;
  if (result.code === "USER_RATE_LIMITED") return true;
  if (result.code === "LIMIT_EXCEEDED") return true;
  if (result.status === 401 || result.status === 403) return true;
  if (result.status === 429) return true;
  // 5xx OR network error from a provider → stop. The user can retry; we
  // shouldn't silently switch providers and charge them double.
  if (result.status >= 500 && !result.ok) return true;
  if (result.code === "PROVIDER_FETCH_FAILED") return true;
  return false;
}

async function loadOrgSettings(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ orgId: string | null; order: ProviderName[]; enableTier3: boolean }> {
  // Resolve the caller's primary org first.
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

  if (!orgId) {
    return { orgId: null, order: DEFAULT_ORDER, enableTier3: false };
  }

  try {
    const { data } = await supabase
      .from("lit_org_enrichment_settings")
      .select("provider_order, enable_tier3")
      .eq("org_id", orgId)
      .maybeSingle();
    if (data) {
      const rawOrder: string[] = Array.isArray((data as any).provider_order)
        ? (data as any).provider_order
        : [];
      const order = rawOrder
        .map((p) => p.trim().toLowerCase() as ProviderName)
        .filter((p) => VALID_PROVIDERS.has(p));
      return {
        orgId,
        order: order.length ? order : DEFAULT_ORDER,
        enableTier3: (data as any).enable_tier3 === true,
      };
    }
  } catch (_) {}

  return { orgId, order: DEFAULT_ORDER, enableTier3: false };
}

async function tagSourceProvider(
  supabase: ReturnType<typeof createClient>,
  provider: ProviderName,
  contacts: any[],
): Promise<void> {
  // The provider fn already persisted the row(s) into lit_contacts. Patch
  // source_provider in a single UPDATE per contact so analytics can
  // attribute matches per provider. Keyed by source_contact_key when
  // available (Apollo), else by id (Lusha returns its own `id`).
  for (const c of contacts) {
    try {
      const key = (c as any)?.source_contact_key;
      const id = (c as any)?.id;
      if (key) {
        await supabase
          .from("lit_contacts")
          .update({ source_provider: provider })
          .eq("source_contact_key", key);
      } else if (id) {
        await supabase
          .from("lit_contacts")
          .update({ source_provider: provider })
          .eq("id", id);
      }
    } catch (_) {
      // Non-fatal — the contact still exists, just won't have the tag.
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

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

    const body: OrchestratorRequest = await req.json().catch(() => ({}));
    const targets = Array.isArray(body.contacts) ? body.contacts : body.contact ? [body.contact] : [];
    if (!targets.length && !body.company_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "No contacts or company_id provided", code: "NO_TARGETS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve provider order — request override beats org setting beats default.
    const { orgId, order: orgOrder, enableTier3 } = await loadOrgSettings(supabase, user.id);
    let providerOrder: ProviderName[] = Array.isArray(body.provider_order) && body.provider_order.length
      ? body.provider_order
          .map((p) => String(p).trim().toLowerCase() as ProviderName)
          .filter((p) => VALID_PROVIDERS.has(p))
      : orgOrder;

    // Filter tier3 out unless explicitly enabled at the org level.
    if (!enableTier3) {
      providerOrder = providerOrder.filter((p) => p !== "tier3");
    }
    if (!providerOrder.length) providerOrder = DEFAULT_ORDER;

    const cascade: Array<{ provider: ProviderName; status: number; count: number; code?: string; error?: string }> = [];

    for (const provider of providerOrder) {
      const payload = payloadForProvider(provider, body);
      if (!payload) {
        cascade.push({ provider, status: 0, count: 0, code: "INSUFFICIENT_PAYLOAD" });
        continue;
      }
      const result = await callProvider(provider, payload, authHeader);
      cascade.push({
        provider,
        status: result.status,
        count: result.count,
        code: result.code,
        error: result.error,
      });

      if (result.ok && result.count > 0) {
        // Success — tag source_provider on persisted rows and return.
        await tagSourceProvider(supabase, provider, result.contacts);
        const taggedContacts = result.contacts.map((c) => ({ ...c, source_provider: provider }));
        log.info("cascade_hit", {
          user_id: user.id,
          org_id: orgId,
          provider,
          count: result.count,
          cascade_path: cascade.map((c) => c.provider).join(","),
        });
        return new Response(
          JSON.stringify({
            ok: true,
            provider,
            contacts: taggedContacts,
            count: result.count,
            cascade,
            provider_order: providerOrder,
            enable_tier3: enableTier3,
            raw_provider_response: result.raw,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Terminal error from this provider — don't burn fallback credits.
      if (shouldStopCascade(result)) {
        log.warn("cascade_terminated", {
          user_id: user.id,
          provider,
          code: result.code,
          status: result.status,
        });
        return new Response(
          JSON.stringify({
            ok: false,
            error: result.error || "Provider returned a terminal error",
            code: result.code || "PROVIDER_ERROR",
            provider,
            cascade,
            provider_order: providerOrder,
            raw_provider_response: result.raw,
          }),
          { status: result.status || 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // No match here — fall through to the next provider.
      if (!isNoMatch(result)) {
        // Unexpected non-match, non-terminal response. Log + still fall
        // through (the next provider may have better coverage) so the
        // cascade isn't blocked by a flaky provider returning 200 with
        // an unexpected shape.
        log.warn("cascade_non_match_continue", {
          user_id: user.id,
          provider,
          status: result.status,
          code: result.code,
        });
      }
    }

    // Cascade exhausted — every provider returned no_match.
    log.info("cascade_exhausted", {
      user_id: user.id,
      org_id: orgId,
      cascade_path: cascade.map((c) => c.provider).join(","),
    });
    return new Response(
      JSON.stringify({
        ok: true,
        provider: null,
        contacts: [],
        count: 0,
        exhausted: true,
        cascade,
        provider_order: providerOrder,
        enable_tier3: enableTier3,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    log.error("orchestrator_unexpected_error", { err: String(error?.message ?? error) });
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
