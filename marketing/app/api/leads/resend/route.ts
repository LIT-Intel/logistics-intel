import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { pushInboundLeadToAttio } from "@/lib/attio";
import { sendEmail } from "@/lib/email";
import { resolveAudience } from "@/lib/resend-audiences";
import { SEQUENCES } from "@/lib/lead-sequences";

/**
 * POST /api/leads/resend — single lead-capture endpoint for the new
 * "money pages" template. Every hero CTA, lead-magnet form, and trial-
 * start widget on logisticintel.com POSTs here.
 *
 * Body: { email: string, source: string, offer?: string }
 *
 * Behavior (in order):
 *   1. Validate email shape. Reject obvious garbage with 400.
 *   2. Insert a row into public.lit_leads via the service-role Supabase
 *      client (lib/supabase.ts). This is the primary success path — if
 *      the insert fails, return 500 and skip the email.
 *   3. Send a transactional email via Resend, picking the template by
 *      `offer`. Resend template IDs live in env:
 *        - default                       → RESEND_LIT_TRIAL_WELCOME_TEMPLATE_ID
 *        - offer === "top-100-shippers-pdf" → RESEND_LIT_TOP_100_TEMPLATE_ID
 *      Email failure is best-effort: logged but does NOT block success.
 *
 * Always returns JSON. Never throws.
 *
 * Required env:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   RESEND_LIT_TRIAL_WELCOME_TEMPLATE_ID
 *   RESEND_LIT_TOP_100_TEMPLATE_ID
 *
 * Optional env:
 *   LIT_TOP_100_PDF_URL          (default: https://logisticintel.com/lead-magnets/top-100-shippers.pdf)
 *   RESEND_FROM_EMAIL            (default: "Logistic Intel <hello@logisticintel.com>")
 *   NEXT_PUBLIC_APP_URL          (default: https://app.logisticintel.com)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Logistic Intel <hello@logisticintel.com>";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.logisticintel.com";

const TOP_100_PDF_URL =
  process.env.LIT_TOP_100_PDF_URL ||
  "https://logisticintel.com/lead-magnets/top-100-shippers.pdf";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AttributionSnapshot = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  liFatId?: string;
  referrer?: string;
  landingPage?: string;
  capturedAt?: string;
};

type LeadBody = {
  email: string;
  source: string;
  offer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  role?: string;
  firstTouch?: AttributionSnapshot;
  lastTouch?: AttributionSnapshot;
};

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const offer =
    typeof body?.offer === "string" && body.offer.trim()
      ? body.offer.trim()
      : undefined;

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "invalid_email" }, 400);
  }
  if (!source) {
    return json({ error: "missing_source" }, 400);
  }

  const trimOrUndef = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t.slice(0, 500) : undefined;
  };

  const cleanAttribution = (
    raw: unknown,
  ): AttributionSnapshot | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    const out: AttributionSnapshot = {
      utmSource: trimOrUndef(r.utmSource ?? r.utm_source),
      utmMedium: trimOrUndef(r.utmMedium ?? r.utm_medium),
      utmCampaign: trimOrUndef(r.utmCampaign ?? r.utm_campaign),
      utmTerm: trimOrUndef(r.utmTerm ?? r.utm_term),
      utmContent: trimOrUndef(r.utmContent ?? r.utm_content),
      gclid: trimOrUndef(r.gclid),
      fbclid: trimOrUndef(r.fbclid),
      liFatId: trimOrUndef(r.liFatId ?? r.li_fat_id),
      referrer: trimOrUndef(r.referrer),
      landingPage: trimOrUndef(r.landingPage ?? r.landing_page),
      capturedAt: trimOrUndef(r.capturedAt ?? r.captured_at),
    };
    // Drop the object entirely if every field is empty.
    const hasAny = Object.values(out).some((v) => typeof v === "string" && v);
    return hasAny ? out : undefined;
  };

  const lead: LeadBody = {
    email: email.slice(0, 254),
    source: source.slice(0, 200),
    offer: offer ? offer.slice(0, 200) : undefined,
    utmSource: trimOrUndef(body?.utmSource ?? body?.utm_source),
    utmMedium: trimOrUndef(body?.utmMedium ?? body?.utm_medium),
    utmCampaign: trimOrUndef(body?.utmCampaign ?? body?.utm_campaign),
    referrer: trimOrUndef(body?.referrer),
    role: trimOrUndef(body?.role),
    firstTouch: cleanAttribution(body?.firstTouch ?? body?.first_touch),
    lastTouch: cleanAttribution(body?.lastTouch ?? body?.last_touch),
  };

  const supa = getSupabase();
  if (!supa) {
    console.error("[leads/resend] supabase client unavailable");
    return json({ error: "store_unavailable" }, 500);
  }

  // Production incident 2026-05-20: app signups that happen seconds after
  // a marketing form fill caused every new signup to receive TWO emails —
  // the marketing-side "Your LIT trial is ready" (this route's inline send
  // below) and Supabase Auth's "Confirm your LIT account". If this email
  // is already an app user (lives in public.profiles via the auth.users
  // trigger), short-circuit: still record the lead row for attribution,
  // but skip the inline welcome and skip queue enrollment. The app's own
  // post-signup onboarding will take it from here.
  const { data: supData } = await supa.rpc("lit_email_suppression_status", {
    p_email: email,
  });
  const supRow = (Array.isArray(supData) ? supData[0] : supData) as
    | { converted: boolean; bounced: boolean; complained: boolean }
    | null;
  const alreadyAppUser = Boolean(supRow?.converted);

  // Generate the UUID server-side so we don't need a SELECT-back after
  // INSERT — anon role has INSERT-only on lit_leads (no SELECT), which is
  // the right security posture for a public capture endpoint.
  const leadId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : require("crypto").randomUUID();
  let leadRow: { id: string } | null = null;
  try {
    const { error } = await supa.from("lit_leads").insert({
      id: leadId,
      email: lead.email,
      source: lead.source,
      offer: lead.offer ?? null,
      first_touch: lead.firstTouch ?? null,
      last_touch: lead.lastTouch ?? null,
    });
    if (error) {
      console.error("[leads/resend] insert failed", error.message);
      return json({ error: "store_failed" }, 500);
    }
    leadRow = { id: leadId };
  } catch (e: any) {
    console.error("[leads/resend] insert threw", e?.message || e);
    return json({ error: "store_failed" }, 500);
  }

  // Skip the welcome email + funnel enrollment for emails that already
  // belong to an app user. They'll get the in-app onboarding instead, and
  // we don't want to duplicate the "Your LIT trial is ready" send. The
  // lead row above is still kept so attribution + first/last-touch carry
  // through to the existing account.
  if (alreadyAppUser) {
    console.log(
      "[leads/resend] skipping welcome + enrollment — already an app user",
      lead.email,
    );
    return json({ ok: true, deduped: "already_app_user" });
  }

  // Email is best-effort — wrap so any failure is logged but never blocks
  // the lead capture (Supabase row is already persisted at this point).
  try {
    await sendResendEmail(lead);
  } catch (e: any) {
    console.error("[leads/resend] email threw", e?.message || e);
  }

  // Audience-add + sequence enrollment. Both are strictly best-effort —
  // any failure here is logged and swallowed. The lead row is already
  // safely persisted, and the welcome email above is the only piece the
  // user actually sees on submit.
  try {
    await enrollLead(lead, leadRow!.id, supa);
  } catch (e: any) {
    console.error("[leads/resend] enrollment threw", e?.message || e);
  }

  // Attio fan-out — awaited inline so the lambda doesn't terminate
  // before the Person → Company → Deal → Note chain completes. Adds
  // ~2-3s to the response time but guarantees nothing falls through
  // the cracks. The earlier fire-and-forget (waitUntil) was wrong:
  // globalThis.waitUntil isn't a real Node-runtime API on Vercel, so
  // the promise was abandoned the moment we returned 200 (verified via
  // runtime logs — only the Company upsert succeeded before the
  // lambda was killed mid-chain).
  try {
    const attioResult = await pushInboundLeadToAttio({
      email: lead.email,
      source: lead.source,
      attribution: {
        offer: lead.offer,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
        referrer: lead.referrer,
        firstTouchUtmSource: lead.firstTouch?.utmSource,
        firstTouchUtmCampaign: lead.firstTouch?.utmCampaign,
        firstTouchReferrer: lead.firstTouch?.referrer,
        lastTouchUtmSource: lead.lastTouch?.utmSource,
        lastTouchUtmCampaign: lead.lastTouch?.utmCampaign,
        leadId: leadRow!.id,
      },
      jobTitle: lead.role,
      dealName: `${lead.email} — ${lead.source}`,
    });
    if (!attioResult.ok) {
      console.warn(
        "[leads/resend] attio push partial",
        JSON.stringify(attioResult),
      );
    }
  } catch (e: any) {
    console.error("[leads/resend] attio push threw", e?.message || e);
  }

  return json({ ok: true });
}

/**
 * Add the lead to a Resend Audience (for future broadcasts) and enqueue
 * every follow-up sequence step in `lit_lead_sequence_queue` (drained by
 * the sequence-dispatcher cron).
 *
 * Step 1 is skipped when its delayHours === 0 — the inline welcome send
 * above already covers it. Subsequent steps and any step-1-with-delay
 * configurations are handled by the cron.
 */
async function enrollLead(
  lead: LeadBody,
  leadId: string,
  supa: NonNullable<ReturnType<typeof getSupabase>>,
): Promise<void> {
  const resolution = resolveAudience({
    source: lead.source,
    offer: lead.offer,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    referrer: lead.referrer,
    role: lead.role,
  });
  const { funnel, audienceIds, labels } = resolution;
  const sequenceKey = funnel.sequenceKey;
  const apiKey = process.env.RESEND_API_KEY;

  // 1. Resend Audience contact-add — fan out across funnel + industry +
  // channel. Each call is best-effort and individually try/caught so a
  // single 4xx never blocks the others or the lead capture.
  if (apiKey && audienceIds.length > 0) {
    await Promise.all(
      audienceIds.map(async (audienceId, idx) => {
        try {
          const r = await fetch(
            `https://api.resend.com/audiences/${audienceId}/contacts`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: lead.email,
                unsubscribed: false,
              }),
            },
          );
          if (!r.ok) {
            const text = await r.text().catch(() => "");
            console.warn(
              "[leads/resend] audience-add non-2xx",
              labels[idx] ?? audienceId,
              r.status,
              text.slice(0, 400),
            );
          }
        } catch (e: any) {
          console.warn(
            "[leads/resend] audience-add failed:",
            labels[idx] ?? audienceId,
            e?.message || e,
          );
        }
      }),
    );
  }

  // 2. Dedup — if this email already has an unsent pending row for the
  // same sequence, the lead is mid-flight and we shouldn't re-enroll
  // (would cause duplicate sends to the same recipient). Common cause:
  // a user submits the same form twice or pastes their email on multiple
  // money pages within a few minutes. We check on the email column
  // (not lead_id) because every form submit mints a fresh lead_id, so
  // the unique constraint on (lead_id, sequence_key, step) wouldn't fire.
  const { data: existingPending } = await supa
    .from("lit_lead_sequence_queue")
    .select("id")
    .eq("email", lead.email)
    .eq("sequence_key", sequenceKey)
    .is("sent_at", null)
    .is("failed_at", null)
    .limit(1);

  if (existingPending && existingPending.length > 0) {
    console.log(
      "[leads/resend] dedup: existing pending sequence for",
      lead.email,
      sequenceKey,
      "— skipping enroll",
    );
    return;
  }

  // 3. Enqueue the drip sequence. Skip step 1 when it would fire now —
  // the inline welcome send above already covered it.
  const steps = SEQUENCES[sequenceKey] ?? [];
  const now = Date.now();
  const queueRows = steps
    .filter((s) => !(s.step === 1 && s.delayHours === 0))
    .map((s) => ({
      lead_id: leadId,
      email: lead.email,
      sequence_key: sequenceKey,
      step: s.step,
      send_at: new Date(now + s.delayHours * 3600 * 1000).toISOString(),
      template_id: process.env[s.envTemplateVar] ?? null,
      subject: s.subject,
      source: lead.source,
      offer: lead.offer ?? null,
    }));

  if (queueRows.length === 0) return;

  const { error } = await supa
    .from("lit_lead_sequence_queue")
    .insert(queueRows);
  if (error) {
    console.warn("[leads/resend] queue insert failed:", error.message);
  }
}

async function sendResendEmail(lead: LeadBody): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[leads/resend] RESEND_API_KEY unset — skipping email");
    return;
  }

  const isTop100 = lead.offer === "top-100-shippers-pdf";
  const templateId = isTop100
    ? process.env.RESEND_LIT_TOP_100_TEMPLATE_ID
    : process.env.RESEND_LIT_TRIAL_WELCOME_TEMPLATE_ID;

  const firstName = lead.email.split("@")[0]?.split(/[._-]/)[0] || "there";
  const merge = {
    firstName,
    source: lead.source,
    ...(isTop100 ? { pdfUrl: TOP_100_PDF_URL } : { ctaUrl: `${APP_URL}/onboarding` }),
  };

  // Prefer Resend "templates" path via the API key when a template ID is set.
  // Resend's transactional template send accepts the template_id as part of
  // the standard /emails payload (the rendered HTML lives in the dashboard).
  if (templateId) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [lead.email],
          subject: isTop100
            ? "Top 100 active shippers in your lane"
            : "Your LIT trial is ready",
          template_id: templateId,
          // Resend supports template merge data via "data" or top-level keys
          // depending on dashboard config — send both for compatibility.
          data: merge,
          ...merge,
        }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        console.error(
          "[leads/resend] resend non-2xx",
          r.status,
          text.slice(0, 400),
        );
      }
      return;
    } catch (e: any) {
      console.error("[leads/resend] template send threw", e?.message || e);
      return;
    }
  }

  // Fallback: no template configured — send a minimal inline HTML email
  // so leads still get acknowledgement during early rollout.
  console.warn(
    "[leads/resend] template id unset; sending inline fallback email",
  );
  await sendEmail({
    from: FROM_EMAIL,
    to: lead.email,
    subject: isTop100
      ? "Top 100 active shippers in your lane"
      : "Your LIT trial is ready",
    html: isTop100 ? top100FallbackHtml(merge) : trialFallbackHtml(merge),
  });
}

function trialFallbackHtml(m: { firstName: string; ctaUrl?: string }) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0b1220;line-height:1.55;">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Welcome, ${escapeHtml(m.firstName)}.</h1>
  <p style="font-size:15px;color:#475569;margin:0 0 20px;">Your Logistic Intel trial is ready. Pick up where you left off and start finding shippers in your lane.</p>
  <a href="${escapeHtml(m.ctaUrl || APP_URL)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:10px;">Start exploring →</a>
</body></html>`;
}

function top100FallbackHtml(m: { firstName: string; pdfUrl?: string }) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0b1220;line-height:1.55;">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Here's your Top 100 shippers, ${escapeHtml(m.firstName)}.</h1>
  <p style="font-size:15px;color:#475569;margin:0 0 20px;">The most active shippers in your lane — refreshed from live customs filings.</p>
  <a href="${escapeHtml(m.pdfUrl || TOP_100_PDF_URL)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:10px;">Download the PDF →</a>
</body></html>`;
}

function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
