// quote-send — digital quoting overhaul (2026-08-12).
//
// Sends a quote to a recipient through the USER's connected Gmail / Outlook /
// Resend mailbox with the quote rendered LIVE INSIDE THE EMAIL BODY: a
// branded, table-based, email-client-safe HTML block (inline styles, tables
// only — no flexbox/grid) carrying the lane, the full sell-side charges
// breakdown, the validity date, and a prominent "View live quote" CTA that
// opens the public tokenized live-quote page (`/q/<share_token>` in the app,
// no login). Opening the live page stamps viewed_at + flips sent -> viewed.
//
// Branding: the SENDER is the user's company — org quote settings
// (org_settings.quote_defaults: company_name, logo_url, contact lines) with
// the organization name as fallback. LIT is only a discreet footer credit.
//
// PDF is OPTIONAL: if a PDF was generated it's offered as a secondary
// "Download PDF" link in the email and on the live page, but sending no
// longer requires one (the old PDF_REQUIRED gate is gone).
//
// Gating: the `quoting` server-side feature gate (requireQuotingFeature) is
// enforced before any work. Admin bypass is server-side only, inside the gate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature } from "../_shared/quote_helpers.ts";
import { sendQuoteEmail, QuoteSenderAccount } from "../_shared/quote_email.ts";

const APP_BASE = (Deno.env.get("LIT_APP_URL") ?? "https://app.logisticintel.com").replace(/\/+$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function laneParts(q: Record<string, unknown>): { origin: string; dest: string } {
  const part = (port: unknown, city: unknown, state: unknown) => {
    if (port && String(port).trim()) return String(port).trim();
    const c = city ? String(city).trim() : "";
    const s = state ? String(state).trim() : "";
    return [c, s].filter(Boolean).join(", ");
  };
  return {
    origin: part(q.origin_port, q.origin_city, q.origin_state) || "Origin",
    dest: part(q.destination_port, q.destination_city, q.destination_state) || "Destination",
  };
}

function laneLabel(q: Record<string, unknown>): string {
  const { origin, dest } = laneParts(q);
  return `${origin} → ${dest}`;
}

function formatUsd(n: unknown, currency = "USD"): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function fmtDate(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function modeLabel(mode: unknown): string {
  switch (mode) {
    case "ocean": return "Ocean Freight";
    case "air": return "Air Freight";
    case "drayage": return "Drayage";
    case "ftl": return "Full Truckload (FTL)";
    case "ltl": return "Less-than-Truckload (LTL)";
    default: return mode ? String(mode) : "Freight";
  }
}

interface EmailBranding {
  company_name: string;
  logo_url: string | null; // only http(s) URLs are embedded (Gmail blocks data: URIs)
  company_email: string | null;
  company_phone: string | null;
}

interface EmailLineItem {
  name: string | null;
  description: string | null;
  quantity: unknown;
  unit_sell: unknown;
  is_accessorial: boolean | null;
  sort_order: number | null;
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

/**
 * The branded quote block — the quote itself, rendered live inside the email.
 * Email-client-safe: nested tables, inline styles, bgcolor attributes, no
 * flex/grid, no external CSS. Sell-side numbers only.
 */
function quoteBlockHtml(opts: {
  quote: Record<string, unknown>;
  items: EmailLineItem[];
  branding: EmailBranding;
  viewUrl: string;
  pdfUrl: string | null;
}): string {
  const { quote, items, branding, viewUrl, pdfUrl } = opts;
  const currency = (quote.currency as string) || "USD";
  const { origin, dest } = laneParts(quote);
  const validUntil = fmtDate(quote.valid_until);

  const subLine = [modeLabel(quote.mode), quote.service_type, quote.equipment_type]
    .map((v) => (v ? String(v).trim() : ""))
    .filter(Boolean)
    .join(" &middot; ");

  // Hero: logo (https only) or sender company name, cyan eyebrow, quote # right.
  const logo =
    branding.logo_url && /^https?:\/\//i.test(branding.logo_url)
      ? `<img src="${esc(branding.logo_url)}" alt="${esc(branding.company_name)}" height="30" style="display:block;height:30px;width:auto;max-width:180px;border:0;" />`
      : "";

  const ordered = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const itemRows = ordered
    .map((li) => {
      const qty = Number.isFinite(Number(li.quantity)) && li.quantity != null ? Number(li.quantity) : 1;
      const unit = Number.isFinite(Number(li.unit_sell)) && li.unit_sell != null ? Number(li.unit_sell) : 0;
      const name = (li.name ?? "Charge").toString().trim() || "Charge";
      const desc = (li.description ?? "").toString().trim();
      const tag = li.is_accessorial ? ` <span style="color:#94a3b8;font-size:11px;">&middot; Accessorial</span>` : "";
      return `<tr>
        <td style="${FONT}padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">
          ${esc(name)}${tag}${desc ? `<br/><span style="color:#94a3b8;font-size:11.5px;">${esc(desc)}</span>` : ""}
        </td>
        <td align="right" style="${FONT}padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;white-space:nowrap;">${qty.toLocaleString("en-US")}</td>
        <td align="right" style="${FONT}padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;white-space:nowrap;">${esc(formatUsd(unit, currency))}</td>
        <td align="right" style="${FONT}padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;">${esc(formatUsd(qty * unit, currency))}</td>
      </tr>`;
    })
    .join("");

  const totalRow = (label: string, value: string, opts2?: { muted?: boolean }) =>
    `<tr>
      <td colspan="3" align="right" style="${FONT}padding:6px 12px 0;font-size:12.5px;color:${opts2?.muted ? "#64748b" : "#334155"};">${label}</td>
      <td align="right" style="${FONT}padding:6px 12px 0;font-size:12.5px;color:#0f172a;white-space:nowrap;">${esc(value)}</td>
    </tr>`;

  let totalsRows = "";
  totalsRows += totalRow("Subtotal", formatUsd(quote.subtotal_sell, currency), { muted: true });
  if (Number(quote.fuel_surcharge_amount) > 0) {
    const pct = Number.isFinite(Number(quote.fuel_surcharge_pct)) && quote.fuel_surcharge_pct != null
      ? ` (${Number(quote.fuel_surcharge_pct)}%)`
      : "";
    totalsRows += totalRow(`Fuel surcharge${pct}`, formatUsd(quote.fuel_surcharge_amount, currency), { muted: true });
  }
  if (Number(quote.accessorial_total) > 0) {
    totalsRows += totalRow("Accessorials", formatUsd(quote.accessorial_total, currency), { muted: true });
  }

  const contactBits = [branding.company_email, branding.company_phone]
    .map((v) => (v ? esc(String(v).trim()) : ""))
    .filter(Boolean)
    .join(" &middot; ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;">
    <!-- Hero (sender's brand on LIT navy) -->
    <tr>
      <td bgcolor="#020617" style="padding:22px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle">
              ${logo ? `${logo}<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>` : ""}
              <div style="${FONT}font-size:17px;font-weight:700;color:#ffffff;">${esc(branding.company_name)}</div>
              <div style="${FONT}font-size:10.5px;font-weight:700;letter-spacing:0.14em;color:#00e0ff;padding-top:4px;">FREIGHT QUOTATION</div>
            </td>
            <td valign="middle" align="right" style="${FONT}font-size:12px;color:#94a3b8;white-space:nowrap;">
              ${quote.quote_number ? `<span style="color:#e2e8f0;font-weight:700;">${esc(String(quote.quote_number))}</span><br/>` : ""}
              ${validUntil ? `Valid until ${esc(validUntil)}` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Lane -->
    <tr>
      <td style="padding:18px 26px 4px;">
        <div style="${FONT}font-size:15px;font-weight:700;color:#0f172a;">${esc(origin)} &rarr; ${esc(dest)}</div>
        ${subLine ? `<div style="${FONT}font-size:12px;color:#64748b;padding-top:3px;">${subLine}</div>` : ""}
        ${quote.commodity ? `<div style="${FONT}font-size:12px;color:#64748b;padding-top:2px;">Commodity: ${esc(String(quote.commodity))}</div>` : ""}
      </td>
    </tr>
    <!-- Charges -->
    <tr>
      <td style="padding:14px 26px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;">
          <tr bgcolor="#f8fafc">
            <td style="${FONT}padding:8px 12px;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#64748b;border-bottom:1px solid #e2e8f0;">CHARGE</td>
            <td align="right" style="${FONT}padding:8px 12px;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#64748b;border-bottom:1px solid #e2e8f0;">QTY</td>
            <td align="right" style="${FONT}padding:8px 12px;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#64748b;border-bottom:1px solid #e2e8f0;">UNIT</td>
            <td align="right" style="${FONT}padding:8px 12px;font-size:10.5px;font-weight:700;letter-spacing:0.08em;color:#64748b;border-bottom:1px solid #e2e8f0;">AMOUNT</td>
          </tr>
          ${itemRows || `<tr><td colspan="4" style="${FONT}padding:12px;font-size:12.5px;color:#94a3b8;">See the live quote for full details.</td></tr>`}
          ${totalsRows}
          <tr>
            <td colspan="3" align="right" style="${FONT}padding:12px 12px 12px;font-size:13px;font-weight:700;color:#0f172a;">TOTAL</td>
            <td align="right" style="${FONT}padding:12px 12px 12px;font-size:16px;font-weight:800;color:#1d4ed8;white-space:nowrap;">${esc(formatUsd(quote.total_sell, currency))}</td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- CTA -->
    <tr>
      <td align="center" style="padding:22px 26px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" bgcolor="#2563eb" style="border-radius:10px;">
              <a href="${esc(viewUrl)}" style="${FONT}display:inline-block;padding:13px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View live quote</a>
            </td>
          </tr>
        </table>
        <div style="${FONT}padding-top:10px;font-size:11.5px;color:#94a3b8;">
          Opens in your browser &mdash; no account needed.${pdfUrl ? ` &nbsp;<a href="${esc(pdfUrl)}" style="color:#64748b;">Download PDF</a>` : ""}
        </div>
      </td>
    </tr>
    <!-- Sender footer -->
    <tr>
      <td style="padding:14px 26px 18px;border-top:1px solid #f1f5f9;">
        <div style="${FONT}font-size:11.5px;color:#94a3b8;">
          ${esc(branding.company_name)}${contactBits ? ` &middot; ${contactBits}` : ""}
        </div>
      </td>
    </tr>
  </table>`;
}

/** Full email document: intro paragraphs + the quote block + fallback link. */
function buildEmailHtml(opts: {
  introText: string | null;
  toName: string | null;
  lane: string;
  quoteBlock: string;
  viewUrl: string;
  senderName: string;
}): string {
  const greeting = opts.toName ? `Hi ${esc(opts.toName)},` : "Hello,";
  const intro = opts.introText
    ? esc(opts.introText).replace(/\r\n|\r|\n/g, "<br/>")
    : `${greeting}<br/><br/>Please find your quote for <strong>${esc(opts.lane)}</strong> below. Happy to walk through any line item or adjust the scope &mdash; just reply to this email.`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
          <tr>
            <td style="${FONT}padding:0 4px 18px;font-size:14.5px;line-height:1.6;color:#0f172a;">${intro}</td>
          </tr>
          <tr>
            <td>${opts.quoteBlock}</td>
          </tr>
          <tr>
            <td style="${FONT}padding:16px 4px 0;font-size:11px;line-height:1.6;color:#94a3b8;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <a href="${esc(opts.viewUrl)}" style="color:#2563eb;word-break:break-all;">${esc(opts.viewUrl)}</a>
            </td>
          </tr>
          <tr>
            <td style="${FONT}padding:14px 4px 0;font-size:10.5px;color:#cbd5e1;">
              Sent by ${esc(opts.senderName)} &middot; Digital quote powered by <a href="https://www.logisticintel.com" style="color:#94a3b8;text-decoration:none;">Logistic Intel</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-send", { request_id: requestId() });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, svc);
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const userId = u.user.id;

  const orgId = await resolveOrg(admin, userId);
  if (!orgId) return json({ ok: false, code: "NO_ORG" }, 403);
  const gate = await requireQuotingFeature(admin, userId, orgId);
  if (!gate.ok) return json(gate.body, gate.status);

  // 1. Parse + validate input.
  const body = await req.json().catch(() => ({}));
  const quoteId: string | null = body.quote_id ?? null;
  const toEmail: string | null = body.to_email ? String(body.to_email).trim() : null;
  const toName: string | null = body.to_name ? String(body.to_name).trim() : null;
  if (!quoteId || !toEmail) {
    return json({ ok: false, code: "INVALID_INPUT", message: "quote_id and to_email required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return json({ ok: false, code: "INVALID_INPUT", message: "valid to_email required" }, 400);
  }

  // 2. Load the quote (org-scoped) + line items + company + branding.
  //    NOTE: the PDF is now OPTIONAL — no PDF_REQUIRED gate. The quote itself
  //    is rendered inside the email; the PDF, when present, is a secondary
  //    "Download PDF" link.
  const { data: quote } = await admin
    .from("lit_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!quote) return json({ ok: false, code: "NOT_FOUND" }, 404);

  const [{ data: items }, { data: company }, { data: org }, { data: os }] = await Promise.all([
    admin
      .from("lit_quote_line_items")
      .select("name, description, quantity, unit_sell, is_accessorial, sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
    admin.from("lit_companies").select("name").eq("id", quote.company_id).maybeSingle(),
    admin.from("organizations").select("name, logo_url").eq("id", orgId).maybeSingle(),
    admin.from("org_settings").select("quote_defaults").eq("org_id", orgId).maybeSingle(),
  ]);
  const companyName = company?.name || "your shipment";

  const s = (os?.quote_defaults ?? {}) as Record<string, unknown>;
  const rawLogo = (s.logo_url as string) || org?.logo_url || null;
  const branding: EmailBranding = {
    company_name: ((s.company_name as string) || org?.name || "Your logistics partner").trim(),
    // Gmail strips data: URIs — only real URLs are embedded; otherwise the
    // hero falls back to the text brand.
    logo_url: rawLogo && /^https?:\/\//i.test(rawLogo) ? rawLogo : null,
    company_email: (s.company_email as string) || null,
    company_phone: (s.company_phone as string) || null,
  };

  // 3. Resolve sender mailbox (must belong to the caller + be connected).
  let account: QuoteSenderAccount | null = null;
  if (body.email_account_id) {
    const { data: acct } = await admin
      .from("lit_email_accounts")
      .select("id, user_id, provider, email, display_name, status")
      .eq("id", body.email_account_id)
      .maybeSingle();
    if (acct && acct.user_id === userId && acct.status === "connected") {
      account = { id: acct.id, user_id: acct.user_id, provider: acct.provider, email: acct.email, display_name: acct.display_name };
    }
  } else {
    const { data: primary } = await admin
      .from("lit_email_accounts")
      .select("id, user_id, provider, email, display_name, status")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .eq("status", "connected")
      .maybeSingle();
    if (primary) {
      account = { id: primary.id, user_id: primary.user_id, provider: primary.provider, email: primary.email, display_name: primary.display_name };
    } else {
      // Fall back to the most recently connected mailbox for this user.
      const { data: fallback } = await admin
        .from("lit_email_accounts")
        .select("id, user_id, provider, email, display_name, status")
        .eq("user_id", userId)
        .eq("status", "connected")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback) {
        account = { id: fallback.id, user_id: fallback.user_id, provider: fallback.provider, email: fallback.email, display_name: fallback.display_name };
      }
    }
  }
  if (!account) {
    return json({ ok: false, code: "NO_SENDER", message: "No connected Gmail or Outlook mailbox found" }, 400);
  }

  // 4. Build the email: intro (user's message or default) + inline quote block.
  const lane = laneLabel(quote);
  const subject = (body.subject ? String(body.subject) : "") || `Quote for ${lane} - ${companyName}`;
  const viewUrl = `${APP_BASE}/q/${quote.share_token}`;
  const pdfUrl = quote.pdf_storage_path
    ? `${url}/functions/v1/quote-view?token=${quote.share_token}&format=pdf`
    : null;

  const quoteBlock = quoteBlockHtml({ quote, items: items ?? [], branding, viewUrl, pdfUrl });
  const html = buildEmailHtml({
    introText: body.body && String(body.body).trim() ? String(body.body) : null,
    toName,
    lane,
    quoteBlock,
    viewUrl,
    senderName: branding.company_name,
  });

  // 5. Send via the user's mailbox (refreshes token first).
  const sendRes = await sendQuoteEmail(admin, account, { to: toEmail, toName, subject, html });
  if (!sendRes.ok) {
    log.error("send_failed", { err: sendRes.error, quote_id: quoteId, provider: account.provider });
    return json({ ok: false, code: "SEND_FAILED", message: sendRes.error }, 502);
  }
  const messageId = sendRes.messageId;

  // 6. Persist state. Don't downgrade an approved/won/lost quote — only move
  //    forward to "sent" from draft/viewed/sent.
  let updatedQuote = quote;
  if (["draft", "viewed", "sent"].includes(quote.status)) {
    const { data: upd } = await admin
      .from("lit_quotes")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("*")
      .single();
    if (upd) updatedQuote = upd;
  }

  await admin.from("lit_quote_events").insert({
    quote_id: quoteId,
    org_id: orgId,
    company_id: quote.company_id,
    event_type: "sent",
    event_payload: { recipient_email: toEmail, provider: account.provider, message_id: messageId },
    created_by: userId,
  });

  // lit_outreach_history has no org_id column (it's keyed by user_id +
  // company_id + campaign). Logged so the quote send shows in the contact's
  // outreach timeline alongside campaign sends.
  await admin.from("lit_outreach_history").insert({
    user_id: userId,
    company_id: quote.company_id,
    channel: "email",
    event_type: "quote_sent",
    status: "sent",
    subject,
    provider: account.provider,
    message_id: messageId,
    provider_event_id: messageId,
    occurred_at: new Date().toISOString(),
    metadata: { quote_id: quoteId, recipient_email: toEmail },
  });

  log.info("quote_sent", { quote_id: quoteId, provider: account.provider, has_message_id: !!messageId });
  return json({ ok: true, data: { quote: updatedQuote, message_id: messageId } });
});
