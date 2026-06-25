// quote-send — Phase 1 quoting.
//
// Sends a quote to a recipient through the USER's connected Gmail or Outlook
// mailbox, as a SECURE LINK (NOT a PDF attachment). The email body carries a
// "View your quote" button pointing at the PUBLIC quote-view function, which
// validates the unguessable share_token, flips status sent->viewed on first
// view, and 302-redirects to a fresh signed PDF URL.
//
// Secure-link only: no multipart MIME, no attachments, no Content-Disposition.
// The PDF is generated separately (quote-generate-pdf) BEFORE this runs —
// this function returns PDF_REQUIRED if the artifact is missing rather than
// generating it here.
//
// Gating: the `quoting` server-side feature gate (requireQuotingFeature) is
// enforced before any work. Admin bypass is server-side only, inside the gate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { resolveOrg, requireQuotingFeature } from "../_shared/quote_helpers.ts";
import { sendQuoteEmail, QuoteSenderAccount } from "../_shared/quote_email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function laneLabel(q: Record<string, unknown>): string {
  const part = (port: unknown, city: unknown, state: unknown) => {
    if (port && String(port).trim()) return String(port).trim();
    const c = city ? String(city).trim() : "";
    const s = state ? String(state).trim() : "";
    return [c, s].filter(Boolean).join(", ");
  };
  const origin = part(q.origin_port, q.origin_city, q.origin_state) || "Origin";
  const dest = part(q.destination_port, q.destination_city, q.destination_state) || "Destination";
  return `${origin} → ${dest}`;
}

function formatUsd(n: unknown, currency = "USD"): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function defaultTemplate(opts: {
  toName?: string | null;
  lane: string;
  total: string;
  validUntil: string | null;
  viewUrl: string;
}): string {
  const greeting = opts.toName ? `Hi ${esc(opts.toName)},` : "Hello,";
  const validLine = opts.validUntil
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;">Valid until <strong>${esc(opts.validUntil)}</strong>.</p>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p style="margin:0 0 16px;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Please find your quote for <strong>${esc(opts.lane)}</strong> below.
    </p>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Total</p>
      <p style="margin:0 0 16px;font-size:28px;font-weight:700;color:#0f172a;">${esc(opts.total)}</p>
      ${validLine}
      <a href="${esc(opts.viewUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">View your quote</a>
    </div>
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href="${esc(opts.viewUrl)}" style="color:#2563eb;word-break:break-all;">${esc(opts.viewUrl)}</a>
    </p>
  </div>
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

  // 2. Load the quote (org-scoped) + company name.
  const { data: quote } = await admin
    .from("lit_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!quote) return json({ ok: false, code: "NOT_FOUND" }, 404);

  if (!quote.pdf_signed_url && !quote.pdf_storage_path) {
    return json({ ok: false, code: "PDF_REQUIRED", message: "Generate the PDF before sending" }, 200);
  }

  const { data: company } = await admin
    .from("lit_companies")
    .select("name")
    .eq("id", quote.company_id)
    .maybeSingle();
  const companyName = company?.name || "your shipment";

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

  // 4. Build the email.
  const lane = laneLabel(quote);
  const subject = (body.subject ? String(body.subject) : "") || `Quote for ${lane} - ${companyName}`;
  const viewUrl = `${url}/functions/v1/quote-view?token=${quote.share_token}`;
  const html = (body.body && String(body.body).trim())
    ? String(body.body)
    : defaultTemplate({
        toName,
        lane,
        total: formatUsd(quote.total_sell, quote.currency),
        validUntil: quote.valid_until ?? null,
        viewUrl,
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
