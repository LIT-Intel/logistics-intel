import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { SEQUENCES, type SequenceKey, type SequenceStep } from "@/lib/lead-sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/lead-sequence-dispatch
 *
 * Cron worker that drains `public.lit_lead_sequence_queue` and fires due
 * follow-up emails via Resend. Invoked every 30 minutes by Vercel Cron
 * (see marketing/vercel.json). Companion to the lead-capture route at
 * /api/leads/resend which enqueues the rows.
 *
 * Auth gate: requires both `Authorization: Bearer ${CRON_SECRET}` AND the
 * `x-vercel-cron` header set by Vercel's cron runner. Manual triggers
 * outside cron will fail — that's intentional; ad-hoc dispatch should
 * go through the queue, not bypass it.
 *
 * Concurrency / race tolerance: we do NOT use `for update skip locked`
 * (the parallel-agent-owned schema has no `claimed_at` column). Two
 * concurrent cron invocations could both fetch the same row, but only
 * one wins the conditional UPDATE (we filter on `sent_at IS NULL` in
 * the update too). The losing one's update affects zero rows and the
 * row is silently re-counted as "already-sent" in the next pass. Worst
 * case: a single email could be sent twice if two PUT-after-fetch races
 * cross the wire in the same millisecond — but Vercel Cron is single-
 * fire so this only matters during manual replay.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BATCH_LIMIT = 100;

type QueueRow = {
  id: string;
  lead_id: string;
  email: string;
  sequence_key: string;
  step: number;
  send_at: string;
  template_id: string | null;
  subject: string | null;
  source: string | null;
  offer: string | null;
};

const KNOWN_COMPETITORS: Record<string, string> = {
  zoominfo: "ZoomInfo",
  importgenius: "ImportGenius",
  apollo: "Apollo",
  panjiva: "Panjiva",
  datamyne: "Datamyne",
  trademo: "Trademo",
  revenuevessel: "RevenueVessel",
  ubico: "Ubico",
  searates: "SeaRates",
};

function parseCompetitorFromSource(source: string | null): string {
  if (!source) return "";
  // Patterns: "vs-zoominfo-hero", "alternatives-apollo", "vs-zoominfo".
  const match = source.toLowerCase().match(/(?:^|[-_])(?:vs|alternatives?)[-_]([a-z0-9]+)/);
  const slug = match?.[1];
  if (!slug) return "";
  return KNOWN_COMPETITORS[slug] ?? "";
}

function parseFirstName(email: string): string {
  const local = (email || "").split("@")[0] || "";
  const first = local.split(/[._-]/)[0] || "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "LIT <pulse@logisticintel.com>";
}

function checkAuth(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(JSON.stringify({ error: "cron_secret_unset" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");
  if (auth !== `Bearer ${expected}` || !vercelCron) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

function findSequenceStep(
  sequenceKey: string,
  step: number,
): SequenceStep | null {
  const seq = SEQUENCES[sequenceKey as SequenceKey];
  if (!seq) return null;
  return seq.find((s) => s.step === step) ?? null;
}

function ctaFromSource(source: string | null): string {
  if (!source) return "https://logisticintel.com/freight-leads";
  if (source.includes("top-100") || source.includes("freight-leads")) {
    return "https://logisticintel.com/freight-leads";
  }
  if (source.includes("partner") || source.includes("affiliate")) {
    return "https://logisticintel.com/affiliate";
  }
  if (source.startsWith("vs-") || source.includes("alternatives")) {
    return "https://logisticintel.com/vs";
  }
  return "https://logisticintel.com/freight-leads";
}

function applyMergeTokens(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

function renderFallbackHtml(args: {
  subject: string;
  firstName: string;
  purpose: string;
  envTemplateVar: string;
  cta: string;
}): string {
  const safeSubject = escapeHtml(args.subject);
  const safeFirstName = escapeHtml(args.firstName || "there");
  const safePurpose = escapeHtml(args.purpose);
  const safeEnvVar = escapeHtml(args.envTemplateVar);
  const safeCta = escapeHtml(args.cta);
  return `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #0f172a;">
<div style="border-bottom: 2px solid #00F0FF; padding-bottom: 16px; margin-bottom: 24px;">
  <strong style="font-size: 18px; letter-spacing: -0.01em;">Logistic Intel</strong>
</div>
<h1 style="font-size: 22px; line-height: 1.3; margin: 0 0 16px;">${safeSubject}</h1>
<p>Hi ${safeFirstName},</p>
<p>${safePurpose}. (Replace this stub by setting the ${safeEnvVar} env var to a real Resend template ID.)</p>
<p><a href="${safeCta}" style="display: inline-block; padding: 12px 18px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Open LIT →</a></p>
<p style="margin-top: 40px; font-size: 12px; color: #64748b;">Logistic Intel · <a href="https://logisticintel.com/legal/privacy" style="color: #64748b;">Privacy</a> · <a href="https://logisticintel.com" style="color: #64748b;">Unsubscribe</a></p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendOne(row: QueueRow): Promise<{ ok: boolean; status: number; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, reason: "resend_api_key_unset" };
  }

  const seqStep = findSequenceStep(row.sequence_key, row.step);
  const firstName = parseFirstName(row.email);
  const competitor = parseCompetitorFromSource(row.source);
  const vars: Record<string, string> = {
    firstName,
    competitor,
    source: row.source ?? "",
    sequenceKey: row.sequence_key,
    step: String(row.step),
    offer: row.offer ?? "",
  };

  // Prefer template id from the queue row, then fall back to the env var
  // that the sequence step declares (so dashboard rotations work without
  // re-enqueuing). If still nothing, drop to inline HTML.
  const resolvedTemplateId =
    row.template_id ||
    (seqStep?.envTemplateVar ? process.env[seqStep.envTemplateVar] || null : null);

  const fromAddress = getFromAddress();
  const rawSubject = row.subject || seqStep?.subject || "An update from Logistic Intel";
  const subject = applyMergeTokens(rawSubject, vars);

  const payload: Record<string, unknown> = {
    from: fromAddress,
    to: [row.email],
    subject,
  };

  if (resolvedTemplateId) {
    // Resend template-based send. Variables are surfaced to the template
    // engine; subject is still required at the top level.
    (payload as any).template = {
      id: resolvedTemplateId,
      variables: vars,
    };
  } else {
    payload.html = renderFallbackHtml({
      subject,
      firstName,
      purpose: seqStep?.purpose || "Following up on your Logistic Intel signup",
      envTemplateVar: seqStep?.envTemplateVar || "RESEND_TPL_UNKNOWN",
      cta: ctaFromSource(row.source),
    });
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status };
    }
    let bodySnippet = "";
    try {
      const text = await res.text();
      bodySnippet = text.slice(0, 200);
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, reason: `http_${res.status}:${bodySnippet}` };
  } catch (e: any) {
    return { ok: false, status: 0, reason: `network:${String(e?.message || e).slice(0, 200)}` };
  }
}

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  const startedAt = Date.now();
  const supabase = getSupabase();
  if (!supabase) {
    return json({ ok: false, error: "supabase_unconfigured" }, 503);
  }

  // 1) Claim due rows. We grab a batch of 100 ordered by send_at ASC so
  // the oldest queued sends always go first when the cron is backed up.
  const nowIso = new Date().toISOString();
  const { data: rows, error: fetchErr } = await supabase
    .from("lit_lead_sequence_queue")
    .select(
      "id, lead_id, email, sequence_key, step, send_at, template_id, subject, source, offer",
    )
    .is("sent_at", null)
    .is("failed_at", null)
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    console.error("[lead-sequence-dispatch] fetch failed", fetchErr.message);
    return json({ ok: false, error: "fetch_failed", message: fetchErr.message }, 500);
  }

  const queue: QueueRow[] = (rows ?? []) as QueueRow[];
  let succeeded = 0;
  let failed = 0;

  // Process sequentially. Resend's free/paid tiers cap around ~10 rps and
  // sequential processing keeps a single cron invocation well under the
  // 60-second maxDuration for typical batches (100 rows * ~300ms = 30s).
  let suppressed = 0;
  for (const row of queue) {
    // Suppression check — fires BEFORE every send. Three reasons we skip:
    //   converted  — lead has a profiles row (signed up at app). Only
    //                applies to trial-welcome steps 2+. The existing app
    //                send-subscription-email pipeline handles post-signup
    //                comms; doubling them up is bad UX.
    //   bounced    — any prior lit_resend_events row marks this email
    //                bounced. Continuing to send harms sender reputation.
    //   complained — recipient marked our mail as spam at any point.
    //                Continuing is a deliverability + legal risk.
    // RPC returns one row with three booleans; security definer lets the
    // anon-role cron call without table-level SELECT grants.
    const { data: supData } = await supabase
      .rpc("lit_email_suppression_status", { p_email: row.email });
    const sup = (Array.isArray(supData) ? supData[0] : supData) as
      | { converted: boolean; bounced: boolean; complained: boolean }
      | undefined;

    const shouldSuppress =
      sup &&
      (sup.bounced ||
        sup.complained ||
        (sup.converted && row.sequence_key === "trial-welcome" && row.step >= 2));

    if (shouldSuppress) {
      const reason = sup.complained
        ? "suppressed_complained"
        : sup.bounced
        ? "suppressed_bounced"
        : "suppressed_lead_converted";
      const { error: upErr } = await supabase
        .from("lit_lead_sequence_queue")
        .update({ failed_at: new Date().toISOString(), failure_reason: reason })
        .eq("id", row.id)
        .is("sent_at", null);
      if (upErr) {
        console.error("[lead-sequence-dispatch] mark-suppressed failed", row.id, upErr.message);
      }
      suppressed++;
      continue;
    }

    const result = await sendOne(row);
    if (result.ok) {
      // Conditional update: only flip sent_at when it's still null. This
      // is our soft idempotency guard against concurrent invocations.
      const { error: upErr } = await supabase
        .from("lit_lead_sequence_queue")
        .update({ sent_at: new Date().toISOString(), failed_at: null, failure_reason: null })
        .eq("id", row.id)
        .is("sent_at", null);
      if (upErr) {
        console.error("[lead-sequence-dispatch] mark-sent failed", row.id, upErr.message);
      }
      succeeded++;
    } else {
      const reason = (result.reason || `status_${result.status}`).slice(0, 500);
      const { error: upErr } = await supabase
        .from("lit_lead_sequence_queue")
        .update({ failed_at: new Date().toISOString(), failure_reason: reason })
        .eq("id", row.id)
        .is("sent_at", null);
      if (upErr) {
        console.error("[lead-sequence-dispatch] mark-failed failed", row.id, upErr.message);
      }
      failed++;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[lead-sequence-dispatch] processed=${queue.length} succeeded=${succeeded} failed=${failed} suppressed=${suppressed} durationMs=${durationMs}`,
  );

  return json({
    ok: true,
    processed: queue.length,
    succeeded,
    failed,
    suppressed,
    durationMs,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
