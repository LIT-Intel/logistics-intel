/**
 * GET  /api/email-preferences?token=<HMAC>
 *   → verify token, return current preferences for the resolved email
 *     (returns defaults if no row exists yet).
 *
 * POST /api/email-preferences?token=<HMAC>
 *   body: { trial_welcome, top_100_followup, partner_onboarding,
 *           comparison_nurture, unsubscribed_all }
 *   → verify token, upsert preferences. If `unsubscribed_all === true`,
 *     mark every pending row in lit_lead_sequence_queue for that email
 *     as failed (`preferences_unsubscribe_all`). Otherwise mark only
 *     the pending rows whose sequence_key matches a now-OFF toggle
 *     (`preferences_opted_out`). Future enqueued rows are also guarded
 *     at dispatch time by the lit_email_is_unsubscribed RPC, so this
 *     queue cleanup just prevents already-enqueued sends from firing.
 *
 * Auth: HMAC token is the ONLY auth gate. No session required — the
 * page is reached from an email link and we don't want to force a
 * recipient to log in to manage their preferences. Service-role
 * Supabase client is required (anon-key has no row access by RLS).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPreferencesToken } from "@/lib/preferences-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the four user-facing nurture sequences have per-sequence
// preference columns. Other sequences (e.g. "re-engagement") aren't
// listed on /email-preferences and are governed only by the master
// kill switch (unsubscribed_all) + the existing
// lit_email_suppression_status RPC.
const SEQUENCE_TO_COLUMN = {
  "trial-welcome": "trial_welcome",
  "top-100-followup": "top_100_followup",
  "partner-onboarding": "partner_onboarding",
  "comparison-nurture": "comparison_nurture",
} as const;

type ToggleableSequenceKey = keyof typeof SEQUENCE_TO_COLUMN;

type PreferenceRow = {
  email: string;
  trial_welcome: boolean;
  top_100_followup: boolean;
  partner_onboarding: boolean;
  comparison_nurture: boolean;
  unsubscribed_all: boolean;
};

function defaultPrefs(email: string): PreferenceRow {
  return {
    email,
    trial_welcome: true,
    top_100_followup: true,
    partner_onboarding: true,
    comparison_nurture: true,
    unsubscribed_all: false,
  };
}

function getServiceClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function emailFromRequest(req: NextRequest): string | null {
  return verifyPreferencesToken(req.nextUrl.searchParams.get("token"));
}

export async function GET(req: NextRequest) {
  const email = emailFromRequest(req);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("lit_email_preferences")
    .select("email, trial_welcome, top_100_followup, partner_onboarding, comparison_nurture, unsubscribed_all")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[email-preferences] read failed", error.message);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }

  const prefs = (data as PreferenceRow | null) ?? defaultPrefs(email);
  return NextResponse.json({ ok: true, preferences: prefs });
}

function coerceBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function POST(req: NextRequest) {
  const email = emailFromRequest(req);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const unsubscribedAll = coerceBool(body.unsubscribed_all, false);
  // When unsubscribed_all is true we still persist the granular flags
  // exactly as posted — that way the recipient can flip the master
  // switch back off without losing their per-sequence opt-ins.
  const next: PreferenceRow = {
    email,
    trial_welcome: !unsubscribedAll && coerceBool(body.trial_welcome, true),
    top_100_followup: !unsubscribedAll && coerceBool(body.top_100_followup, true),
    partner_onboarding: !unsubscribedAll && coerceBool(body.partner_onboarding, true),
    comparison_nurture: !unsubscribedAll && coerceBool(body.comparison_nurture, true),
    unsubscribed_all: unsubscribedAll,
  };

  const { error: upsertErr } = await supabase
    .from("lit_email_preferences")
    .upsert(
      { ...next, updated_at: new Date().toISOString() },
      { onConflict: "email" },
    );

  if (upsertErr) {
    console.error("[email-preferences] upsert failed", upsertErr.message);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  // Cancel pending queue rows so already-enqueued sends don't fire
  // after the recipient has opted out. The dispatcher also runs the
  // RPC at send-time, but trimming the queue here keeps the admin
  // dashboard counts honest and stops a borderline-due row from
  // sneaking through between save + the next cron run.
  const nowIso = new Date().toISOString();
  if (unsubscribedAll) {
    const { error: cancelErr } = await supabase
      .from("lit_lead_sequence_queue")
      .update({ failed_at: nowIso, failure_reason: "preferences_unsubscribe_all" })
      .eq("email", email)
      .is("sent_at", null)
      .is("failed_at", null);
    if (cancelErr) {
      console.error("[email-preferences] cancel-all failed", cancelErr.message);
    }
  } else {
    const optedOut: ToggleableSequenceKey[] = (
      Object.keys(SEQUENCE_TO_COLUMN) as ToggleableSequenceKey[]
    ).filter((seq) => next[SEQUENCE_TO_COLUMN[seq]] === false);
    if (optedOut.length > 0) {
      const { error: cancelErr } = await supabase
        .from("lit_lead_sequence_queue")
        .update({ failed_at: nowIso, failure_reason: "preferences_opted_out" })
        .eq("email", email)
        .in("sequence_key", optedOut)
        .is("sent_at", null)
        .is("failed_at", null);
      if (cancelErr) {
        console.error("[email-preferences] cancel-opted-out failed", cancelErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true, preferences: next });
}
