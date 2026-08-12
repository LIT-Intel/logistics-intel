import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/engagement-branch
 *
 * Daily behavior-triggered branching. `lit_high_intent_candidates()`
 * (security definer, service-role-only) surfaces recipients who show
 * buying intent but haven't signed up — 2+ link clicks or 4+ opens in
 * the last 14 days — and this route enrolls them in the 2-step
 * "high-intent-offer" sequence (signup-now / live-list-session closer).
 *
 * Pricing-page clickers get source 'engagement-branch:pricing' so they're
 * distinguishable in the queue and in future reporting. A 45-day
 * re-enroll cooldown lives in the SQL function; per-send suppression
 * (bounce/complaint/unsubscribe/converted) is re-checked by the
 * dispatcher as always.
 *
 * Dormant while lit_resend_events has no open/click rows (Resend
 * tracking newly enabled) — activates by itself as data accrues.
 */

function checkAuth(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return json({ error: "cron_secret_unset" }, 503);
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

  const { data, error } = await supabase.rpc("lit_high_intent_candidates");
  if (error) {
    console.error("[engagement-branch] candidates failed", error.message);
    return json({ ok: false, error: "candidates_failed", message: error.message }, 500);
  }

  type Candidate = { email: string; clicks_14d: number; opens_14d: number; clicked_pricing: boolean };
  const candidates = (data ?? []) as Candidate[];
  if (!candidates.length) {
    return json({ ok: true, enrolled: 0, note: "no high-intent candidates" });
  }

  const now = new Date();
  const step2At = new Date(now.getTime() + 72 * 3600 * 1000);
  const rows = candidates.flatMap((c) => {
    const source = c.clicked_pricing ? "engagement-branch:pricing" : "engagement-branch";
    return [
      {
        email: c.email,
        sequence_key: "high-intent-offer",
        step: 1,
        send_at: now.toISOString(),
        subject: "You keep opening these — let's skip to the good part",
        source,
      },
      {
        email: c.email,
        sequence_key: "high-intent-offer",
        step: 2,
        send_at: step2At.toISOString(),
        subject: "Last nudge — a live prospect list, on us",
        source,
      },
    ];
  });

  const { error: insErr } = await supabase.from("lit_lead_sequence_queue").insert(rows);
  if (insErr) {
    console.error("[engagement-branch] insert failed", insErr.message);
    return json({ ok: false, error: "insert_failed", message: insErr.message }, 500);
  }

  const pricing = candidates.filter((c) => c.clicked_pricing).length;
  console.log(`[engagement-branch] enrolled=${candidates.length} pricing_clickers=${pricing}`);
  return json({ ok: true, enrolled: candidates.length, pricing_clickers: pricing });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
