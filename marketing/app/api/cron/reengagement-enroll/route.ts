import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkCron } from "@/lib/cron-auth";
import { SEQUENCES } from "@/lib/lead-sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/reengagement-enroll
 *
 * Daily enrollment job that finds dormant leads and enqueues them into
 * the `re-engagement` sequence. Companion to lead-sequence-dispatch:
 * this cron writes the queue rows, the dispatcher drains them.
 *
 * Schedule: 16:00 UTC daily (vercel.json), one hour after the dispatcher
 * at 15:00 UTC so freshly enrolled step-1 rows are picked up in the
 * following day's drain (not the same day) and so we don't compete with
 * the dispatcher's batch for the email-send capacity.
 *
 * Auth: CRON_SECRET via Authorization: Bearer header (per checkCron).
 *
 * Candidate definition (a lead is enrolled when ALL hold):
 *   1. lit_leads row exists with created_at older than 30 days.
 *   2. No row in lit_lead_sequence_queue with sequence_key='re-engagement'
 *      for this email (never enrolled before — re-engagement is once-only).
 *   3. No 'opened' event in lit_email_events for this email in the last
 *      30 days. (Open = active = leave them alone.)
 *   4. Not bounced or complained per lit_email_suppression_status RPC.
 *   5. Not globally unsubscribed per lit_email_preferences.unsubscribed_all.
 *
 * Batch cap: 100 enrollments per run. With a daily cadence the funnel
 * drains naturally — a 30-day backlog of dormant leads clears in ~1 month.
 */

const BATCH_LIMIT = 100;
const DORMANT_DAYS = 30;
const STEP_2_DELAY_HOURS = 168; // 7 days

export async function GET(req: NextRequest) {
  const authFail = checkCron(req);
  if (authFail) return authFail;

  const startedAt = Date.now();
  const supa = getSupabase();
  if (!supa) {
    return json({ ok: false, error: "supabase_unconfigured" }, 503);
  }

  const cutoffIso = new Date(
    Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1. Pull a candidate pool of leads older than the dormancy cutoff.
  // We pull a wider window than BATCH_LIMIT because most candidates will
  // be filtered out by the four exclusion checks below. 500 in / 100 out
  // is the working ratio observed in dry-runs.
  const { data: leadRows, error: leadsErr } = await supa
    .from("lit_leads")
    .select("id, email, created_at")
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(500);

  if (leadsErr) {
    console.error("[reengagement-enroll] lit_leads fetch failed", leadsErr.message);
    return json({ ok: false, error: "leads_fetch_failed", message: leadsErr.message }, 500);
  }

  const candidates = (leadRows ?? []) as Array<{ id: string; email: string; created_at: string }>;
  if (candidates.length === 0) {
    return json({ ok: true, enrolled: 0, scanned: 0, durationMs: Date.now() - startedAt });
  }

  // De-dup by lowercased email — a single email can appear multiple times
  // in lit_leads across separate form submits. Keep the OLDEST row (so the
  // "30d since created" cutoff is satisfied even for repeat submitters).
  const emailMap = new Map<string, { id: string; email: string; created_at: string }>();
  for (const c of candidates) {
    const key = (c.email || "").toLowerCase();
    if (!key) continue;
    if (!emailMap.has(key)) emailMap.set(key, c);
  }
  const uniqueEmails = Array.from(emailMap.keys());

  // 2. Exclude anyone already in the re-engagement queue (any state).
  const { data: alreadyEnrolled } = await supa
    .from("lit_lead_sequence_queue")
    .select("email")
    .eq("sequence_key", "re-engagement")
    .in("email", uniqueEmails);
  const enrolledSet = new Set(
    (alreadyEnrolled ?? []).map((r: { email: string }) => (r.email || "").toLowerCase()),
  );

  // 3. Exclude anyone with an opened event in the last 30d (active).
  const { data: recentOpens } = await supa
    .from("lit_email_events")
    .select("metadata_json")
    .eq("event_type", "opened")
    .gt("created_at", cutoffIso)
    .filter("metadata_json->>email_to", "in", `(${uniqueEmails.join(",")})`);
  const openedSet = new Set(
    (recentOpens ?? []).map((r: { metadata_json?: { email_to?: string } }) =>
      (r.metadata_json?.email_to || "").toLowerCase(),
    ),
  );

  // 4. Exclude leads with global unsubscribe preference.
  const { data: prefs } = await supa
    .from("lit_email_preferences")
    .select("email, unsubscribed_all")
    .in("email", uniqueEmails);
  const unsubscribedSet = new Set(
    (prefs ?? [])
      .filter((r: { unsubscribed_all: boolean }) => r.unsubscribed_all === true)
      .map((r: { email: string }) => (r.email || "").toLowerCase()),
  );

  // 5. Suppression status (bounced/complained) — RPC must be queried per
  // email; the helper function returns a single row. Cap to BATCH_LIMIT
  // pre-filter candidates first to bound the RPC fan-out.
  const preFiltered = uniqueEmails.filter(
    (e) => !enrolledSet.has(e) && !openedSet.has(e) && !unsubscribedSet.has(e),
  );
  const candidatesToCheck = preFiltered.slice(0, BATCH_LIMIT);

  const reEngagementSteps = SEQUENCES["re-engagement"];
  const step1 = reEngagementSteps.find((s) => s.step === 1);
  const step2 = reEngagementSteps.find((s) => s.step === 2);
  if (!step1 || !step2) {
    return json({ ok: false, error: "sequence_misconfigured" }, 500);
  }

  let enrolled = 0;
  let suppressedCount = 0;
  let insertErrors = 0;
  const now = Date.now();

  for (const emailLower of candidatesToCheck) {
    const lead = emailMap.get(emailLower);
    if (!lead) continue;

    const { data: supData } = await supa.rpc("lit_email_suppression_status", {
      p_email: lead.email,
    });
    const sup = (Array.isArray(supData) ? supData[0] : supData) as
      | { converted?: boolean; bounced?: boolean; complained?: boolean }
      | undefined;

    if (sup && (sup.bounced || sup.complained)) {
      suppressedCount++;
      continue;
    }

    const queueRows = [
      {
        lead_id: lead.id,
        email: lead.email,
        sequence_key: "re-engagement",
        step: step1.step,
        send_at: new Date(now).toISOString(),
        template_id: process.env[step1.envTemplateVar] ?? null,
        subject: step1.subject,
        source: "re-engagement-cron",
        offer: null,
      },
      {
        lead_id: lead.id,
        email: lead.email,
        sequence_key: "re-engagement",
        step: step2.step,
        send_at: new Date(
          now + STEP_2_DELAY_HOURS * 60 * 60 * 1000,
        ).toISOString(),
        template_id: process.env[step2.envTemplateVar] ?? null,
        subject: step2.subject,
        source: "re-engagement-cron",
        offer: null,
      },
    ];

    const { error: insErr } = await supa
      .from("lit_lead_sequence_queue")
      .upsert(queueRows, {
        onConflict: "lead_id,sequence_key,step",
        ignoreDuplicates: true,
      });

    if (insErr) {
      console.error(
        "[reengagement-enroll] queue insert failed for",
        lead.email,
        insErr.message,
      );
      insertErrors++;
      continue;
    }
    enrolled++;
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[reengagement-enroll] scanned=${uniqueEmails.length} eligible=${candidatesToCheck.length} enrolled=${enrolled} suppressed=${suppressedCount} errors=${insertErrors} durationMs=${durationMs}`,
  );

  return json({
    ok: true,
    enrolled,
    scanned: uniqueEmails.length,
    eligible: candidatesToCheck.length,
    suppressed: suppressedCount,
    errors: insertErrors,
    durationMs,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
