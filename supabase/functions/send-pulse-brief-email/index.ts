// send-pulse-brief-email — sends a Pulse AI Brief from the user's own
// connected mailbox (Gmail or Outlook) via the OAuth refresh-token they
// already stored when they linked their inbox. No Resend / no LIT-branded
// "from" address — the email goes out as if the user composed it
// themselves, so replies thread back to them naturally.
//
// Body: {
//   to: string,                  required
//   cc?: string,                 optional
//   subject: string,             required
//   company_name?: string,       optional — surfaced in the wrapper banner
//   body_markdown?: string,      optional — user-typed message (plain)
//   body_html?: string,          optional — already-rendered brief HTML
//   from_account_id: string,     required — uuid of lit_email_accounts row
// }
//
// Returns: { ok: true, message_id?: string }
//
// Mirrors send-inbox-reply (v15) for the OAuth refresh + provider dispatch.
// Auth: requires the caller's Supabase JWT (verify_jwt: true).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build the final email body.
 *
 * The frontend now ships a COMPLETE styled HTML document in `body_html`
 * (see frontend/src/lib/pulse/pulseBriefHtml.ts renderPulseBriefEmailHtml).
 * We must NOT wrap it in another shell — nested <html>/<body> tags get
 * stripped by Gmail's HTML sanitizer, which dumps the inline body styles
 * and the recipient sees a plain-text-looking email. Pass it through and
 * inject the operator's preamble (if any) immediately after the opening
 * <body> tag so the human note appears above the branded brief.
 *
 * If body_html is empty / fragment-only, fall back to wrapping the
 * preamble + fragment in a minimal shell (preserves the v1 behaviour).
 */
function renderEmailHtml(args: {
  companyName: string;
  preambleMarkdown: string | null;
  briefHtml: string | null;
}): string {
  const { companyName, preambleMarkdown, briefHtml } = args;

  const preambleHtml = preambleMarkdown
    ? `<div style="font-size:14px;line-height:1.55;color:#0f172a;padding:18px 22px;background:#FFFFFF;border-bottom:1px solid #E2E8F0;">${preambleMarkdown
        .split(/\n{2,}/)
        .map((p) =>
          `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
        )
        .join("")}</div>`
    : "";

  // Pass-through path: body_html is already a complete document. Inject
  // the preamble right after the opening <body ...> tag so the operator's
  // note appears above the branded brief, then return the (still-valid)
  // single document. Regex tolerates whitespace/attrs/newlines.
  if (briefHtml && /<body[\s>]/i.test(briefHtml)) {
    if (!preambleHtml) return briefHtml;
    return briefHtml.replace(
      /<body([^>]*)>/i,
      (_m, attrs) => `<body${attrs}>${preambleHtml}`,
    );
  }

  // Fallback wrap (fragment-only body_html, or operator-text-only sends).
  const briefBody = briefHtml
    ? briefHtml
    : `<p style="color:#64748b;font-size:14px;">No brief content was attached. Open Logistic Intel and re-run the Pulse Brief, then resend.</p>`;

  const banner = companyName
    ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#2563eb;margin:0 0 6px;">Pulse Brief · ${escapeHtml(companyName)}</div>`
    : `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#2563eb;margin:0 0 6px;">Pulse Brief</div>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 32px;">
${banner}
${preambleHtml}
<div style="font-size:14px;line-height:1.55;color:#0f172a;">${briefBody}</div>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;line-height:1.5;">
Shared via <a href="https://logisticintel.com" style="color:#2563eb;text-decoration:none;font-weight:600;">Logistic Intel</a>.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * RFC 2047 MIME-encode a header value when it contains non-ASCII so Gmail
 * doesn't mojibake em-dashes / smart quotes / etc. Only needed for the
 * Gmail RFC822 raw send path — Outlook Graph takes UTF-8 JSON natively.
 *
 * Output: `=?UTF-8?B?<base64>?=` when non-ASCII detected; original string
 * otherwise.
 */
function encodeMimeHeader(value: string): string {
  // ASCII-only — Gmail accepts as-is.
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

interface BriefEmailBody {
  to?: string;
  cc?: string;
  subject?: string;
  company_name?: string;
  body_markdown?: string;
  body_html?: string;
  from_account_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  // ---- Auth -----------------------------------------------------------------
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "missing_auth" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "unauthorized" }, 401);

  // ---- Body -----------------------------------------------------------------
  let body: BriefEmailBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const to = String(body?.to || "").trim();
  const cc = body?.cc ? String(body.cc).trim() : "";
  const subject = String(body?.subject || "").trim();
  const fromAccountId = String(body?.from_account_id || "").trim();
  const companyName = body?.company_name ? String(body.company_name).trim() : "";
  const bodyMarkdown = body?.body_markdown ? String(body.body_markdown) : null;
  const briefHtmlInput = body?.body_html ? String(body.body_html) : null;

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ ok: false, error: "invalid_to" }, 400);
  }
  if (!subject) return json({ ok: false, error: "missing_subject" }, 400);
  if (!fromAccountId) return json({ ok: false, error: "missing_from_account_id" }, 400);
  if (!bodyMarkdown && !briefHtmlInput) {
    return json({ ok: false, error: "missing_body" }, 400);
  }

  // ---- Mailbox lookup -------------------------------------------------------
  // Service-role client to (a) verify the account belongs to the caller and
  // (b) read the OAuth token row that lit_email_accounts indexes by id.
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: account, error: acctErr } = await admin
    .from("lit_email_accounts")
    .select("id, user_id, provider, email, display_name")
    .eq("id", fromAccountId)
    .maybeSingle();
  if (acctErr || !account) return json({ ok: false, error: "mailbox_not_found" }, 404);
  if (account.user_id !== user.id) {
    return json({ ok: false, error: "mailbox_not_yours" }, 403);
  }

  // ---- Compose --------------------------------------------------------------
  const emailHtml = renderEmailHtml({
    companyName,
    preambleMarkdown: bodyMarkdown,
    briefHtml: briefHtmlInput,
  });
  const emailText = htmlToText(emailHtml);

  // ---- OAuth access token ---------------------------------------------------
  const tokenRes = await getAccessToken(admin, account);
  if (!tokenRes.ok) return json({ ok: false, error: `token:${tokenRes.error}` }, 502);

  // ---- Provider dispatch ----------------------------------------------------
  let providerMessageId: string | null = null;
  if (account.provider === "gmail") {
    // Gmail's send API takes a raw RFC 822 message. Headers that contain
    // non-ASCII (em-dashes in the subject, accented display names, etc.)
    // MUST be MIME-encoded per RFC 2047, otherwise Gmail forwards the
    // bytes verbatim and the recipient sees mojibake ("â€"" for "—").
    const displayName = account.display_name
      ? encodeMimeHeader(account.display_name)
      : null;
    const fromLine = displayName
      ? `${displayName} <${account.email}>`
      : account.email;
    const headers: string[] = [
      `From: ${fromLine}`,
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      `Subject: ${encodeMimeHeader(subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      // Marking the body 8bit + base64 is overkill for HTML — quoted-printable
      // would also work — but most providers accept raw UTF-8 in the body
      // as long as the Content-Type charset is correct. Leave body raw.
    ];
    const raw = [...headers, "", emailHtml].join("\r\n");
    const resp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRes.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: toBase64Url(raw) }),
      },
    );
    const respJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json(
        {
          ok: false,
          error: `gmail_${resp.status}:${respJson?.error?.message || ""}`,
        },
        502,
      );
    }
    providerMessageId = respJson.id ?? null;
  } else if (account.provider === "outlook") {
    const toRecipients = [{ emailAddress: { address: to } }];
    const ccRecipients = cc ? [{ emailAddress: { address: cc } }] : [];
    const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenRes.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: emailHtml },
          toRecipients,
          ccRecipients,
        },
        saveToSentItems: true,
      }),
    });
    if (!resp.ok) {
      let errBody: any = {};
      try {
        errBody = await resp.json();
      } catch {}
      return json(
        {
          ok: false,
          error: `outlook_${resp.status}:${errBody?.error?.message || ""}`,
        },
        502,
      );
    }
    providerMessageId = resp.headers.get("client-request-id") ?? `graph_${Date.now()}`;
  } else {
    return json({ ok: false, error: `unsupported_provider:${account.provider}` }, 400);
  }

  // ---- Audit row ------------------------------------------------------------
  // lit_outreach_history exists from the admin-notify path; this mirrors
  // the same channel="email" + provider="gmail"|"outlook" shape so the admin
  // dashboard can surface a "brief sent" history later. Best-effort — if the
  // insert fails we still report success since the email actually shipped.
  try {
    await admin.from("lit_outreach_history").insert({
      user_id: user.id,
      campaign_id: null,
      contact_id: null,
      channel: "email",
      event_type: "pulse_brief_sent",
      status: "sent",
      subject,
      message_id: providerMessageId,
      provider: account.provider,
      occurred_at: new Date().toISOString(),
      metadata: { to, cc: cc || null, company_name: companyName || null },
    });
  } catch (e) {
    console.warn("[send-pulse-brief-email] audit insert failed (non-fatal):", e);
  }

  return json({ ok: true, message_id: providerMessageId });
});

async function getAccessToken(
  admin: any,
  account: { id: string; provider: string },
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const { data: tokenRow, error } = await admin
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, provider")
    .eq("email_account_id", account.id)
    .maybeSingle();
  if (error || !tokenRow) return { ok: false, error: "no_token" };

  const expiresAt = tokenRow.expires_at
    ? new Date(tokenRow.expires_at as string).getTime()
    : 0;
  const nowMs = Date.now();
  if (expiresAt - nowMs >= 60_000) {
    return { ok: true, accessToken: tokenRow.access_token as string };
  }
  if (!tokenRow.refresh_token) return { ok: false, error: "no_refresh_token" };

  let refreshJson: any = null;
  if (account.provider === "gmail") {
    const id = Deno.env.get("GMAIL_CLIENT_ID");
    const secret = Deno.env.get("GMAIL_CLIENT_SECRET");
    if (!id || !secret) return { ok: false, error: "gmail_credentials_missing" };
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: id,
          client_secret: secret,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      refreshJson = await r.json();
    } catch (e) {
      console.error(e);
    }
  } else {
    const id = Deno.env.get("OUTLOOK_CLIENT_ID");
    const secret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
    const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";
    if (!id || !secret) return { ok: false, error: "outlook_credentials_missing" };
    try {
      const r = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            refresh_token: tokenRow.refresh_token,
            grant_type: "refresh_token",
            scope: OUTLOOK_SCOPES.join(" "),
          }),
        },
      );
      refreshJson = await r.json();
    } catch (e) {
      console.error(e);
    }
  }

  if (!refreshJson?.access_token) return { ok: false, error: "token_refresh_failed" };
  const newAccessToken = refreshJson.access_token as string;
  const expiresIn = Number(refreshJson.expires_in) || 3600;
  await admin
    .from("lit_oauth_tokens")
    .update({
      access_token: newAccessToken,
      expires_at: new Date(nowMs + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.id);
  return { ok: true, accessToken: newAccessToken };
}
