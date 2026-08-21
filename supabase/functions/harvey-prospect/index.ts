// harvey-prospect — Project Harvey Batch 5 (PROSPECT).
//
// The internal-only agent that SOURCES new leads into Harvey's inventory. It
// finds freight-sales professionals (salespeople/BD/owners at brokers /
// forwarders / NVOCCs / 3PLs / customs / drayage), dedupes + suppression-checks
// them, scores the opportunity, and creates surviving leads directly in
// lit_admin_leads with primary_source='harvey'. It NEVER sends anything.
//
// SOURCING ORDER (cheapest first):
//   1. INTERNAL, ZERO-CREDIT: existing LIT company data (lit_companies +
//      lit_company_directory), filtered to freight types. Preferred via the
//      membership-gated lit_leadcrm_search_companies RPC when a lead-CRM member
//      JWT is forwardable (admin/manual trigger); otherwise a direct
//      service-role table read (cron trigger, no user context).
//   2. APOLLO (PAID) — only when NOT testMode AND config.prospecting.apollo is
//      not disabled AND a forwardable member JWT exists (the lead-crm-* /
//      apollo-* functions require a real member JWT; a service-role bearer
//      cannot authorize them). Flow: lead-crm-find-leads -> lead-crm-qualify-
//      company (skip unless safe_to_enrich) -> apollo-contact-search ->
//      lead-crm-enrich-contacts. In testMode Apollo is skipped entirely and the
//      run logs what it WOULD have done (NO paid spend).
//
// INTERNAL-ONLY boundary (customers can never invoke this — mirrors
// harvey-controller's dual auth):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron header ==
//     LIT_CRON_SECRET via _shared/cron_auth.ts)
//   - OR an authenticated PLATFORM ADMIN who is also a lead-CRM member
//     (requireUser + isUserAdmin().isPlatformAdmin + is_lead_crm_member RPC).
//   Everyone else gets 401/403.
//
// Gate order (fail CLOSED — mirrors harvey-controller):
//   1. lit_feature_flags['harvey_internal_agent'] must EXIST with
//      global_kill=false (isAgentFlagEnabled — fail-closed).
//   2. lit_agent_config['harvey'].enabled must be true.
//   3. Quiet hours skip the run unless trigger_type is 'manual' or 'test'.
//
// Input JSON:
//   { agent_name='harvey', trigger_type?, created_by?,
//     target?: { count?, keywords?:string[], location?:string } }
//
// Response:
//   { ok, run_id, sourced, created, skipped, test_mode,
//     leads:[{ id, full_name, company_name, title, email, lead_score }] }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  type AgentConfig,
  completeAgentRun,
  isAgentFlagEnabled,
  loadAgentConfig,
  recordAgentRun,
  withinQuietHours,
} from "../_shared/agent.ts";
import { recordProviderUsage } from "../_shared/provider_ledger.ts";
import { PROVIDERS, PROVIDER_OPERATIONS, TRIGGER_TYPES } from "../_shared/provider_operations.ts";

const AGENT_NAME = "harvey-prospect";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";

type TriggerType = "cron" | "webhook" | "manual" | "test";

// Freight-type keywords used both for the Apollo org search and for filtering
// internal company rows down to freight-sales target companies.
const FREIGHT_KEYWORDS = [
  "freight broker",
  "freight forwarder",
  "3PL",
  "NVOCC",
  "logistics",
];
// Substrings that mark an internal company row as a freight target (matched
// against name/industry, lower-cased).
const FREIGHT_TYPE_MARKERS = [
  "broker",
  "forwarder",
  "forwarding",
  "logistic",
  "3pl",
  "nvocc",
  "drayage",
  "customs",
  "freight",
  "transportation",
  "supply chain",
];
// Apollo contact-search targeting: freight-sales decision-makers / reps.
const APOLLO_TITLES = [
  "VP Sales",
  "Owner",
  "Sales Manager",
  "President",
  "Head of Sales",
  "Business Development",
];
const APOLLO_SENIORITIES = ["owner", "c_suite", "vp", "director", "manager"];
const APOLLO_EMAIL_STATUSES = ["verified"];

type SuppressionStatus = {
  converted: boolean;
  bounced: boolean;
  complained: boolean;
  unsubscribed: boolean;
};

type InternalCompany = {
  id: string | null; // lit_companies.id (uuid) when known
  source_company_key: string | null;
  name: string;
  domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  origin: string; // 'companies' | 'directory'
  has_snapshot: boolean;
  shipments_12m: number | null;
  employee_count: number | null;
};

type Candidate = {
  full_name: string | null;
  title: string | null;
  email: string | null;
  company_name: string;
  company_id: string | null;
  source_company_key: string | null;
  company_domain: string | null;
  company_city: string | null;
  company_state: string | null;
  company_country: string | null;
  apollo_organization_id: string | null;
  industry: string | null;
  employee_count: number | null;
  shipments_12m: number | null; // freight-relevance signal for scoring (never inserted)
  contact_quality: number; // 0..1 (verified email > name-only)
  source: "internal" | "apollo";
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function cleanDomain(value: unknown): string | null {
  const v = String(value ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  return v || null;
}

function isFreightCompany(name: string | null, industry: string | null): boolean {
  const hay = `${name ?? ""} ${industry ?? ""}`.toLowerCase();
  return FREIGHT_TYPE_MARKERS.some((m) => hay.includes(m));
}

/**
 * Opportunity score 0-100 = weighted sum of:
 *   ICP fit (freight target company)         — weight 25
 *   title seniority (owner/VP/head-of-sales) — weight 25
 *   freight relevance (shipment activity)    — weight 20
 *   company size (employees)                 — weight 15
 *   contact quality (verified email present) — weight 15
 * Weights are read from config.prospecting.scoreWeights when present (each key
 * optional), else the defaults above. Capped to [0,100].
 */
function opportunityScore(c: Candidate, config: AgentConfig): number {
  const w = ((config.prospecting as Record<string, unknown> | undefined)?.scoreWeights ?? {}) as Record<string, number>;
  const wIcp = Number.isFinite(w.icp) ? w.icp : 25;
  const wTitle = Number.isFinite(w.title) ? w.title : 25;
  const wFreight = Number.isFinite(w.freight) ? w.freight : 20;
  const wSize = Number.isFinite(w.size) ? w.size : 15;
  const wContact = Number.isFinite(w.contact) ? w.contact : 15;

  // ICP fit: is the employer a freight-sales target company?
  const icpFit = isFreightCompany(c.company_name, c.industry) ? 1 : 0.4;

  // Title seniority: map the title to a 0..1 seniority weight.
  const title = (c.title ?? "").toLowerCase();
  let titleFit = 0.3; // default when unknown/low
  if (/owner|founder|ceo|president|principal/.test(title)) titleFit = 1;
  else if (/(vp|vice president|chief|cro|coo)/.test(title)) titleFit = 0.9;
  else if (/head of sales|sales director|director of (sales|business)/.test(title)) titleFit = 0.8;
  else if (/business development|bd\b|sales manager|branch manager|commercial/.test(title)) titleFit = 0.65;
  else if (/sales|account/.test(title)) titleFit = 0.5;

  // Freight relevance: shipment activity on the recognized company.
  const shipments = c.shipments_12m;
  let freightRel = 0.4;
  if (typeof shipments === "number" && shipments > 0) {
    freightRel = Math.min(1, 0.5 + Math.log10(shipments + 1) / 4);
  } else if (isFreightCompany(c.company_name, c.industry)) {
    freightRel = 0.6;
  }

  // Company size: employees (bigger sales orgs = more seats).
  const emp = Number(c.employee_count);
  let sizeFit = 0.4;
  if (Number.isFinite(emp) && emp > 0) {
    sizeFit = Math.min(1, Math.log10(emp + 1) / 3); // ~1000 employees -> 1.0
  }

  // Contact quality: verified email beats a name-only record.
  const contactFit = Math.min(1, Math.max(0, c.contact_quality));

  const raw =
    wIcp * icpFit +
    wTitle * titleFit +
    wFreight * freightRel +
    wSize * sizeFit +
    wContact * contactFit;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Suppression check via the SECURITY DEFINER RPC. Any true => skip. */
async function isSuppressed(admin: SupabaseClient, email: string | null): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await admin.rpc("lit_email_suppression_status", { p_email: email });
  if (error) {
    // Fail SAFE for an autonomous sender's inventory: if we cannot confirm the
    // email is clean, do NOT create the lead.
    return true;
  }
  const row = (Array.isArray(data) ? data[0] : data) as SuppressionStatus | null;
  if (!row) return false;
  return Boolean(row.converted || row.bounced || row.complained || row.unsubscribed);
}

/**
 * Dedup check: is this candidate already a lead? Checks (in order) email,
 * apollo_organization_id, company_id, source_company_key, and canonical
 * company name. Returns true when a matching (non-deleted) lead already exists.
 */
async function isDuplicate(admin: SupabaseClient, c: Candidate): Promise<boolean> {
  // 1. Email (citext) — exact-clean match.
  if (c.email) {
    const { data } = await admin
      .from("lit_admin_leads")
      .select("id")
      .eq("email", c.email)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  // 2. Apollo org id (partial-unique).
  if (c.apollo_organization_id) {
    const { data } = await admin
      .from("lit_admin_leads")
      .select("id")
      .eq("apollo_organization_id", c.apollo_organization_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  // 3. company_id.
  if (c.company_id) {
    const { data } = await admin
      .from("lit_admin_leads")
      .select("id")
      .eq("company_id", c.company_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  // 4. source_company_key.
  if (c.source_company_key) {
    const { data } = await admin
      .from("lit_admin_leads")
      .select("id")
      .eq("source_company_key", c.source_company_key)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  // 5. Canonical company name (via the same SQL fn the create-from-company path uses).
  if (c.company_name) {
    const { data: canon } = await admin.rpc("lit_canonicalize_name", { raw: c.company_name });
    const cn = typeof canon === "string" ? canon : null;
    if (cn && cn.length >= 2) {
      // Compare against canonicalized company_name of existing non-deleted leads.
      const { data } = await admin
        .from("lit_admin_leads")
        .select("id, company_name")
        .is("deleted_at", null)
        .ilike("company_name", `%${c.company_name.slice(0, 24)}%`)
        .limit(25);
      for (const row of (data ?? []) as Array<{ company_name: string | null }>) {
        const { data: rc } = await admin.rpc("lit_canonicalize_name", {
          raw: row.company_name ?? "",
        });
        if (typeof rc === "string" && rc === cn) return true;
      }
    }
  }
  return false;
}

/** INTERNAL zero-credit sourcing via the membership-gated RPC (needs a member JWT). */
async function sourceInternalViaRpc(
  userClient: SupabaseClient,
  keyword: string,
  limit: number,
): Promise<InternalCompany[]> {
  const { data, error } = await userClient.rpc("lit_leadcrm_search_companies", {
    p_q: keyword,
    p_limit: limit,
  });
  if (error) return [];
  const env = (data ?? {}) as { ok?: boolean; companies?: unknown[] };
  const rows = Array.isArray(env.companies) ? env.companies : [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id : null,
      source_company_key: typeof o.source_company_key === "string" ? o.source_company_key : null,
      name: String(o.name ?? "").trim(),
      domain: cleanDomain(o.domain),
      city: (o.city as string) ?? null,
      state: (o.state as string) ?? null,
      country: (o.country as string) ?? null,
      industry: (o.industry as string) ?? null,
      origin: String(o.origin ?? "directory"),
      has_snapshot: o.has_snapshot === true,
      shipments_12m: null,
      employee_count: null,
    };
  });
}

/** INTERNAL zero-credit sourcing via direct service-role table reads (cron path, no user JWT). */
async function sourceInternalViaService(
  admin: SupabaseClient,
  keyword: string,
  limit: number,
): Promise<InternalCompany[]> {
  const like = `%${keyword}%`;
  const out: InternalCompany[] = [];
  const { data: companies } = await admin
    .from("lit_companies")
    .select("id, source_company_key, name, domain, website, city, state, country_code, industry, shipments_12m")
    .ilike("name", like)
    .order("shipments_12m", { ascending: false, nullsFirst: false })
    .limit(limit);
  for (const r of (companies ?? []) as Array<Record<string, unknown>>) {
    out.push({
      id: (r.id as string) ?? null,
      source_company_key: typeof r.source_company_key === "string"
        ? r.source_company_key.replace(/^company\//, "")
        : null,
      name: String(r.name ?? "").trim(),
      domain: cleanDomain(r.domain ?? r.website),
      city: (r.city as string) ?? null,
      state: (r.state as string) ?? null,
      country: (r.country_code as string) ?? null,
      industry: (r.industry as string) ?? null,
      origin: "companies",
      has_snapshot: Boolean(r.source_company_key),
      shipments_12m: typeof r.shipments_12m === "number" ? r.shipments_12m : null,
      employee_count: null,
    });
  }
  return out;
}

/** Server-to-server POST to another edge fn, forwarding a member JWT. */
async function callFn(
  path: string,
  bearer: string,
  anonKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const res = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearer}`,
      "apikey": anonKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body first so cron callers can pass trigger_type/created_by/target ─
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine for a bare cron tick
    body = {};
  }

  // ── auth: verified cron OR platform-admin lead-CRM member — else 401/403 ────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;
  // A forwardable member JWT + anon key — present ONLY on the admin/manual path.
  // The lead-crm-*/apollo-* functions require a real member JWT; cron cannot use
  // the Apollo path because a service-role bearer cannot authorize them.
  let memberJwt: string | null = null;
  let userClient: SupabaseClient | null = null;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook"
      ? requested
      : "cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing_supabase_env");
      return json({ ok: false, error: "server_misconfigured", request_id: rid }, 500);
    }
    admin = createClient(supabaseUrl, serviceKey);
  } else {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { isPlatformAdmin } = await isUserAdmin(auth.admin, auth.user.id);
    if (!isPlatformAdmin) {
      log.warn("forbidden_not_platform_admin", { user_id: auth.user.id });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    const { data: isMember, error: memberErr } = await auth.userClient.rpc("is_lead_crm_member", {
      p_user_id: auth.user.id,
    });
    if (memberErr || isMember !== true) {
      log.warn("forbidden_not_lead_crm_member", { user_id: auth.user.id, err: memberErr?.message });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    admin = auth.admin;
    userClient = auth.userClient;
    actorUserId = auth.user.id;
    // Capture the member JWT so we can forward it to the paid Apollo functions.
    const authHeader = req.headers.get("Authorization") ?? "";
    memberJwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "manual";
    triggerType = requested === "test" ? "test" : "manual";
  }

  const target = (body.target && typeof body.target === "object" ? body.target : {}) as Record<string, unknown>;
  const reqCount = Number(target.count);
  const reqKeywords = Array.isArray(target.keywords)
    ? target.keywords.map((k) => String(k ?? "").trim()).filter(Boolean)
    : [];
  const reqLocation = typeof target.location === "string" ? target.location.trim() : "";

  let runId: string | null = null;
  try {
    // ── gate 1: feature flag — fail CLOSED ──────────────────────────────────
    const flagEnabled = await isAgentFlagEnabled(admin, FLAG_KEY);
    if (!flagEnabled) {
      const reason = `feature flag '${FLAG_KEY}' missing or killed (fail-closed)`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_flag_disabled", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── gate 2: config exists AND enabled ───────────────────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      const reason = config
        ? "lit_agent_config['harvey'].enabled is false"
        : "lit_agent_config['harvey'] row missing (fail-closed)";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: config?.testMode === true,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_config_disabled", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    const testMode = config.testMode === true;

    // ── gate 3: quiet hours (manual/test exempt) ────────────────────────────
    if (triggerType !== "manual" && triggerType !== "test" && withinQuietHours(config)) {
      const qh = config.quietHours;
      const reason = `within quiet hours (${qh?.start}-${qh?.end} ${qh?.timezone})`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: testMode,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_quiet_hours", { run_id: runId, trigger_type: triggerType });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    const prospecting = (config.prospecting ?? {}) as Record<string, unknown>;
    const minimumScore = Number.isFinite(Number(prospecting.minimumScore)) ? Number(prospecting.minimumScore) : 70;
    const targetInventory = Number.isFinite(Number(prospecting.targetInventory)) ? Number(prospecting.targetInventory) : 100;
    const apolloDisabled = prospecting.apollo === false; // opt-out switch in config
    const targetCount = Number.isFinite(reqCount) && reqCount > 0 ? Math.min(reqCount, 50) : Math.min(targetInventory, 50);
    const keywords = reqKeywords.length ? reqKeywords : FREIGHT_KEYWORDS;
    const location = reqLocation || (typeof prospecting.location === "string" ? prospecting.location : "");

    // Resolve the New stage id (leads MUST be created at New).
    const { data: stages, error: stageErr } = await admin
      .from("lit_lead_pipeline_stages")
      .select("id, name");
    if (stageErr) throw new Error(`stage lookup failed: ${stageErr.message}`);
    const newStageId = (stages ?? []).find((s: { name: string }) => s.name === "New")?.id as string | undefined;
    if (!newStageId) throw new Error("New pipeline stage not found");

    // ── open the run before sourcing so an error still has a run id ──────────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: testMode,
      input_json: {
        request_id: rid,
        actor_user_id: actorUserId,
        target_count: targetCount,
        keywords,
        location,
      },
    });
    log.info("run_started", { run_id: runId, target_count: targetCount, test_mode: testMode });

    const candidates: Candidate[] = [];
    let apolloWouldHave = 0;

    // ── STEP 1: internal, zero-credit sourcing ──────────────────────────────
    const internalCompanies: InternalCompany[] = [];
    const perKw = Math.max(5, Math.ceil((targetCount * 2) / keywords.length));
    for (const kw of keywords) {
      const rows = userClient
        ? await sourceInternalViaRpc(userClient, kw, perKw)
        : await sourceInternalViaService(admin, kw, perKw);
      for (const r of rows) {
        if (!r.name) continue;
        if (!isFreightCompany(r.name, r.industry)) continue; // freight types only
        internalCompanies.push(r);
      }
    }
    // Dedup internal companies by canonical-ish key (name+domain) in-memory.
    const seenKeys = new Set<string>();
    for (const co of internalCompanies) {
      const key = `${(co.name || "").toLowerCase()}|${co.domain ?? ""}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      candidates.push({
        full_name: null, // company-first internal lead; person filled by enrich later
        title: null,
        email: null,
        company_name: co.name,
        company_id: co.id,
        source_company_key: co.source_company_key,
        company_domain: co.domain,
        company_city: co.city,
        company_state: co.state,
        company_country: co.country,
        apollo_organization_id: null,
        industry: co.industry,
        employee_count: co.employee_count,
        shipments_12m: co.shipments_12m,
        contact_quality: 0, // no person/email yet
        source: "internal",
      });
    }

    // ── STEP 2: Apollo (paid) — only when allowed AND a member JWT exists ────
    const apolloEligible = !testMode && !apolloDisabled && Boolean(memberJwt);
    if (!testMode && !apolloDisabled && !memberJwt) {
      log.info("apollo_skipped_no_member_jwt", { run_id: runId });
    }
    if (testMode) {
      log.info("apollo_skipped_test_mode", { run_id: runId });
    }
    if (apolloEligible && candidates.length < targetCount) {
      const jwt = memberJwt as string;
      // 2a. Find freight companies via Apollo.
      const find = await callFn("lead-crm-find-leads", jwt, anonKey, {
        keywords,
        location: location || undefined,
        page: 1,
        per_page: Math.min(50, Math.max(10, targetCount)),
      });
      const orgs: any[] = find.ok && Array.isArray(find.data?.companies) ? find.data.companies : [];
      for (const org of orgs) {
        if (candidates.length >= targetCount) break;
        if (org?.saved) continue; // already a lead
        const providerCompanyId = String(org?.id ?? "").trim();
        const companyName = String(org?.name ?? "").trim();
        if (!providerCompanyId || !companyName) continue;

        // 2b. Qualify — skip unless safe_to_enrich. (metered as harvey.qualify)
        const qual = await callFn("lead-crm-qualify-company", jwt, anonKey, {
          provider_company_id: providerCompanyId,
          company_name: companyName,
          domain: org?.domain ?? undefined,
          industry: org?.industry ?? undefined,
          location: [org?.city, org?.state, org?.country].filter(Boolean).join(", ") || undefined,
        });
        apolloWouldHave += 1;
        await recordProviderUsage(admin, {
          provider: PROVIDERS.APOLLO,
          operation: PROVIDER_OPERATIONS.QUALIFY,
          status: qual.ok ? "success" : "error",
          trigger_type: TRIGGER_TYPES.SYSTEM,
          source: "harvey",
          request_id: rid,
          metadata: { run_id: runId, provider_company_id: providerCompanyId, company_name: companyName },
        });
        const qres = qual.data?.qualification;
        const safeToEnrich = qres
          ? Boolean(qres.safe_to_enrich) ||
            (qres.status === "qualified" && Number(qres.confidence) >= 0.75)
          : false;
        if (!safeToEnrich) continue;

        // 2c. Contact search for freight-sales decision-makers.
        const search = await callFn("apollo-contact-search", jwt, anonKey, {
          company_id: org?.saved_company_id ?? undefined,
          domain: org?.domain ?? undefined,
          company_name: companyName,
          titles: APOLLO_TITLES,
          seniorities: APOLLO_SENIORITIES,
          email_statuses: APOLLO_EMAIL_STATUSES,
          per_page: 5,
        });
        await recordProviderUsage(admin, {
          provider: PROVIDERS.APOLLO,
          operation: PROVIDER_OPERATIONS.PROSPECT,
          status: search.ok ? "success" : "error",
          trigger_type: TRIGGER_TYPES.SYSTEM,
          source: "harvey",
          request_id: rid,
          metadata: { run_id: runId, stage: "contact_search", company_name: companyName },
        });
        const people: any[] = search.ok && Array.isArray(search.data?.contacts) ? search.data.contacts : [];
        const person = people[0];
        if (!person) continue;

        candidates.push({
          full_name: person.full_name ?? null,
          title: person.title ?? null,
          email: person.email ?? null, // may be locked/null until enriched
          company_name: companyName,
          company_id: org?.saved_company_id ?? null,
          source_company_key: null,
          company_domain: cleanDomain(org?.domain ?? person.organization_domain),
          company_city: org?.city ?? person.city ?? null,
          company_state: org?.state ?? person.state ?? null,
          company_country: org?.country ?? person.country_code ?? null,
          apollo_organization_id: providerCompanyId,
          industry: org?.industry ?? null,
          employee_count: Number.isFinite(Number(org?.employee_count)) ? Number(org.employee_count) : null,
          shipments_12m: null,
          contact_quality: person.email ? 1 : 0.5,
          source: "apollo",
        });
      }
    }

    // ── STEP 3: dedup + suppression + create ─────────────────────────────────
    const sourced = candidates.length;
    let created = 0;
    let skippedDupes = 0;
    let skippedSuppressed = 0;
    let skippedLowScore = 0;
    const createdLeads: Array<{
      id: string;
      full_name: string | null;
      company_name: string;
      title: string | null;
      email: string | null;
      lead_score: number;
    }> = [];
    const createdLeadIds: string[] = [];

    for (const c of candidates) {
      if (created >= targetCount) break;

      // Score first — respect minimumScore.
      const score = opportunityScore(c, config);
      if (score < minimumScore) {
        skippedLowScore += 1;
        continue;
      }
      // Suppression exclusion (never create a lead for a converted/suppressed email).
      if (await isSuppressed(admin, c.email)) {
        skippedSuppressed += 1;
        continue;
      }
      // Dedup.
      if (await isDuplicate(admin, c)) {
        skippedDupes += 1;
        continue;
      }

      // Service-role INSERT into lit_admin_leads. The insert trigger auto-logs a
      // 'created' activity row; we add an explicit 'prospected' note below.
      const { data: leadRow, error: insErr } = await admin
        .from("lit_admin_leads")
        .insert({
          email: c.email, // null for company-first internal leads
          full_name: c.full_name,
          company_name: c.company_name,
          primary_source: "harvey",
          status: "open",
          stage_id: newStageId,
          lead_score: score,
          company_id: c.company_id,
          source_company_key: c.source_company_key,
          company_domain: c.company_domain,
          company_city: c.company_city,
          company_state: c.company_state,
          company_country: c.company_country,
          apollo_organization_id: c.apollo_organization_id,
          first_seen_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) {
        // A unique-violation (email / apollo_org) means a concurrent dup — count it.
        if (String(insErr.message).toLowerCase().includes("duplicate") || (insErr as { code?: string }).code === "23505") {
          skippedDupes += 1;
          continue;
        }
        throw new Error(`lit_admin_leads insert failed: ${insErr.message}`);
      }
      const leadId = leadRow.id as string;

      // Explicit 'prospected' activity note (kind 'prospected', source 'system').
      await admin.from("lit_lead_activity").insert({
        lead_id: leadId,
        kind: "prospected",
        body: {
          agent: "harvey",
          run_id: runId,
          source: c.source,
          title: c.title,
          lead_score: score,
          apollo_organization_id: c.apollo_organization_id,
        },
        actor_user_id: actorUserId,
        source: "system",
      });

      created += 1;
      createdLeadIds.push(leadId);
      createdLeads.push({
        id: leadId,
        full_name: c.full_name,
        company_name: c.company_name,
        title: c.title,
        email: c.email,
        lead_score: score,
      });
    }

    const skipped = skippedDupes + skippedSuppressed + skippedLowScore;

    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "prospected",
      decision_reason: `Sourced ${sourced}, created ${created} Harvey lead(s)` +
        (testMode ? " (test mode — internal only, no paid Apollo spend)" : ""),
      output_json: {
        sourced,
        created,
        skipped_dupes: skippedDupes,
        skipped_suppressed: skippedSuppressed,
        skipped_low_score: skippedLowScore,
        test_mode: testMode,
        apollo_used: !testMode && !apolloDisabled && Boolean(memberJwt),
        apollo_would_have_qualified: testMode ? apolloWouldHave : undefined,
        lead_ids: createdLeadIds,
      },
    });
    log.info("run_ok", { run_id: runId, sourced, created, skipped, test_mode: testMode });

    return json({
      ok: true,
      run_id: runId,
      sourced,
      created,
      skipped,
      test_mode: testMode,
      leads: createdLeads,
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    try {
      if (runId) {
        await completeAgentRun(admin, runId, {
          status: "error",
          error_json: { message, request_id: rid },
        });
      } else {
        runId = await recordAgentRun(admin, {
          agent_name: AGENT_NAME,
          trigger_type: triggerType,
          status: "error",
          error_json: { message, request_id: rid },
          completed_at: new Date().toISOString(),
        });
      }
    } catch (auditErr) {
      log.error("run_audit_write_failed", { run_id: runId, err: String(auditErr) });
    }
    return json({ ok: false, error: "internal_error", run_id: runId, request_id: rid }, 500);
  }
});
