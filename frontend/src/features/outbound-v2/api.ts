/**
 * Outbound Engine v2 — data layer.
 *
 * Direct Supabase reads/writes (RLS-scoped) + thin wrappers over existing
 * edge functions. No fabricated numbers: everything here returns either a
 * real row/aggregate or null so the selectors in data/computeOutbound.ts
 * can render an honest "—" / "Coming soon" state.
 *
 * Reuses (does NOT duplicate):
 *   - features/outbound/api/campaignActions.ts  → pause/resume/archive/delete,
 *     saveCampaignDraft (atomic create used by "Use template")
 *   - features/outbound/api/campaignMetrics.ts  → funnel RPC
 *   - api/outreach.ts                           → OAuth starts, queue-campaign-recipients
 */
import { supabase } from "@/lib/supabase";
import {
  saveCampaignDraft,
  type SaveCampaignDraftStep,
} from "@/features/outbound/api/campaignActions";

// ────────────────────────────────────────────────────────── steps CRUD

export interface StepVariant {
  key: string; // "A" | "B" | "C" | "D"
  subject: string;
  body?: string;
  sent?: number;
  opened?: number;
  replied?: number;
}

export interface OutboundStepRow {
  id: string;
  campaign_id: string;
  step_order: number;
  channel: string;
  step_type: string;
  subject: string | null;
  body: string | null;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
  subject_b: string | null;
  include_signature: boolean;
  time_of_day_local: string | null;
  weekdays_only: boolean | null;
  metadata: Record<string, unknown> | null;
  variants: StepVariant[] | null;
  linkedin_action: string | null;
  branch: Record<string, unknown> | null;
}

const STEP_COLS =
  "id, campaign_id, step_order, channel, step_type, subject, body, delay_days, delay_hours, delay_minutes, subject_b, include_signature, time_of_day_local, weekdays_only, metadata, variants, linkedin_action, branch";

export async function listCampaignSteps(
  campaignId: string,
): Promise<OutboundStepRow[]> {
  if (!campaignId) return [];
  const { data, error } = await supabase
    .from("lit_campaign_steps")
    .select(STEP_COLS)
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });
  if (error) throw new Error(`listCampaignSteps: ${error.message}`);
  return (data ?? []) as unknown as OutboundStepRow[];
}

export interface CreateStepInput {
  channel: string;
  step_type: string;
  step_order: number;
  subject?: string | null;
  body?: string | null;
  delay_days?: number;
  delay_hours?: number;
  delay_minutes?: number;
  metadata?: Record<string, unknown>;
  variants?: StepVariant[] | null;
  linkedin_action?: string | null;
  include_signature?: boolean;
}

export async function createCampaignStep(
  campaignId: string,
  input: CreateStepInput,
): Promise<OutboundStepRow> {
  if (!campaignId) throw new Error("createCampaignStep: campaignId required");
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("createCampaignStep: not signed in");
  const row = {
    campaign_id: campaignId,
    user_id: userId,
    step_order: input.step_order,
    channel: input.channel,
    step_type: input.step_type,
    subject: input.subject ?? null,
    body: input.body ?? null,
    delay_days: input.delay_days ?? 0,
    delay_hours: input.delay_hours ?? 0,
    delay_minutes: input.delay_minutes ?? 0,
    metadata: input.metadata ?? {},
    variants: input.variants ?? null,
    linkedin_action: input.linkedin_action ?? null,
    include_signature: input.include_signature ?? true,
  };
  const { data, error } = await supabase
    .from("lit_campaign_steps")
    .insert(row)
    .select(STEP_COLS)
    .single();
  if (error) throw new Error(`createCampaignStep: ${error.message}`);
  return data as unknown as OutboundStepRow;
}

export interface UpdateStepPatch {
  subject?: string | null;
  body?: string | null;
  delay_days?: number;
  delay_hours?: number;
  delay_minutes?: number;
  metadata?: Record<string, unknown>;
  /**
   * Variants write. Legacy compatibility: when variants are provided we ALSO
   * mirror variant A into subject/body and variant B's subject into
   * subject_b, so the existing dispatcher (which only knows subject/subject_b)
   * keeps working unchanged.
   */
  variants?: StepVariant[] | null;
  linkedin_action?: string | null;
  include_signature?: boolean;
  subject_b?: string | null;
}

export async function updateCampaignStep(
  stepId: string,
  patch: UpdateStepPatch,
): Promise<void> {
  if (!stepId) throw new Error("updateCampaignStep: stepId required");
  const update: Record<string, unknown> = { ...patch };
  if (patch.variants !== undefined && patch.variants !== null) {
    const a = patch.variants[0];
    const b = patch.variants[1];
    if (a) {
      if (update.subject === undefined) update.subject = a.subject ?? null;
      if (update.body === undefined) update.body = a.body ?? null;
    }
    update.subject_b = b?.subject ?? null;
  }
  const { data, error } = await supabase
    .from("lit_campaign_steps")
    .update(update)
    .eq("id", stepId)
    .select("id");
  if (error) throw new Error(`updateCampaignStep: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("updateCampaignStep: not found or no permission");
  }
}

export async function deleteCampaignStep(stepId: string): Promise<void> {
  if (!stepId) throw new Error("deleteCampaignStep: stepId required");
  const { data, error } = await supabase
    .from("lit_campaign_steps")
    .delete()
    .eq("id", stepId)
    .select("id");
  if (error) throw new Error(`deleteCampaignStep: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("deleteCampaignStep: not found or no permission");
  }
}

// ────────────────────────────────────────────────────────── campaign header

export interface CampaignHeaderRow {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  metrics: Record<string, unknown>;
  created_at: string | null;
  scheduled_start_at: string | null;
  send_timezone: string | null;
  exit_overrides: Record<string, unknown> | null;
}

export async function fetchCampaignHeader(
  campaignId: string,
): Promise<CampaignHeaderRow> {
  const { data, error } = await supabase
    .from("lit_campaigns")
    .select(
      "id, name, status, channel, metrics, created_at, scheduled_start_at, send_timezone, exit_overrides",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`fetchCampaignHeader: ${error.message}`);
  if (!data) throw new Error("Campaign not found");
  return {
    ...(data as any),
    metrics: (data as any).metrics ?? {},
  } as CampaignHeaderRow;
}

export async function countCampaignCompanies(
  campaignId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("lit_campaign_companies")
    .select("company_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) return 0;
  return count ?? 0;
}

// ────────────────────────────────────────────────────────── detail aggregates

export interface CampaignAggregates {
  /** lit_campaign_contacts */
  enrolledTotal: number;
  enrolledByStatus: Record<string, number>;
  scheduledNext: number; // next_send_at set
  contacted: number; // last_sent_at set
  /** lit_outreach_history for this campaign */
  events: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    meetings: number;
  };
  /** per step_id → event counts (null when step_id isn't on history rows) */
  perStep: Map<string, { sent: number; opened: number; replied: number }> | null;
}

export async function fetchCampaignAggregates(
  campaignId: string,
): Promise<CampaignAggregates> {
  const contactsQ = supabase
    .from("lit_campaign_contacts")
    .select("status, next_send_at, last_sent_at")
    .eq("campaign_id", campaignId)
    .limit(10000);

  let historyRows: Array<{ event_type: string; step_id?: string | null }> = [];
  let hasStepId = true;
  {
    const { data, error } = await supabase
      .from("lit_outreach_history")
      .select("event_type, step_id")
      .eq("campaign_id", campaignId)
      .limit(20000);
    if (error) {
      // step_id column may not exist on older schemas — degrade gracefully.
      hasStepId = false;
      const retry = await supabase
        .from("lit_outreach_history")
        .select("event_type")
        .eq("campaign_id", campaignId)
        .limit(20000);
      historyRows = (retry.data ?? []) as any[];
    } else {
      historyRows = (data ?? []) as any[];
    }
  }

  const { data: contactRows } = await contactsQ;
  const enrolledByStatus: Record<string, number> = {};
  let scheduledNext = 0;
  let contacted = 0;
  for (const r of (contactRows ?? []) as any[]) {
    const s = String(r.status ?? "unknown");
    enrolledByStatus[s] = (enrolledByStatus[s] ?? 0) + 1;
    if (r.next_send_at) scheduledNext += 1;
    if (r.last_sent_at) contacted += 1;
  }

  const events = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, meetings: 0 };
  const perStep = hasStepId
    ? new Map<string, { sent: number; opened: number; replied: number }>()
    : null;
  for (const row of historyRows) {
    const evt = String(row.event_type ?? "");
    if (evt === "sent") events.sent += 1;
    else if (evt === "opened") events.opened += 1;
    else if (evt === "clicked") events.clicked += 1;
    else if (evt === "replied") events.replied += 1;
    else if (evt === "bounced") events.bounced += 1;
    else if (evt.includes("meeting")) events.meetings += 1;
    if (perStep && row.step_id) {
      const b =
        perStep.get(row.step_id) ??
        (() => {
          const nb = { sent: 0, opened: 0, replied: 0 };
          perStep.set(row.step_id!, nb);
          return nb;
        })();
      if (evt === "sent") b.sent += 1;
      else if (evt === "opened") b.opened += 1;
      else if (evt === "replied") b.replied += 1;
    }
  }

  return {
    enrolledTotal: (contactRows ?? []).length,
    enrolledByStatus,
    scheduledNext,
    contacted,
    events,
    perStep,
  };
}

// ────────────────────────────────────────────────────────── deals sourced

export interface DealLite {
  id: string;
  title: string;
  value_amount: number | null;
  status: string;
}

/**
 * Deals sourced by a campaign. Primary path: lit_deals.source_campaign_id
 * (new column). Fallback when the column doesn't exist yet: name match on
 * title/notes. Returns [] on any failure — the UI shows the honest empty copy.
 */
export async function listDealsForCampaign(
  campaignId: string,
  campaignName: string,
): Promise<DealLite[]> {
  try {
    const { data, error } = await supabase
      .from("lit_deals")
      .select("id, title, value_amount, status")
      .eq("source_campaign_id", campaignId)
      .limit(50);
    if (!error) return (data ?? []) as DealLite[];
  } catch {
    /* fall through to name match */
  }
  const name = (campaignName ?? "").trim();
  if (name.length < 4) return [];
  try {
    const safe = name.replace(/[%_]/g, "");
    const [byTitle, byNotes] = await Promise.all([
      supabase
        .from("lit_deals")
        .select("id, title, value_amount, status")
        .ilike("title", `%${safe}%`)
        .limit(25),
      supabase
        .from("lit_deals")
        .select("id, title, value_amount, status")
        .ilike("notes", `%${safe}%`)
        .limit(25),
    ]);
    const seen = new Map<string, DealLite>();
    for (const d of [...(byTitle.data ?? []), ...(byNotes.data ?? [])] as DealLite[]) {
      seen.set(d.id, d);
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

export interface DealsSourced {
  count: number;
  value: number;
  perCampaign: Map<string, { count: number; value: number }>;
}

/**
 * Org-wide "pipeline sourced by outbound" totals + per-campaign breakdown.
 * null = not derivable (lit_deals.source_campaign_id column absent) — the UI
 * shows "—" instead of inventing a number.
 */
export async function fetchDealsSourcedTotal(): Promise<DealsSourced | null> {
  try {
    const { data, error } = await supabase
      .from("lit_deals")
      .select("value_amount, source_campaign_id")
      .not("source_campaign_id", "is", null)
      .limit(2000);
    if (error) return null;
    const rows = (data ?? []) as Array<{
      value_amount: number | null;
      source_campaign_id: string | null;
    }>;
    const perCampaign = new Map<string, { count: number; value: number }>();
    let value = 0;
    for (const r of rows) {
      const v = Number(r.value_amount) || 0;
      value += v;
      if (r.source_campaign_id) {
        const b =
          perCampaign.get(r.source_campaign_id) ??
          (() => {
            const nb = { count: 0, value: 0 };
            perCampaign.set(r.source_campaign_id!, nb);
            return nb;
          })();
        b.count += 1;
        b.value += v;
      }
    }
    return { count: rows.length, value, perCampaign };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────── inbox threads

export interface EmailThreadRow {
  id: string;
  subject: string | null;
  participants: Array<{ email?: string; name?: string }> | null;
  last_message_at: string | null;
  message_count: number | null;
  unread_count: number | null;
  status: string | null;
  conversation_type: string | null;
  campaign_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  provider: string | null;
  email_account_id: string | null;
  intent: string | null;
  read_at: string | null;
}

const THREAD_COLS =
  "id, subject, participants, last_message_at, message_count, unread_count, status, conversation_type, campaign_id, company_id, contact_id, provider, email_account_id, intent, read_at";

export async function listInboxThreads(): Promise<EmailThreadRow[]> {
  const { data, error } = await supabase
    .from("lit_email_threads")
    .select(THREAD_COLS)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`listInboxThreads: ${error.message}`);
  return (data ?? []) as unknown as EmailThreadRow[];
}

/** Opening a thread marks it read: read_at = now, unread_count = 0. */
export async function markThreadRead(threadId: string): Promise<void> {
  const { error } = await supabase
    .from("lit_email_threads")
    .update({ read_at: new Date().toISOString(), unread_count: 0 })
    .eq("id", threadId);
  if (error) throw new Error(`markThreadRead: ${error.message}`);
}

export async function setThreadIntent(
  threadId: string,
  intent: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("lit_email_threads")
    .update({ intent })
    .eq("id", threadId);
  if (error) throw new Error(`setThreadIntent: ${error.message}`);
}

export interface EmailMessageRow {
  id: string;
  thread_id: string;
  direction: string | null;
  from_name: string | null;
  from_email: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  message_date: string | null;
}

export async function listThreadMessages(
  threadId: string,
): Promise<EmailMessageRow[]> {
  const { data, error } = await supabase
    .from("lit_email_messages")
    .select("id, thread_id, direction, from_name, from_email, body_text, body_html, snippet, message_date")
    .eq("thread_id", threadId)
    .order("message_date", { ascending: true });
  if (error) throw new Error(`listThreadMessages: ${error.message}`);
  return (data ?? []) as unknown as EmailMessageRow[];
}

export async function sendInboxReply(
  threadId: string,
  bodyText: string,
  bodyHtml?: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-inbox-reply", {
    body: { thread_id: threadId, body: bodyText, body_html: bodyHtml ?? bodyText },
  });
  if (error) throw new Error(error.message || "send_failed");
  if (data && (data as any).ok === false) {
    throw new Error((data as any).error || "send_failed");
  }
}

export async function syncInbox(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("sync-inbox", { body: {} });
  if (error) throw new Error(error.message || "sync_failed");
  if (data && (data as any).ok === false) {
    throw new Error((data as any).error || "sync_failed");
  }
}

// ────────────────────────────────────────────────────────── mailboxes

export interface MailAccountRow {
  id: string;
  email: string;
  provider: string | null;
  status: string | null;
  is_primary: boolean | null;
  created_at: string | null;
}

export async function listEmailAccounts(): Promise<MailAccountRow[]> {
  const { data, error } = await supabase
    .from("lit_email_accounts")
    .select("id, email, provider, status, is_primary, created_at")
    .order("is_primary", { ascending: false });
  if (error) throw new Error(`listEmailAccounts: ${error.message}`);
  return (data ?? []) as unknown as MailAccountRow[];
}

export interface PerAccountStats {
  sent7: number;
  sent30: number;
  replies7: number;
  failed7: number; // bounced event OR failed_at set, last 7d
}

export interface MailboxStats {
  /** keyed by lit_email_accounts.id; null when history rows don't carry
   *  email_account_id (older schema) — UI then shows org-wide totals only. */
  perAccount: Map<string, PerAccountStats> | null;
  totals: { sent7: number; sent30: number; replies7: number; failed7: number };
}

/**
 * Real send/reply/bounce-ish counts from lit_outreach_history over the last
 * 7/30 days. Only what's actually derivable — no invented health scores.
 */
export async function fetchMailboxStats(): Promise<MailboxStats> {
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since7 = Date.now() - 7 * 86400_000;
  const totals = { sent7: 0, sent30: 0, replies7: 0, failed7: 0 };

  let rows: Array<{
    event_type: string;
    occurred_at: string | null;
    email_account_id?: string | null;
    failed_at?: string | null;
  }> = [];
  let hasAccountCol = true;

  const first = await supabase
    .from("lit_outreach_history")
    .select("event_type, occurred_at, email_account_id, failed_at")
    .gte("occurred_at", since30)
    .limit(20000);
  if (first.error) {
    hasAccountCol = false;
    const retry = await supabase
      .from("lit_outreach_history")
      .select("event_type, occurred_at")
      .gte("occurred_at", since30)
      .limit(20000);
    if (retry.error) return { perAccount: null, totals };
    rows = (retry.data ?? []) as any[];
  } else {
    rows = (first.data ?? []) as any[];
  }

  const perAccount = hasAccountCol ? new Map<string, PerAccountStats>() : null;
  for (const r of rows) {
    const t = r.occurred_at ? new Date(r.occurred_at).getTime() : 0;
    const in7 = t >= since7;
    const evt = String(r.event_type ?? "");
    const isFail = evt === "bounced" || Boolean(r.failed_at);
    if (evt === "sent") {
      totals.sent30 += 1;
      if (in7) totals.sent7 += 1;
    }
    if (evt === "replied" && in7) totals.replies7 += 1;
    if (isFail && in7) totals.failed7 += 1;
    if (perAccount && r.email_account_id) {
      const b =
        perAccount.get(r.email_account_id) ??
        (() => {
          const nb = { sent7: 0, sent30: 0, replies7: 0, failed7: 0 };
          perAccount.set(r.email_account_id!, nb);
          return nb;
        })();
      if (evt === "sent") {
        b.sent30 += 1;
        if (in7) b.sent7 += 1;
      }
      if (evt === "replied" && in7) b.replies7 += 1;
      if (isFail && in7) b.failed7 += 1;
    }
  }
  return { perAccount, totals };
}

// ────────────────────────────────────────────────────────── templates

export interface WorkspaceTemplateRow {
  id: string;
  title: string;
  channel: string | null;
  subject_template: string | null;
  body_template: string | null;
  stage: string | null;
  mode: string | null;
}

export async function listWorkspaceTemplates(): Promise<WorkspaceTemplateRow[]> {
  const { data, error } = await supabase
    .from("lit_outreach_templates")
    .select("id, title, channel, subject_template, body_template, stage, mode")
    .eq("is_active", true)
    .limit(200);
  if (error) throw new Error(`listWorkspaceTemplates: ${error.message}`);
  return (data ?? []) as unknown as WorkspaceTemplateRow[];
}

/**
 * "Use template" → creates a Draft lit_campaigns row + its steps atomically
 * via the existing save-campaign-draft edge function, then returns the new
 * campaign id so the caller can open its detail view.
 */
export async function createDraftCampaign(input: {
  name: string;
  channels: string[];
  audience?: string[];
  playName?: string;
  steps: SaveCampaignDraftStep[];
}): Promise<string> {
  const res = await saveCampaignDraft({
    name: input.name,
    channel: input.channels[0] ?? "email",
    metrics: {
      channels: input.channels,
      ...(input.playName ? { play: input.playName } : {}),
      ...(input.audience?.length ? { audience: input.audience } : {}),
      step_count: input.steps.length,
    },
    company_ids: [],
    steps: input.steps,
    replace_companies: false,
  });
  return res.campaign_id;
}

// ────────────────────────────────────────────────────────── preview contact

export interface SampleContact {
  id: string;
  fullName: string | null;
  firstName: string | null;
  email: string | null;
  companyName: string | null;
}

/** A real enrolled contact for token preview; null when none enrolled. */
export async function getSampleEnrolledContact(
  campaignId: string,
): Promise<SampleContact | null> {
  try {
    const { data: cc } = await supabase
      .from("lit_campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .not("contact_id", "is", null)
      .limit(1);
    const contactId = (cc ?? [])[0]?.contact_id;
    if (!contactId) return null;
    let row: any = null;
    const withCo = await supabase
      .from("lit_contacts")
      .select("id, full_name, email, company_name")
      .eq("id", contactId)
      .maybeSingle();
    if (withCo.error) {
      const plain = await supabase
        .from("lit_contacts")
        .select("id, full_name, email")
        .eq("id", contactId)
        .maybeSingle();
      row = plain.data;
    } else {
      row = withCo.data;
    }
    if (!row) return null;
    const fullName = row.full_name ?? null;
    return {
      id: String(row.id),
      fullName,
      firstName: fullName ? String(fullName).split(/\s+/)[0] : null,
      email: row.email ?? null,
      companyName: row.company_name ?? null,
    };
  } catch {
    return null;
  }
}
