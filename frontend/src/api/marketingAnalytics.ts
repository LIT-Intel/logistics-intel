/**
 * Marketing analytics — Resend email-event aggregations.
 *
 * Backs the in-app /app/admin/marketing-analytics dashboard. Reads from
 * public.lit_resend_events via the Supabase client. The table's RLS policy
 * (admins-only via public.is_admin_caller()) enforces that only platform
 * admins can ever see this data — the page-level <RequireSuperAdmin>
 * guard is the second layer.
 *
 * All counts are computed client-side over the most recent N rows. For
 * the LIT scale (single-digit thousands of emails/month) this is fine
 * and keeps the dashboard a pure read — no RPCs to maintain. If we cross
 * 100k events/month we should move the KPI rollups into a Postgres view.
 */

import { supabase } from "@/lib/supabase";
import { SEQUENCES, type SequenceKey } from "../marketingSequences";

export type EmailEvent = {
  id: number;
  resend_email_id: string;
  event_type: string;
  email_to: string | null;
  template_id: string | null;
  subject: string | null;
  click_url: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
};

export type KpiSummary = {
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounced: number;
  complained: number;
  failed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
};

export type TemplatePerformance = {
  templateId: string;
  templateLabel: string;
  sequenceKey: SequenceKey | "unknown";
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  bounced: number;
  openRate: number;
  clickRate: number;
};

export type SequencePerformance = {
  sequenceKey: SequenceKey;
  label: string;
  steps: number;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number;
  clickRate: number;
};

export const SEQUENCE_LABELS: Record<SequenceKey, string> = {
  "trial-welcome": "Trial Welcome",
  "top-100-followup": "Top-100 PDF",
  "partner-onboarding": "Partner Onboarding",
  "comparison-nurture": "Comparison Nurture",
};

/**
 * Build a reverse index from env-var name → { sequenceKey, step, subject }
 * so we can correlate an event's template_id (resolved at dispatch from
 * env) back to its sequence. This is a best-effort heuristic — events
 * whose template_id doesn't map are bucketed as "unknown".
 */
function buildTemplateLookup() {
  const out = new Map<
    string,
    { sequenceKey: SequenceKey; step: number; subject: string; envVar: string }
  >();
  (Object.keys(SEQUENCES) as SequenceKey[]).forEach((seqKey) => {
    SEQUENCES[seqKey].forEach((s) => {
      // We don't have the resolved Resend template id on the client, only
      // the env-var name. The dashboard treats `template_id` as opaque and
      // groups + labels via a hint string + env-var fallback.
      out.set(s.envTemplateVar, {
        sequenceKey: seqKey,
        step: s.step,
        subject: s.subject,
        envVar: s.envTemplateVar,
      });
    });
  });
  return out;
}

/**
 * Fetch recent email events. Capped at 10,000 to keep the page fast — a
 * 30-day window at LIT volume sits comfortably under this.
 */
export async function fetchRecentEmailEvents(
  sinceIso?: string,
  limit = 5000,
): Promise<EmailEvent[]> {
  let q = supabase
    .from("lit_resend_events")
    .select(
      "id,resend_email_id,event_type,email_to,template_id,subject,click_url,user_agent,ip,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as EmailEvent[];
}

/**
 * Roll a flat event list into the KPI summary card values.
 * Open rate / click rate are computed against DISTINCT delivered emails
 * (i.e. unique opens / delivered), matching Constant Contact conventions.
 */
export function computeKpis(events: EmailEvent[]): KpiSummary {
  const sentIds = new Set<string>();
  const deliveredIds = new Set<string>();
  const openedIds = new Set<string>();
  const clickedIds = new Set<string>();
  let bounced = 0;
  let complained = 0;
  let failed = 0;

  for (const e of events) {
    switch (e.event_type) {
      case "sent":
        sentIds.add(e.resend_email_id);
        break;
      case "delivered":
        deliveredIds.add(e.resend_email_id);
        break;
      case "opened":
        openedIds.add(e.resend_email_id);
        break;
      case "clicked":
        clickedIds.add(e.resend_email_id);
        break;
      case "bounced":
        bounced += 1;
        break;
      case "complained":
        complained += 1;
        break;
      case "failed":
        failed += 1;
        break;
    }
  }

  const sent = sentIds.size;
  const delivered = deliveredIds.size;
  const uniqueOpens = openedIds.size;
  const uniqueClicks = clickedIds.size;

  return {
    sent,
    delivered,
    uniqueOpens,
    uniqueClicks,
    bounced,
    complained,
    failed,
    openRate: delivered ? uniqueOpens / delivered : 0,
    clickRate: delivered ? uniqueClicks / delivered : 0,
    bounceRate: sent ? bounced / sent : 0,
    complaintRate: delivered ? complained / delivered : 0,
  };
}

/** Group events by template_id and roll a per-template perf table. */
export function computeTemplatePerformance(
  events: EmailEvent[],
): TemplatePerformance[] {
  const lookup = buildTemplateLookup();
  const byTpl = new Map<string, EmailEvent[]>();
  for (const e of events) {
    const key = e.template_id || "(no-template)";
    const bucket = byTpl.get(key);
    if (bucket) bucket.push(e);
    else byTpl.set(key, [e]);
  }
  const rows: TemplatePerformance[] = [];
  byTpl.forEach((evts, tpl) => {
    const k = computeKpis(evts);
    // Best-effort label: when the marketing-site cron tags events with the
    // env-var name, we can map back to a friendly sequence + step subject.
    const hit = lookup.get(tpl);
    const label = hit
      ? `${SEQUENCE_LABELS[hit.sequenceKey]} · Step ${hit.step}`
      : tpl;
    rows.push({
      templateId: tpl,
      templateLabel: label,
      sequenceKey: hit?.sequenceKey ?? "unknown",
      sent: k.sent,
      delivered: k.delivered,
      uniqueOpens: k.uniqueOpens,
      uniqueClicks: k.uniqueClicks,
      bounced: k.bounced,
      openRate: k.openRate,
      clickRate: k.clickRate,
    });
  });
  return rows.sort((a, b) => b.sent - a.sent);
}

/** Roll the per-template table up to one row per sequence. */
export function computeSequencePerformance(
  events: EmailEvent[],
): SequencePerformance[] {
  const lookup = buildTemplateLookup();
  const bySeq = new Map<SequenceKey, EmailEvent[]>();
  for (const e of events) {
    if (!e.template_id) continue;
    const hit = lookup.get(e.template_id);
    if (!hit) continue;
    const bucket = bySeq.get(hit.sequenceKey);
    if (bucket) bucket.push(e);
    else bySeq.set(hit.sequenceKey, [e]);
  }
  const rows: SequencePerformance[] = [];
  (Object.keys(SEQUENCES) as SequenceKey[]).forEach((seqKey) => {
    const evts = bySeq.get(seqKey) || [];
    const k = computeKpis(evts);
    rows.push({
      sequenceKey: seqKey,
      label: SEQUENCE_LABELS[seqKey],
      steps: SEQUENCES[seqKey].length,
      sent: k.sent,
      delivered: k.delivered,
      uniqueOpens: k.uniqueOpens,
      uniqueClicks: k.uniqueClicks,
      openRate: k.openRate,
      clickRate: k.clickRate,
    });
  });
  return rows;
}

/** Day-bucket sent counts for the trend chart. */
export function computeDailyVolume(
  events: EmailEvent[],
): Array<{ day: string; sent: number; opened: number; clicked: number }> {
  const buckets = new Map<
    string,
    { sent: Set<string>; opened: Set<string>; clicked: Set<string> }
  >();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    let b = buckets.get(day);
    if (!b) {
      b = { sent: new Set(), opened: new Set(), clicked: new Set() };
      buckets.set(day, b);
    }
    if (e.event_type === "sent") b.sent.add(e.resend_email_id);
    else if (e.event_type === "opened") b.opened.add(e.resend_email_id);
    else if (e.event_type === "clicked") b.clicked.add(e.resend_email_id);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, b]) => ({
      day,
      sent: b.sent.size,
      opened: b.opened.size,
      clicked: b.clicked.size,
    }));
}
