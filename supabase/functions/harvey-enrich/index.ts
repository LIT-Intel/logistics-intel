// harvey-enrich — Project Harvey LEAD-CRM ENRICHMENT engine.
//
// Many LEAD-CRM leads (lit_admin_leads) arrive with a name + company but no
// email, so Harvey cannot email them. This function finds workable 'New'-stage
// leads that lack an email, reveals one via Apollo people/match (the same direct
// path harvey-prospect uses — _shared/apollo.ts + APOLLO_API_KEY), and writes
// it back to the lead so harvey-sequence-tick can enroll + email them.
//
// It NEVER sends anything and NEVER invents an address: Apollo "locked" markers
// are normalized to null by the shared helper, so a lead only gets an email when
// Apollo actually revealed a real one. Weak identifiers are skipped BEFORE any
// Apollo call so credits are never wasted.
//
// Fail-CLOSED: flag 'harvey_internal_agent' + config.enabled gate the run, and
// the run is a no-op when APOLLO_API_KEY is unset. Auth mirrors harvey-nurture:
// verified pg_cron (X-Internal-Cron) OR authenticated platform admin.
//
// Input JSON: { trigger_type?, limit?, created_by? }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import { completeAgentRun, isAgentFlagEnabled, loadAgentConfig, recordAgentRun } from "../_shared/agent.ts";
import { apolloConfigured, apolloEnrichPerson } from "../_shared/apollo.ts";

const AGENT_NAME = "harvey-enrich";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";
const WORKABLE_STAGES = ["New"];
const DEFAULT_LIMIT = 25; // bound Apollo credit spend per run

type TriggerType = "cron" | "webhook" | "manual" | "test";

function splitName(full: string | null): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook" ? requested : "cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_misconfigured", request_id: rid }, 500);
    admin = createClient(supabaseUrl, serviceKey);
  } else {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { isPlatformAdmin } = await isUserAdmin(auth.admin, auth.user.id);
    if (!isPlatformAdmin) return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    admin = auth.admin;
    actorUserId = auth.user.id;
    triggerType = body.trigger_type === "test" ? "test" : "manual";
  }

  const limit = (() => {
    const raw = typeof body.limit === "number" ? body.limit : Number(body.limit);
    if (Number.isFinite(raw) && raw > 0) return Math.min(100, Math.floor(raw));
    return DEFAULT_LIMIT;
  })();

  let runId: string | null = null;
  try {
    // ── gates ──────────────────────────────────────────────────────────────
    if (!(await isAgentFlagEnabled(admin, FLAG_KEY))) {
      const reason = `feature flag '${FLAG_KEY}' missing or killed (fail-closed)`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "skipped",
        decision_reason: reason, completed_at: new Date().toISOString(),
      });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      const reason = config ? "lit_agent_config['harvey'].enabled is false" : "lit_agent_config['harvey'] row missing (fail-closed)";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "skipped",
        decision_reason: reason, completed_at: new Date().toISOString(),
      });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    if (!apolloConfigured()) {
      const reason = "APOLLO_API_KEY not configured — enrichment unavailable";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "skipped",
        decision_reason: reason, completed_at: new Date().toISOString(),
      });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME, trigger_type: triggerType, status: "running",
      input_json: { request_id: rid, actor_user_id: actorUserId, limit },
    });
    log.info("run_started", { run_id: runId, trigger_type: triggerType, limit });

    // ── candidate selection: New-stage, open, NO email, with a usable id ─────
    const { data: stageRows, error: stageErr } = await admin
      .from("lit_lead_pipeline_stages").select("id, name");
    if (stageErr) throw new Error(`stage map failed: ${stageErr.message}`);
    const stageIds = (stageRows ?? [])
      .filter((s: { name: string }) => WORKABLE_STAGES.includes(s.name))
      .map((s: { id: string }) => s.id);

    let enriched = 0, no_match = 0, skipped_weak = 0, considered = 0;
    if (stageIds.length) {
      const { data: leadRows, error: leadErr } = await admin
        .from("lit_admin_leads")
        .select("id, full_name, company_name, company_domain, title, email, linkedin_url, apollo_organization_id")
        .in("stage_id", stageIds)
        .eq("status", "open")
        .is("archived_at", null)
        .is("deleted_at", null)
        .or("email.is.null,email.eq.")
        .order("lead_score", { ascending: false, nullsFirst: false })
        .limit(limit * 3);
      if (leadErr) throw new Error(`enrich candidates failed: ${leadErr.message}`);

      for (const lead of (leadRows ?? []) as Array<Record<string, unknown>>) {
        if (enriched >= limit) break;
        const emailVal = typeof lead.email === "string" ? lead.email.trim() : "";
        if (emailVal) continue; // already has one
        considered += 1;

        const { first, last } = splitName(lead.full_name as string | null);
        const domain = (lead.company_domain as string | null) || null;
        const orgName = (lead.company_name as string | null) || null;
        const linkedin = (lead.linkedin_url as string | null) || null;

        // Need a strong-enough identifier (helper refuses weak ones anyway).
        const hasStrongId = Boolean(linkedin || (first && last && (domain || orgName)));
        if (!hasStrongId) { skipped_weak += 1; continue; }

        const result = await apolloEnrichPerson({
          first_name: first, last_name: last, domain, organization_name: orgName, linkedin_url: linkedin,
        });
        if (!result || !result.email) { no_match += 1; continue; }

        const patch: Record<string, unknown> = { email: result.email, updated_at: new Date().toISOString() };
        if (!linkedin && result.linkedin_url) patch.linkedin_url = result.linkedin_url;
        if (!lead.title && result.title) patch.title = result.title;
        if (!lead.company_domain && result.organization_domain) patch.company_domain = result.organization_domain;
        if (result.phone && !lead.phone) patch.phone = result.phone;

        const { error: updErr } = await admin.from("lit_admin_leads").update(patch).eq("id", lead.id as string);
        if (updErr) { log.warn("enrich_update_failed", { run_id: runId, lead_id: lead.id, err: updErr.message }); continue; }
        enriched += 1;
      }
    }

    await completeAgentRun(admin, runId, {
      status: "ok", decision: "enriched",
      decision_reason: `Enriched ${enriched} lead(s) (considered ${considered}, no-match ${no_match}, weak-id ${skipped_weak})`,
      output_json: { enriched, considered, no_match, skipped_weak },
    });
    log.info("run_ok", { run_id: runId, enriched, considered, no_match, skipped_weak });
    return json({ ok: true, run_id: runId, enriched, considered, no_match, skipped_weak });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message });
    try {
      if (runId) await completeAgentRun(admin, runId, { status: "error", error_json: { message, request_id: rid } });
      else runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "error",
        error_json: { message, request_id: rid }, completed_at: new Date().toISOString(),
      });
    } catch (_e) { /* noop */ }
    return json({ ok: false, error: "internal_error", run_id: runId, request_id: rid }, 500);
  }
});
