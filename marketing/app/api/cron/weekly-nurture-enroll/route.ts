import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/weekly-nurture-enroll
 *
 * The "nobody goes silent" floor of the acquisition funnel. Every Tuesday
 * (14:00 UTC — vercel.json) this enrolls one `lit-weekly` touch for every
 * opted-in address that currently has NOTHING pending in the sequence
 * queue: captured leads, demo requesters, demo invitees, and trial /
 * expired-trial users. Paying customers, unsubscribes, bounces, and anyone
 * mid-sequence are excluded server-side by
 * `public.lit_weekly_nurture_candidates()` (security definer,
 * service-role-only execute).
 *
 * Content rotates by ISO week: step = ((isoWeek - 1) % 4) + 1, so the four
 * "LIT Signals Weekly" plays cycle indefinitely and two adjacent weeks
 * never repeat. Steps are standalone plays — any entry point reads fine.
 *
 * The dispatch cron (lead-sequence-dispatch) sends the rows and re-checks
 * suppression + preference opt-outs per send, so this route can stay a
 * dumb enroller.
 */

const STEP_SUBJECTS: Record<number, string> = {
  1: "The 30-second teardown that books freight meetings",
  2: "Why Q4 freight contracts are won in August",
  3: "Read a prospect's carrier mix like a P&L",
  4: "The follow-up cadence that doesn't burn lists",
};

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function checkAuth(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return json({ error: "cron_secret_unset" }, 503);
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, error: "supabase_unconfigured" }, 503);

  const { data, error } = await supabase.rpc("lit_weekly_nurture_candidates");
  if (error) {
    console.error("[weekly-nurture-enroll] candidates failed", error.message);
    return json({ ok: false, error: "candidates_failed", message: error.message }, 500);
  }

  const emails: string[] = (data ?? [])
    .map((r: { email: string }) => r.email)
    .filter(Boolean);

  const now = new Date();
  const step = ((isoWeek(now) - 1) % 4) + 1;
  const rows = emails.map((email) => ({
    email,
    sequence_key: "lit-weekly",
    step,
    send_at: now.toISOString(),
    subject: STEP_SUBJECTS[step],
    source: "weekly-nurture",
  }));

  let enrolled = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insErr } = await supabase.from("lit_lead_sequence_queue").insert(chunk);
    if (insErr) {
      console.error("[weekly-nurture-enroll] insert failed", insErr.message);
      return json({ ok: false, error: "insert_failed", enrolled, message: insErr.message }, 500);
    }
    enrolled += chunk.length;
  }

  console.log(`[weekly-nurture-enroll] week=${isoWeek(now)} step=${step} enrolled=${enrolled}`);
  return json({ ok: true, week: isoWeek(now), step, enrolled });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
