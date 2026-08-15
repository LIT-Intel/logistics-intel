// lead_magnet_email — SHARED branded email delivery for the lead magnets.
// ---------------------------------------------------------------------------
// ONE reusable branded HTML template (mirrors send-demo-invite / email-pulse-
// report styling) parameterized by magnet + payload, plus the Resend send and
// the suppression/unsubscribe gate. Imported by the immediate-send path on the
// public edge fns AND by the lead-magnet-fulfillment cron so a user gets the
// same email either way.
//
// Reuses the existing email stack: LIT_RESEND_API_KEY + the verified
// updates.logisticintel.com from-domain (same as email-pulse-report), and the
// same suppression tables send-campaign-email honors
// (lit_email_preferences.unsubscribed_all, lit_email_unsubscribes,
// lit_email_suppression_list, lit_marketing_suppression_list).
//
// Email is TRANSACTIONAL: only sent to a lead who explicitly submitted their
// email on a magnet. A send failure NEVER throws to the caller's response path
// (callers wrap it); it does throw here so the cron can record last_email_error.
// ---------------------------------------------------------------------------

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const ICON = "https://raw.githubusercontent.com/LIT-Intel/logistics-intel/main/frontend/public/icon_256.png";
const SITE = "https://logisticintel.com";
const APP_SIGNUP = "https://app.logisticintel.com/signup";

function fromAddr(): string {
  return (
    Deno.env.get("LIT_RESEND_FROM_EMAIL") ||
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "LIT <hello@updates.logisticintel.com>"
  );
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtInt(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(v)));
}

// ---------------------------------------------------------------------------
// suppression gate — mirror the tables send-campaign-email checks. Returns a
// reason string when the address must NOT be emailed, else null.
// ---------------------------------------------------------------------------
export async function isSuppressed(admin: SupabaseClient, email: string): Promise<string | null> {
  const addr = email.trim().toLowerCase();
  if (!addr) return "empty";
  // Exclude obvious internal test users (never email the LIT team its own magnets).
  if (addr.endsWith("@logisticintel.com")) return "internal";

  try {
    const { data: pref } = await admin
      .from("lit_email_preferences")
      .select("unsubscribed_all")
      .eq("email", addr)
      .maybeSingle();
    if ((pref as any)?.unsubscribed_all) return "unsubscribed_all";
  } catch { /* table optional — fail open to other checks */ }

  try {
    const { data: unsub } = await admin
      .from("lit_email_unsubscribes")
      .select("recipient_email")
      .eq("recipient_email", addr)
      .maybeSingle();
    if (unsub) return "unsubscribed";
  } catch { /* ignore */ }

  try {
    const { data: supp } = await admin
      .from("lit_email_suppression_list")
      .select("email")
      .eq("email", addr)
      .maybeSingle();
    if (supp) return "suppressed";
  } catch { /* ignore */ }

  try {
    const { data: msupp } = await admin
      .from("lit_marketing_suppression_list")
      .select("email")
      .eq("email", addr)
      .maybeSingle();
    if (msupp) return "marketing_suppressed";
  } catch { /* ignore */ }

  return null;
}

// ---------------------------------------------------------------------------
// per-magnet content — subject + inner HTML body + CTA. Payload shape depends
// on the magnet; each branch reads only what it needs.
// ---------------------------------------------------------------------------

type MagnetSlug =
  | "free-shipper-report"
  | "import-risk-scanner"
  | "top-shippers"
  | "free-freight-prospects"
  | "freight-revenue-calculator";

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:6px 0 4px 0;"><tr><td bgcolor="#2563EB" valign="middle" style="background-color:#2563EB;border-radius:10px;border-bottom:2px solid #1E40AF;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;line-height:1;">${esc(label)} →</a></td></tr></table>`;
}

function statRow(label: string, value: string): string {
  return `<tr><td style="padding:5px 14px 5px 0;font-family:${FONT};font-size:13px;color:#64748B;">${esc(label)}</td><td style="padding:5px 0;font-family:${FONT};font-size:14px;font-weight:700;color:#0F172A;">${esc(value)}</td></tr>`;
}

function deepLink(magnet: MagnetSlug, payload: Record<string, unknown>): string {
  const params = new URLSearchParams({ magnet, saved_search: "1" });
  const companyKey = (payload?.visible as any)?.company_key ?? (payload as any)?.company_key;
  if (companyKey) params.set("company", String(companyKey));
  const savedQuery = (payload as any)?.saved_query;
  const ef = savedQuery?.explorer_filters;
  if (ef && Object.keys(ef).length) {
    params.set("explore", encodeURIComponent(JSON.stringify({ filters: ef })));
  }
  return `${APP_SIGNUP}?${params.toString()}`;
}

function renderContent(
  magnet: MagnetSlug,
  payload: Record<string, unknown>,
): { subject: string; heading: string; intro: string; body: string; cta: string } {
  const link = deepLink(magnet, payload);

  if (magnet === "top-shippers" || magnet === "free-freight-prospects") {
    const visible = Array.isArray(payload.visible) ? (payload.visible as any[]) : [];
    const total = Number(payload.total_count ?? 25);
    const rows = visible.slice(0, 5).map((r) => {
      const meta = [r.industry, r.region].filter(Boolean).join(" · ");
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #EEF2F7;font-family:${FONT};"><div style="font-size:15px;font-weight:700;color:#0F172A;">${esc(r.rank)}. ${esc(r.company_name)}</div><div style="font-size:12.5px;color:#64748B;margin-top:2px;">${esc(meta)}${r.top_lane ? ` · Lane: ${esc(r.top_lane)}` : ""}</div><div style="font-size:12.5px;color:#475569;margin-top:3px;">~${fmtInt(r.shipments_12m)} shipments/12mo · ${fmtInt(r.teu)} TEU · Score ${esc(r.opportunity_score)}</div></td></tr>`;
    }).join("");
    return {
      subject: "Your freight prospect list is ready",
      heading: "Your top freight prospects",
      intro: "Here are your top 5 ranked prospects from cached, aggregated customs intelligence. Create your free account to unlock all " + esc(total) + ".",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 4px 0;">${rows}</table>`,
      cta: ctaButton(link, `Create your free account to unlock all ${total}`),
      subjectPlaceholder: "",
    } as any;
  }

  if (magnet === "freight-revenue-calculator") {
    const est = (payload.estimate && typeof payload.estimate === "object" ? payload.estimate : {}) as Record<string, unknown>;
    const rows = [
      est.annual_revenue != null ? statRow("Est. annual freight revenue", "$" + fmtInt(est.annual_revenue)) : "",
      est.gross_profit != null ? statRow("Est. gross profit", "$" + fmtInt(est.gross_profit)) : "",
      est.opportunity_value != null ? statRow("Probability-adjusted opportunity", "$" + fmtInt(est.opportunity_value)) : "",
    ].filter(Boolean).join("");
    return {
      subject: "Your freight revenue estimate",
      heading: "Your freight account estimate",
      intro: "Here's the estimate you calculated. Create your free account to size every account on your lanes automatically.",
      body: rows
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0;">${rows}</table>`
        : `<p style="font-family:${FONT};font-size:14px;color:#475569;">Your estimate summary is saved to your session.</p>`,
      cta: ctaButton(link, "Create your free account"),
    } as any;
  }

  if (magnet === "import-risk-scanner") {
    const v = (payload.visible && typeof payload.visible === "object" ? payload.visible : {}) as Record<string, any>;
    const ic = v.import_concentration ?? {};
    const pc = v.port_concentration ?? {};
    const rows = [
      statRow("Company", String(v.company_name ?? "")),
      statRow("Shipments (12mo, est.)", fmtInt(v.shipments_last_12m)),
      ic.top_country ? statRow("Top sourcing country", `${esc(ic.top_country)} (${esc(ic.top_country_share)}% · ${esc(ic.level)})`) : "",
      pc.top_port ? statRow("Top destination port", `${esc(pc.top_port)} (${esc(pc.top_port_share)}% · ${esc(pc.level)})`) : "",
      v.trend_12mo?.direction ? statRow("12-mo trend", String(v.trend_12mo.direction)) : "",
    ].filter(Boolean).join("");
    return {
      subject: `Import risk indicators for ${v.company_name ?? "your target"}`,
      heading: "Your import risk scan",
      intro: "Here are the concentration and trend indicators from cached customs data. These are non-legal indicators only. Start a 7-day trial to unlock the full profile.",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0;">${rows}</table><p style="font-family:${FONT};font-size:11.5px;color:#94A3B8;margin-top:10px;">Indicators from public, aggregated shipment records. Not legal, customs, or tariff advice.</p>`,
      cta: ctaButton(link, "Unlock the full profile — start your 7-day trial"),
    } as any;
  }

  // default: free-shipper-report
  const v = (payload.visible && typeof payload.visible === "object" ? payload.visible : {}) as Record<string, any>;
  const rows = [
    statRow("Company", String(v.company_name ?? "")),
    statRow("Shipments (12mo, est.)", fmtInt(v.shipments_last_12m)),
    statRow("Total TEU (modeled)", fmtInt(v.total_teu)),
    Array.isArray(v.top_origin_countries) && v.top_origin_countries.length ? statRow("Top origin countries", v.top_origin_countries.join(", ")) : "",
    Array.isArray(v.top_destination_ports) && v.top_destination_ports.length ? statRow("Top destination ports", v.top_destination_ports.join(", ")) : "",
    v.lead_trade_lane ? statRow("Lead trade lane", String(v.lead_trade_lane)) : "",
  ].filter(Boolean).join("");
  return {
    subject: `Your free shipper report for ${v.company_name ?? "your target"}`,
    heading: "Your free shipper intelligence report",
    intro: "Here's the aggregated public intelligence we pulled from cached customs data. Start a 7-day trial to unlock the full profile — decision-makers, all lanes, alerts, and opportunity scoring.",
    body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0;">${rows}</table>`,
    cta: ctaButton(link, "Unlock the full profile — start your 7-day trial"),
  } as any;
}

function wrapHtml(heading: string, intro: string, body: string, cta: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(heading)}</title></head><body style="margin:0;padding:0;background-color:#F1F5F9;color:#0F172A;font-family:${FONT};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F1F5F9" style="border-collapse:collapse;"><tr><td align="center" valign="top" style="padding:40px 16px 56px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#FFFFFF" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:18px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);"><tr><td bgcolor="#0A1024" style="background-color:#0A1024;padding:24px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle" style="padding-right:13px;"><img src="${ICON}" width="34" height="34" alt="LIT" style="display:block;width:34px;height:34px;border-radius:9px;border:0;outline:none;" /></td><td valign="middle" style="font-family:${FONT};font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:1;">Logistic Intel</td></tr></table></td></tr><tr><td style="padding:30px 40px 4px 40px;"><h1 style="margin:0 0 10px 0;font-family:${FONT};font-size:23px;font-weight:800;color:#0F172A;line-height:1.25;letter-spacing:-0.02em;">${esc(heading)}</h1><p style="margin:0 0 6px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#475569;">${esc(intro)}</p></td></tr><tr><td style="padding:8px 40px 4px 40px;">${body}</td></tr><tr><td style="padding:8px 40px 8px 40px;">${cta}</td></tr><tr><td style="padding:6px 40px 30px 40px;font-family:${FONT};font-size:12.5px;line-height:1.7;color:#94A3B8;"><div style="height:1px;background-color:#E2E8F0;font-size:0;line-height:0;margin-bottom:18px;">&nbsp;</div><span style="color:#475569;font-weight:600;">Logistic Intel</span> — freight revenue intelligence. You received this because you requested it from a free tool at ${SITE}. <a href="${SITE}/unsubscribe" style="color:#94A3B8;text-decoration:underline;">Unsubscribe</a>.</td></tr></table></td></tr></table></body></html>`;
}

export function buildLeadMagnetEmail(
  magnet: string,
  firstName: string | null,
  payload: Record<string, unknown>,
): { subject: string; html: string } {
  const c = renderContent(magnet as MagnetSlug, payload);
  const greeting = firstName ? `Hi ${firstName}, ` : "";
  const html = wrapHtml(c.heading, greeting + c.intro, c.body, c.cta);
  return { subject: c.subject, html };
}

/**
 * Send the branded magnet email via Resend. Honors suppression. THROWS on send
 * failure (so the cron records last_email_error); callers on the request path
 * wrap this in try/catch so the API response is never broken.
 * Returns { skipped, reason?, message_id? }.
 */
export async function sendLeadMagnetEmail(
  admin: SupabaseClient,
  opts: {
    magnetSlug: string;
    email: string;
    firstName: string | null;
    payload: Record<string, unknown>;
  },
): Promise<{ skipped: boolean; reason?: string; message_id?: string | null }> {
  const resendKey = Deno.env.get("LIT_RESEND_API_KEY") || "";
  if (!resendKey) throw new Error("resend_api_key_missing");

  const to = opts.email.trim().toLowerCase();
  const suppressed = await isSuppressed(admin, to);
  if (suppressed) return { skipped: true, reason: suppressed };

  const { subject, html } = buildLeadMagnetEmail(opts.magnetSlug, opts.firstName, opts.payload);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddr(), to: [to], subject, html }),
  });
  const respJson: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = String(respJson?.message || respJson?.name || respJson?.error || resp.statusText).slice(0, 500);
    throw new Error(`resend_failed: ${msg}`);
  }
  return { skipped: false, message_id: respJson?.id ?? null };
}
