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
//   1 handle_urgent_replies      (real — Batch 8 — UNPROCESSED inbound replies on
//                                 Harvey's mailbox → harvey-reply. Outranks
//                                 EVERYTHING: a prospect who replied must never
//                                 get a canned follow-up. harvey-reply hard-guards
//                                 + classifies + drafts for approval; never sends.)
//   2 compliance_escalation      (stub — no separate store; harvey-reply hard-guards
//                                 opt-out/legal inline)
//   3 handle_meeting_requests    (stub — Batch 4 intent classification)
//   4 awaiting_human_approval    (real — Harvey-marked pending LinkedIn actions)
//   5 nurture_trials             (real — not-upgraded trial users needing a
//                                 lifecycle nurture touch → harvey-nurture.
//                                 Harvey OWNS trial nurture; this outranks all
//                                 cold prospecting/outreach.)
//   6 send_due_outreach          (real — due recipients on Harvey campaigns)
//   6 dispatch_email             (real — approved, unsent Harvey email drafts →
//                                 harvey-email-dispatch. Batch 6. Same fail-closed
//                                 gates; sends nothing while enabled=false/dryRun=true)
//   6 research_leads             (real — New-stage leads without company recognition)
//   7 message_qualified_leads    (real — New-stage leads at/above minimumScore)
//   8 draft_outreach            (real — researched leads with a brief but no draft
//                                 yet; autonomous Harvey generates the first-touch)
//   9 campaign_followups         (real — active Harvey campaigns)
//  10 prospect                   (real — Harvey-sourced inventory below target)
//  11 analyze                    (fallback)
//
// EXECUTION: the controller now ACTS on several branches (behind the same gates,
// respecting mode/testMode/quiet-hours). It invokes the sibling worker fns
// server-to-server (X-Internal-Cron: LIT_CRON_SECRET) exactly like ai-employee-
// console's run_now proxies the controller:
//   - handle_urgent_replies → harvey-reply (read inbound replies, hard-guard
//                       opt-out/legal/OOO, classify intent, advance the lead,
//                       draft a reply for approval; NEVER sends — Batch 8)
//   - nurture_trials  → harvey-nurture (draft trial-lifecycle nurtures for
//                       not-upgraded users; drafts only, never sends)
//   - prospect        → harvey-prospect (source up to the shortfall)
//   - research_leads  → harvey-research per lead (small batch)
//   - draft_outreach  → harvey-writer per researched lead (autonomous only)
//   - dispatch_email  → harvey-email-dispatch (send approved, unsent email drafts;
//                       Batch 6 — the worker re-checks every gate + dryRun itself)
// A failing sub-call is caught, recorded in output_json, and the controller run
// still completes 'ok' — one bad worker call must not crash the heartbeat.
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
  nurture_candidates: number;
  due_outreach: number;
  approved_email_drafts: number;
  leads_needing_research: number;
  qualified_leads_needing_messaging: number;
  leads_researched_needing_draft: number;
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

/**
 * Probe 2 (Batch 8): UNPROCESSED inbound replies on Harvey's mailbox. REAL.
 *
 * "Handling replies outranks everything" — a prospect who replied must never get
 * a canned follow-up. This counts inbound messages on Harvey's connected mailbox
 * that harvey-reply has NOT yet ledgered (lit_agent_inbound, channel='email').
 * It is a BOUNDED scan (we only need "is there work"): fetch a capped window of
 * inbound message row-ids, subtract the ones already in the inbound ledger.
 *
 * The exact reply-vs-noise correlation (which of these are actually replies to
 * Harvey's outreach) is done authoritatively inside harvey-reply; the controller
 * only needs a cheap "is there unprocessed inbound" signal to route to it.
 */
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

  // Bounded window of the most-recent inbound message row ids.
  const SCAN = 200;
  const { data: inbound, error: inErr } = await admin
    .from("lit_email_messages")
    .select("id")
    .in("email_account_id", ids)
    .eq("direction", "inbound")
    .order("message_date", { ascending: false })
    .limit(SCAN);
  if (inErr) throw new Error(`probe urgent_replies (inbound) failed: ${inErr.message}`);
  const rowIds = (inbound ?? []).map((r: { id: string }) => r.id as string);
  if (rowIds.length === 0) return 0;

  // Subtract inbound already ledgered by harvey-reply (processed once).
  const { data: ledgered, error: ledErr } = await admin
    .from("lit_agent_inbound")
    .select("source_row_id")
    .eq("channel", "email")
    .in("source_row_id", rowIds);
  if (ledErr) throw new Error(`probe urgent_replies (ledger) failed: ${ledErr.message}`);
  const handled = new Set(
    (ledgered ?? [])
      .map((r: { source_row_id: string | null }) => r.source_row_id)
      .filter((id): id is string => typeof id === "string"),
  );
  return rowIds.filter((id) => !handled.has(id)).length;
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

/**
 * Probe (nurture): not-upgraded lifecycle users who still need a trial-nurture
 * touch — i.e. rows in lit_lifecycle_user_stages that do NOT yet have a
 * current-stage 'lifecycle' send AND do NOT already have a pending nurture
 * draft (metadata_json.lifecycle for that user+stage). Harvey OWNS the trial
 * nurture (lit_internal_meta['harvey_owns_trial_nurture']='true'). REAL.
 *
 * This is a bounded count for the decision; harvey-nurture re-selects + caps
 * its own batch. Fails SAFE-ish: on any query error it returns 0 so a broken
 * probe never fabricates work (the outer decide() just falls through).
 */
async function probeNurtureCandidates(admin: SupabaseClient): Promise<number> {
  // Bound the scan — we only need to know "is there work" and roughly how much.
  const SCAN = 500;
  const { data: rows, error } = await admin
    .from("lit_lifecycle_user_stages")
    .select("user_id, stage")
    .limit(SCAN);
  if (error) throw new Error(`probe nurture_candidates (view) failed: ${error.message}`);
  const candidates = (rows ?? []) as Array<{ user_id: string; stage: string | null }>;
  if (candidates.length === 0) return 0;

  const userIds = Array.from(new Set(candidates.map((c) => c.user_id).filter(Boolean)));
  if (userIds.length === 0) return 0;

  // Already-sent (user_id, stage) under campaign='lifecycle'.
  const sentKeys = new Set<string>();
  const { data: sends, error: sendsErr } = await admin
    .from("lit_lifecycle_sends")
    .select("user_id, stage, campaign")
    .in("user_id", userIds)
    .eq("campaign", "lifecycle");
  if (sendsErr) throw new Error(`probe nurture_candidates (sends) failed: ${sendsErr.message}`);
  for (const s of sends ?? []) {
    const row = s as { user_id: string; stage: string | null };
    sentKeys.add(`${row.user_id}|${row.stage ?? ""}`);
  }

  // Pending nurture drafts (harvey, stage='trial') tagged with lifecycle meta.
  const pendingKeys = new Set<string>();
  const { data: drafts, error: draftErr } = await admin
    .from("lit_agent_drafts")
    .select("status, metadata_json")
    .eq("agent_name", CONFIG_KEY)
    .eq("stage", "trial")
    .in("status", ["pending_approval", "approved", "draft"])
    .limit(1000);
  if (draftErr) throw new Error(`probe nurture_candidates (drafts) failed: ${draftErr.message}`);
  for (const d of drafts ?? []) {
    const meta = (d as { metadata_json?: Record<string, unknown> | null }).metadata_json ?? null;
    const lc = meta && typeof meta === "object" ? (meta as Record<string, unknown>).lifecycle : null;
    if (lc && typeof lc === "object") {
      const uid = (lc as Record<string, unknown>).user_id;
      const st = (lc as Record<string, unknown>).stage;
      if (typeof uid === "string") pendingKeys.add(`${uid}|${typeof st === "string" ? st : ""}`);
    }
  }

  const seen = new Set<string>();
  let eligible = 0;
  for (const c of candidates) {
    if (!c.user_id || seen.has(c.user_id)) continue;
    const key = `${c.user_id}|${c.stage ?? ""}`;
    if (sentKeys.has(key) || pendingKeys.has(key)) continue;
    seen.add(c.user_id);
    eligible++;
  }
  return eligible;
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

/**
 * Probe 5b: APPROVED, unsent Harvey email drafts awaiting dispatch. REAL.
 * These are lit_agent_drafts (channel='email', status='approved') that have NOT
 * yet been recorded in lit_agent_send_log — i.e. the harvey-email-dispatch
 * worker has real work to do. 0 until Harvey has approved email drafts.
 */
async function probeApprovedEmailDrafts(admin: SupabaseClient): Promise<number> {
  const { data: drafts, error } = await admin
    .from("lit_agent_drafts")
    .select("id")
    .eq("agent_name", CONFIG_KEY)
    .eq("channel", "email")
    .eq("status", "approved")
    .limit(500);
  if (error) throw new Error(`probe approved_email_drafts (drafts) failed: ${error.message}`);
  const draftIds = (drafts ?? []).map((d: { id: string }) => d.id as string);
  if (draftIds.length === 0) return 0;

  // Exclude drafts already dispatched (present in the send log).
  const { data: logged, error: logErr } = await admin
    .from("lit_agent_send_log")
    .select("draft_id")
    .in("draft_id", draftIds);
  if (logErr) throw new Error(`probe approved_email_drafts (send_log) failed: ${logErr.message}`);
  const handled = new Set(
    (logged ?? [])
      .map((r: { draft_id: string | null }) => r.draft_id)
      .filter((id): id is string => typeof id === "string"),
  );
  return draftIds.filter((id) => !handled.has(id)).length;
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

/**
 * Harvey's New-stage open leads that have NO lit_agent_lead_research row yet.
 * Returns their ids (capped). Used by both the research probe/execution.
 */
async function harveyLeadsNeedingResearch(
  admin: SupabaseClient,
  newStageId: string | undefined,
  cap: number,
): Promise<string[]> {
  if (!newStageId) return [];
  const { data: leads, error } = await admin
    .from("lit_admin_leads")
    .select("id")
    .eq("primary_source", "harvey")
    .eq("stage_id", newStageId)
    .eq("status", "open")
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(cap * 4, cap)); // over-fetch; we filter out already-researched
  if (error) throw new Error(`harveyLeadsNeedingResearch (leads) failed: ${error.message}`);
  const ids = (leads ?? []).map((l: { id: string }) => l.id as string);
  if (ids.length === 0) return [];

  const { data: researched, error: rErr } = await admin
    .from("lit_agent_lead_research")
    .select("lead_id")
    .in("lead_id", ids);
  if (rErr) throw new Error(`harveyLeadsNeedingResearch (research) failed: ${rErr.message}`);
  const done = new Set((researched ?? []).map((r: { lead_id: string }) => r.lead_id));
  return ids.filter((id) => !done.has(id)).slice(0, cap);
}

/**
 * Harvey's leads that HAVE a research brief but NO lit_agent_drafts row yet.
 * Returns { lead_id, brief } pairs (capped) so the writer can be handed the
 * recommended channel / research facts.
 */
interface LeadBrief {
  lead_id: string;
  brief: Record<string, unknown> | null;
}

async function harveyResearchedLeadsNeedingDraft(
  admin: SupabaseClient,
  cap: number,
): Promise<LeadBrief[]> {
  // Restrict to Harvey's own leads so we never draft for someone else's rows.
  const { data: leads, error: lErr } = await admin
    .from("lit_admin_leads")
    .select("id")
    .eq("primary_source", "harvey")
    .eq("status", "open")
    .is("archived_at", null)
    .is("deleted_at", null);
  if (lErr) throw new Error(`harveyResearchedLeadsNeedingDraft (leads) failed: ${lErr.message}`);
  const harveyLeadIds = new Set((leads ?? []).map((l: { id: string }) => l.id as string));
  if (harveyLeadIds.size === 0) return [];

  const { data: research, error: rErr } = await admin
    .from("lit_agent_lead_research")
    .select("lead_id, brief")
    .in("lead_id", Array.from(harveyLeadIds))
    .order("created_at", { ascending: true });
  if (rErr) throw new Error(`harveyResearchedLeadsNeedingDraft (research) failed: ${rErr.message}`);
  const researchedIds = (research ?? []).map((r: { lead_id: string }) => r.lead_id);
  if (researchedIds.length === 0) return [];

  const { data: drafts, error: dErr } = await admin
    .from("lit_agent_drafts")
    .select("lead_id")
    .in("lead_id", researchedIds);
  if (dErr) throw new Error(`harveyResearchedLeadsNeedingDraft (drafts) failed: ${dErr.message}`);
  const drafted = new Set(
    (drafts ?? [])
      .map((d: { lead_id: string | null }) => d.lead_id)
      .filter((id): id is string => typeof id === "string"),
  );

  const out: LeadBrief[] = [];
  for (const r of research ?? []) {
    const row = r as { lead_id: string; brief: Record<string, unknown> | null };
    if (drafted.has(row.lead_id)) continue;
    out.push({ lead_id: row.lead_id, brief: row.brief ?? null });
    if (out.length >= cap) break;
  }
  return out;
}

/** Probe: Harvey's researched leads (brief present) still lacking a draft. REAL. */
async function probeLeadsResearchedNeedingDraft(admin: SupabaseClient): Promise<number> {
  // A count is enough for the decision; execution re-fetches the capped batch.
  const pending = await harveyResearchedLeadsNeedingDraft(admin, 1000);
  return pending.length;
}

// ─── server-to-server worker invocation (X-Internal-Cron) ────────────────────

/**
 * Invoke a sibling Harvey worker fn exactly like ai-employee-console's run_now
 * proxies the controller: POST to ${SUPABASE_URL}/functions/v1/<fn> with the
 * X-Internal-Cron: LIT_CRON_SECRET header. Returns a normalized result; NEVER
 * throws (a failing worker call must not crash the controller heartbeat).
 */
async function invokeWorker(
  fn: string,
  bodyObj: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) return { ok: false, error: "SUPABASE_URL not configured" };
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/${fn}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // Gateway needs a valid apikey/JWT to route the internal call before the
        // target fn's X-Internal-Cron check runs; the target checks cron first.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify(bodyObj),
    });
    if (res.status === 404) return { ok: false, status: 404, error: `${fn} not deployed` };
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok || (data && (data as Record<string, unknown>).ok === false)) {
      const errMsg = (data && typeof (data as Record<string, unknown>).error === "string")
        ? String((data as Record<string, unknown>).error)
        : `${fn} HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: errMsg };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: `${fn} unreachable: ${String((err as Error)?.message ?? err)}` };
  }
}

// ─── deterministic decision (NO LLM) ─────────────────────────────────────────

function decide(counts: ProbeCounts): { priority: number; decision: string; reason: string } {
  // Batch 8: handling REPLIES outranks EVERYTHING. A prospect who replied must
  // never get a canned follow-up — route to harvey-reply before any compliance
  // stub, outreach, nurture, or prospecting decision.
  if (counts.urgent_replies > 0) {
    return {
      priority: 1,
      decision: "handle_urgent_replies",
      reason: `${counts.urgent_replies} unprocessed inbound repl(y/ies) on Harvey's mailbox`,
    };
  }
  if (counts.compliance_escalations > 0) {
    return {
      priority: 2,
      decision: "compliance_escalation",
      reason: `${counts.compliance_escalations} compliance escalation(s) require immediate handling`,
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
  if (counts.nurture_candidates > 0) {
    // Nurturing existing not-upgraded trials that are going cold is more
    // valuable than any cold prospecting — slot it ABOVE due_outreach /
    // dispatch / prospect, just under reply + approval handling.
    return {
      priority: 5,
      decision: "nurture_trials",
      reason: `${counts.nurture_candidates} not-upgraded trial user(s) need a lifecycle nurture touch`,
    };
  }
  if (counts.due_outreach > 0) {
    return {
      priority: 6,
      decision: "send_due_outreach",
      reason: `${counts.due_outreach} due recipient(s) on Harvey campaigns`,
    };
  }
  if (counts.approved_email_drafts > 0) {
    return {
      priority: 6,
      decision: "dispatch_email",
      reason: `${counts.approved_email_drafts} approved, unsent Harvey email draft(s) ready to dispatch`,
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
  if (counts.leads_researched_needing_draft > 0) {
    return {
      priority: 8,
      decision: "draft_outreach",
      reason:
        `${counts.leads_researched_needing_draft} researched lead(s) with a brief but no draft yet`,
    };
  }
  if (counts.active_harvey_campaigns > 0) {
    return {
      priority: 9,
      decision: "campaign_followups",
      reason: `${counts.active_harvey_campaigns} active Harvey campaign(s) to manage`,
    };
  }
  if (counts.harvey_prospect_inventory < counts.prospect_inventory_target) {
    return {
      priority: 10,
      decision: "prospect",
      reason:
        `Harvey-sourced inventory ${counts.harvey_prospect_inventory} below target ` +
        `${counts.prospect_inventory_target}`,
    };
  }
  return { priority: 11, decision: "analyze", reason: "no higher-priority work; analyze pipeline" };
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
      nurtureCandidates,
      dueOutreach,
      approvedEmailDrafts,
      leadsNeedingResearch,
      qualifiedLeads,
      researchedNeedingDraft,
      activeHarveyCampaigns,
      harveyInventory,
    ] = await Promise.all([
      probeUrgentReplies(admin, config),
      probeAwaitingApproval(admin),
      probeNurtureCandidates(admin),
      probeDueOutreach(admin, campaignIds),
      probeApprovedEmailDrafts(admin),
      probeLeadsNeedingResearch(admin, newStageId),
      probeQualifiedLeads(admin, newStageId, minimumScore),
      probeLeadsResearchedNeedingDraft(admin),
      probeActiveHarveyCampaigns(admin),
      probeHarveyInventory(admin),
    ]);

    const counts: ProbeCounts = {
      compliance_escalations: probeComplianceEscalations(),
      urgent_replies: urgentReplies,
      meeting_requests: probeMeetingRequests(),
      awaiting_approval: awaitingApproval,
      nurture_candidates: nurtureCandidates,
      due_outreach: dueOutreach,
      approved_email_drafts: approvedEmailDrafts,
      leads_needing_research: leadsNeedingResearch,
      qualified_leads_needing_messaging: qualifiedLeads,
      leads_researched_needing_draft: researchedNeedingDraft,
      active_harvey_campaigns: activeHarveyCampaigns,
      harvey_prospect_inventory: harveyInventory,
      prospect_inventory_target: targetInventory,
    };

    // ── decide (deterministic) ──────────────────────────────────────────────
    const { priority, decision, reason } = decide(counts);

    // ── execute the chosen action (behind the gates already passed above) ────
    // The feature-flag, enabled, and quiet-hours gates all cleared before we got
    // here (non-manual/test runs are skipped inside quiet hours), so any run that
    // reaches this point is CLEARED to act. dispatch_email / prospect /
    // research_leads / draft_outreach dispatch today; other decisions still
    // record-only. dispatch_email routes to harvey-email-dispatch, which
    // re-checks the full send gate chain itself (nothing sends while Harvey is
    // enabled=false / dryRun=true). Every
    // sub-call is wrapped so one failure can't crash the heartbeat — the error is
    // recorded and the controller run still completes 'ok'.
    const mode = typeof config.mode === "string" ? config.mode : "assisted";
    const RESEARCH_BATCH = 5;
    const DRAFT_BATCH = 5;
    let executed = false;
    const execution: Record<string, unknown> = {};

    if (decision === "handle_urgent_replies") {
      // Batch 8: unprocessed inbound replies exist → invoke harvey-reply. That
      // worker re-checks the SAME fail-closed gates (flag, enabled, quiet-hours)
      // itself, applies deterministic hard-guards FIRST, classifies intent,
      // advances the lead, and DRAFTS a suggested reply for human approval. It
      // NEVER sends: with config.replies.autoReply=false every draft is
      // pending_approval, and even an approved reply draft is only ever SENT by
      // the dispatchers (which respect live/dry-run). invokeWorker never throws;
      // a failure is recorded and the heartbeat still completes 'ok'.
      const res = await invokeWorker("harvey-reply", {
        agent_name: CONFIG_KEY,
        trigger_type: triggerType,
        created_by: actorUserId,
      });
      if (res.ok) {
        const data = res.data ?? {};
        execution.handle_urgent_replies = {
          scanned: typeof data.scanned === "number" ? data.scanned : 0,
          drafted: typeof data.drafted === "number" ? data.drafted : 0,
          escalated: typeof data.escalated === "number" ? data.escalated : 0,
          suppressed: typeof data.suppressed === "number" ? data.suppressed : 0,
          auto_replied: typeof data.auto_replied === "number" ? data.auto_replied : 0,
          ignored: typeof data.ignored === "number" ? data.ignored : 0,
          run_id: data.run_id ?? null,
        };
        executed = true;
      } else {
        execution.handle_urgent_replies = { error: res.error ?? "harvey-reply failed" };
      }
    } else if (decision === "nurture_trials") {
      // Not-upgraded trial users need lifecycle nurture drafts → invoke
      // harvey-nurture. That worker DRAFTS ONLY (never sends): it selects
      // candidates, invokes harvey-writer, and stamps metadata_json.lifecycle so
      // the dispatcher records the send + dedups. It re-checks the same
      // fail-closed gates itself. invokeWorker never throws; a failure is
      // recorded and the heartbeat still completes 'ok'.
      const res = await invokeWorker("harvey-nurture", {
        agent_name: CONFIG_KEY,
        trigger_type: triggerType,
        created_by: actorUserId,
      });
      if (res.ok) {
        const data = res.data ?? {};
        execution.nurture_trials = {
          drafted: typeof data.drafted === "number" ? data.drafted : 0,
          candidates: typeof data.candidates === "number" ? data.candidates : 0,
          skipped: typeof data.skipped === "number" ? data.skipped : 0,
          by_stage: (data.by_stage && typeof data.by_stage === "object") ? data.by_stage : {},
          run_id: data.run_id ?? null,
        };
        executed = true;
      } else {
        execution.nurture_trials = { error: res.error ?? "harvey-nurture failed" };
      }
    } else if (decision === "dispatch_email") {
      // Approved, unsent Harvey email drafts exist → invoke harvey-email-dispatch.
      // That worker enforces its OWN full fail-closed gate chain (flag, enabled,
      // paused, quiet-hours, dryRun/testMode, suppression, stop-on-reply, daily
      // cap, idempotency) — the controller only routes to it. With Harvey's
      // current config (enabled=false / dryRun=true) the worker sends nothing.
      // invokeWorker never throws; a failure is recorded and the heartbeat
      // still completes 'ok'.
      const res = await invokeWorker("harvey-email-dispatch", {
        agent_name: CONFIG_KEY,
        trigger_type: triggerType,
        created_by: actorUserId,
      });
      if (res.ok) {
        const data = res.data ?? {};
        execution.dispatch_email = {
          sent: typeof data.sent === "number" ? data.sent : 0,
          skipped: typeof data.skipped === "number" ? data.skipped : 0,
          dry_run: typeof data.dry_run === "number" ? data.dry_run : 0,
          cap: typeof data.cap === "number" ? data.cap : null,
          run_id: data.run_id ?? null,
        };
        executed = true;
      } else {
        execution.dispatch_email = { error: res.error ?? "harvey-email-dispatch failed" };
      }
    } else if (decision === "prospect") {
      const shortfall = Math.max(0, counts.prospect_inventory_target - counts.harvey_prospect_inventory);
      // harvey-prospect itself avoids paid spend in testMode, so we still call it.
      const res = await invokeWorker("harvey-prospect", {
        agent_name: CONFIG_KEY,
        trigger_type: triggerType,
        target: shortfall,
        created_by: actorUserId,
      });
      if (res.ok) {
        const data = res.data ?? {};
        const leads = Array.isArray(data.leads) ? data.leads : [];
        execution.prospect = {
          requested: shortfall,
          created: typeof data.created === "number" ? data.created : leads.length,
          sourced: leads.length,
          run_id: data.run_id ?? null,
        };
        executed = true;
      } else {
        execution.prospect = { error: res.error ?? "harvey-prospect failed", requested: shortfall };
      }
    } else if (decision === "research_leads") {
      let leadIds: string[] = [];
      try {
        leadIds = await harveyLeadsNeedingResearch(admin, newStageId, RESEARCH_BATCH);
      } catch (probeErr) {
        execution.research = { error: `lead selection failed: ${String((probeErr as Error)?.message ?? probeErr)}` };
      }
      if (leadIds.length > 0) {
        let researched = 0;
        const failures: Array<{ lead_id: string; error: string }> = [];
        for (const leadId of leadIds) {
          const res = await invokeWorker("harvey-research", {
            agent_name: CONFIG_KEY,
            lead_id: leadId,
            trigger_type: triggerType,
          });
          if (res.ok) researched += 1;
          else failures.push({ lead_id: leadId, error: res.error ?? "harvey-research failed" });
        }
        execution.research = {
          batch: leadIds.length,
          researched,
          failed: failures.length,
          ...(failures.length ? { failures } : {}),
        };
        // executed if at least one research call succeeded.
        if (researched > 0) executed = true;
      } else if (!execution.research) {
        execution.research = { batch: 0, researched: 0, note: "no un-researched Harvey leads found" };
      }
    } else if (decision === "draft_outreach") {
      if (mode !== "autonomous") {
        // In assisted/copilot, drafting is a human/task-initiated step, not an
        // autonomous controller action. Skip with a reason (no send either way).
        execution.draft_outreach = {
          skipped: true,
          reason: `mode '${mode}' — first-touch drafts are generated on human/task request, not autonomously`,
        };
      } else {
        let batch: LeadBrief[] = [];
        try {
          batch = await harveyResearchedLeadsNeedingDraft(admin, DRAFT_BATCH);
        } catch (probeErr) {
          execution.draft_outreach = { error: `lead selection failed: ${String((probeErr as Error)?.message ?? probeErr)}` };
        }
        if (batch.length > 0) {
          let drafted = 0;
          const failures: Array<{ lead_id: string; error: string }> = [];
          for (const item of batch) {
            const brief = (item.brief ?? {}) as Record<string, unknown>;
            const recommended = typeof brief.recommendedChannel === "string"
              ? brief.recommendedChannel.toLowerCase()
              : "email";
            const channel = recommended === "linkedin" ? "linkedin" : "email";
            const contact = (brief.contact && typeof brief.contact === "object")
              ? brief.contact as Record<string, unknown>
              : {};
            const researchText = typeof brief.summary === "string"
              ? brief.summary
              : (typeof brief.research === "string" ? brief.research : null);
            const res = await invokeWorker("harvey-writer", {
              agent_name: CONFIG_KEY,
              channel,
              stage: "cold_outreach",
              intent: "first_touch",
              lead_id: item.lead_id,
              contact,
              research: researchText,
              created_by: actorUserId,
              trigger_type: triggerType,
            });
            if (res.ok) drafted += 1;
            else failures.push({ lead_id: item.lead_id, error: res.error ?? "harvey-writer failed" });
          }
          execution.draft_outreach = {
            batch: batch.length,
            drafted,
            failed: failures.length,
            ...(failures.length ? { failures } : {}),
          };
          if (drafted > 0) executed = true;
        } else if (!execution.draft_outreach) {
          execution.draft_outreach = { batch: 0, drafted: 0, note: "no researched-but-undrafted Harvey leads found" };
        }
      }
    }

    // ── record exactly ONE run row summarizing the decision + execution ──────
    await completeAgentRun(admin, runId, {
      status: "ok",
      priority,
      decision,
      decision_reason: reason,
      output_json: {
        counts,
        minimum_score: minimumScore,
        mode,
        executed,
        execution,
      },
    });
    log.info("run_ok", { run_id: runId, decision, priority, executed, trigger_type: triggerType });

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
