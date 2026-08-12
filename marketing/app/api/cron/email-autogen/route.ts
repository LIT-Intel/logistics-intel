import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { complete, DEFAULT_MODEL, hasClaude } from "@/lib/anthropic";
import { existingWeeklySubjects, type EmailDef } from "@/lib/sequence-email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby-plan ceiling — generation + enrollment fits comfortably.
export const maxDuration = 60;

/**
 * GET /api/cron/email-autogen
 *
 * Friday content engine. Every Friday this has Claude write ONE brand-new
 * "LIT Signals" play — same voice, structure, and house layout as the
 * hand-written Tuesday rotation — stores the structured def in
 * lit_generated_emails, and enrolls every weekly-nurture candidate with a
 * queue row whose template_id is 'gen:<id>'. The dispatcher renders it
 * per-recipient (greeting, preferences link) exactly like static plays.
 *
 * Cadence rationale: Tuesday = hand-written rotation, Friday = generated
 * fresh play → 2 touches/week, the deliverability-safe ceiling for a
 * prospect list. Failure mode is silent-skip: if Claude is unset, output
 * fails validation, or there are no candidates, nothing sends and the
 * Tuesday rotation carries the week.
 *
 * Novelty guard: the prompt carries all prior subjects (hand-written +
 * previously generated) and forbids repeating an angle.
 */

const SYSTEM = `You write LIT Signals Weekly, a short tactical email for Logistic Intel (LIT) — a freight-intelligence SaaS that lets logistics sales teams search 524,000+ active US importers by lane, port, carrier, or product, see shipment histories and carrier mixes, and unlock verified decision-maker contacts.

Audience: freight forwarder / 3PL / NVOCC sales reps and managers who have NOT signed up yet. Each email teaches ONE concrete, field-tested prospecting play they can run this week. Voice: a sharp practitioner peer — direct, specific, zero fluff, no hype words ("revolutionize", "game-changing"), no emojis. Sign-off voice is "Gabriel".

Every play must be actionable WITH import/shipment data (that's the quiet product tie-in) and must end with a natural reason to search LIT free.`;

function buildPrompt(priorSubjects: string[]): string {
  return `Prior plays already sent (do NOT repeat these angles or anything close):
${priorSubjects.map((s) => `- ${s}`).join("\n")}

Write ONE new play. Return ONLY valid JSON (no markdown fences, no commentary) with exactly this shape:
{
  "subject": "string, <60 chars, no colon-clickbait",
  "previewText": "string, <90 chars",
  "headline": "string, <45 chars, punchy",
  "paragraphs": ["2 paragraphs, each 40-80 words. Do NOT include a greeting — it is added automatically."],
  "bullets": ["optional, 3-4 short imperative steps; omit the key entirely if the play doesn't need steps"],
  "tip": "optional single Pro-tip sentence; omit key if none",
  "ctaText": "string, 2-5 words, imperative",
  "signoff": "one short sentence ending with — Gabriel"
}`;
}

function validateDef(raw: unknown): EmailDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const subject = typeof o.subject === "string" ? o.subject.trim().slice(0, 90) : "";
  const headline = typeof o.headline === "string" ? o.headline.trim().slice(0, 70) : "";
  const paragraphs = Array.isArray(o.paragraphs)
    ? o.paragraphs.filter((p): p is string => typeof p === "string" && p.trim().length > 20).slice(0, 3)
    : [];
  const ctaText = typeof o.ctaText === "string" ? o.ctaText.trim().slice(0, 40) : "";
  if (!subject || !headline || paragraphs.length < 1 || !ctaText) return null;
  const bullets = Array.isArray(o.bullets)
    ? o.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 3).slice(0, 5)
    : undefined;
  return {
    subject,
    previewText: typeof o.previewText === "string" ? o.previewText.trim().slice(0, 120) : subject,
    headline,
    subtitle: "LIT Signals Weekly — one field-tested play per week.",
    paragraphs,
    ...(bullets && bullets.length ? { bullets } : {}),
    ...(typeof o.tip === "string" && o.tip.trim() ? { tip: o.tip.trim().slice(0, 240) } : {}),
    ctaText,
    // CTA is always the free search — the generator never controls URLs.
    ctaUrl: "https://logisticintel.com/search",
    ...(typeof o.signoff === "string" && o.signoff.trim() ? { signoff: o.signoff.trim().slice(0, 160) } : {}),
  };
}

function checkAuth(req: NextRequest): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return json({ error: "cron_secret_unset" }, 503);
  // Vercel Cron (Authorization) or marketing-cron-relay edge fn
  // (x-lit-cron = shared service-role key) — see lead-sequence-dispatch.
  const internal = req.headers.get("x-lit-cron");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const internalOk = Boolean(serviceKey && internal && internal === serviceKey);
  if (req.headers.get("authorization") !== `Bearer ${expected}` && !internalOk) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authFail = checkAuth(req);
  if (authFail) return authFail;
  if (!hasClaude()) return json({ ok: false, skipped: "anthropic_key_unset" });

  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, error: "supabase_unconfigured" }, 503);

  // Novelty guard: hand-written subjects + everything previously generated.
  const { data: priorGen } = await supabase
    .from("lit_generated_emails")
    .select("subject")
    .order("created_at", { ascending: false })
    .limit(60);
  const priorSubjects = [
    ...existingWeeklySubjects(),
    ...(priorGen ?? []).map((r: { subject: string }) => r.subject),
  ];

  const text = await complete({
    system: SYSTEM,
    prompt: buildPrompt(priorSubjects),
    model: DEFAULT_MODEL,
    maxTokens: 1200,
    temperature: 0.8,
  });
  if (!text) return json({ ok: false, error: "generation_empty" }, 502);

  let def: EmailDef | null = null;
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    def = validateDef(JSON.parse(text.slice(jsonStart, jsonEnd + 1)));
  } catch {
    def = null;
  }
  if (!def) {
    console.error("[email-autogen] generated output failed validation", text.slice(0, 300));
    return json({ ok: false, error: "validation_failed" }, 502);
  }

  const { data: stored, error: storeErr } = await supabase
    .from("lit_generated_emails")
    .insert({ sequence_key: "lit-weekly-gen", subject: def.subject, def, model: DEFAULT_MODEL })
    .select("id")
    .single();
  if (storeErr || !stored?.id) {
    return json({ ok: false, error: "store_failed", message: storeErr?.message }, 500);
  }

  // Enroll the same audience as the Tuesday floor. Suppression and
  // preference opt-outs are re-checked per send by the dispatcher.
  const { data: cand, error: candErr } = await supabase.rpc("lit_weekly_nurture_candidates");
  if (candErr) {
    return json({ ok: false, error: "candidates_failed", message: candErr.message, generated_id: stored.id }, 500);
  }
  const emails: string[] = (cand ?? []).map((r: { email: string }) => r.email).filter(Boolean);

  const nowIso = new Date().toISOString();
  const rows = emails.map((email) => ({
    email,
    sequence_key: "lit-weekly-gen",
    step: 1,
    send_at: nowIso,
    subject: def!.subject,
    source: "email-autogen",
    template_id: `gen:${stored.id}`,
  }));

  let enrolled = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insErr } = await supabase.from("lit_lead_sequence_queue").insert(chunk);
    if (insErr) {
      return json({ ok: false, error: "enroll_failed", enrolled, message: insErr.message, generated_id: stored.id }, 500);
    }
    enrolled += chunk.length;
  }

  console.log(`[email-autogen] subject="${def.subject}" enrolled=${enrolled}`);
  return json({ ok: true, generated_id: stored.id, subject: def.subject, enrolled });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
