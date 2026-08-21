// harvey-email-dispatch — Project Harvey Batch 6 (EMAIL DISPATCH).
//
// The FIRST Harvey code path that can send REAL email. It sends Harvey's
// APPROVED email drafts (lit_agent_drafts, status='approved') FROM Harvey's
// connected Gmail mailbox (harvey@logisticintel.com), one at a time, behind
// multiple independent fail-closed gates.
//
// CRITICAL SAFETY INVARIANT:
//   With Harvey's current config (enabled=false, feature-flag armed/killed,
//   sending.dryRun=true), NOTHING sends. The real Gmail send call is reached
//   ONLY when EVERY one of the following is simultaneously true:
//     - feature flag 'harvey_internal_agent' exists AND global_kill=false
//     - config.enabled === true
//     - config.sending.paused !== true
//     - NOT quiet hours (unless trigger === 'manual')
//     - dryRun === false  (dryRun = config.sending.dryRun===true || config.testMode===true)
//     - per-draft gates all pass (recipient email present, not suppressed,
//       no reply received, lead not converted/lost/past-Contacted)
//     - the daily cap has room
//     - the idempotency insert (UNIQUE draft_id) succeeded (no prior send-log row)
//   If ANY gate fails, we record a 'skipped'/'dry_run' row and return WITHOUT
//   calling Gmail. A single-draft failure logs 'failed' and the loop continues.
//   NEVER throws uncaught — a gate/probe failure returns a skipped run.
//
// Send primitive: REUSED from send-campaign-email's Gmail path exactly
//   (lit_oauth_tokens refresh via oauth2.googleapis.com/token, then
//   POST gmail.googleapis.com/gmail/v1/users/me/messages/send with a
//   base64url RFC822 raw message). No hand-rolled SMTP.
//
// INTERNAL-ONLY boundary (customers can never invoke this — mirrors
// harvey-controller's dual auth):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron == LIT_CRON_SECRET)
//   - OR an authenticated PLATFORM ADMIN who is also a lead-CRM member.
//   Everyone else gets 401/403.
//
// Response: { ok, run_id, sent, skipped, dry_run, cap }.

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

const AGENT_NAME = "harvey-email-dispatch";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";
const LOG_AGENT = "harvey"; // agent_name stored in lit_agent_send_log

const DEFAULT_DAILY_LIMIT = 25;
// Hard ceiling on candidates examined per tick (defense-in-depth so a
// misconfigured cap can never cause an unbounded loop / send storm).
const MAX_CANDIDATES = 100;

type TriggerType = "cron" | "webhook" | "manual" | "test";

interface DraftRow {
  id: string;
  agent_name: string;
  lead_id: string | null;
  contact_json: Record<string, unknown> | null;
  channel: string;
  subject: string | null;
  body: string;
  edited_subject: string | null;
  edited_body: string | null;
  status: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface HarveyAccount {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  display_name: string | null;
}

// ─── Gmail send primitive (REUSED verbatim from send-campaign-email) ─────────

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** RFC 2045 base64 body encoder (wrapped at 76 chars). Matches send-campaign-email. */
function encodeBodyMimeBase64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

/**
 * Refresh (if needed) and return a valid Gmail access token for Harvey's
 * mailbox. Mirrors send-campaign-email's getAccessToken Gmail branch exactly:
 * reads lit_oauth_tokens, refreshes via oauth2.googleapis.com/token when the
 * access token is within 60s of expiry, and persists the new token.
 */
async function getGmailAccessToken(
  admin: SupabaseClient,
  account: HarveyAccount,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const { data: tokenRow, error } = await admin
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, provider")
    .eq("email_account_id", account.id)
    .maybeSingle();
  if (error || !tokenRow) return { ok: false, error: "no_token" };

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at as string).getTime() : 0;
  const nowMs = Date.now();
  const needsRefresh = expiresAt - nowMs < 60_000;
  if (!needsRefresh && tokenRow.access_token) {
    return { ok: true, accessToken: tokenRow.access_token as string };
  }
  if (!tokenRow.refresh_token) return { ok: false, error: "no_refresh_token" };

  const id = Deno.env.get("GMAIL_CLIENT_ID");
  const secret = Deno.env.get("GMAIL_CLIENT_SECRET");
  if (!id || !secret) return { ok: false, error: "gmail_credentials_missing" };

  let refreshJson: Record<string, unknown> | null = null;
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: tokenRow.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    refreshJson = await resp.json().catch(() => null);
  } catch (_e) {
    return { ok: false, error: "gmail_refresh_threw" };
  }

  const newAccessToken = refreshJson?.access_token as string | undefined;
  if (!newAccessToken) {
    await admin
      .from("lit_email_accounts")
      .update({ status: "error", error_message: "token_refresh_failed", updated_at: new Date().toISOString() })
      .eq("id", account.id);
    return { ok: false, error: "token_refresh_failed" };
  }

  const expiresIn = Number(refreshJson?.expires_in) || 3600;
  await admin
    .from("lit_oauth_tokens")
    .update({
      access_token: newAccessToken,
      expires_at: new Date(nowMs + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.id);

  return { ok: true, accessToken: newAccessToken };
}

/** Send one email via Gmail messages.send. Mirrors send-campaign-email's Gmail branch. */
async function sendGmail(args: {
  accessToken: string;
  from: HarveyAccount;
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { accessToken, from, to, subject, body } = args;
  const fromLine = from.display_name ? `"${from.display_name}" <${from.email}>` : from.email;
  const isHtml = /^<[a-z!]/i.test(body.trim()) || /<table|<div|<p[\s>]/i.test(body);
  const messageId = `<harvey-${crypto.randomUUID()}@logisticintel.com>`;
  const raw = [
    `From: ${fromLine}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeBodyMimeBase64(body),
  ].join("\r\n");
  try {
    const resp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: toBase64Url(raw) }),
      },
    );
    const respJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: `gmail_${resp.status}:${(respJson as any)?.error?.message || ""}`.slice(0, 500) };
    }
    // Return our injected RFC 5322 Message-ID (reply-receiver correlates on it).
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "gmail_threw" };
  }
}

// ─── per-draft gate helpers ──────────────────────────────────────────────────

/** Resolve recipient email for a draft: lit_admin_leads.email, else contact_json.email. */
async function resolveRecipient(
  admin: SupabaseClient,
  draft: DraftRow,
): Promise<{ email: string | null; leadStatus: string | null; stageName: string | null }> {
  let email: string | null = null;
  let leadStatus: string | null = null;
  let stageName: string | null = null;

  if (draft.lead_id) {
    const { data: lead } = await admin
      .from("lit_admin_leads")
      .select("email, status, stage_id")
      .eq("id", draft.lead_id)
      .maybeSingle();
    if (lead) {
      email = (lead.email as string | null) ?? null;
      leadStatus = (lead.status as string | null) ?? null;
      if (lead.stage_id) {
        const { data: stage } = await admin
          .from("lit_lead_pipeline_stages")
          .select("name")
          .eq("id", lead.stage_id)
          .maybeSingle();
        stageName = (stage?.name as string | null) ?? null;
      }
    }
  }
  if (!email) {
    const cj = draft.contact_json ?? {};
    const cjEmail = (cj as Record<string, unknown>).email;
    if (typeof cjEmail === "string" && cjEmail.trim()) email = cjEmail.trim();
  }
  return { email: email ? email.toLowerCase() : null, leadStatus, stageName };
}

/** Suppression gate — reuse send-campaign-email's RPC + legacy-table fallback. */
async function isSuppressed(admin: SupabaseClient, email: string): Promise<string | null> {
  try {
    const { data: rpcRow } = await admin.rpc("lit_email_suppression_status", { p_email: email });
    const supp = Array.isArray(rpcRow) ? rpcRow[0] : rpcRow;
    if (supp?.unsubscribed) return "unsubscribed";
    if (supp?.bounced) return "bounced";
    if (supp?.complained) return "complained";
    if (supp?.converted) return "converted";
  } catch (_e) {
    // Fall through to legacy table check.
  }
  const { data: supRows } = await admin
    .from("lit_email_suppression_list")
    .select("reason, org_id")
    .eq("email", email)
    .limit(5);
  const matched = (supRows ?? []).find((s: any) => s.org_id === null);
  if (matched) return (matched as any).reason || "suppressed";
  return null;
}

/**
 * STOP-ON-REPLY. Returns true when the recipient has already replied.
 * Two independent signals (either one stops the send):
 *   1. lit_email_messages: an inbound message on Harvey's mailbox from this
 *      address (same source harvey-controller's probeUrgentReplies consults).
 *   2. lit_outreach_history: a 'replied' event whose metadata.from carries
 *      this address (the reply-receiver correlation record).
 */
async function hasReplied(
  admin: SupabaseClient,
  email: string,
  mailboxIds: string[],
): Promise<boolean> {
  // Signal 1 — inbound mail on Harvey's connected mailbox from this address.
  if (mailboxIds.length > 0) {
    const { count } = await admin
      .from("lit_email_messages")
      .select("id", { count: "exact", head: true })
      .in("email_account_id", mailboxIds)
      .eq("direction", "inbound")
      .ilike("from_email", email);
    if ((count ?? 0) > 0) return true;
  }
  // Signal 2 — a correlated reply event in outreach history.
  const { count: replyCount } = await admin
    .from("lit_outreach_history")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "replied")
    .ilike("metadata->>from", `%${email}%`);
  if ((replyCount ?? 0) > 0) return true;

  return false;
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body (trigger_type) ──────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  // ── auth: verified cron OR platform-admin lead-CRM member — else 401/403 ────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = null;

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
    const { data: isMember, error: memberErr } = await auth.userClient.rpc(
      "is_lead_crm_member",
      { p_user_id: auth.user.id },
    );
    if (memberErr || isMember !== true) {
      log.warn("forbidden_not_lead_crm_member", { user_id: auth.user.id, err: memberErr?.message });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    admin = auth.admin;
    actorUserId = auth.user.id;
    triggerType = body.trigger_type === "test" ? "test" : "manual";
  }

  // Helper: record a 'skipped' run and return WITHOUT sending anything.
  const skippedRun = async (reason: string, extra: Record<string, unknown> = {}) => {
    let runId: string | null = null;
    try {
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision: "dispatch_email",
        decision_reason: reason,
        input_json: { request_id: rid, actor_user_id: actorUserId },
        output_json: { sent: 0, skipped: 0, dry_run: 0, ...extra },
        completed_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      log.error("skipped_run_audit_failed", { err: String(auditErr) });
    }
    log.info("skipped", { run_id: runId, reason, trigger_type: triggerType });
    return json({ ok: true, run_id: runId, sent: 0, skipped: 0, dry_run: 0, cap: 0, reason });
  };

  try {
    // ── GATE (a): feature flag — fail CLOSED (missing/killed/error = OFF) ─────
    const flagEnabled = await isAgentFlagEnabled(admin, FLAG_KEY);
    if (!flagEnabled) {
      return await skippedRun(`feature flag '${FLAG_KEY}' missing or killed (fail-closed)`);
    }

    // ── GATE (b): config must exist AND enabled === true ─────────────────────
    const config: AgentConfig | null = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      return await skippedRun(
        config ? "lit_agent_config['harvey'].enabled is false" : "lit_agent_config['harvey'] row missing (fail-closed)",
      );
    }

    const sending = (config.sending ?? {}) as Record<string, unknown>;

    // ── GATE (c): sending.paused must NOT be true ────────────────────────────
    if (sending.paused === true) {
      return await skippedRun("config.sending.paused === true");
    }

    // ── GATE (d): quiet hours (manual invocations exempt) ────────────────────
    if (triggerType !== "manual" && withinQuietHours(config)) {
      const qh = config.quietHours;
      return await skippedRun(`within quiet hours (${qh?.start}–${qh?.end} ${qh?.timezone})`);
    }

    // ── dryRun determination: dryRun neutralizes the real Gmail send ─────────
    const dryRun = sending.dryRun === true || config.testMode === true;
    const dailyLimit = Number.isFinite(Number(sending.emailDailyLimit))
      ? Math.max(0, Number(sending.emailDailyLimit))
      : DEFAULT_DAILY_LIMIT;

    // ── open the run so an error still has a run id ──────────────────────────
    const runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      decision: "dispatch_email",
      test_mode: config.testMode === true,
      input_json: { request_id: rid, actor_user_id: actorUserId, dry_run: dryRun, cap: dailyLimit },
    });
    log.info("run_started", { run_id: runId, dry_run: dryRun, cap: dailyLimit, trigger_type: triggerType });

    const summary = {
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      dry_run: 0,
      cap: dailyLimit,
      already_at_cap: false,
      reasons: {} as Record<string, number>,
    };
    const bumpReason = (k: string) => { summary.reasons[k] = (summary.reasons[k] ?? 0) + 1; };

    // ── resolve Harvey's sender mailbox by config.sender.emailAccount ────────
    const senderEmail = typeof config.sender?.emailAccount === "string"
      ? config.sender.emailAccount
      : "harvey@logisticintel.com";
    const { data: acctRows } = await admin
      .from("lit_email_accounts")
      .select("id, user_id, provider, email, display_name, status")
      .eq("email", senderEmail);
    const mailboxIds = (acctRows ?? []).map((a: any) => a.id as string);
    // Prefer a connected Gmail account; Harvey only sends Gmail.
    const sender = (acctRows ?? []).find(
      (a: any) => a.provider === "gmail" && a.status === "connected",
    ) as HarveyAccount | undefined;

    // ── SELECT approved, unsent email drafts (oldest first) ──────────────────
    const { data: draftRows, error: draftErr } = await admin
      .from("lit_agent_drafts")
      .select("id, agent_name, lead_id, contact_json, channel, subject, body, edited_subject, edited_body, status, metadata_json, created_at")
      .eq("agent_name", CONFIG_KEY)
      .eq("channel", "email")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(MAX_CANDIDATES);
    if (draftErr) throw new Error(`lit_agent_drafts select failed: ${draftErr.message}`);

    // Exclude drafts already in the send log (idempotency at the SELECT layer;
    // the UNIQUE(draft_id) insert below is the hard guarantee).
    const allDraftIds = (draftRows ?? []).map((d: any) => d.id as string);
    const alreadyHandled = new Set<string>();
    if (allDraftIds.length > 0) {
      const { data: logged } = await admin
        .from("lit_agent_send_log")
        .select("draft_id")
        .in("draft_id", allDraftIds);
      for (const row of logged ?? []) {
        if ((row as any).draft_id) alreadyHandled.add((row as any).draft_id as string);
      }
    }
    const candidates = (draftRows ?? []).filter((d: any) => !alreadyHandled.has(d.id)) as DraftRow[];
    summary.candidates = candidates.length;

    // ── DAILY CAP: count today's real 'sent' email rows in the send log ──────
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await admin
      .from("lit_agent_send_log")
      .select("id", { count: "exact", head: true })
      .eq("agent_name", LOG_AGENT)
      .eq("channel", "email")
      .eq("status", "sent")
      .gte("created_at", startOfDayUtc.toISOString());
    let sentSoFar = sentToday ?? 0;

    // Real-send mode with NO connected Harvey mailbox → nothing can be sent.
    // Short-circuit BEFORE claiming any draft so we never write 'sent' rows we
    // can't fulfill. (dryRun does not need a sender, so it still runs the loop.)
    const canProceed = dryRun || !!sender;
    if (!canProceed && candidates.length > 0) {
      log.warn("no_connected_sender", { sender_email: senderEmail, candidates: candidates.length });
      summary.reasons.no_connected_sender = candidates.length;
    }

    // ── process each candidate ───────────────────────────────────────────────
    for (const draft of canProceed ? candidates : []) {
      try {
        // DAILY CAP gate — stop dispatching real sends once the cap is hit.
        // (dry_run rows don't consume the cap: they never sent anything.)
        if (!dryRun && sentSoFar >= dailyLimit) {
          summary.already_at_cap = true;
          break;
        }

        // Resolve recipient + lead state.
        const { email, leadStatus, stageName } = await resolveRecipient(admin, draft);

        // Gate: recipient email present.
        if (!email) {
          await logSkip(admin, draft, "no_recipient_email");
          summary.skipped += 1; bumpReason("no_recipient_email"); continue;
        }

        // Gate: lead status must not be converted/lost.
        if (leadStatus === "converted" || leadStatus === "lost") {
          await logSkip(admin, draft, `lead_status:${leadStatus}`);
          summary.skipped += 1; bumpReason(`lead_status_${leadStatus}`); continue;
        }

        // Gate: lead stage must not be past Contacted/Engaged — outreach stops
        // once the lead has moved into Trial / Subscriber / Lost.
        if (stageName && ["Trial", "Subscriber", "Lost"].includes(stageName)) {
          await logSkip(admin, draft, `stage_past_outreach:${stageName}`);
          summary.skipped += 1; bumpReason(`stage_${stageName}`); continue;
        }

        // Gate: suppression list.
        const suppressed = await isSuppressed(admin, email);
        if (suppressed) {
          await logSkip(admin, draft, `suppressed:${suppressed}`);
          summary.skipped += 1; bumpReason(`suppressed_${suppressed}`); continue;
        }

        // Gate: STOP-ON-REPLY — never re-touch a lead who already replied.
        if (await hasReplied(admin, email, mailboxIds)) {
          await logSkip(admin, draft, "stop_on_reply");
          summary.skipped += 1; bumpReason("stop_on_reply"); continue;
        }

        // ── IDEMPOTENCY: claim the draft BEFORE sending. The UNIQUE(draft_id)
        //    index means a concurrent tick that already claimed this draft
        //    causes a unique violation here → we treat it as already-sent and
        //    do NOT send. On dryRun we write the claim as status='dry_run';
        //    otherwise 'sent' (corrected to 'failed'/'skipped' if the send or a
        //    later per-draft gate does not complete).
        const nowIso = new Date().toISOString();
        const { data: claimRow, error: claimErr } = await admin
          .from("lit_agent_send_log")
          .insert({
            agent_name: LOG_AGENT,
            draft_id: draft.id,
            lead_id: draft.lead_id,
            channel: "email",
            status: dryRun ? "dry_run" : "sent",
            dry_run: dryRun,
            sent_at: dryRun ? null : nowIso,
          })
          .select("id")
          .single();

        if (claimErr) {
          // Unique violation (23505) → another tick already handled this draft.
          if ((claimErr as any).code === "23505") {
            bumpReason("already_handled_race"); continue;
          }
          // Any other insert error: log and skip (do NOT send without an audit row).
          log.warn("send_log_claim_failed", { draft_id: draft.id, err: claimErr.message });
          summary.failed += 1; bumpReason("claim_failed"); continue;
        }
        const logId = (claimRow as any).id as string;

        const subject = (draft.edited_subject ?? draft.subject ?? "").trim();
        const messageBody = (draft.edited_body ?? draft.body ?? "").trim();

        // ── dryRun: everything ran, but NO Gmail call. The claim row already
        //    recorded status='dry_run'. Mark the draft sent (dry) and move on.
        if (dryRun) {
          log.info("dry_run_would_send", {
            run_id: runId, draft_id: draft.id, to: email,
            subject_length: subject.length, body_length: messageBody.length,
          });
          await finalizeDraftSent(admin, draft, { messageId: null, dryRun: true, senderUserId: sender?.user_id ?? null });
          summary.dry_run += 1;
          continue;
        }

        // ── REAL SEND PATH (only reachable when dryRun===false and every gate
        //    above passed). Requires a connected Gmail mailbox for Harvey.
        if (!sender) {
          // No sender identity — undo the 'sent' claim into 'skipped'.
          await admin
            .from("lit_agent_send_log")
            .update({ status: "skipped", skip_reason: "no_connected_sender", sent_at: null })
            .eq("id", logId);
          await logDraftSkip(admin, draft, "no_connected_sender");
          summary.skipped += 1; bumpReason("no_connected_sender"); continue;
        }

        if (!subject && !messageBody) {
          await admin
            .from("lit_agent_send_log")
            .update({ status: "skipped", skip_reason: "empty_template", sent_at: null })
            .eq("id", logId);
          summary.skipped += 1; bumpReason("empty_template"); continue;
        }

        const tokenRes = await getGmailAccessToken(admin, sender);
        if (!tokenRes.ok) {
          await admin
            .from("lit_agent_send_log")
            .update({ status: "failed", error: `token:${tokenRes.error}`, sent_at: null })
            .eq("id", logId);
          summary.failed += 1; bumpReason(`token_${tokenRes.error}`); continue;
        }

        // ── THE REAL GMAIL SEND CALL ─────────────────────────────────────────
        const sendRes = await sendGmail({
          accessToken: tokenRes.accessToken,
          from: sender,
          to: email,
          subject,
          body: messageBody,
        });

        if (!sendRes.ok) {
          await admin
            .from("lit_agent_send_log")
            .update({ status: "failed", error: sendRes.error.slice(0, 500), sent_at: null })
            .eq("id", logId);
          summary.failed += 1; bumpReason("send_failed"); continue;
        }

        // Success — record provider message id + finalize CRM side-effects.
        await admin
          .from("lit_agent_send_log")
          .update({ provider_message_id: sendRes.messageId, sent_at: new Date().toISOString() })
          .eq("id", logId);
        await finalizeDraftSent(admin, draft, { messageId: sendRes.messageId, dryRun: false, senderUserId: sender.user_id });
        sentSoFar += 1;
        summary.sent += 1;
      } catch (perDraftErr) {
        // A single-draft failure must NOT crash the loop.
        log.error("draft_exception", {
          draft_id: draft.id,
          err: perDraftErr instanceof Error ? perDraftErr.message : String(perDraftErr),
        });
        try {
          await admin.from("lit_agent_send_log").upsert(
            {
              agent_name: LOG_AGENT,
              draft_id: draft.id,
              lead_id: draft.lead_id,
              channel: "email",
              status: "failed",
              error: (perDraftErr instanceof Error ? perDraftErr.message : String(perDraftErr)).slice(0, 500),
            },
            { onConflict: "draft_id", ignoreDuplicates: true },
          );
        } catch (_e) { /* best-effort audit */ }
        summary.failed += 1; bumpReason("exception");
      }
    }

    // ── record the run summary ───────────────────────────────────────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "dispatch_email",
      decision_reason:
        `dispatched: ${summary.sent} sent / ${summary.dry_run} dry_run / ${summary.skipped} skipped / ${summary.failed} failed`,
      output_json: {
        candidates: summary.candidates,
        sent: summary.sent,
        skipped: summary.skipped,
        failed: summary.failed,
        dry_run: summary.dry_run,
        cap: summary.cap,
        already_at_cap: summary.already_at_cap,
        reasons: summary.reasons,
        sender_connected: !!sender,
        dry_run_mode: dryRun,
      },
    });
    log.info("run_ok", {
      run_id: runId, sent: summary.sent, dry_run: summary.dry_run,
      skipped: summary.skipped, failed: summary.failed, cap: summary.cap,
    });

    return json({
      ok: true,
      run_id: runId,
      sent: summary.sent,
      skipped: summary.skipped + summary.failed,
      dry_run: summary.dry_run,
      cap: summary.cap,
    });
  } catch (err) {
    // NEVER throw uncaught — record a skipped/error run and return.
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { err: message, trigger_type: triggerType });
    try {
      await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "error",
        decision: "dispatch_email",
        error_json: { message, request_id: rid },
        completed_at: new Date().toISOString(),
      });
    } catch (_e) { /* best-effort */ }
    return json({ ok: false, error: "internal_error", request_id: rid }, 500);
  }
});

// ─── send-log skip helper ────────────────────────────────────────────────────

/** Record a 'skipped' send-log row (idempotent via UNIQUE draft_id). */
async function logSkip(admin: SupabaseClient, draft: DraftRow, reason: string): Promise<void> {
  await admin.from("lit_agent_send_log").upsert(
    {
      agent_name: LOG_AGENT,
      draft_id: draft.id,
      lead_id: draft.lead_id,
      channel: "email",
      status: "skipped",
      skip_reason: reason.slice(0, 500),
    },
    { onConflict: "draft_id", ignoreDuplicates: true },
  );
}

// ─── CRM side-effects after a (real or dry-run) send ─────────────────────────

/**
 * Finalize a draft that was sent (or dry-run "sent"):
 *   - lit_agent_drafts: status='sent', sent_at, metadata_json.sent
 *   - lit_lead_activity: kind 'email_sent', source 'system' (bumps last_activity)
 *   - lit_outreach_history: append-only outbound record (idempotent)
 *   - lit_admin_leads: move New → Contacted stage (only when currently New)
 * All best-effort: a side-effect failure is logged but doesn't undo the send.
 */
async function finalizeDraftSent(
  admin: SupabaseClient,
  draft: DraftRow,
  info: { messageId: string | null; dryRun: boolean; senderUserId: string | null },
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Mark the draft sent.
  await admin
    .from("lit_agent_drafts")
    .update({
      status: "sent",
      sent_at: nowIso,
      metadata_json: {
        ...(draft.metadata_json ?? {}),
        sent: { message_id: info.messageId, dry_run: info.dryRun, at: nowIso },
      },
    })
    .eq("id", draft.id);

  if (!draft.lead_id) return;

  // 2. Activity log (the touch trigger bumps last_activity_at).
  await admin.from("lit_lead_activity").insert({
    lead_id: draft.lead_id,
    kind: "email_sent",
    body: { channel: "email", message_id: info.messageId, dry_run: info.dryRun, agent: LOG_AGENT, draft_id: draft.id },
    actor_user_id: null,
    source: "system",
  });

  // 3. Append-only outreach history (best-effort; not the idempotency key).
  //    user_id is NOT NULL on lit_outreach_history — only append when we know
  //    Harvey's mailbox owner. provider_event_id carries the RFC 5322 Message-ID
  //    so reply-receiver can correlate inbound replies (dry-run has no id, so
  //    it's null-safe against the unique (provider, provider_event_id) index).
  if (info.senderUserId) {
    await admin.from("lit_outreach_history").insert({
      user_id: info.senderUserId,
      channel: "email",
      event_type: "sent",
      status: "sent",
      subject: (draft.edited_subject ?? draft.subject) ?? null,
      provider: "gmail",
      message_id: info.messageId,
      provider_event_id: info.messageId,
      occurred_at: nowIso,
      metadata: { agent: LOG_AGENT, draft_id: draft.id, lead_id: draft.lead_id, dry_run: info.dryRun },
    });
  }

  // 4. Move New → Contacted.
  const { data: lead } = await admin
    .from("lit_admin_leads")
    .select("stage_id")
    .eq("id", draft.lead_id)
    .maybeSingle();
  if (lead?.stage_id) {
    const { data: curStage } = await admin
      .from("lit_lead_pipeline_stages")
      .select("name")
      .eq("id", lead.stage_id)
      .maybeSingle();
    if (curStage?.name === "New") {
      const { data: contactedStage } = await admin
        .from("lit_lead_pipeline_stages")
        .select("id")
        .eq("name", "Contacted")
        .maybeSingle();
      if (contactedStage?.id) {
        await admin.from("lit_admin_leads").update({ stage_id: contactedStage.id }).eq("id", draft.lead_id);
      }
    }
  }
}

/** Log a skip on the DRAFT itself when we couldn't send (e.g. no sender). */
async function logDraftSkip(admin: SupabaseClient, draft: DraftRow, reason: string): Promise<void> {
  if (!draft.lead_id) return;
  await admin.from("lit_lead_activity").insert({
    lead_id: draft.lead_id,
    kind: "email_send_skipped",
    body: { reason, agent: LOG_AGENT, draft_id: draft.id },
    actor_user_id: null,
    source: "system",
  });
}
