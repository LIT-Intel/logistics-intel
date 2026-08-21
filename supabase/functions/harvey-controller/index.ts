// harvey-controller — Project Harvey Batch 2 (FOUNDATION).
//
// The deterministic heartbeat/decision function for the internal-only Harvey
// sales agent. NO LLM anywhere in this function: it probes real pipeline
// state, picks exactly one highest-priority action, and (in Batch 2) only
// RECORDS the decision to lit_agent_runs. No outreach is sent, no CRM rows
// are written. Later batches add worker execution behind the same gates.
//
// INTERNAL-ONLY boundary (customers can never invoke this):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron header ==
//     LIT_CRON_SECRET via _shared/cron_auth.ts — no cron job exists yet in
//     Batch 2; shipped in a later batch after manual verification)
//   - OR an authenticated PLATFORM ADMIN who is also a lead-CRM member
//     (requireUser + isUserAdmin().isPlatformAdmin + is_lead_crm_member RPC).
//   Everyone else gets 403.
//
// Gate order (fail CLOSED — see _shared/agent.ts):
//   1. lit_feature_flags['harvey_internal_agent'] must EXIST with
//      global_kill=false. Missing row = OFF. (Deliberately NOT the fail-open
//      lit_provider_flag() RPC.)
//   2. lit_agent_config['harvey'].enabled must be true.
//   3. Quiet hours (config.quietHours, America/New_York 19:00→08:00) skip the
//      run unless trigger_type is 'manual' or 'test'.
//   Any gate failure records a 'skipped' lit_agent_runs row and returns
//   200 { skipped: true, reason }.
//
// Decision priority (highest first — from HARVEY_REFERENCE_REVIEW.md:
// "replies always outrank new outreach"):
//   1 compliance_escalation      (stub — Batch 4 reply classifier)
//   2 handle_urgent_replies      (real — unread inbound on Harvey's mailbox)
//   3 handle_meeting_requests    (stub — Batch 4 intent classification)
//   4 awaiting_human_approval    (real — Harvey-marked pending LinkedIn actions)
//   5 send_due_outreach          (real — due recipients on Harvey campaigns)
//   6 research_leads             (real — New-stage leads without company recognition)
//   7 message_qualified_leads    (real — New-stage leads at/above minimumScore)
//   8 campaign_followups         (real — active Harvey campaigns)
//   9 prospect                   (real — Harvey-sourced inventory below target)
//  10 analyze                    (fallback)
//
// Harvey has no sender identity yet (harvey@logisticintel.com is not a
// connected lit_email_accounts row, and no rows carry the harvey scope
// markers), so probes 2/4/5/8 legitimately return 0 today and the decision
// falls through to research/messaging/prospect/analyze. That is expected.
//
// Response: { ok, run_id, decision, decision_reason, counts, test_mode }.

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

const AGENT_NAME = "harvey-controller";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";

type TriggerType = "cron" | "webhook" | "manual" | "test";

interface ProbeCounts {
  compliance_escalations: number;
  urgent_replies: number;
  meeting_requests: number;
  awaiting_approval: number;
  due_outreach: number;
  leads_needing_research: number;
  qualified_leads_needing_messaging: number;
  active_harvey_campaigns: number;
  harvey_prospect_inventory: number;
  prospect_inventory_target: number;
}

// ─── probes (deterministic; each throws on query error so a broken probe
//     surfaces as an 'error' run instead of a silently-wrong decision) ────────

async function countRows(
  q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  probe: string,
): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(`probe ${probe} failed: ${error.message}`);
  return count ?? 0;
}

/** Probe 1: compliance/opt-out/legal escalations awaiting handling. */
function probeComplianceEscalations(): number {
  // BATCH-4: the reply classifier (harvey-handler) will hard-flag opt-out /
  // legal / hostile inbound (OPT_OUT_PATTERNS + ESCALATION_PATTERNS) and park
  // them for a human. No classifier output store exists yet — always 0.
  return 0;
}

/** Probe 2: unread inbound messages on Harvey's connected mailbox. REAL. */
async function probeUrgentReplies(admin: SupabaseClient, config: AgentConfig): Promise<number> {
  const senderEmail = config.sender?.emailAccount ?? null;
  if (!senderEmail) return 0;
  // Harvey's mailbox is a normal lit_email_accounts row (created by the owner
  // via oauth-gmail-start — a blocking owner action, see architecture doc §5.1).
  const { data: accounts, error } = await admin
    .from("lit_email_accounts")
    .select("id")
    .eq("email", senderEmail);
  if (error) throw new Error(`probe urgent_replies (accounts) failed: ${error.message}`);
  const ids = (accounts ?? []).map((a: { id: string }) => a.id);
  if (ids.length === 0) return 0; // sender not connected yet — legitimately 0
  return await countRows(
    admin
      .from("lit_email_messages")
      .select("id", { count: "exact", head: true })
      .in("email_account_id", ids)
      .eq("direction", "inbound")
      .eq("is_unread", true),
    "urgent_replies",
  );
}

/** Probe 3: inbound replies asking for a meeting. */
function probeMeetingRequests(): number {
  // BATCH-4: needs LLM intent classification over lit_email_messages
  // (intent='meeting'); no intent column / classification table exists yet.
  return 0;
}

/** Probe 4: Harvey-drafted LinkedIn actions parked for human approval. REAL. */
async function probeAwaitingApproval(admin: SupabaseClient): Promise<number> {
  // Harvey marks its rows with metadata.internal_agent='harvey'
  // (lit_linkedin_outreach_actions.metadata jsonb). No rows carry the marker
  // yet (Harvey drafts nothing before Batch 5) — legitimately 0.
  return await countRows(
    admin
      .from("lit_linkedin_outreach_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval")
      .eq("metadata->>internal_agent", "harvey"),
    "awaiting_approval",
  );
}

/** Resolve Harvey-scoped campaign ids (metrics.internal_agent='harvey'). */
async function harveyCampaignIds(admin: SupabaseClient): Promise<string[]> {
  // lit_campaigns has no metadata column — the jsonb column is `metrics`
  // (20260115001224). The architecture doc's scope marker lives there.
  const { data, error } = await admin
    .from("lit_campaigns")
    .select("id, status")
    .eq("metrics->>internal_agent", "harvey");
  if (error) throw new Error(`probe harvey_campaigns failed: ${error.message}`);
  return (data ?? []).map((c: { id: string }) => c.id);
}

/** Probe 5: due recipients on Harvey campaigns. REAL (0 until Batch 5). */
async function probeDueOutreach(admin: SupabaseClient, campaignIds: string[]): Promise<number> {
  if (campaignIds.length === 0) return 0;
  return await countRows(
    admin
      .from("lit_campaign_contacts")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .in("status", ["pending", "queued"])
      .lte("next_send_at", new Date().toISOString()),
    "due_outreach",
  );
}

/** Fetch the pipeline stage name→id map (6 global stages). */
async function stageIdsByName(admin: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("lit_lead_pipeline_stages")
    .select("id, name");
  if (error) throw new Error(`probe stages failed: ${error.message}`);
  const map: Record<string, string> = {};
  for (const s of data ?? []) map[(s as { name: string }).name] = (s as { id: string }).id;
  return map;
}

/** Probe 6: New-stage open leads lacking company recognition. REAL. */
async function probeLeadsNeedingResearch(
  admin: SupabaseClient,
  newStageId: string | undefined,
): Promise<number> {
  if (!newStageId) return 0;
  return await countRows(
    admin
      .from("lit_admin_leads")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", newStageId)
      .eq("status", "open")
      .is("archived_at", null)
      .is("deleted_at", null)
      .is("company_id", null),
    "leads_needing_research",
  );
}

/** Probe 7: New-stage open leads scored at/above minimumScore. REAL. */
async function probeQualifiedLeads(
  admin: SupabaseClient,
  newStageId: string | undefined,
  minimumScore: number,
): Promise<number> {
  if (!newStageId) return 0;
  return await countRows(
    admin
      .from("lit_admin_leads")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", newStageId)
      .eq("status", "open")
      .is("archived_at", null)
      .is("deleted_at", null)
      .gte("lead_score", minimumScore),
    "qualified_leads_needing_messaging",
  );
}

/** Probe 8: active Harvey campaigns needing follow-up management. REAL. */
async function probeActiveHarveyCampaigns(admin: SupabaseClient): Promise<number> {
  return await countRows(
    admin
      .from("lit_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("metrics->>internal_agent", "harvey")
      .eq("status", "active"),
    "active_harvey_campaigns",
  );
}

/** Probe 9: Harvey-sourced open-lead inventory (primary_source='harvey'). REAL. */
async function probeHarveyInventory(admin: SupabaseClient): Promise<number> {
  return await countRows(
    admin
      .from("lit_admin_leads")
      .select("id", { count: "exact", head: true })
      .eq("primary_source", "harvey")
      .eq("status", "open")
      .is("archived_at", null)
      .is("deleted_at", null),
    "harvey_prospect_inventory",
  );
}

// ─── deterministic decision (NO LLM) ─────────────────────────────────────────

function decide(counts: ProbeCounts): { priority: number; decision: string; reason: string } {
  if (counts.compliance_escalations > 0) {
    return {
      priority: 1,
      decision: "compliance_escalation",
      reason: `${counts.compliance_escalations} compliance escalation(s) require immediate handling`,
    };
  }
  if (counts.urgent_replies > 0) {
    return {
      priority: 2,
      decision: "handle_urgent_replies",
      reason: `${counts.urgent_replies} unread inbound message(s) on Harvey's mailbox`,
    };
  }
  if (counts.meeting_requests > 0) {
    return {
      priority: 3,
      decision: "handle_meeting_requests",
      reason: `${counts.meeting_requests} inbound meeting request(s) pending`,
    };
  }
  if (counts.awaiting_approval > 0) {
    return {
      priority: 4,
      decision: "awaiting_human_approval",
      reason: `${counts.awaiting_approval} Harvey action(s) parked at pending_approval`,
    };
  }
  if (counts.due_outreach > 0) {
    return {
      priority: 5,
      decision: "send_due_outreach",
      reason: `${counts.due_outreach} due recipient(s) on Harvey campaigns`,
    };
  }
  if (counts.leads_needing_research > 0) {
    return {
      priority: 6,
      decision: "research_leads",
      reason: `${counts.leads_needing_research} New-stage lead(s) without company recognition`,
    };
  }
  if (counts.qualified_leads_needing_messaging > 0) {
    return {
      priority: 7,
      decision: "message_qualified_leads",
      reason: `${counts.qualified_leads_needing_messaging} qualified New-stage lead(s) awaiting messaging`,
    };
  }
  if (counts.active_harvey_campaigns > 0) {
    return {
      priority: 8,
      decision: "campaign_followups",
      reason: `${counts.active_harvey_campaigns} active Harvey campaign(s) to manage`,
    };
  }
  if (counts.harvey_prospect_inventory < counts.prospect_inventory_target) {
    return {
      priority: 9,
      decision: "prospect",
      reason:
        `Harvey-sourced inventory ${counts.harvey_prospect_inventory} below target ` +
        `${counts.prospect_inventory_target}`,
    };
  }
  return { priority: 10, decision: "analyze", reason: "no higher-priority work; analyze pipeline" };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── auth: verified cron OR platform-admin lead-CRM member — else 403 ──────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    triggerType = "cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing_supabase_env");
      return json({ ok: false, error: "server_misconfigured" }, 500);
    }
    admin = createClient(supabaseUrl, serviceKey);
  } else {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { isPlatformAdmin } = await isUserAdmin(auth.admin, auth.user.id);
    if (!isPlatformAdmin) {
      log.warn("forbidden_not_platform_admin", { user_id: auth.user.id });
      return json({ ok: false, error: "forbidden" }, 403);
    }
    // Belt-and-braces: also require lead-CRM membership via the SECURITY
    // DEFINER helper (checked through the user-scoped client — the RPC is
    // granted to `authenticated`). Platform admins are implicit members, so
    // this is defense in depth, not a second door.
    const { data: isMember, error: memberErr } = await auth.userClient.rpc(
      "is_lead_crm_member",
      { p_user_id: auth.user.id },
    );
    if (memberErr || isMember !== true) {
      log.warn("forbidden_not_lead_crm_member", { user_id: auth.user.id, err: memberErr?.message });
      return json({ ok: false, error: "forbidden" }, 403);
    }
    actorUserId = auth.user.id;
    admin = auth.admin;
    // Manual invocations may declare themselves test runs.
    let requestedTrigger: unknown = null;
    try {
      const body = await req.json();
      requestedTrigger = body?.trigger_type ?? null;
    } catch (_err) {
      // empty body is fine
    }
    triggerType = requestedTrigger === "test" ? "test" : "manual";
  }

  let runId: string | null = null;
  try {
    // ── gate 1: feature flag — fail CLOSED (missing row = OFF) ──────────────
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

    // ── gate 2: agent config must exist AND be enabled ──────────────────────
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

    // ── gate 3: quiet hours (manual/test invocations are exempt) ────────────
    if (triggerType !== "manual" && triggerType !== "test" && withinQuietHours(config)) {
      const qh = config.quietHours;
      const reason = `within quiet hours (${qh?.start}–${qh?.end} ${qh?.timezone})`;
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

    // ── open the run before probing so an error still has a run id ──────────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: testMode,
      input_json: { request_id: rid, actor_user_id: actorUserId },
    });
    log.info("run_started", { run_id: runId, trigger_type: triggerType, test_mode: testMode });

    // ── probes (independent lookups first, then dependent counts) ───────────
    const [stages, campaignIds] = await Promise.all([
      stageIdsByName(admin),
      harveyCampaignIds(admin),
    ]);
    const newStageId = stages["New"];
    const minimumScore = config.prospecting?.minimumScore ?? 70;
    const targetInventory = config.prospecting?.targetInventory ?? 100;

    const [
      urgentReplies,
      awaitingApproval,
      dueOutreach,
      leadsNeedingResearch,
      qualifiedLeads,
      activeHarveyCampaigns,
      harveyInventory,
    ] = await Promise.all([
      probeUrgentReplies(admin, config),
      probeAwaitingApproval(admin),
      probeDueOutreach(admin, campaignIds),
      probeLeadsNeedingResearch(admin, newStageId),
      probeQualifiedLeads(admin, newStageId, minimumScore),
      probeActiveHarveyCampaigns(admin),
      probeHarveyInventory(admin),
    ]);

    const counts: ProbeCounts = {
      compliance_escalations: probeComplianceEscalations(),
      urgent_replies: urgentReplies,
      meeting_requests: probeMeetingRequests(),
      awaiting_approval: awaitingApproval,
      due_outreach: dueOutreach,
      leads_needing_research: leadsNeedingResearch,
      qualified_leads_needing_messaging: qualifiedLeads,
      active_harvey_campaigns: activeHarveyCampaigns,
      harvey_prospect_inventory: harveyInventory,
      prospect_inventory_target: targetInventory,
    };

    // ── decide (deterministic) + record. Batch 2 execution = record ONLY. ───
    const { priority, decision, reason } = decide(counts);
    await completeAgentRun(admin, runId, {
      status: "ok",
      priority,
      decision,
      decision_reason: reason,
      output_json: {
        counts,
        minimum_score: minimumScore,
        // BATCH-3+: worker dispatch happens here. Batch 2 records only.
        executed: false,
      },
    });
    log.info("run_ok", { run_id: runId, decision, priority, trigger_type: triggerType });

    return json({
      ok: true,
      run_id: runId,
      decision,
      decision_reason: reason,
      counts,
      test_mode: testMode,
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    // Best-effort: make sure the failure is on the audit log with a run id.
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
