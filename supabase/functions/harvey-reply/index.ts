// harvey-reply — Project Harvey Batch 8 (REPLY HANDLER).
//
// Reads Harvey's INBOUND replies (email + LinkedIn), applies DETERMINISTIC
// hard-guards FIRST (opt-out / legal / out-of-office — keyword scans, NO LLM),
// then classifies intent with the LLM, moves the lead to Engaged, drafts a
// suggested response, escalates sensitive ones for a human, and instantly
// suppresses opt-outs. It processes each inbound message EXACTLY ONCE via the
// lit_agent_inbound ledger (UNIQUE(channel, source_message_id)).
//
// CRITICAL SAFETY INVARIANT — NOTHING AUTO-SENDS:
//   Reply PROCESSING (fetch + correlate + guard + classify + draft) always runs
//   (it is read + draft + guard, never a send), even in dryRun/testMode. The
//   only thing that could SEND is an AUTO-APPROVED reply draft, which requires
//   config.replies.autoReply===true AND mode==='autonomous' AND the intent in
//   autoReplyIntents AND confidence>=0.7. With Harvey's current config
//   (autoReply=false) EVERY reply draft is written status='pending_approval'
//   (requires_approval=true) for human review. And even an 'approved' reply
//   draft is only ever SENT later by the dispatchers (harvey-email-dispatch /
//   harvey-linkedin-dispatch), which re-check the full fail-closed gate chain
//   and respect live/dry-run. This function never calls Gmail or Unipile.
//
// HARD-GUARD ORDERING (cannot be overridden):
//   The deterministic keyword hard-guards (opt-out, legal/compliance,
//   out-of-office) run BEFORE any LLM call and short-circuit. An opt-out is
//   suppressed (lit_email_preferences + lit_email_suppression_list) and NEVER
//   replied to; a legal reply is escalated and NEVER auto-replied; an
//   out-of-office is ignored (no reply, no stage advance).
//
// INTERNAL-ONLY boundary (customers can never invoke this — mirrors
// harvey-controller's dual auth):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron == LIT_CRON_SECRET
//     via _shared/cron_auth.ts) OR an authenticated PLATFORM ADMIN who is also a
//     lead-CRM member. Everyone else gets 401/403.
//
// Gates (fail CLOSED): isAgentFlagEnabled('harvey_internal_agent') +
//   config.enabled + quiet hours (cron only; manual/test exempt). A gate failure
//   records a 'skipped' run and returns 200 { skipped:true, reason }.
//
// Contract:
//   POST { agent_name='harvey', trigger_type?, limit?(default 20), created_by? }
//   → { ok, run_id, scanned, drafted, escalated, suppressed, auto_replied, ignored }

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
import { buildHarveySystemPrompt } from "../_shared/harvey_persona.ts";
import { callLlm, resolveLlmModel } from "../_shared/llm.ts";
import { fetchApprovedKnowledge, renderKnowledgeBlock } from "../_shared/harvey_context.ts";

const AGENT_NAME = "harvey-reply";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";

const DEFAULT_LIMIT = 20;
// Hard ceiling on inbound messages examined per tick (defense-in-depth so a
// misconfigured limit can never cause an unbounded scan).
const MAX_LIMIT = 100;

type TriggerType = "cron" | "webhook" | "manual" | "test";

// The closed set of intents the classifier may return.
const INTENTS = [
  "interested", "demo_request", "pricing", "question", "objection",
  "not_now", "not_interested", "wrong_person", "referral", "unsubscribe",
  "out_of_office", "legal_escalation", "support_request", "existing_customer",
  "unknown",
] as const;
type Intent = (typeof INTENTS)[number];

// ─── DETERMINISTIC HARD-GUARDS (keyword scans on body_text; NO LLM) ──────────
// These run FIRST and cannot be overridden by the LLM. Each is a conservative,
// explicit phrase list — we accept false negatives (a missed opt-out just falls
// through to classification, which also has an 'unsubscribe' path) over false
// positives that would wrongly suppress a legitimate prospect.

const OPT_OUT_PATTERNS: string[] = [
  "unsubscribe",
  "remove me",
  "take me off",
  "stop emailing",
  "stop contacting",
  "do not contact",
  "don't contact",
  "opt out",
  "opt-out",
  "no longer wish to receive",
  "please remove",
];

const LEGAL_PATTERNS: string[] = [
  "lawyer",
  "attorney",
  "lawsuit",
  "cease and desist",
  "cease-and-desist",
  "harassment",
  "spam complaint",
  "report you as spam",
  "reporting you as spam",
  "ftc",
  "gdpr",
  "can-spam",
  "can spam",
  "legal action",
  "our legal team",
];

const OUT_OF_OFFICE_PATTERNS: string[] = [
  "out of office",
  "out-of-office",
  "on vacation",
  "automatic reply",
  "auto-reply",
  "auto reply",
  "away from my desk",
  "annual leave",
  "on holiday",
  "currently away",
  "return to the office",
  "returning to the office",
];

type GuardKind = "opt_out" | "legal" | "out_of_office" | null;

/** Deterministic hard-guard scan. Runs BEFORE the LLM; opt-out wins, then legal,
 *  then out-of-office. Returns null when no guard fires. */
function hardGuard(bodyText: string | null): GuardKind {
  const hay = (bodyText ?? "").toLowerCase();
  if (!hay.trim()) return null;
  if (OPT_OUT_PATTERNS.some((p) => hay.includes(p))) return "opt_out";
  if (LEGAL_PATTERNS.some((p) => hay.includes(p))) return "legal";
  if (OUT_OF_OFFICE_PATTERNS.some((p) => hay.includes(p))) return "out_of_office";
  return null;
}

// ─── correlated-reply type (email OR linkedin) ───────────────────────────────

interface CorrelatedReply {
  channel: "email" | "linkedin";
  sourceMessageId: string;   // provider message id (idempotency key)
  sourceRowId: string;       // our row id
  bodyText: string | null;
  // email specifics
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  replyMessageId: string | null;   // inbound RFC5322 Message-ID (raw_headers['message-id'])
  referencesChain: string | null;  // space-joined references + inbound msg-id
  gmailThreadId: string | null;    // parent lit_email_threads.provider_thread_id
  // linkedin specifics
  fromProviderId: string | null;
  providerChatId: string | null;
  // shared
  leadId: string | null;
}

// ─── EMAIL: fetch + correlate inbound replies to Harvey's outreach ───────────

/** Read raw_headers['message-id'] (the inbound RFC5322 Message-ID). */
function headerMessageId(raw: Record<string, unknown> | null): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)["message-id"] ?? (raw as Record<string, unknown>)["Message-ID"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Read raw_headers['in-reply-to']. */
function headerInReplyTo(raw: Record<string, unknown> | null): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)["in-reply-to"] ?? (raw as Record<string, unknown>)["In-Reply-To"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Read raw_headers.references[] as a string[] (tolerates a single string). */
function headerReferences(raw: Record<string, unknown> | null): string[] {
  if (!raw || typeof raw !== "object") return [];
  const v = (raw as Record<string, unknown>)["references"] ?? (raw as Record<string, unknown>)["References"];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "string" && v.trim()) {
    // A raw References header is a space-separated list of <id> tokens.
    return v.trim().split(/\s+/).filter(Boolean);
  }
  return [];
}

interface EmailInboundRow {
  id: string;
  thread_id: string | null;
  provider_message_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  snippet: string | null;
  raw_headers: Record<string, unknown> | null;
}

/**
 * Fetch NEW unprocessed inbound email on Harvey's mailbox(es) and correlate each
 * to a Harvey lead. Correlation (per the audit contract):
 *   PRIMARY — raw_headers['in-reply-to'] OR any raw_headers.references[] matches
 *     a lit_outreach_history.provider_event_id where metadata->>'agent'='harvey'
 *     (that row also carries metadata.lead_id / metadata.draft_id).
 *   FALLBACK — the inbound from_email matches a Harvey lead's email (via the
 *     lit_agent_send_log → lit_agent_drafts → lit_admin_leads.email chain, or
 *     lit_agent_drafts.contact_json.email).
 * Inbound NOT correlated to Harvey is returned with leadId=null and action-ledgered
 * as 'ignored' by the caller so it is never re-scanned.
 */
async function fetchEmailReplies(
  admin: SupabaseClient,
  mailboxIds: string[],
  limit: number,
): Promise<{ correlated: CorrelatedReply[]; ignored: CorrelatedReply[] }> {
  const correlated: CorrelatedReply[] = [];
  const ignored: CorrelatedReply[] = [];
  if (mailboxIds.length === 0) return { correlated, ignored };

  // Already-ledgered source_row_ids (channel='email') to exclude.
  const { data: ledgered } = await admin
    .from("lit_agent_inbound")
    .select("source_row_id")
    .eq("channel", "email");
  const handledRowIds = new Set(
    (ledgered ?? [])
      .map((r: { source_row_id: string | null }) => r.source_row_id)
      .filter((id): id is string => typeof id === "string"),
  );

  // Newest-first inbound on Harvey's mailbox. We over-fetch a little then cap
  // after excluding already-ledgered rows.
  const { data: rows, error } = await admin
    .from("lit_email_messages")
    .select("id, thread_id, provider_message_id, from_email, from_name, subject, body_text, snippet, raw_headers")
    .in("email_account_id", mailboxIds)
    .eq("direction", "inbound")
    .order("message_date", { ascending: false })
    .limit(Math.min(MAX_LIMIT, limit * 4));
  if (error) throw new Error(`lit_email_messages select failed: ${error.message}`);

  const candidates = ((rows ?? []) as EmailInboundRow[])
    .filter((r) => !handledRowIds.has(r.id))
    .slice(0, limit);
  if (candidates.length === 0) return { correlated, ignored };

  // Gather all header id references for a single correlation query.
  const allRefTokens = new Set<string>();
  for (const r of candidates) {
    const inReplyTo = headerInReplyTo(r.raw_headers);
    if (inReplyTo) allRefTokens.add(inReplyTo);
    for (const ref of headerReferences(r.raw_headers)) allRefTokens.add(ref);
  }

  // PRIMARY correlation: map provider_event_id → {lead_id} for Harvey outreach.
  const eventToLead = new Map<string, string | null>();
  if (allRefTokens.size > 0) {
    const { data: hist } = await admin
      .from("lit_outreach_history")
      .select("provider_event_id, metadata")
      .eq("metadata->>agent", "harvey")
      .in("provider_event_id", Array.from(allRefTokens));
    for (const h of hist ?? []) {
      const row = h as { provider_event_id: string | null; metadata: Record<string, unknown> | null };
      if (!row.provider_event_id) continue;
      const meta = row.metadata ?? {};
      const leadId = typeof (meta as Record<string, unknown>).lead_id === "string"
        ? String((meta as Record<string, unknown>).lead_id)
        : null;
      eventToLead.set(row.provider_event_id, leadId);
    }
  }

  // FALLBACK correlation: build a set of Harvey lead emails (lowercased) → lead_id.
  // Harvey's leads are those with drafts in the send log or with contact emails.
  const fallbackEmailToLead = await buildHarveyEmailIndex(admin);

  for (const r of candidates) {
    const referencesChain = buildReferencesChain(r.raw_headers);
    const replyMsgId = headerMessageId(r.raw_headers);
    // resolve gmail thread id from parent thread.
    let gmailThreadId: string | null = null;
    if (r.thread_id) {
      const { data: thread } = await admin
        .from("lit_email_threads")
        .select("provider_thread_id")
        .eq("id", r.thread_id)
        .maybeSingle();
      gmailThreadId = (thread?.provider_thread_id as string | null) ?? null;
    }

    // PRIMARY: any header id matches a Harvey outreach event.
    let leadId: string | null = null;
    let matched = false;
    const inReplyTo = headerInReplyTo(r.raw_headers);
    const refs = headerReferences(r.raw_headers);
    for (const token of [inReplyTo, ...refs]) {
      if (token && eventToLead.has(token)) {
        matched = true;
        leadId = eventToLead.get(token) ?? null;
        break;
      }
    }

    // FALLBACK: from_email matches a Harvey lead email.
    if (!matched) {
      const fromLower = (r.from_email ?? "").toLowerCase().trim();
      if (fromLower && fallbackEmailToLead.has(fromLower)) {
        matched = true;
        leadId = fallbackEmailToLead.get(fromLower) ?? null;
      }
    }

    const reply: CorrelatedReply = {
      channel: "email",
      sourceMessageId: r.provider_message_id,
      sourceRowId: r.id,
      bodyText: r.body_text ?? r.snippet ?? null,
      fromEmail: (r.from_email ?? "").toLowerCase().trim() || null,
      fromName: r.from_name ?? null,
      subject: r.subject ?? null,
      replyMessageId: replyMsgId,
      referencesChain,
      gmailThreadId,
      fromProviderId: null,
      providerChatId: null,
      leadId,
    };

    if (matched) correlated.push(reply);
    else ignored.push(reply);
  }

  return { correlated, ignored };
}

/** Build a space-joined references chain (existing references + inbound msg-id)
 *  the dispatcher will emit on the reply's References header. */
function buildReferencesChain(raw: Record<string, unknown> | null): string | null {
  const refs = headerReferences(raw);
  const msgId = headerMessageId(raw);
  const chain = [...refs];
  if (msgId && !chain.includes(msgId)) chain.push(msgId);
  return chain.length > 0 ? chain.join(" ") : null;
}

/**
 * Build a lowercased-email → lead_id index of Harvey's leads for FALLBACK
 * correlation. Sources: lit_agent_send_log.draft_id → lit_agent_drafts
 * (lead_id + contact_json.email), and the resolved lit_admin_leads.email.
 * Best-effort + bounded; a query error just yields an empty index (we fall back
 * only to header correlation).
 */
async function buildHarveyEmailIndex(admin: SupabaseClient): Promise<Map<string, string | null>> {
  const index = new Map<string, string | null>();
  // Harvey's drafts (both channels not needed — email fallback only). Pull a
  // bounded window of the agent's drafts and index their contact emails + leads.
  const { data: drafts } = await admin
    .from("lit_agent_drafts")
    .select("lead_id, contact_json")
    .eq("agent_name", CONFIG_KEY)
    .order("created_at", { ascending: false })
    .limit(1000);
  const leadIds = new Set<string>();
  for (const d of drafts ?? []) {
    const row = d as { lead_id: string | null; contact_json: Record<string, unknown> | null };
    const cjEmail = row.contact_json && typeof row.contact_json === "object"
      ? (row.contact_json as Record<string, unknown>).email
      : null;
    if (typeof cjEmail === "string" && cjEmail.trim()) {
      index.set(cjEmail.toLowerCase().trim(), row.lead_id ?? null);
    }
    if (row.lead_id) leadIds.add(row.lead_id);
  }
  // Resolve lead emails for the drafts that carry a lead_id.
  if (leadIds.size > 0) {
    const { data: leads } = await admin
      .from("lit_admin_leads")
      .select("id, email")
      .in("id", Array.from(leadIds));
    for (const l of leads ?? []) {
      const row = l as { id: string; email: string | null };
      if (row.email) index.set(String(row.email).toLowerCase().trim(), row.id);
    }
  }
  return index;
}

// ─── LINKEDIN: fetch inbound replies on Harvey's Unipile account ─────────────

interface LinkedinInboundRow {
  id: string;
  thread_id: string;
  provider_message_id: string;
  sender_provider_id: string | null;
  body_text: string | null;
}

async function fetchLinkedinReplies(
  admin: SupabaseClient,
  linkedinAccountId: string | null,
  limit: number,
): Promise<CorrelatedReply[]> {
  const out: CorrelatedReply[] = [];
  if (!linkedinAccountId) return out;

  // Already-ledgered provider_message_ids (channel='linkedin') to exclude.
  const { data: ledgered } = await admin
    .from("lit_agent_inbound")
    .select("source_message_id")
    .eq("channel", "linkedin");
  const handled = new Set(
    (ledgered ?? [])
      .map((r: { source_message_id: string | null }) => r.source_message_id)
      .filter((id): id is string => typeof id === "string"),
  );

  const { data: rows, error } = await admin
    .from("lit_linkedin_messages")
    .select("id, thread_id, provider_message_id, sender_provider_id, body_text")
    .eq("account_id", linkedinAccountId)
    .eq("direction", "inbound")
    .order("message_date", { ascending: false })
    .limit(Math.min(MAX_LIMIT, limit * 4));
  if (error) throw new Error(`lit_linkedin_messages select failed: ${error.message}`);

  const candidates = ((rows ?? []) as LinkedinInboundRow[])
    .filter((r) => !handled.has(r.provider_message_id))
    .slice(0, limit);

  for (const r of candidates) {
    // lead_id + chat id come from the parent thread. All inbound on Harvey's own
    // designated account is his conversation, so these are treated as correlated.
    const { data: thread } = await admin
      .from("lit_linkedin_threads")
      .select("lead_id, provider_chat_id")
      .eq("id", r.thread_id)
      .maybeSingle();
    out.push({
      channel: "linkedin",
      sourceMessageId: r.provider_message_id,
      sourceRowId: r.id,
      bodyText: r.body_text ?? null,
      fromEmail: null,
      fromName: null,
      subject: null,
      replyMessageId: null,
      referencesChain: null,
      gmailThreadId: null,
      fromProviderId: r.sender_provider_id ?? null,
      providerChatId: (thread?.provider_chat_id as string | null) ?? null,
      leadId: (thread?.lead_id as string | null) ?? null,
    });
  }
  return out;
}

// ─── OPT-OUT SUPPRESSION (both writes) ───────────────────────────────────────

/**
 * Suppress an email globally: BOTH writes are required.
 *   (a) upsert lit_email_preferences (unsubscribed_all=true + all sequence
 *       toggles false) — THIS is what makes the dispatcher's isSuppressed()
 *       return 'unsubscribed'.
 *   (b) insert lit_email_suppression_list (org_id=null for GLOBAL scope).
 * Best-effort per write, but we attempt BOTH regardless of either's outcome.
 */
async function suppressEmail(admin: SupabaseClient, rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  if (!email) return;
  const nowIso = new Date().toISOString();

  // (a) preferences upsert — the master kill switch the dispatcher reads.
  await admin
    .from("lit_email_preferences")
    .upsert(
      {
        email,
        unsubscribed_all: true,
        updated_at: nowIso,
        trial_welcome: false,
        top_100_followup: false,
        partner_onboarding: false,
        comparison_nurture: false,
      },
      { onConflict: "email" },
    );

  // (b) global suppression-list row (org_id MUST be null to be global).
  // The unique(org_id, email) constraint means a repeat is a 23505 no-op.
  const { error: supErr } = await admin
    .from("lit_email_suppression_list")
    .insert({
      email,
      org_id: null,
      reason: "unsubscribe",
      source: "harvey_reply_optout",
    });
  if (supErr && (supErr as { code?: string }).code !== "23505") {
    // Best-effort; the preferences upsert is the primary suppression signal.
    console.warn("suppressEmail suppression-list insert failed:", supErr.message);
  }
}

// ─── CRM side-effects (service-role direct writes; the RPCs are JWT-gated) ────

/** Create a human review/escalation task on a lead (open, unassigned). */
async function createReviewTask(admin: SupabaseClient, leadId: string, title: string): Promise<void> {
  await admin.from("lit_lead_tasks").insert({
    lead_id: leadId,
    title: title.slice(0, 300),
    due_date: null,
    status: "open",
    assignee_user_id: null,
    created_by: null,
  });
}

/** Log a timeline activity on a lead (system actor). */
async function logActivity(
  admin: SupabaseClient,
  leadId: string,
  kind: string,
  body: Record<string, unknown>,
): Promise<void> {
  await admin.from("lit_lead_activity").insert({
    lead_id: leadId,
    kind,
    body,
    actor_user_id: null,
    source: "system",
  });
}

/**
 * Move a lead FORWARD to the 'Engaged' stage — but ONLY when it is currently
 * earlier than Engaged (never move a lead backward from Trial/Subscriber/Lost).
 * The lit_admin_leads trigger auto-logs the stage_change. Best-effort.
 */
async function moveToEngaged(admin: SupabaseClient, leadId: string): Promise<void> {
  const { data: stages } = await admin
    .from("lit_lead_pipeline_stages")
    .select("id, name, position");
  if (!stages) return;
  const byName = new Map<string, { id: string; pos: number }>();
  const byId = new Map<string, number>();
  for (const s of stages) {
    const row = s as { id: string; name: string; position: number | null };
    const pos = typeof row.position === "number" ? row.position : 999;
    byName.set(row.name, { id: row.id, pos });
    byId.set(row.id, pos);
  }
  const engaged = byName.get("Engaged");
  if (!engaged) return;

  const { data: lead } = await admin
    .from("lit_admin_leads")
    .select("stage_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  // Determine current position (no stage / unknown → -1 so it advances).
  const currentPos = lead.stage_id && byId.has(lead.stage_id) ? byId.get(lead.stage_id)! : -1;
  // Only advance when strictly earlier than Engaged (never move backward).
  if (currentPos < engaged.pos) {
    await admin.from("lit_admin_leads").update({ stage_id: engaged.id }).eq("id", leadId);
  }
}

// ─── LLM INTENT CLASSIFICATION ───────────────────────────────────────────────

interface Classification {
  intent: Intent;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  urgency: "low" | "medium" | "high";
  meeting_intent: boolean;
  recommended_action: string;
}

/** Strip ```json fences / prose and parse the first JSON object found. */
function parseClassificationJson(raw: string): Classification | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    text = text.slice(first, last + 1);
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const intentRaw = typeof obj.intent === "string" ? obj.intent.trim().toLowerCase() : "";
  const intent = (INTENTS as readonly string[]).includes(intentRaw) ? (intentRaw as Intent) : "unknown";
  const sentimentRaw = typeof obj.sentiment === "string" ? obj.sentiment.trim().toLowerCase() : "neutral";
  const sentiment: Classification["sentiment"] =
    sentimentRaw === "positive" || sentimentRaw === "negative" ? sentimentRaw : "neutral";
  const urgencyRaw = typeof obj.urgency === "string" ? obj.urgency.trim().toLowerCase() : "low";
  const urgency: Classification["urgency"] =
    urgencyRaw === "medium" || urgencyRaw === "high" ? urgencyRaw : "low";
  const confRaw = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;
  return {
    intent,
    sentiment,
    confidence,
    urgency,
    meeting_intent: obj.meeting_intent === true,
    recommended_action: typeof obj.recommended_action === "string" ? obj.recommended_action : "",
  };
}

/** Compact thread context for classification / drafting. */
async function buildThreadContext(
  admin: SupabaseClient,
  reply: CorrelatedReply,
): Promise<{ leadLine: string; harveyLast: string | null }> {
  let leadLine = "(no lead details available)";
  if (reply.leadId) {
    const { data: lead } = await admin
      .from("lit_admin_leads")
      .select("full_name, company_name, email")
      .eq("id", reply.leadId)
      .maybeSingle();
    if (lead) {
      const parts = [
        lead.full_name ? `Name: ${lead.full_name}` : null,
        lead.company_name ? `Company: ${lead.company_name}` : null,
        lead.email ? `Email: ${lead.email}` : null,
      ].filter(Boolean);
      if (parts.length) leadLine = parts.join(" | ");
    }
  }
  // Harvey's last message on this lead (most recent draft body) for continuity.
  let harveyLast: string | null = null;
  if (reply.leadId) {
    const { data: prior } = await admin
      .from("lit_agent_drafts")
      .select("body, edited_body, subject")
      .eq("agent_name", CONFIG_KEY)
      .eq("lead_id", reply.leadId)
      .order("created_at", { ascending: false })
      .limit(1);
    const d = (prior ?? [])[0] as { body: string | null; edited_body: string | null } | undefined;
    if (d) harveyLast = (d.edited_body ?? d.body ?? "").slice(0, 800) || null;
  }
  return { leadLine, harveyLast };
}

function buildClassifyUserBlock(reply: CorrelatedReply, leadLine: string, harveyLast: string | null): string {
  const parts: string[] = [];
  parts.push(
    "Classify the INTENT of an inbound reply from a prospect to Harvey's outreach. " +
      "This is a freight-sales PEER (broker/forwarder/3PL/NVOCC/drayage sales person), " +
      "not a shipper.",
  );
  parts.push(`CHANNEL: ${reply.channel}`);
  parts.push(`PROSPECT: ${leadLine}`);
  if (harveyLast) parts.push(`HARVEY'S LAST MESSAGE (for context):\n${harveyLast}`);
  parts.push(`INBOUND REPLY BODY:\n${(reply.bodyText ?? "").slice(0, 4000) || "(empty body)"}`);
  parts.push(
    "OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose, no code fences:\n" +
      "{\n" +
      `  "intent": "<one of: ${INTENTS.join(", ")}>",\n` +
      '  "sentiment": "<positive|neutral|negative>",\n' +
      '  "confidence": <number 0..1>,\n' +
      '  "urgency": "<low|medium|high>",\n' +
      '  "meeting_intent": <true|false>,\n' +
      '  "recommended_action": "<one short phrase>"\n' +
      "}\n" +
      "Return the JSON object and nothing else.",
  );
  return parts.join("\n\n");
}

/** Classify via the LLM; robust parse + one retry; fallback to intent='unknown'. */
async function classifyReply(
  systemPrompt: string,
  reply: CorrelatedReply,
  leadLine: string,
  harveyLast: string | null,
): Promise<{ classification: Classification; parseOk: boolean }> {
  const userBlock = buildClassifyUserBlock(reply, leadLine, harveyLast);
  let llm = await callLlm(systemPrompt, userBlock, 512);
  let parsed = llm.ok ? parseClassificationJson(llm.text) : null;
  if (llm.ok && !parsed) {
    const nudge = userBlock +
      "\n\nIMPORTANT: Your previous reply could not be parsed. Return ONLY the raw JSON object " +
      "described in the OUTPUT CONTRACT — no prose, no markdown, no code fences.";
    llm = await callLlm(systemPrompt, nudge, 512);
    parsed = llm.ok ? parseClassificationJson(llm.text) : null;
  }
  // On parse failure OR confidence < 0.5 → treat as 'unknown'.
  if (!parsed || parsed.confidence < 0.5) {
    return {
      classification: {
        intent: "unknown",
        sentiment: parsed?.sentiment ?? "neutral",
        confidence: parsed?.confidence ?? 0,
        urgency: parsed?.urgency ?? "low",
        meeting_intent: parsed?.meeting_intent ?? false,
        recommended_action: parsed?.recommended_action ?? "route to human — low confidence",
      },
      parseOk: !!parsed,
    };
  }
  return { classification: parsed, parseOk: true };
}

// ─── REPLY DRAFT GENERATION ──────────────────────────────────────────────────

const INTENT_GUIDANCE: Record<string, string> = {
  interested: "Acknowledge their interest warmly and suggest a concrete, low-friction next step. Do not oversell.",
  demo_request: "They want to see it — acknowledge and offer to set up a short walkthrough. Keep it easy.",
  pricing: "Do NOT invent pricing. Offer to send current, confirmed pricing; keep it human and unhurried.",
  question: "Answer ONLY from the approved knowledge below. If the answer isn't in it, say you'll confirm before answering — never invent product facts.",
  objection: "Listen to the objection; don't rebut hard. Validate, then reframe how LIT's workflow differs. Never attack competitors.",
  not_now: "Acknowledge the timing, offer to stay in touch and reconnect later, and reduce cadence. Do not keep pitching.",
  wrong_person: "Thank them and ask who the right person for freight-sales tooling would be.",
  referral: "Thank them and ask who they'd suggest you speak with (name/role).",
  support_request: "Acknowledge and route to the right place; do not attempt to resolve a support issue as sales.",
  existing_customer: "Recognize they are already a customer; be warm and route appropriately. Do not cold-pitch.",
  unknown: "You are unsure of intent — write a brief, human, non-committal reply that keeps the door open and defers specifics to a human.",
};

function buildReplyDraftUserBlock(params: {
  reply: CorrelatedReply;
  intent: Intent;
  leadLine: string;
  harveyLast: string | null;
  knowledgeBlock: string;
}): string {
  const { reply, intent, leadLine, harveyLast, knowledgeBlock } = params;
  const guidance = INTENT_GUIDANCE[intent] ?? INTENT_GUIDANCE.unknown;
  const parts: string[] = [];
  parts.push(`APPROVED KNOWLEDGE (the ONLY product facts you may use — never invent beyond these):\n${knowledgeBlock}`);
  parts.push(`PROSPECT: ${leadLine}`);
  if (harveyLast) parts.push(`HARVEY'S LAST MESSAGE:\n${harveyLast}`);
  parts.push(`THEIR REPLY:\n${(reply.bodyText ?? "").slice(0, 4000) || "(empty body)"}`);
  parts.push(`CLASSIFIED INTENT: ${intent}. GUIDANCE: ${guidance}`);
  parts.push(
    "GUARDRAILS:\n- " + [
      `Channel: ${reply.channel}.` + (reply.channel === "linkedin"
        ? " LinkedIn — keep it SHORT; no subject line."
        : " Email — concise reply body; no subject needed (the thread subject is reused)."),
      "NEVER invent pricing, features, data sources, integrations, coverage, metrics, or customer names. " +
        "If a fact isn't in the approved knowledge above, do not state it.",
      "You are selling LIT SOFTWARE to a freight-sales peer — never offering to move freight.",
      "Sound like an experienced freight rep replying to a peer, not a SaaS SDR.",
    ].join("\n- "),
  );
  parts.push(
    "OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose, no code fences:\n" +
      "{\n" +
      '  "body": "<your reply body>",\n' +
      '  "angle": "<one short phrase describing your approach>"\n' +
      "}\n" +
      "Return the JSON object and nothing else.",
  );
  return parts.join("\n\n");
}

/** Parse the reply-draft JSON; fall back to raw text as the body. */
function parseReplyDraft(raw: string): { body: string; angle: string | null } | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const body = typeof obj.body === "string" ? obj.body.trim() : "";
      if (body) return { body, angle: typeof obj.angle === "string" ? obj.angle : null };
    } catch {
      // fall through
    }
  }
  const body = raw.trim();
  return body ? { body, angle: null } : null;
}

interface DraftResult {
  draftId: string;
  autoApproved: boolean;
}

/**
 * Generate + persist a reply draft. Approval decision:
 *   auto-approve ONLY when config.replies.autoReply===true AND mode==='autonomous'
 *   AND intent in autoReplyIntents AND confidence>=0.7. Otherwise pending_approval.
 * (autoReply is false today → always pending_approval → nothing auto-sends.)
 * The metadata_json.reply block carries everything the dispatcher needs to
 * thread the reply.
 */
async function draftReply(
  admin: SupabaseClient,
  systemPrompt: string,
  knowledgeBlock: string,
  reply: CorrelatedReply,
  classification: Classification,
  leadLine: string,
  harveyLast: string | null,
  config: AgentConfig,
  inboundLedgerId: string,
  createdBy: string | null,
  forceEscalate: boolean,
): Promise<DraftResult | null> {
  const userBlock = buildReplyDraftUserBlock({
    reply, intent: classification.intent, leadLine, harveyLast, knowledgeBlock,
  });
  const model = resolveLlmModel();
  let llm = await callLlm(systemPrompt, userBlock, 800);
  let parsed = llm.ok ? parseReplyDraft(llm.text) : null;
  if (llm.ok && !parsed) {
    const nudge = userBlock +
      "\n\nIMPORTANT: Return ONLY the raw JSON object from the OUTPUT CONTRACT — no prose, no fences.";
    llm = await callLlm(systemPrompt, nudge, 800);
    parsed = llm.ok ? parseReplyDraft(llm.text) : null;
  }
  if (!llm.ok || !parsed) return null;

  // Approval decision — auto-approve is intentionally hard to reach.
  const replies = (config.replies ?? {}) as Record<string, unknown>;
  const autoReply = replies.autoReply === true;
  const autoReplyIntents = Array.isArray(replies.autoReplyIntents)
    ? (replies.autoReplyIntents as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const mode = typeof config.mode === "string" ? config.mode : "assisted";
  const autoApproved = !forceEscalate &&
    autoReply &&
    mode === "autonomous" &&
    autoReplyIntents.includes(classification.intent) &&
    classification.confidence >= 0.7;
  const draftStatus = autoApproved ? "approved" : "pending_approval";

  // Thread continuity metadata for the dispatcher.
  const replyMeta: Record<string, unknown> = {
    is_reply: true,
    in_reply_to: reply.replyMessageId,
    references: reply.referencesChain,
    gmail_thread_id: reply.gmailThreadId,
    provider_chat_id: reply.providerChatId,
    inbound_id: inboundLedgerId,
    intent: classification.intent,
  };

  const contactJson: Record<string, unknown> = reply.channel === "email"
    ? { email: reply.fromEmail }
    : { provider_id: reply.fromProviderId, provider_chat_id: reply.providerChatId };

  const subject = reply.channel === "email"
    ? "Re: " + (reply.subject ?? "").replace(/^\s*re:\s*/i, "").trim()
    : null;

  const { data: draftRow, error: draftErr } = await admin
    .from("lit_agent_drafts")
    .insert({
      agent_name: CONFIG_KEY,
      lead_id: reply.leadId,
      contact_json: contactJson,
      channel: reply.channel,
      stage: "reply",
      intent: classification.intent,
      subject,
      body: parsed.body,
      angle: parsed.angle,
      facts_used: [],
      confidence: classification.confidence,
      status: draftStatus,
      requires_approval: !autoApproved,
      created_by: createdBy,
      metadata_json: {
        model,
        test_mode: config.testMode === true,
        request_id: inboundLedgerId,
        auto_approved: autoApproved,
        reply: replyMeta,
        classification: {
          intent: classification.intent,
          sentiment: classification.sentiment,
          confidence: classification.confidence,
          urgency: classification.urgency,
          meeting_intent: classification.meeting_intent,
        },
      },
    })
    .select("id")
    .single();
  if (draftErr) throw new Error(`lit_agent_drafts (reply) insert failed: ${draftErr.message}`);
  return { draftId: draftRow.id as string, autoApproved };
}

// ─── ledger write ────────────────────────────────────────────────────────────

interface LedgerFields {
  channel: "email" | "linkedin";
  source_message_id: string;
  source_row_id: string | null;
  lead_id: string | null;
  from_email: string | null;
  from_provider_id: string | null;
  thread_ref: string | null;
  reply_message_id: string | null;
  intent: string | null;
  classification_json: Record<string, unknown> | null;
  action: string | null;
  draft_id: string | null;
  run_id: string | null;
  status?: "processed" | "error";
  error?: string | null;
}

/**
 * Insert a lit_agent_inbound ledger row. Returns the new id, or null on a 23505
 * (already processed by a concurrent tick — skip). Throws on other DB errors.
 */
async function ledgerInsert(admin: SupabaseClient, fields: LedgerFields): Promise<string | null> {
  const { data, error } = await admin
    .from("lit_agent_inbound")
    .insert({
      agent_name: CONFIG_KEY,
      channel: fields.channel,
      source_message_id: fields.source_message_id,
      source_row_id: fields.source_row_id,
      lead_id: fields.lead_id,
      from_email: fields.from_email,
      from_provider_id: fields.from_provider_id,
      thread_ref: fields.thread_ref,
      reply_message_id: fields.reply_message_id,
      intent: fields.intent,
      classification_json: fields.classification_json,
      action: fields.action,
      draft_id: fields.draft_id,
      run_id: fields.run_id,
      status: fields.status ?? "processed",
      error: fields.error ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return null; // already handled
    throw new Error(`lit_agent_inbound insert failed: ${error.message}`);
  }
  return data.id as string;
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  // ── auth: verified cron OR platform-admin lead-CRM member — else 401/403 ────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null =
    typeof body.created_by === "string" ? body.created_by : null;

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

  const limit = Number.isFinite(Number(body.limit))
    ? Math.min(MAX_LIMIT, Math.max(1, Number(body.limit)))
    : DEFAULT_LIMIT;

  // Helper: record a 'skipped' run and return WITHOUT processing anything.
  const skippedRun = async (reason: string) => {
    let runId: string | null = null;
    try {
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision: "handle_replies",
        decision_reason: reason,
        input_json: { request_id: rid, actor_user_id: actorUserId, limit },
        output_json: { scanned: 0, drafted: 0, escalated: 0, suppressed: 0, auto_replied: 0, ignored: 0 },
        completed_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      log.error("skipped_run_audit_failed", { err: String(auditErr) });
    }
    log.info("skipped", { run_id: runId, reason, trigger_type: triggerType });
    return json({
      ok: true, run_id: runId, scanned: 0, drafted: 0, escalated: 0,
      suppressed: 0, auto_replied: 0, ignored: 0, reason,
    });
  };

  let runId: string | null = null;
  try {
    // ── GATE (a): feature flag — fail CLOSED ─────────────────────────────────
    const flagEnabled = await isAgentFlagEnabled(admin, FLAG_KEY);
    if (!flagEnabled) {
      return await skippedRun(`feature flag '${FLAG_KEY}' missing or killed (fail-closed)`);
    }

    // ── GATE (b): config must exist AND enabled === true ─────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      return await skippedRun(
        config ? "lit_agent_config['harvey'].enabled is false" : "lit_agent_config['harvey'] row missing (fail-closed)",
      );
    }

    // ── GATE (c): quiet hours (manual/test invocations exempt) ───────────────
    if (triggerType !== "manual" && triggerType !== "test" && withinQuietHours(config)) {
      const qh = config.quietHours;
      return await skippedRun(`within quiet hours (${qh?.start}–${qh?.end} ${qh?.timezone})`);
    }

    const testMode = config.testMode === true;
    const replies = (config.replies ?? {}) as Record<string, unknown>;
    const alwaysEscalateIntents = Array.isArray(replies.alwaysEscalateIntents)
      ? (replies.alwaysEscalateIntents as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

    // ── open the run so an error still has a run id ──────────────────────────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      decision: "handle_replies",
      test_mode: testMode,
      input_json: { request_id: rid, actor_user_id: actorUserId, limit },
    });
    log.info("run_started", { run_id: runId, limit, trigger_type: triggerType });

    // ── resolve Harvey's mailbox ids + LinkedIn account ──────────────────────
    const senderEmail = typeof config.sender?.emailAccount === "string"
      ? config.sender.emailAccount
      : "harvey@logisticintel.com";
    const { data: acctRows } = await admin
      .from("lit_email_accounts")
      .select("id")
      .eq("email", senderEmail);
    const mailboxIds = (acctRows ?? []).map((a: { id: string }) => a.id as string);
    const linkedinAccountId = typeof config.sender?.linkedinAccountId === "string"
      ? config.sender.linkedinAccountId
      : null;

    // ── FETCH inbound (email + linkedin) ─────────────────────────────────────
    const [{ correlated: emailReplies, ignored: emailIgnored }, linkedinReplies] = await Promise.all([
      fetchEmailReplies(admin, mailboxIds, limit),
      fetchLinkedinReplies(admin, linkedinAccountId, limit),
    ]);

    // Grounding for the LLM (persona + approved knowledge).
    const profile = (config.profile ?? null) as Record<string, unknown> | null;
    const systemPrompt = buildHarveySystemPrompt(profile);
    const knowledge = await fetchApprovedKnowledge(admin);
    const knowledgeBlock = renderKnowledgeBlock(knowledge);

    const summary = {
      scanned: 0,
      correlated: 0,
      suppressed: 0,
      escalated: 0,
      drafted: 0,
      auto_replied: 0,
      ignored: 0,
      by_intent: {} as Record<string, number>,
    };
    const bumpIntent = (k: string) => { summary.by_intent[k] = (summary.by_intent[k] ?? 0) + 1; };

    // Ledger the NON-correlated inbound as action='ignored' so we never re-scan.
    for (const reply of emailIgnored) {
      summary.scanned += 1;
      try {
        await ledgerInsert(admin, {
          channel: reply.channel,
          source_message_id: reply.sourceMessageId,
          source_row_id: reply.sourceRowId,
          lead_id: null,
          from_email: reply.fromEmail,
          from_provider_id: reply.fromProviderId,
          thread_ref: reply.gmailThreadId ?? reply.providerChatId,
          reply_message_id: reply.replyMessageId,
          intent: null,
          classification_json: { correlated: false },
          action: "ignored",
          draft_id: null,
          run_id: runId,
        });
        summary.ignored += 1;
      } catch (ledErr) {
        log.warn("ledger_ignored_failed", { err: String((ledErr as Error)?.message ?? ledErr) });
      }
    }

    // Process correlated replies (email + linkedin).
    const allCorrelated = [...emailReplies, ...linkedinReplies];
    for (const reply of allCorrelated) {
      summary.scanned += 1;
      summary.correlated += 1;
      // Per-message try/catch → ledger status='error' for that message, continue.
      try {
        // ── (a) DETERMINISTIC HARD-GUARDS — run FIRST, no LLM ────────────────
        const guard = hardGuard(reply.bodyText);

        if (guard === "opt_out") {
          // Suppress (BOTH writes) — email only (LinkedIn suppression is out of
          // scope for the email suppression stores; we still mark the lead lost).
          if (reply.channel === "email" && reply.fromEmail) {
            await suppressEmail(admin, reply.fromEmail);
          }
          if (reply.leadId) {
            await admin.from("lit_admin_leads").update({ status: "lost" }).eq("id", reply.leadId);
            await logActivity(admin, reply.leadId, "reply_opt_out", {
              channel: reply.channel, intent: "unsubscribe",
              snippet: (reply.bodyText ?? "").slice(0, 400), agent: CONFIG_KEY,
            });
          }
          await ledgerInsert(admin, {
            channel: reply.channel,
            source_message_id: reply.sourceMessageId,
            source_row_id: reply.sourceRowId,
            lead_id: reply.leadId,
            from_email: reply.fromEmail,
            from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId,
            reply_message_id: reply.replyMessageId,
            intent: "unsubscribe",
            classification_json: { hard_guard: "opt_out" },
            action: "suppressed",
            draft_id: null,
            run_id: runId,
          });
          summary.suppressed += 1; bumpIntent("unsubscribe");
          continue; // NO further processing, NO reply.
        }

        if (guard === "legal") {
          const who = reply.fromEmail ?? reply.fromName ?? reply.fromProviderId ?? "unknown sender";
          if (reply.leadId) {
            await createReviewTask(admin, reply.leadId, `URGENT: legal/compliance reply from ${who}`);
            await logActivity(admin, reply.leadId, "reply_legal_escalation", {
              channel: reply.channel, intent: "legal_escalation",
              snippet: (reply.bodyText ?? "").slice(0, 400), agent: CONFIG_KEY,
            });
          }
          await ledgerInsert(admin, {
            channel: reply.channel,
            source_message_id: reply.sourceMessageId,
            source_row_id: reply.sourceRowId,
            lead_id: reply.leadId,
            from_email: reply.fromEmail,
            from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId,
            reply_message_id: reply.replyMessageId,
            intent: "legal_escalation",
            classification_json: { hard_guard: "legal" },
            action: "escalated",
            draft_id: null,
            run_id: runId,
          });
          summary.escalated += 1; bumpIntent("legal_escalation");
          continue; // NO auto-reply EVER.
        }

        if (guard === "out_of_office") {
          await ledgerInsert(admin, {
            channel: reply.channel,
            source_message_id: reply.sourceMessageId,
            source_row_id: reply.sourceRowId,
            lead_id: reply.leadId,
            from_email: reply.fromEmail,
            from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId,
            reply_message_id: reply.replyMessageId,
            intent: "out_of_office",
            classification_json: { hard_guard: "out_of_office" },
            action: "ignored",
            draft_id: null,
            run_id: runId,
          });
          summary.ignored += 1; bumpIntent("out_of_office");
          continue; // No reply; do NOT advance stage.
        }

        // ── (b) LLM INTENT CLASSIFICATION (only after hard-guards clear) ─────
        const { leadLine, harveyLast } = await buildThreadContext(admin, reply);
        const { classification } = await classifyReply(systemPrompt, reply, leadLine, harveyLast);
        bumpIntent(classification.intent);

        // A classifier-detected opt-out/legal is a SECOND safety net — route them
        // to the deterministic handlers' semantics even though the keyword guard
        // didn't fire (belt-and-braces; hard-guards remain the primary gate).
        if (classification.intent === "unsubscribe") {
          if (reply.channel === "email" && reply.fromEmail) await suppressEmail(admin, reply.fromEmail);
          if (reply.leadId) {
            await admin.from("lit_admin_leads").update({ status: "lost" }).eq("id", reply.leadId);
            await logActivity(admin, reply.leadId, "reply_opt_out", {
              channel: reply.channel, intent: "unsubscribe",
              snippet: (reply.bodyText ?? "").slice(0, 400), agent: CONFIG_KEY, via: "classifier",
            });
          }
          await ledgerInsert(admin, {
            channel: reply.channel, source_message_id: reply.sourceMessageId, source_row_id: reply.sourceRowId,
            lead_id: reply.leadId, from_email: reply.fromEmail, from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId, reply_message_id: reply.replyMessageId,
            intent: "unsubscribe", classification_json: classification as unknown as Record<string, unknown>,
            action: "suppressed", draft_id: null, run_id: runId,
          });
          summary.suppressed += 1;
          continue;
        }
        if (classification.intent === "legal_escalation") {
          const who = reply.fromEmail ?? reply.fromName ?? reply.fromProviderId ?? "unknown sender";
          if (reply.leadId) {
            await createReviewTask(admin, reply.leadId, `URGENT: legal/compliance reply from ${who}`);
            await logActivity(admin, reply.leadId, "reply_legal_escalation", {
              channel: reply.channel, intent: "legal_escalation",
              snippet: (reply.bodyText ?? "").slice(0, 400), agent: CONFIG_KEY, via: "classifier",
            });
          }
          await ledgerInsert(admin, {
            channel: reply.channel, source_message_id: reply.sourceMessageId, source_row_id: reply.sourceRowId,
            lead_id: reply.leadId, from_email: reply.fromEmail, from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId, reply_message_id: reply.replyMessageId,
            intent: "legal_escalation", classification_json: classification as unknown as Record<string, unknown>,
            action: "escalated", draft_id: null, run_id: runId,
          });
          summary.escalated += 1;
          continue;
        }
        if (classification.intent === "out_of_office") {
          await ledgerInsert(admin, {
            channel: reply.channel, source_message_id: reply.sourceMessageId, source_row_id: reply.sourceRowId,
            lead_id: reply.leadId, from_email: reply.fromEmail, from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId, reply_message_id: reply.replyMessageId,
            intent: "out_of_office", classification_json: classification as unknown as Record<string, unknown>,
            action: "ignored", draft_id: null, run_id: runId,
          });
          summary.ignored += 1;
          continue;
        }

        // ── (c) DECIDE — advance stage + activity, then escalate or draft ────
        if (reply.leadId) {
          await moveToEngaged(admin, reply.leadId);
          await logActivity(admin, reply.leadId, reply.channel === "email" ? "email_reply_received" : "linkedin_reply_received", {
            channel: reply.channel,
            intent: classification.intent,
            sentiment: classification.sentiment,
            confidence: classification.confidence,
            snippet: (reply.bodyText ?? "").slice(0, 400),
            agent: CONFIG_KEY,
          });
        }

        // Escalation triggers: always-escalate intent, negative sentiment,
        // meeting intent (meetings are a later batch), or low confidence.
        const forceEscalate =
          alwaysEscalateIntents.includes(classification.intent) ||
          classification.sentiment === "negative" ||
          classification.meeting_intent === true ||
          classification.confidence < 0.5;

        // Draft a suggested reply either way (escalated drafts are still
        // pending_approval so a human can approve/edit).
        let draftResult: DraftResult | null = null;
        try {
          // We need the inbound ledger id BEFORE the draft (metadata.reply.inbound_id).
          // Insert the ledger first, then attach the draft id via update.
          const preLedgerId = await ledgerInsert(admin, {
            channel: reply.channel,
            source_message_id: reply.sourceMessageId,
            source_row_id: reply.sourceRowId,
            lead_id: reply.leadId,
            from_email: reply.fromEmail,
            from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId,
            reply_message_id: reply.replyMessageId,
            intent: classification.intent,
            classification_json: classification as unknown as Record<string, unknown>,
            action: forceEscalate ? "escalated" : "drafted",
            draft_id: null,
            run_id: runId,
          });
          if (preLedgerId === null) {
            // Concurrent tick already handled this message — skip cleanly.
            continue;
          }

          draftResult = await draftReply(
            admin, systemPrompt, knowledgeBlock, reply, classification,
            leadLine, harveyLast, config, preLedgerId, actorUserId, forceEscalate,
          );

          if (forceEscalate && reply.leadId) {
            const who = reply.fromEmail ?? reply.fromName ?? reply.fromProviderId ?? "unknown sender";
            await createReviewTask(admin, reply.leadId, `Review reply from ${who}: ${classification.intent}`);
          }

          // Attach the draft id + final action to the ledger row.
          const finalAction = draftResult?.autoApproved
            ? "auto_replied"
            : (forceEscalate ? "escalated" : "drafted");
          await admin
            .from("lit_agent_inbound")
            .update({ draft_id: draftResult?.draftId ?? null, action: finalAction })
            .eq("id", preLedgerId);

          if (draftResult?.autoApproved) summary.auto_replied += 1;
          else if (forceEscalate) summary.escalated += 1;
          else summary.drafted += 1;
        } catch (draftErr) {
          // Drafting failed but the reply WAS classified + logged — record the
          // classification on the ledger and continue. (If we reached here after
          // the pre-ledger insert, the row exists; ensure it isn't lost.)
          log.warn("reply_draft_failed", {
            source_message_id: reply.sourceMessageId,
            err: String((draftErr as Error)?.message ?? draftErr),
          });
          // Best-effort: ensure a ledger row exists for idempotency.
          await ledgerInsert(admin, {
            channel: reply.channel, source_message_id: reply.sourceMessageId, source_row_id: reply.sourceRowId,
            lead_id: reply.leadId, from_email: reply.fromEmail, from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId, reply_message_id: reply.replyMessageId,
            intent: classification.intent, classification_json: classification as unknown as Record<string, unknown>,
            action: forceEscalate ? "escalated" : "drafted", draft_id: null, run_id: runId,
            status: "error", error: String((draftErr as Error)?.message ?? draftErr).slice(0, 500),
          }).catch(() => {/* 23505 or already inserted — fine */});
          if (forceEscalate) summary.escalated += 1; else summary.drafted += 1;
        }
      } catch (perMsgErr) {
        // A single-message failure must NOT crash the loop — ledger 'error'.
        log.error("reply_exception", {
          source_message_id: reply.sourceMessageId,
          err: perMsgErr instanceof Error ? perMsgErr.message : String(perMsgErr),
        });
        try {
          await ledgerInsert(admin, {
            channel: reply.channel,
            source_message_id: reply.sourceMessageId,
            source_row_id: reply.sourceRowId,
            lead_id: reply.leadId,
            from_email: reply.fromEmail,
            from_provider_id: reply.fromProviderId,
            thread_ref: reply.gmailThreadId ?? reply.providerChatId,
            reply_message_id: reply.replyMessageId,
            intent: null,
            classification_json: null,
            action: null,
            draft_id: null,
            run_id: runId,
            status: "error",
            error: (perMsgErr instanceof Error ? perMsgErr.message : String(perMsgErr)).slice(0, 500),
          });
        } catch (_e) { /* best-effort audit (23505 = already logged) */ }
      }
    }

    // ── record the run summary ───────────────────────────────────────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "handle_replies",
      decision_reason:
        `replies: ${summary.correlated} correlated / ${summary.drafted} drafted / ` +
        `${summary.escalated} escalated / ${summary.suppressed} suppressed / ` +
        `${summary.auto_replied} auto_replied / ${summary.ignored} ignored`,
      output_json: {
        scanned: summary.scanned,
        correlated: summary.correlated,
        suppressed: summary.suppressed,
        escalated: summary.escalated,
        drafted: summary.drafted,
        auto_replied: summary.auto_replied,
        ignored: summary.ignored,
        by_intent: summary.by_intent,
      },
    });
    log.info("run_ok", {
      run_id: runId, scanned: summary.scanned, drafted: summary.drafted,
      escalated: summary.escalated, suppressed: summary.suppressed,
      auto_replied: summary.auto_replied, ignored: summary.ignored,
    });

    return json({
      ok: true,
      run_id: runId,
      scanned: summary.scanned,
      drafted: summary.drafted,
      escalated: summary.escalated,
      suppressed: summary.suppressed,
      auto_replied: summary.auto_replied,
      ignored: summary.ignored,
    });
  } catch (err) {
    // NEVER throw uncaught — record an error run and return.
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
          decision: "handle_replies",
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
