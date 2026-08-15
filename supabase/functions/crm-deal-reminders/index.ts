// crm-deal-reminders — daily at-risk deal digest email for deal owners.
//
// Cron-only (X-Internal-Cron via _shared/cron_auth.ts). Once a day it emails
// each deal OWNER a digest of THEIR at-risk open deals:
//   • overdue      — expected_close_date is in the past
//   • closing_soon — expected_close_date within the next 3 days
//   • stale        — lit_deals.is_stale (no activity 14+ days; set by the
//                    lit_crm_flag_stale_deals sweep)
//
// Only owners who currently have at-risk deals get an email — empty owners are
// skipped entirely. Idempotent: a deal in a given at-risk state is not
// re-emailed to the same owner within 24h (checked against lit_crm_reminder_log,
// written after a successful send). Branded house layout mirrors
// send-subscription-email; delivered via Resend + LIT_RESEND_API_KEY. Deep-links
// go to the deal / pipeline in the app.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("LIT_RESEND_API_KEY") || "";
const APP_URL = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");
const SITE_URL = (Deno.env.get("LIT_SITE_URL") ?? "https://www.logisticintel.com").replace(/\/+$/, "");
const FROM_EMAIL =
  Deno.env.get("LIT_EMAIL_FROM") ?? "Gabriel from LIT <hello@updates.logisticintel.com>";
const REPLY_TO = Deno.env.get("LIT_EMAIL_REPLY_TO") ?? "hello@logisticintel.com";

const SOON_DAYS = 3;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// The pipeline / command-center deep link (matches the frontend PIPELINE_URL).
const PIPELINE_PATH = "/app/command-center";

type AlertKind = "deal_overdue" | "deal_closing_soon" | "deal_stale";

interface DealRow {
  id: string;
  org_id: string | null;
  owner_user_id: string | null;
  title: string;
  value_amount: number | null;
  currency: string | null;
  expected_close_date: string | null;
  is_stale: boolean;
  status: string;
}

interface Categorized {
  deal: DealRow;
  kind: AlertKind;
  days: number | null; // days until close (negative = overdue by N); null for pure stale
}

const FONT_BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const LIT_ICON_URL =
  "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const COLOR = {
  text: "#0F172A",
  textSubtle: "#475569",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  ctaBg: "#2563EB",
  ctaBgDark: "#1E40AF",
  ctaText: "#FFFFFF",
  bg: "#FFFFFF",
  pageBg: "#F1F5F9",
  heroBg: "#0A1024",
  brandBlue: "#2563EB",
  overdue: "#B91C1C",
  soon: "#B45309",
  stale: "#475569",
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function money(value: number | null, currency: string | null): string {
  if (value == null) return "";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${cur} ${Math.round(value).toLocaleString("en-US")}`;
  }
}

function closeDateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Days between today (UTC) and an ISO date (positive = future, negative = past).
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - todayUtc) / 86400000);
}

// Categorize a deal into its most-urgent at-risk kind (overdue > closing_soon >
// stale). A deal that's both stale AND has a close alert is reported under the
// close alert (the more actionable signal). Returns null when not at risk.
function categorize(d: DealRow): Categorized | null {
  const days = daysUntil(d.expected_close_date);
  if (days != null && days < 0) return { deal: d, kind: "deal_overdue", days };
  if (days != null && days >= 0 && days <= SOON_DAYS) {
    return { deal: d, kind: "deal_closing_soon", days };
  }
  if (d.is_stale) return { deal: d, kind: "deal_stale", days: null };
  return null;
}

function sectionHtml(
  label: string,
  color: string,
  items: Categorized[],
): string {
  if (!items.length) return "";
  const rows = items
    .map((it) => {
      const d = it.deal;
      const val = d.value_amount != null ? ` · ${esc(money(d.value_amount, d.currency))}` : "";
      let meta = "";
      if (it.kind === "deal_overdue") {
        meta = `due ${esc(closeDateLabel(d.expected_close_date))}, ${Math.abs(it.days ?? 0)}d overdue`;
      } else if (it.kind === "deal_closing_soon") {
        meta = it.days === 0
          ? `closes ${esc(closeDateLabel(d.expected_close_date))} (today)`
          : `closes ${esc(closeDateLabel(d.expected_close_date))} (in ${it.days}d)`;
      } else {
        meta = "no activity in 14+ days";
      }
      const url = `${APP_URL}/crm/deals/${d.id}`;
      return `<tr><td style="padding:8px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.45;color:${COLOR.text};border-bottom:1px solid ${COLOR.divider};"><a href="${url}" style="color:${COLOR.text};font-weight:700;text-decoration:none;">${esc(d.title)}</a>${val}<div style="font-family:${FONT_BODY};font-size:13px;color:${COLOR.textSubtle};margin-top:2px;">${meta}</div></td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:20px 0 0 0;width:100%;"><tr><td style="font-family:${FONT_BODY};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};padding-bottom:4px;">${esc(label)} (${items.length})</td></tr>${rows}</table>`;
}

function sectionText(label: string, items: Categorized[]): string {
  if (!items.length) return "";
  const lines = items.map((it) => {
    const d = it.deal;
    const val = d.value_amount != null ? ` · ${money(d.value_amount, d.currency)}` : "";
    let meta = "";
    if (it.kind === "deal_overdue") meta = `due ${closeDateLabel(d.expected_close_date)}, ${Math.abs(it.days ?? 0)}d overdue`;
    else if (it.kind === "deal_closing_soon") meta = it.days === 0 ? `closes ${closeDateLabel(d.expected_close_date)} (today)` : `closes ${closeDateLabel(d.expected_close_date)} (in ${it.days}d)`;
    else meta = "no activity in 14+ days";
    return `  • ${d.title}${val} — ${meta}`;
  });
  return `${label} (${items.length}):\n${lines.join("\n")}`;
}

function buildDigest(
  firstName: string,
  overdue: Categorized[],
  soon: Categorized[],
  stale: Categorized[],
  unsubscribeUrl: string,
): { subject: string; html: string; text: string } {
  const total = overdue.length + soon.length + stale.length;
  const name = firstName?.trim() || "there";
  const ctaUrl = `${APP_URL}${PIPELINE_PATH}`;

  const previewText = `${total} deal${total === 1 ? "" : "s"} need a look today.`;
  const headline = "Your deals that need attention";
  const subtitle = `${total} at-risk deal${total === 1 ? "" : "s"} in your pipeline`;

  const bodyHtml =
    `<p style="margin:0 0 18px 0;">Hi ${esc(name)},</p>` +
    `<p style="margin:0 0 4px 0;">Here's a quick pulse on the open deals worth your attention today.</p>` +
    sectionHtml("Past close date", COLOR.overdue, overdue) +
    sectionHtml("Closing soon", COLOR.soon, soon) +
    sectionHtml("Going quiet", COLOR.stale, stale);

  const bodyText = [
    `Hi ${name},`,
    "",
    "Here's a quick pulse on the open deals worth your attention today.",
    "",
    sectionText("Past close date", overdue),
    sectionText("Closing soon", soon),
    sectionText("Going quiet", stale),
  ].filter(Boolean).join("\n\n");

  const previewBlock = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#FFFFFF;mso-hide:all;">${esc(previewText)}${"&nbsp;&#847;".repeat(60)}</div>`;
  const heroBlock = `<tr><td bgcolor="${COLOR.heroBg}" style="background-color:${COLOR.heroBg};padding:32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:14px;"><img src="${LIT_ICON_URL}" width="40" height="40" alt="LIT" style="display:block;width:40px;height:40px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT_BODY};font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr>`;
  const ctaBlock = `<tr><td style="padding:24px 40px 36px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${COLOR.ctaBg}" valign="middle" style="background-color:${COLOR.ctaBg};border-radius:10px;mso-padding-alt:16px 32px;border-bottom:2px solid ${COLOR.ctaBgDark};"><a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:16px 32px;font-family:${FONT_BODY};font-size:16px;font-weight:600;color:${COLOR.ctaText};text-decoration:none;border-radius:10px;letter-spacing:0.01em;line-height:1;">Open your pipeline →</a></td></tr></table></td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(headline)}</title></head><body style="margin:0;padding:0;background-color:${COLOR.pageBg};color:${COLOR.text};font-family:${FONT_BODY};">${previewBlock}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLOR.pageBg}" style="background-color:${COLOR.pageBg};border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="${COLOR.bg}" style="max-width:600px;width:100%;background-color:${COLOR.bg};border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);">${heroBlock}<tr><td style="padding:36px 40px 4px 40px;"><h1 style="margin:0 0 8px 0;font-family:${FONT_BODY};font-size:28px;font-weight:800;color:${COLOR.text};line-height:1.2;letter-spacing:-0.02em;text-align:left;">${esc(headline)}</h1><p style="margin:0;font-family:${FONT_BODY};font-size:17px;font-weight:500;line-height:1.4;color:${COLOR.textSubtle};text-align:left;">${esc(subtitle)}</p></td></tr><tr><td style="padding:24px 40px 8px 40px;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${COLOR.text};text-align:left;">${bodyHtml}</td></tr>${ctaBlock}<tr><td style="padding:0 40px;"><div style="height:1px;background-color:${COLOR.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr><tr><td style="padding:24px 40px 32px 40px;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${COLOR.textMuted};text-align:left;"><span style="color:${COLOR.textSubtle};font-weight:600;">Logistics Intel</span> — freight revenue intelligence for logistics sales teams.<br/>You're receiving this because you own deals in your LIT pipeline.<br/><a href="${unsubscribeUrl}" style="color:${COLOR.textMuted};text-decoration:underline;">Unsubscribe</a> &middot; <a href="mailto:${REPLY_TO}" style="color:${COLOR.textMuted};text-decoration:underline;">${REPLY_TO}</a></td></tr></table></td></tr></table></body></html>`;

  const text = [
    headline,
    subtitle,
    "",
    bodyText,
    "",
    `Open your pipeline: ${ctaUrl}`,
    "",
    "—",
    "Logistics Intel — freight revenue intelligence for logistics sales teams.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const subject =
    overdue.length > 0
      ? `${overdue.length} deal${overdue.length === 1 ? "" : "s"} past close date — plus ${soon.length + stale.length} more to watch`
      : `${total} deal${total === 1 ? "" : "s"} in your pipeline need attention`;

  return { subject, html, text };
}

serve(async (req: Request) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  if (!RESEND_API_KEY) return json({ ok: false, error: "LIT_RESEND_API_KEY not set" }, 500);

  // Allow a dry-run (no email sent, no ledger write) for verification.
  let dryRun = false;
  try {
    const b = await req.json();
    dryRun = b?.dry_run === true;
  } catch {
    // no body — normal cron invocation
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Pull all OPEN deals that MIGHT be at-risk. We categorize in TS so the
  //    "most urgent kind wins" logic matches the Coach card exactly.
  const soonCutoff = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + SOON_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const { data: deals, error: dealsErr } = await db
    .from("lit_deals")
    .select("id, org_id, owner_user_id, title, value_amount, currency, expected_close_date, is_stale, status")
    .eq("status", "open")
    .or(`is_stale.eq.true,and(expected_close_date.not.is.null,expected_close_date.lte.${soonCutoff})`);

  if (dealsErr) {
    console.error("[crm-deal-reminders] deals query failed", dealsErr);
    return json({ ok: false, error: "deals query failed" }, 500);
  }

  // 2. Categorize + group by owner.
  const byOwner = new Map<string, Categorized[]>();
  for (const raw of (deals ?? []) as DealRow[]) {
    if (!raw.owner_user_id) continue;
    const cat = categorize(raw);
    if (!cat) continue;
    const arr = byOwner.get(raw.owner_user_id) ?? [];
    arr.push(cat);
    byOwner.set(raw.owner_user_id, arr);
  }

  if (byOwner.size === 0) {
    return json({ ok: true, owners_eligible: 0, sent: 0, reason: "no_at_risk_deals" });
  }

  const results: Array<Record<string, unknown>> = [];
  let sentCount = 0;

  for (const [ownerId, allItems] of byOwner) {
    // 3. Idempotency: drop deals already emailed in this SAME kind within 24h.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const dealIds = allItems.map((i) => i.deal.id);
    const { data: recent } = await db
      .from("lit_crm_reminder_log")
      .select("deal_id, kind, sent_at")
      .eq("user_id", ownerId)
      .in("deal_id", dealIds)
      .gte("sent_at", since);
    const recentSet = new Set((recent ?? []).map((r: any) => `${r.deal_id}:${r.kind}`));
    const items = allItems.filter((i) => !recentSet.has(`${i.deal.id}:${i.kind}`));

    if (items.length === 0) {
      results.push({ owner: ownerId, skipped: "all_recently_emailed" });
      continue;
    }

    // 4. Resolve owner email + name from auth.
    const { data: userRes, error: userErr } = await db.auth.admin.getUserById(ownerId);
    const email = userRes?.user?.email ?? null;
    if (userErr || !email) {
      results.push({ owner: ownerId, skipped: "no_email" });
      continue;
    }
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const firstName =
      (typeof meta.first_name === "string" && meta.first_name) ||
      (typeof meta.full_name === "string" && String(meta.full_name).split(" ")[0]) ||
      (typeof meta.name === "string" && String(meta.name).split(" ")[0]) ||
      "";

    // Respect the platform unsubscribe list.
    const { data: unsub } = await db
      .from("lit_email_unsubscribes")
      .select("id")
      .eq("recipient_email", email.toLowerCase())
      .maybeSingle();
    if (unsub) {
      results.push({ owner: ownerId, skipped: "unsubscribed" });
      continue;
    }

    const overdue = items.filter((i) => i.kind === "deal_overdue")
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    const soon = items.filter((i) => i.kind === "deal_closing_soon")
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    const stale = items.filter((i) => i.kind === "deal_stale");

    const emailToken = btoa(email.toLowerCase()).replace(/=/g, "");
    const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email.toLowerCase())}&token=${emailToken}`;
    const { subject, html, text } = buildDigest(String(firstName), overdue, soon, stale, unsubscribeUrl);

    if (dryRun) {
      results.push({
        owner: ownerId, email, would_send: true,
        overdue: overdue.length, closing_soon: soon.length, stale: stale.length,
        subject,
      });
      continue;
    }

    // 5. Send via Resend.
    let ok = false;
    let errMsg: string | null = null;
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          reply_to: REPLY_TO,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [{ name: "event_type", value: "crm_deal_reminder" }],
        }),
      });
      const respJson: any = await resp.json().catch(() => ({}));
      ok = resp.ok;
      if (!ok) errMsg = String(respJson?.message || respJson?.name || resp.status).slice(0, 500);
    } catch (err) {
      errMsg = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    }

    // 6. Log every included deal so the 24h dedupe holds next run.
    if (ok) {
      const rows = items.map((i) => ({
        user_id: ownerId,
        org_id: i.deal.org_id,
        deal_id: i.deal.id,
        kind: i.kind,
      }));
      const { error: logErr } = await db.from("lit_crm_reminder_log").insert(rows);
      if (logErr) console.error("[crm-deal-reminders] ledger insert failed", logErr);
      sentCount += 1;
      results.push({ owner: ownerId, email, sent: true, deals: items.length, subject });
    } else {
      console.error("[crm-deal-reminders] send failed", ownerId, errMsg);
      results.push({ owner: ownerId, email, sent: false, error: errMsg });
    }
  }

  return json({ ok: true, owners_eligible: byOwner.size, sent: sentCount, dry_run: dryRun, results });
});
