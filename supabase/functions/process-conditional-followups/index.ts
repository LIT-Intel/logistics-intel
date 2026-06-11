// Sub-project O — process-conditional-followups
//
// Cron-driven. For each due trigger row in lit_conditional_followups:
//   1. Evaluate condition against primary_campaign_id's recipients.
//   2. For each matching recipient, enroll into followup_campaign_id
//      (idempotent — skip if a non-suppressed row already exists).
//   3. Stamp processed_at.
//
// Supported conditions:
//   - { kind: 'clicked_url_no_meeting', url_pattern: '%cal.com%' }
//     Recipient has a 'clicked' row whose metadata.original_url OR
//     metadata.url matches url_pattern (ILIKE), AND has NO
//     'meeting_booked' / 'meeting_rescheduled' row for the same email
//     within the primary campaign.
//   - { kind: 'meeting_booked' }
//     Recipient has a 'meeting_booked' row in primary campaign.
//   - { kind: 'viewed_no_reply', wait_hours: N }
//     Recipient has an 'opened' row >= N hours ago in primary campaign,
//     AND no 'replied' status on any recipient row.
//   - { kind: 'not_viewed', wait_hours: N }
//     Recipient has NO 'opened' row, AND first 'sent' row in primary
//     campaign occurred >= N hours ago.
//
// Auth: X-Internal-Cron header must match LIT_CRON_SECRET (cron-only fn).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LIT_CRON_SECRET = Deno.env.get("LIT_CRON_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface ClickedUrlNoMeetingCondition {
  kind: "clicked_url_no_meeting";
  url_pattern: string;
}
interface MeetingBookedCondition {
  kind: "meeting_booked";
}
interface ViewedNoReplyCondition {
  kind: "viewed_no_reply";
  wait_hours?: number;
}
interface NotViewedCondition {
  kind: "not_viewed";
  wait_hours?: number;
}

type Condition =
  | ClickedUrlNoMeetingCondition
  | MeetingBookedCondition
  | ViewedNoReplyCondition
  | NotViewedCondition;

interface TriggerRow {
  id: string;
  primary_campaign_id: string;
  followup_campaign_id: string;
  condition: Condition;
  trigger_at: string;
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ fn: "process-conditional-followups", level, event, ts: new Date().toISOString(), ...fields })
  );
}

interface RecipientLite {
  id: string;
  email: string;
  org_id: string | null;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  status: string | null;
}

async function fetchRecipients(primaryCampaignId: string): Promise<RecipientLite[]> {
  const { data, error } = await supabase
    .from("lit_campaign_contacts")
    .select("id, email, org_id, user_id, first_name, last_name, display_name, status")
    .eq("campaign_id", primaryCampaignId);
  if (error) throw new Error(`recipients_fetch_failed: ${error.message}`);
  return ((data ?? []) as RecipientLite[]).filter((r) => !!r.email);
}

async function fetchEventEmailsByType(
  primaryCampaignId: string,
  eventTypes: string[],
): Promise<Array<{ email: string; ts: string | null }>> {
  const { data, error } = await supabase
    .from("lit_outreach_history")
    .select("metadata, created_at, event_type")
    .eq("campaign_id", primaryCampaignId)
    .in("event_type", eventTypes);
  if (error) throw new Error(`history_fetch_failed(${eventTypes.join(",")}): ${error.message}`);
  const out: Array<{ email: string; ts: string | null }> = [];
  for (const row of data ?? []) {
    const md = (row.metadata ?? {}) as Record<string, unknown>;
    const email = String(md.recipient_email ?? "").toLowerCase();
    if (!email) continue;
    out.push({ email, ts: (row.created_at as string) ?? null });
  }
  return out;
}

async function evaluateClickedUrlNoMeeting(
  primaryCampaignId: string,
  urlPattern: string,
): Promise<string[]> {
  const recipients = await fetchRecipients(primaryCampaignId);
  if (recipients.length === 0) return [];

  const { data: clicks, error: clickErr } = await supabase
    .from("lit_outreach_history")
    .select("metadata")
    .eq("campaign_id", primaryCampaignId)
    .or("event_type.eq.clicked,clicked_at.not.is.null");
  if (clickErr) throw new Error(`clicks_fetch_failed: ${clickErr.message}`);

  const patternRe = new RegExp(
    "^" + urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$",
    "i"
  );

  const clickedEmails = new Set<string>();
  for (const c of clicks ?? []) {
    const md = (c.metadata ?? {}) as Record<string, unknown>;
    const url = String(md.original_url ?? md.url ?? "");
    const recipientEmail = String(md.recipient_email ?? "").toLowerCase();
    if (!url || !recipientEmail) continue;
    if (patternRe.test(url)) clickedEmails.add(recipientEmail);
  }
  if (clickedEmails.size === 0) return [];

  const bookedRows = await fetchEventEmailsByType(primaryCampaignId, ["meeting_booked", "meeting_rescheduled"]);
  const bookedEmails = new Set(bookedRows.map((r) => r.email));

  const matched: string[] = [];
  for (const r of recipients) {
    const email = r.email.toLowerCase();
    if (clickedEmails.has(email) && !bookedEmails.has(email)) matched.push(r.id);
  }
  return matched;
}

async function evaluateMeetingBooked(primaryCampaignId: string): Promise<string[]> {
  const recipients = await fetchRecipients(primaryCampaignId);
  if (recipients.length === 0) return [];
  const bookedRows = await fetchEventEmailsByType(primaryCampaignId, ["meeting_booked", "meeting_rescheduled"]);
  const bookedEmails = new Set(bookedRows.map((r) => r.email));
  if (bookedEmails.size === 0) return [];
  const matched: string[] = [];
  for (const r of recipients) {
    if (bookedEmails.has(r.email.toLowerCase())) matched.push(r.id);
  }
  return matched;
}

async function evaluateViewedNoReply(
  primaryCampaignId: string,
  waitHours: number,
): Promise<string[]> {
  const recipients = await fetchRecipients(primaryCampaignId);
  if (recipients.length === 0) return [];
  const opens = await fetchEventEmailsByType(primaryCampaignId, ["opened"]);
  if (opens.length === 0) return [];

  // earliest open per email
  const earliestOpen = new Map<string, number>();
  for (const o of opens) {
    if (!o.ts) continue;
    const t = new Date(o.ts).getTime();
    if (isNaN(t)) continue;
    const prev = earliestOpen.get(o.email);
    if (prev === undefined || t < prev) earliestOpen.set(o.email, t);
  }

  const cutoff = Date.now() - waitHours * 3600_000;
  const matched: string[] = [];
  for (const r of recipients) {
    const email = r.email.toLowerCase();
    const openedAt = earliestOpen.get(email);
    if (openedAt === undefined) continue;
    if (openedAt > cutoff) continue; // too recent
    if ((r.status ?? "").toLowerCase() === "replied") continue;
    matched.push(r.id);
  }
  return matched;
}

async function evaluateNotViewed(
  primaryCampaignId: string,
  waitHours: number,
): Promise<string[]> {
  const recipients = await fetchRecipients(primaryCampaignId);
  if (recipients.length === 0) return [];
  const opens = await fetchEventEmailsByType(primaryCampaignId, ["opened"]);
  const openedEmails = new Set(opens.map((o) => o.email));

  const sends = await fetchEventEmailsByType(primaryCampaignId, ["sent"]);
  const earliestSent = new Map<string, number>();
  for (const s of sends) {
    if (!s.ts) continue;
    const t = new Date(s.ts).getTime();
    if (isNaN(t)) continue;
    const prev = earliestSent.get(s.email);
    if (prev === undefined || t < prev) earliestSent.set(s.email, t);
  }

  const cutoff = Date.now() - waitHours * 3600_000;
  const matched: string[] = [];
  for (const r of recipients) {
    const email = r.email.toLowerCase();
    if (openedEmails.has(email)) continue;
    const sentAt = earliestSent.get(email);
    if (sentAt === undefined) continue;
    if (sentAt > cutoff) continue;
    matched.push(r.id);
  }
  return matched;
}

async function enrollRecipientsInto(
  followupCampaignId: string,
  primaryRecipientIds: string[],
  now: string,
): Promise<{ enrolled: number; skipped: number }> {
  if (primaryRecipientIds.length === 0) return { enrolled: 0, skipped: 0 };

  const { data: srcRecipients, error: srcErr } = await supabase
    .from("lit_campaign_contacts")
    .select("id, email, first_name, last_name, display_name, title, linkedin_url, phone, contact_id, company_id, org_id")
    .in("id", primaryRecipientIds);
  if (srcErr) throw new Error(`src_recipients_fetch_failed: ${srcErr.message}`);
  if (!srcRecipients || srcRecipients.length === 0) return { enrolled: 0, skipped: 0 };

  const { data: fc, error: fcErr } = await supabase
    .from("lit_campaigns")
    .select("id, user_id, org_id")
    .eq("id", followupCampaignId)
    .single();
  if (fcErr || !fc) throw new Error(`followup_campaign_fetch_failed: ${fcErr?.message ?? "not_found"}`);

  const { data: firstStep, error: stepErr } = await supabase
    .from("lit_campaign_steps")
    .select("id")
    .eq("campaign_id", followupCampaignId)
    .order("step_order", { ascending: true })
    .limit(1)
    .single();
  if (stepErr || !firstStep) throw new Error(`followup_first_step_fetch_failed: ${stepErr?.message ?? "not_found"}`);

  let enrolled = 0;
  let skipped = 0;

  for (const r of srcRecipients) {
    const { data: existing, error: exErr } = await supabase
      .from("lit_campaign_contacts")
      .select("id, status")
      .eq("campaign_id", followupCampaignId)
      .eq("email", r.email)
      .maybeSingle();
    if (exErr) {
      log("warn", "existing_check_failed", { email: r.email, err: exErr.message });
      skipped++;
      continue;
    }
    if (existing) {
      skipped++;
      continue;
    }

    const { error: insErr } = await supabase.from("lit_campaign_contacts").insert({
      campaign_id: followupCampaignId,
      org_id: fc.org_id ?? r.org_id,
      user_id: fc.user_id,
      contact_id: r.contact_id,
      company_id: r.company_id,
      current_step_id: null,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      display_name: r.display_name,
      title: r.title,
      linkedin_url: r.linkedin_url,
      phone: r.phone,
      status: "queued",
      next_send_at: now,
      next_step_order: 1,
      merge_vars: {},
    });
    if (insErr) {
      log("warn", "enroll_insert_failed", { email: r.email, err: insErr.message });
      skipped++;
      continue;
    }
    enrolled++;
  }

  return { enrolled, skipped };
}

Deno.serve(async (req: Request) => {
  const cronHeader = req.headers.get("X-Internal-Cron") ?? "";
  if (!LIT_CRON_SECRET || cronHeader !== LIT_CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();

  const { data: dueTriggers, error: dueErr } = await supabase
    .from("lit_conditional_followups")
    .select("id, primary_campaign_id, followup_campaign_id, condition, trigger_at")
    .is("processed_at", null)
    .lte("trigger_at", now)
    .order("trigger_at", { ascending: true });
  if (dueErr) {
    log("error", "due_fetch_failed", { err: dueErr.message });
    return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 });
  }

  const triggers = (dueTriggers ?? []) as TriggerRow[];
  if (triggers.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const t of triggers) {
    try {
      let matched: string[] = [];
      const kind = t.condition?.kind;
      if (kind === "clicked_url_no_meeting") {
        matched = await evaluateClickedUrlNoMeeting(
          t.primary_campaign_id,
          (t.condition as ClickedUrlNoMeetingCondition).url_pattern
        );
      } else if (kind === "meeting_booked") {
        matched = await evaluateMeetingBooked(t.primary_campaign_id);
      } else if (kind === "viewed_no_reply") {
        const waitHours = (t.condition as ViewedNoReplyCondition).wait_hours ?? 24;
        matched = await evaluateViewedNoReply(t.primary_campaign_id, waitHours);
      } else if (kind === "not_viewed") {
        const waitHours = (t.condition as NotViewedCondition).wait_hours ?? 48;
        matched = await evaluateNotViewed(t.primary_campaign_id, waitHours);
      } else {
        log("warn", "unknown_condition_kind", { trigger_id: t.id, kind });
      }

      const { enrolled, skipped } = await enrollRecipientsInto(
        t.followup_campaign_id,
        matched,
        now
      );

      const { error: stampErr } = await supabase
        .from("lit_conditional_followups")
        .update({ processed_at: now })
        .eq("id", t.id);
      if (stampErr) {
        log("warn", "stamp_processed_failed", { trigger_id: t.id, err: stampErr.message });
      }

      log("info", "trigger_processed", {
        trigger_id: t.id,
        kind,
        matched: matched.length,
        enrolled,
        skipped,
      });
      results.push({
        trigger_id: t.id,
        kind,
        matched: matched.length,
        enrolled,
        skipped,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log("error", "trigger_failed", { trigger_id: t.id, err });
      results.push({ trigger_id: t.id, error: err });
    }
  }

  return new Response(JSON.stringify({ processed: triggers.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
