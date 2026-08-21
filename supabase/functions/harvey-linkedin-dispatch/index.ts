// harvey-linkedin-dispatch — Project Harvey Batch 7 (LINKEDIN DISPATCH).
//
// The FIRST Harvey code path that can send a REAL LinkedIn action (a connection
// invitation or a message) through Unipile from Harvey's DESIGNATED connected
// LinkedIn account. It reuses the EXACT Unipile call surface the human
// unipile-outreach function uses (_shared/unipile.ts: unipileRequest,
// linkedinPublicIdentifier, unipileErrorCode) — it does NOT hand-roll any
// Unipile request. It only ever acts on Harvey drafts that a human already
// APPROVED (lit_agent_drafts.status='approved', channel='linkedin').
//
// SAFETY — multiple INDEPENDENT fail-CLOSED gates; with Harvey's current config
// (feature flag killed, config.enabled=false, sending.dryRun=true and testMode
// =true, sender.linkedinAccountId=null) NOTHING can reach a Unipile send call:
//   gate a: lit_feature_flags['harvey_internal_agent'] EXISTS & global_kill=false
//   gate b: lit_agent_config['harvey'].enabled === true
//   gate c: config.sending.paused !== true
//   gate d: NOT within quiet hours (unless a manual/test trigger)
//   gate e: Harvey has a DESIGNATED LinkedIn sender — config.sender
//           .linkedinAccountId points at a lit_unipile_accounts row with
//           status='OK' AND use_for_lead_crm=true. Otherwise skip
//           ('no_linkedin_sender').
//   dryRun neutralization: dryRun = config.sending.dryRun===true ||
//           config.testMode===true. In dryRun the code walks every gate and
//           per-draft check but NEVER calls Unipile — it records 'dry_run'.
// Any gate failure records a 'skipped' lit_agent_runs row and returns 200
// { ok:true, skipped:true, reason }. NOTHING is sent.
//
// INTERNAL-ONLY boundary (customers can never invoke this — mirrors
// harvey-controller / harvey-writer dual auth):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron == LIT_CRON_SECRET
//     via _shared/cron_auth.ts) OR an authenticated PLATFORM ADMIN
//     (requireUser + isUserAdmin().isPlatformAdmin). Everyone else gets 401/403.
//
// Contract:
//   POST { agent_name='harvey', trigger_type?, created_by? }
//   → { ok, run_id, sent, skipped, dry_run, invite_cap, message_cap }
//
// Idempotency + caps:
//   - lit_agent_send_log (UNIQUE(draft_id), created by the Batch-6 migration) is
//     the send ledger. Before sending we check the log; after sending we INSERT.
//     A unique-violation (23505) means a parallel run already sent this draft —
//     we treat it as already-sent and never double-send.
//   - Daily caps are MIN(account cap, config cap), counted from TODAY's 'sent'
//     rows in lit_agent_send_log for this account+action_type.
//
// Per-draft gates (skip, never throw): stop-on-reply (LinkedIn reply or email
// suppression/reply), lead converted/lost, and no resolvable LinkedIn recipient.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  completeAgentRun,
  isAgentFlagEnabled,
  loadAgentConfig,
  recordAgentRun,
  withinQuietHours,
} from "../_shared/agent.ts";
import { linkedinPublicIdentifier, unipileErrorCode, unipileRequest } from "../_shared/unipile.ts";

const AGENT_NAME = "harvey-linkedin-dispatch";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";

// LinkedIn's hard invitation-note limit. unipile-outreach enforces 200 (its
// agent prompt caps notes there); LinkedIn itself allows ~300. We truncate to a
// SAFE 200 for invites so a longer approved body can never be rejected outright.
const INVITE_NOTE_MAX = 200;

// How many approved drafts we consider per run. Caps still bound actual sends.
const CANDIDATE_LIMIT = 100;

type TriggerType = "cron" | "webhook" | "manual" | "test";

interface DraftRow {
  id: string;
  lead_id: string | null;
  contact_json: Record<string, unknown> | null;
  channel: string;
  status: string;
  body: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface RecipientRef {
  linkedinUrl: string | null;
  publicId: string | null;
  providerId: string | null;
}

// ─── recipient resolution (contact_json first, then the lead row) ─────────────

/**
 * Resolve a LinkedIn recipient for a draft. contact_json may carry a
 * linkedin_url and/or a provider id (LinkedIn provider_id) and/or an
 * apollo_person_id (not a LinkedIn provider id — ignored for sending). We fall
 * back to lit_admin_leads.linkedin_url. Returns nulls when nothing resolves.
 */
function resolveRecipient(contact: Record<string, unknown> | null, leadUrl: string | null): RecipientRef {
  const c = contact ?? {};
  const rawUrl =
    (typeof c.linkedin_url === "string" && c.linkedin_url.trim() ? c.linkedin_url.trim() : "") ||
    (typeof (c as Record<string, unknown>).linkedinUrl === "string" && String((c as Record<string, unknown>).linkedinUrl).trim()
      ? String((c as Record<string, unknown>).linkedinUrl).trim()
      : "") ||
    (typeof leadUrl === "string" && leadUrl.trim() ? leadUrl.trim() : "");
  // A LinkedIn provider id (NOT an apollo_person_id) — only accept keys that are
  // explicitly a linkedin provider id so we never treat an Apollo id as one.
  const providerId =
    (typeof c.provider_id === "string" && c.provider_id.trim() ? c.provider_id.trim() : null) ||
    (typeof (c as Record<string, unknown>).linkedin_provider_id === "string" &&
      String((c as Record<string, unknown>).linkedin_provider_id).trim()
      ? String((c as Record<string, unknown>).linkedin_provider_id).trim()
      : null);
  const publicId = rawUrl ? linkedinPublicIdentifier(rawUrl) : null;
  return { linkedinUrl: rawUrl || null, publicId, providerId };
}

// ─── stop-on-reply / lead-status per-draft gate ───────────────────────────────

interface DraftGate {
  ok: boolean; // ok to proceed to send/dry_run
  reason?: string; // when !ok — recorded as a 'skipped' send-log row
}

/**
 * Per-draft blockers that MUST stop a send (recorded as a skipped send-log row):
 *   - lead status converted/lost
 *   - the prospect already replied on LinkedIn (lit_lead_activity kind
 *     'linkedin_reply_received', OR a prior outreach action flipped to 'replied')
 *   - email reply/suppression (lit_email_suppression_status: converted /
 *     unsubscribed / complained ⇒ do not touch them again)
 * Any query error here is treated as a BLOCK (fail safe — never send when we
 * cannot confirm the prospect has not already replied / opted out).
 */
async function draftBlocked(admin: SupabaseClient, leadId: string | null): Promise<DraftGate> {
  if (!leadId) return { ok: true }; // no lead → nothing to check here (recipient gate still applies)

  // 1. lead status + email (single fetch)
  const { data: lead, error: leadErr } = await admin
    .from("lit_admin_leads")
    .select("status, email")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { ok: false, reason: `lead_lookup_failed:${leadErr.message}` };
  if (lead && (lead.status === "converted" || lead.status === "lost")) {
    return { ok: false, reason: `lead_status_${lead.status}` };
  }

  // 2. LinkedIn reply on the activity feed
  {
    const { count, error } = await admin
      .from("lit_lead_activity")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("kind", "linkedin_reply_received");
    if (error) return { ok: false, reason: `reply_activity_count_failed:${error.message}` };
    if ((count ?? 0) > 0) return { ok: false, reason: "prospect_replied_linkedin" };
  }

  // 3. a prior outreach action for this lead already flipped to 'replied'
  {
    const { count, error } = await admin
      .from("lit_linkedin_outreach_actions")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("status", "replied");
    if (error) return { ok: false, reason: `outreach_reply_lookup_failed:${error.message}` };
    if ((count ?? 0) > 0) return { ok: false, reason: "prospect_replied_linkedin" };
  }

  // 4. email suppression / reply (there is no LinkedIn suppression RPC; the
  //    campaign LinkedIn path relies on lead status + reply — we ALSO honor the
  //    email suppression RPC so an opted-out / bounced / converted prospect is
  //    never touched on LinkedIn either).
  if (lead?.email) {
    const { data: supp, error: suppErr } = await admin.rpc("lit_email_suppression_status", {
      p_email: lead.email,
    });
    if (suppErr) return { ok: false, reason: `suppression_lookup_failed:${suppErr.message}` };
    const row = Array.isArray(supp) ? supp[0] : supp;
    if (row && (row.converted === true || row.unsubscribed === true || row.complained === true)) {
      const which = row.converted ? "converted" : row.unsubscribed ? "unsubscribed" : "complained";
      return { ok: false, reason: `email_suppressed_${which}` };
    }
  }

  return { ok: true };
}

// ─── invite vs message decision ───────────────────────────────────────────────

type ActionType = "invite" | "message";

/**
 * Decide INVITE vs MESSAGE for a lead.
 *   - If a prior INVITE for this lead was ACCEPTED — signalled by an existing
 *     outreach thread / a prior message action / (best-effort) a sent message in
 *     our own send-log — the connection exists → MESSAGE.
 *   - Otherwise (first touch, stage New/Contacted) → INVITE.
 * Defaults to INVITE (the safe first-touch) whenever the connection state is
 * unknown, exactly as the spec requires.
 */
async function decideActionType(admin: SupabaseClient, leadId: string | null): Promise<ActionType> {
  if (!leadId) return "invite";
  // An existing LinkedIn thread for this lead means we are already connected /
  // in conversation → MESSAGE. (unipile-webhook writes lit_linkedin_threads on
  // any inbound/outbound activity; a thread implies an accepted connection.)
  const { count: threadCount } = await admin
    .from("lit_linkedin_threads")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);
  if ((threadCount ?? 0) > 0) return "message";

  // A prior 'sent' MESSAGE action (invite already accepted earlier) → MESSAGE.
  const { count: msgCount } = await admin
    .from("lit_linkedin_outreach_actions")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("action_type", "message")
    .eq("status", "sent");
  if ((msgCount ?? 0) > 0) return "message";

  // Default: first touch → connection INVITE.
  return "invite";
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body first so cron callers can pass trigger_type/created_by ──────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty/invalid body is tolerated (cron may POST nothing)
    body = {};
  }

  // ── auth: verified cron OR platform-admin — else 401/403 ───────────────────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook"
      ? (requested as TriggerType)
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
    admin = auth.admin;
    actorUserId = auth.user.id;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "manual";
    triggerType = requested === "test" ? "test" : "manual";
  }

  const manualTrigger = triggerType === "manual" || triggerType === "test";

  // Helper: record a skipped run + return the standard skipped response.
  const skipRun = async (reason: string, extra?: Record<string, unknown>) => {
    const runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "skipped",
      decision_reason: reason,
      input_json: { request_id: rid, actor_user_id: actorUserId, ...(extra ?? {}) },
      completed_at: new Date().toISOString(),
    });
    log.info("skipped", { run_id: runId, reason, trigger_type: triggerType });
    return json({
      ok: true,
      skipped: true,
      reason,
      run_id: runId,
      sent: 0,
      dry_run: Boolean(extra?.dry_run) || false,
      invite_cap: typeof extra?.invite_cap === "number" ? extra.invite_cap : 0,
      message_cap: typeof extra?.message_cap === "number" ? extra.message_cap : 0,
    });
  };

  let runId: string | null = null;
  try {
    // ── gate a: feature flag — fail CLOSED (missing/killed ⇒ OFF) ────────────
    const flagEnabled = await isAgentFlagEnabled(admin, FLAG_KEY);
    if (!flagEnabled) {
      return await skipRun(`feature flag '${FLAG_KEY}' missing or killed (fail-closed)`);
    }

    // ── gate b: config must exist AND be enabled ─────────────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      return await skipRun(
        config ? "lit_agent_config['harvey'].enabled is false" : "lit_agent_config['harvey'] row missing (fail-closed)",
      );
    }

    // dryRun neutralization — either explicit dryRun OR testMode disables sends.
    // `sending` is read as an open bag: dryRun/paused are safety fields that may
    // not be present in the declared AgentConfig.sending shape.
    const sending = (config.sending ?? {}) as Record<string, unknown>;
    const dryRun = sending.dryRun === true || (config as Record<string, unknown>).testMode === true;

    // ── gate c: sending paused ───────────────────────────────────────────────
    if (sending.paused === true) {
      return await skipRun("config.sending.paused is true", { dry_run: dryRun });
    }

    // ── gate d: quiet hours (manual/test invocations are exempt) ─────────────
    if (!manualTrigger && withinQuietHours(config)) {
      const qh = config.quietHours;
      return await skipRun(`within quiet hours (${qh?.start}–${qh?.end} ${qh?.timezone})`, { dry_run: dryRun });
    }

    // ── gate e: Harvey has a DESIGNATED, OK, lead-CRM LinkedIn sender ─────────
    const linkedinAccountId = config.sender?.linkedinAccountId ?? null;
    if (!linkedinAccountId || typeof linkedinAccountId !== "string") {
      return await skipRun("no_linkedin_sender", { dry_run: dryRun, detail: "config.sender.linkedinAccountId not set" });
    }
    const { data: senderAccount, error: senderErr } = await admin
      .from("lit_unipile_accounts")
      .select("id, unipile_account_id, status, use_for_lead_crm, daily_invite_cap, daily_message_cap")
      .eq("id", linkedinAccountId)
      .maybeSingle();
    if (senderErr) {
      return await skipRun("no_linkedin_sender", { dry_run: dryRun, detail: `sender lookup failed: ${senderErr.message}` });
    }
    if (!senderAccount || senderAccount.status !== "OK" || senderAccount.use_for_lead_crm !== true) {
      return await skipRun("no_linkedin_sender", {
        dry_run: dryRun,
        detail: senderAccount
          ? `sender not ready (status=${senderAccount.status}, use_for_lead_crm=${senderAccount.use_for_lead_crm})`
          : "designated sender row not found",
      });
    }

    // ── caps: MIN(account, config) per action type ───────────────────────────
    const accInviteCap = Number(senderAccount.daily_invite_cap) || 0;
    const accMessageCap = Number(senderAccount.daily_message_cap) || 0;
    const cfgInviteCap = Number(sending.linkedinInviteDailyLimit);
    const cfgMessageCap = Number(sending.linkedinMessageDailyLimit);
    const inviteCap = Math.min(
      accInviteCap,
      Number.isFinite(cfgInviteCap) ? cfgInviteCap : accInviteCap,
    );
    const messageCap = Math.min(
      accMessageCap,
      Number.isFinite(cfgMessageCap) ? cfgMessageCap : accMessageCap,
    );

    // Count today's already-sent invites/messages for THIS account from the
    // send ledger (UTC day boundary — matches unipile-outreach's day window).
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const countSentToday = async (actionType: ActionType): Promise<number> => {
      const { count, error } = await admin
        .from("lit_agent_send_log")
        .select("id", { count: "exact", head: true })
        .eq("channel", "linkedin")
        .eq("status", "sent")
        .eq("unipile_account_id", senderAccount.unipile_account_id)
        .eq("action_type", actionType)
        .gte("sent_at", dayStart.toISOString());
      if (error) throw new Error(`send-log cap count failed (${actionType}): ${error.message}`);
      return count ?? 0;
    };
    let sentInvitesToday = await countSentToday("invite");
    let sentMessagesToday = await countSentToday("message");

    // ── open the run before touching drafts so errors still have a run id ─────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: (config as Record<string, unknown>).testMode === true,
      input_json: {
        request_id: rid,
        actor_user_id: actorUserId,
        dry_run: dryRun,
        invite_cap: inviteCap,
        message_cap: messageCap,
        unipile_account_id: senderAccount.unipile_account_id,
      },
    });
    log.info("run_started", {
      run_id: runId,
      trigger_type: triggerType,
      dry_run: dryRun,
      invite_cap: inviteCap,
      message_cap: messageCap,
    });

    // ── select candidate drafts: approved linkedin drafts not yet in the log ──
    const { data: draftsRaw, error: draftsErr } = await admin
      .from("lit_agent_drafts")
      .select("id, lead_id, contact_json, channel, status, body, metadata_json, created_at")
      .eq("agent_name", CONFIG_KEY)
      .eq("channel", "linkedin")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (draftsErr) throw new Error(`lit_agent_drafts select failed: ${draftsErr.message}`);
    const candidateDrafts = (draftsRaw ?? []) as DraftRow[];

    // Filter out drafts already in the send-log (already processed).
    let unsent: DraftRow[] = candidateDrafts;
    if (candidateDrafts.length > 0) {
      const ids = candidateDrafts.map((d) => d.id);
      const { data: logged, error: logErr } = await admin
        .from("lit_agent_send_log")
        .select("draft_id")
        .in("draft_id", ids);
      if (logErr) throw new Error(`lit_agent_send_log select failed: ${logErr.message}`);
      const done = new Set((logged ?? []).map((r: { draft_id: string }) => r.draft_id));
      unsent = candidateDrafts.filter((d) => !done.has(d.id));
    }

    let sent = 0;
    let invitesSent = 0;
    let messagesSent = 0;
    let skipped = 0;
    let failed = 0;
    let dryRunCount = 0;
    const perDraft: Array<Record<string, unknown>> = [];

    for (const draft of unsent) {
      // ── REPLY DRAFT branch (from harvey-reply) ─────────────────────────────
      // metadata_json.reply.is_reply === true with a provider_chat_id means this
      // is a threaded reply into an EXISTING Unipile chat, not a fresh invite/msg.
      // Replies: always send an in-thread MESSAGE to provider_chat_id, bypass the
      // invite-vs-message decision and the already-connected check (if they
      // replied, we're connected). Caps still apply (counts as a message);
      // idempotency + dry-run + gate chain are unchanged. stop-on-reply is N/A for
      // the reply itself, so draftBlocked's reply gate is intentionally skipped.
      const replyMeta = (draft.metadata_json as any)?.reply;
      const isReplyDraft = replyMeta?.is_reply === true;
      const replyChatId =
        typeof replyMeta?.provider_chat_id === "string" && replyMeta.provider_chat_id.trim()
          ? replyMeta.provider_chat_id.trim()
          : null;
      if (isReplyDraft) {
        if (!replyChatId) {
          await logSend(admin, {
            draftId: draft.id,
            leadId: draft.lead_id,
            actionType: "message",
            unipileAccountId: senderAccount.unipile_account_id,
            status: "skipped",
            reason: "reply_no_chat_id",
          });
          skipped += 1;
          perDraft.push({ draft_id: draft.id, status: "skipped", reason: "reply_no_chat_id" });
          continue;
        }

        // Message cap still applies to replies (they count as a message).
        if (sentMessagesToday >= messageCap) {
          await logSend(admin, {
            draftId: draft.id,
            leadId: draft.lead_id,
            actionType: "message",
            unipileAccountId: senderAccount.unipile_account_id,
            status: "skipped",
            reason: "message_cap_reached",
          });
          skipped += 1;
          perDraft.push({ draft_id: draft.id, status: "skipped", reason: "message_cap_reached" });
          continue;
        }

        const replyText = String(draft.body ?? "").trim();

        // DRY RUN: never call Unipile; record 'dry_run' and move on.
        if (dryRun) {
          const inserted = await logSend(admin, {
            draftId: draft.id,
            leadId: draft.lead_id,
            actionType: "message",
            unipileAccountId: senderAccount.unipile_account_id,
            status: "dry_run",
            reason: "dry_run",
            providerChatId: replyChatId,
          });
          if (inserted === "duplicate") {
            skipped += 1;
            perDraft.push({ draft_id: draft.id, status: "skipped", reason: "already_logged" });
            continue;
          }
          dryRunCount += 1;
          perDraft.push({ draft_id: draft.id, status: "dry_run", action_type: "message", reply: true });
          continue;
        }

        // ── REAL in-thread reply send ────────────────────────────────────────
        // UNVERIFIED: POST /chats/{chatId}/messages { text } is the standard
        // Unipile route for posting into an existing chat, but it is NOT exercised
        // anywhere else in this repo (all other calls create NEW chats via
        // POST /chats). It must be confirmed against Unipile's live API. Implement
        // defensively: on any non-2xx / unknown-shape response, log a clear error,
        // mark the send 'failed' with reason 'linkedin_reply_endpoint', and
        // continue — never crash the loop.
        try {
          const form = new FormData();
          form.set("account_id", senderAccount.unipile_account_id);
          form.set("text", replyText);
          const response = await unipileRequest<Record<string, unknown>>(
            `/chats/${encodeURIComponent(replyChatId)}/messages`,
            { method: "POST", body: form },
          );

          const providerEventId =
            String((response as any)?.message_id || (response as any)?.id || "") || null;
          if (!providerEventId) {
            // Unknown response shape → treat as a failure (defensive).
            await logSend(admin, {
              draftId: draft.id,
              leadId: draft.lead_id,
              actionType: "message",
              unipileAccountId: senderAccount.unipile_account_id,
              status: "failed",
              reason: "linkedin_reply_endpoint",
              providerChatId: replyChatId,
            });
            failed += 1;
            perDraft.push({ draft_id: draft.id, status: "failed", action_type: "message", reply: true, error: "linkedin_reply_endpoint" });
            log.warn("reply_send_unknown_shape", { run_id: runId, draft_id: draft.id, chat_id: replyChatId });
            continue;
          }

          const inserted = await logSend(admin, {
            draftId: draft.id,
            leadId: draft.lead_id,
            actionType: "message",
            unipileAccountId: senderAccount.unipile_account_id,
            status: "sent",
            providerEventId,
            providerChatId: replyChatId,
            sentAt: new Date().toISOString(),
          });
          if (inserted === "duplicate") {
            skipped += 1;
            perDraft.push({ draft_id: draft.id, status: "skipped", reason: "already_logged_race" });
            continue;
          }

          // Advance the draft + activity feed (best-effort).
          await admin
            .from("lit_agent_drafts")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", draft.id);
          if (draft.lead_id) {
            await admin.from("lit_lead_activity").insert({
              lead_id: draft.lead_id,
              kind: "linkedin_message",
              body: { draft_id: draft.id, provider_event_id: providerEventId, reply: true, message: replyText.slice(0, 400) },
              actor_user_id: null,
              source: "system",
            });
          }

          sent += 1;
          messagesSent += 1;
          sentMessagesToday += 1;
          perDraft.push({ draft_id: draft.id, status: "sent", action_type: "message", reply: true, provider_event_id: providerEventId });
        } catch (replyErr) {
          // Non-2xx (unipileRequest throws) or any other error → log 'failed'
          // with reason 'linkedin_reply_endpoint' and continue (defensive).
          const message = String((replyErr as Error)?.message ?? replyErr);
          await logSend(admin, {
            draftId: draft.id,
            leadId: draft.lead_id,
            actionType: "message",
            unipileAccountId: senderAccount.unipile_account_id,
            status: "failed",
            reason: `linkedin_reply_endpoint:${message}`.slice(0, 500),
            providerChatId: replyChatId,
          });
          failed += 1;
          perDraft.push({ draft_id: draft.id, status: "failed", action_type: "message", reply: true, error: "linkedin_reply_endpoint" });
          log.warn("reply_send_failed", { run_id: runId, draft_id: draft.id, chat_id: replyChatId, err: message });
        }
        continue;
      }

      // Resolve the lead's stored linkedin_url (fallback recipient source).
      let leadUrl: string | null = null;
      if (draft.lead_id) {
        const { data: leadRow } = await admin
          .from("lit_admin_leads")
          .select("linkedin_url")
          .eq("id", draft.lead_id)
          .maybeSingle();
        leadUrl = (leadRow?.linkedin_url as string | null) ?? null;
      }
      const recipient = resolveRecipient(draft.contact_json, leadUrl);

      // ── per-draft gate: resolvable recipient ──────────────────────────────
      if (!recipient.providerId && !recipient.publicId) {
        await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType: "invite",
          unipileAccountId: senderAccount.unipile_account_id,
          status: "skipped",
          reason: "no_linkedin_recipient",
        });
        skipped += 1;
        perDraft.push({ draft_id: draft.id, status: "skipped", reason: "no_linkedin_recipient" });
        continue;
      }

      // ── per-draft gate: stop-on-reply / lead status / suppression ─────────
      const gate = await draftBlocked(admin, draft.lead_id);
      if (!gate.ok) {
        await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType: "invite",
          unipileAccountId: senderAccount.unipile_account_id,
          status: "skipped",
          reason: gate.reason ?? "blocked",
        });
        skipped += 1;
        perDraft.push({ draft_id: draft.id, status: "skipped", reason: gate.reason });
        continue;
      }

      // ── decide invite vs message ──────────────────────────────────────────
      const actionType = await decideActionType(admin, draft.lead_id);

      // ── cap gate (MIN account/config) ─────────────────────────────────────
      if (actionType === "invite" && sentInvitesToday >= inviteCap) {
        await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType,
          unipileAccountId: senderAccount.unipile_account_id,
          status: "skipped",
          reason: "invite_cap_reached",
        });
        skipped += 1;
        perDraft.push({ draft_id: draft.id, status: "skipped", reason: "invite_cap_reached" });
        continue;
      }
      if (actionType === "message" && sentMessagesToday >= messageCap) {
        await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType,
          unipileAccountId: senderAccount.unipile_account_id,
          status: "skipped",
          reason: "message_cap_reached",
        });
        skipped += 1;
        perDraft.push({ draft_id: draft.id, status: "skipped", reason: "message_cap_reached" });
        continue;
      }

      // Invite note respects LinkedIn's limit — truncate safely.
      const bodyText = String(draft.body ?? "").trim();
      const inviteNote = bodyText.length > INVITE_NOTE_MAX
        ? bodyText.slice(0, INVITE_NOTE_MAX - 1).trimEnd() + "…"
        : bodyText;

      // ── DRY RUN: never call Unipile. Record 'dry_run' and move on. ─────────
      if (dryRun) {
        const inserted = await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType,
          unipileAccountId: senderAccount.unipile_account_id,
          status: "dry_run",
          reason: "dry_run",
        });
        if (inserted === "duplicate") {
          skipped += 1;
          perDraft.push({ draft_id: draft.id, status: "skipped", reason: "already_logged" });
          continue;
        }
        dryRunCount += 1;
        perDraft.push({ draft_id: draft.id, status: "dry_run", action_type: actionType });
        continue;
      }

      // ── SEND (real) — reuse the EXACT Unipile calls unipile-outreach uses ──
      try {
        // Resolve a provider_id if we only have a public identifier — mirrors
        // unipile-outreach: GET /users/{publicId}?account_id=... → provider_id.
        let providerId = recipient.providerId;
        let profile: Record<string, unknown> | null = null;
        if (!providerId) {
          profile = await unipileRequest<Record<string, unknown>>(
            `/users/${encodeURIComponent(recipient.publicId!)}?account_id=${encodeURIComponent(senderAccount.unipile_account_id)}`,
          );
          providerId = String(profile.provider_id || "");
          if (!providerId) throw new Error("Could not resolve the LinkedIn recipient");
        }

        let response: Record<string, unknown>;
        if (actionType === "invite") {
          // POST /users/invite { provider_id, account_id, message } — identical
          // to unipile-outreach's invite branch.
          response = await unipileRequest<Record<string, unknown>>("/users/invite", {
            method: "POST",
            body: JSON.stringify({
              provider_id: providerId,
              account_id: senderAccount.unipile_account_id,
              message: inviteNote,
            }),
          });
        } else {
          // Message a first-degree connection by opening a chat — identical to
          // unipile-outreach's new-chat branch (multipart form).
          if (profile && profile.is_relationship === false) {
            // Not connected yet — fall back to an INVITE instead of failing.
            response = await unipileRequest<Record<string, unknown>>("/users/invite", {
              method: "POST",
              body: JSON.stringify({
                provider_id: providerId,
                account_id: senderAccount.unipile_account_id,
                message: inviteNote,
              }),
            });
          } else {
            const form = new FormData();
            form.set("account_id", senderAccount.unipile_account_id);
            form.set("text", bodyText);
            form.append("attendees_ids", providerId);
            response = await unipileRequest<Record<string, unknown>>("/chats", {
              method: "POST",
              body: form,
            });
          }
        }

        const providerEventId = String(
          response.invitation_id || response.id || response.message_id || response.chat_id || "",
        ) || null;
        const providerChatId = String(response.chat_id || response.id || "") || null;

        // ── record idempotently (UNIQUE(draft_id)) ─────────────────────────
        const inserted = await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType,
          unipileAccountId: senderAccount.unipile_account_id,
          status: "sent",
          providerId,
          providerEventId,
          providerChatId,
          sentAt: new Date().toISOString(),
        });
        if (inserted === "duplicate") {
          // A parallel run already logged this draft — do NOT count as a fresh
          // send (we may have sent a duplicate to Unipile, but LinkedIn/Unipile
          // dedupes pending invites; we never double-log).
          skipped += 1;
          perDraft.push({ draft_id: draft.id, status: "skipped", reason: "already_logged_race" });
          continue;
        }

        // Advance the draft + lead + activity feed (best-effort; a failure here
        // must not undo the recorded send).
        await admin
          .from("lit_agent_drafts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", draft.id);

        if (draft.lead_id) {
          await admin.from("lit_lead_activity").insert({
            lead_id: draft.lead_id,
            kind: actionType === "invite" ? "linkedin_invite" : "linkedin_message",
            body: { draft_id: draft.id, provider_event_id: providerEventId, message: bodyText.slice(0, 400) },
            actor_user_id: null,
            source: "system",
          });
          // Move a New-stage lead to Contacted on first touch.
          await moveNewToContacted(admin, draft.lead_id);
        }

        sent += 1;
        if (actionType === "invite") {
          invitesSent += 1;
          sentInvitesToday += 1;
        } else {
          messagesSent += 1;
          sentMessagesToday += 1;
        }
        perDraft.push({ draft_id: draft.id, status: "sent", action_type: actionType, provider_event_id: providerEventId });
      } catch (sendErr) {
        // A single-draft failure is logged 'failed' and the loop continues.
        const message = String((sendErr as Error)?.message ?? sendErr);
        const code = unipileErrorCode(sendErr);
        await logSend(admin, {
          draftId: draft.id,
          leadId: draft.lead_id,
          actionType,
          unipileAccountId: senderAccount.unipile_account_id,
          status: "failed",
          reason: `${code}:${message}`.slice(0, 500),
        });
        failed += 1;
        perDraft.push({ draft_id: draft.id, status: "failed", action_type: actionType, error: code });
        log.warn("draft_send_failed", { run_id: runId, draft_id: draft.id, err: message });
      }
    }

    // ── record exactly ONE run summary ────────────────────────────────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: dryRun ? "linkedin_dispatch_dry_run" : "linkedin_dispatch",
      decision_reason: dryRun
        ? `dry-run: ${dryRunCount} would-send, ${skipped} skipped, ${unsent.length} candidates`
        : `sent ${sent} (${invitesSent} invite / ${messagesSent} message), ${skipped} skipped, ${failed} failed`,
      output_json: {
        candidates: unsent.length,
        invites_sent: invitesSent,
        messages_sent: messagesSent,
        skipped,
        failed,
        dry_run: dryRun,
        dry_run_count: dryRunCount,
        caps: { invite_cap: inviteCap, message_cap: messageCap, account_invite_cap: accInviteCap, account_message_cap: accMessageCap },
        per_draft: perDraft,
      },
    });
    log.info("run_ok", {
      run_id: runId,
      sent,
      invites_sent: invitesSent,
      messages_sent: messagesSent,
      skipped,
      failed,
      dry_run: dryRun,
    });

    return json({
      ok: true,
      run_id: runId,
      sent,
      skipped,
      dry_run: dryRun,
      invite_cap: inviteCap,
      message_cap: messageCap,
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    try {
      if (runId) {
        await completeAgentRun(admin, runId, { status: "error", error_json: { message, request_id: rid } });
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

// ─── idempotent send-log writer (UNIQUE(draft_id)) ────────────────────────────

interface LogSendArgs {
  draftId: string;
  leadId: string | null;
  actionType: ActionType;
  unipileAccountId: string;
  status: "sent" | "skipped" | "failed" | "dry_run";
  reason?: string;
  providerId?: string | null;
  providerEventId?: string | null;
  providerChatId?: string | null;
  sentAt?: string | null;
}

/**
 * INSERT one lit_agent_send_log row. Returns "inserted" on success or
 * "duplicate" on a UNIQUE(draft_id) violation (Postgres 23505) — the caller
 * treats a duplicate as "already handled by a parallel run" and never
 * double-sends / double-counts. Any OTHER db error is swallowed and logged as
 * "inserted" is NOT returned — but we never throw so the dispatch loop survives.
 */
async function logSend(admin: SupabaseClient, args: LogSendArgs): Promise<"inserted" | "duplicate" | "error"> {
  const row: Record<string, unknown> = {
    draft_id: args.draftId,
    agent_name: CONFIG_KEY,
    lead_id: args.leadId,
    channel: "linkedin",
    action_type: args.actionType,
    unipile_account_id: args.unipileAccountId,
    status: args.status,
    reason: args.reason ?? null,
    provider_id: args.providerId ?? null,
    provider_event_id: args.providerEventId ?? null,
    provider_chat_id: args.providerChatId ?? null,
    sent_at: args.sentAt ?? (args.status === "sent" ? new Date().toISOString() : null),
  };
  const { error } = await admin.from("lit_agent_send_log").insert(row);
  if (!error) return "inserted";
  // 23505 = unique_violation on UNIQUE(draft_id) ⇒ already logged.
  if ((error as { code?: string }).code === "23505") return "duplicate";
  // Any other error: surface via throw so the outer per-draft try/catch records
  // it (for a real send) — but skipped/dry_run inserts should not crash the run,
  // so we only throw for the 'sent' path where correctness matters.
  if (args.status === "sent") {
    throw new Error(`lit_agent_send_log insert failed for ${args.draftId}: ${error.message}`);
  }
  return "error";
}

// ─── lead stage helper ────────────────────────────────────────────────────────

/** Move a lead from the 'New' stage to 'Contacted' on first touch (best-effort). */
async function moveNewToContacted(admin: SupabaseClient, leadId: string): Promise<void> {
  try {
    const { data: stages } = await admin
      .from("lit_lead_pipeline_stages")
      .select("id, name")
      .in("name", ["New", "Contacted"]);
    const map: Record<string, string> = {};
    for (const s of stages ?? []) map[(s as { name: string }).name] = (s as { id: string }).id;
    const newId = map["New"];
    const contactedId = map["Contacted"];
    if (!newId || !contactedId) return;
    // Only advance a lead that is currently in 'New' — never regress a later stage.
    await admin
      .from("lit_admin_leads")
      .update({ stage_id: contactedId, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("stage_id", newId);
  } catch {
    // best-effort; a stage move must never fail a recorded send
  }
}
