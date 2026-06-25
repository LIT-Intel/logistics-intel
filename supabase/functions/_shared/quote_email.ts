// Single-recipient quote email sender.
//
// Adapted from send-campaign-email.ts sendEmail(); keep in sync if provider
// flow changes. This is a self-contained, minimal, single-recipient sender
// for the quoting module — it does NOT do link rewriting, pixel injection,
// throttling, suppression, or A/B logic. It only:
//   1. Refreshes the mailbox OAuth token (Gmail / Outlook) when stale.
//   2. Sends one HTML email through the user's connected mailbox.
//
// Secure-link only: the quote ships as a clickable "View your quote" link.
// There is NO PDF attachment, no multipart MIME, no Content-Disposition.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type QuoteSenderAccount = {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  display_name: string | null;
};

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Read",
  "offline_access",
];

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Base64 (NOT base64url) body for Gmail RFC822 raw, wrapped at 76 chars per RFC 2045. */
function encodeBodyMimeBase64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

/**
 * Resolve a live access token for the mailbox, refreshing via the provider
 * token endpoint when within 60s of expiry. Mirrors send-campaign-email's
 * getAccessToken. Never logs token material.
 */
export async function getAccessToken(
  admin: SupabaseClient,
  account: QuoteSenderAccount,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const { data: tokenRow, error } = await admin
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, provider")
    .eq("email_account_id", account.id)
    .maybeSingle();
  if (error || !tokenRow) return { ok: false, error: "no_token" };

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at as string).getTime() : 0;
  const nowMs = Date.now();
  const needsRefresh = expiresAt - nowMs < 60_000;

  if (!needsRefresh) return { ok: true, accessToken: tokenRow.access_token as string };
  if (!tokenRow.refresh_token) return { ok: false, error: "no_refresh_token" };

  const refreshToken = tokenRow.refresh_token as string;
  let refreshJson: { access_token?: string; expires_in?: number } | null = null;

  if (account.provider === "gmail") {
    const id = Deno.env.get("GMAIL_CLIENT_ID");
    const secret = Deno.env.get("GMAIL_CLIENT_SECRET");
    if (!id || !secret) return { ok: false, error: "gmail_credentials_missing" };
    try {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: id,
          client_secret: secret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      refreshJson = await resp.json();
    } catch (_e) {
      return { ok: false, error: "gmail_refresh_threw" };
    }
  } else {
    const id = Deno.env.get("OUTLOOK_CLIENT_ID");
    const secret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
    const tenant = Deno.env.get("OUTLOOK_TENANT") || "common";
    if (!id || !secret) return { ok: false, error: "outlook_credentials_missing" };
    try {
      const resp = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: OUTLOOK_SCOPES.join(" "),
          }),
        },
      );
      refreshJson = await resp.json();
    } catch (_e) {
      return { ok: false, error: "outlook_refresh_threw" };
    }
  }

  if (!refreshJson?.access_token) {
    await admin
      .from("lit_email_accounts")
      .update({ status: "error", error_message: "token_refresh_failed", updated_at: new Date().toISOString() })
      .eq("id", account.id);
    return { ok: false, error: "token_refresh_failed" };
  }

  const newAccessToken = refreshJson.access_token;
  const expiresIn = Number(refreshJson.expires_in) || 3600;
  const newExpiresAt = new Date(nowMs + expiresIn * 1000).toISOString();
  await admin
    .from("lit_oauth_tokens")
    .update({ access_token: newAccessToken, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  return { ok: true, accessToken: newAccessToken };
}

/** Send a single HTML email through the user's Gmail mailbox (RFC822 raw). */
export async function sendViaGmail(
  accessToken: string,
  args: { from: QuoteSenderAccount; to: string; toName?: string | null; subject: string; html: string },
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const { from, to, toName, subject, html } = args;
  const fromLine = from.display_name ? `"${from.display_name}" <${from.email}>` : from.email;
  const toLine = toName ? `"${toName}" <${to}>` : to;
  const messageId = `<litquote-${crypto.randomUUID()}@logisticintel.com>`;
  const raw = [
    `From: ${fromLine}`,
    `To: ${toLine}`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeBodyMimeBase64(html),
  ].join("\r\n");
  try {
    const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: toBase64Url(raw) }),
    });
    const respJson = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: `gmail_${resp.status}:${respJson?.error?.message || ""}`.slice(0, 500) };
    }
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "gmail_threw" };
  }
}

/** Send a single HTML email through the user's Outlook mailbox (draft-then-send via Graph). */
export async function sendViaOutlook(
  accessToken: string,
  args: { to: string; toName?: string | null; subject: string; html: string },
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const { to, toName, subject, html } = args;
  try {
    const draftResp = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to, name: toName ?? undefined } }],
      }),
    });
    if (!draftResp.ok) {
      let errBody: { error?: { message?: string } } = {};
      try { errBody = await draftResp.json(); } catch { /* empty */ }
      return { ok: false, error: `outlook_draft_${draftResp.status}:${errBody?.error?.message || ""}`.slice(0, 500) };
    }
    const draft = await draftResp.json();
    const internetMessageId: string | null = draft?.internetMessageId ?? null;
    const draftId: string = draft.id;

    const sendResp = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${draftId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!sendResp.ok) {
      let errBody: { error?: { message?: string } } = {};
      try { errBody = await sendResp.json(); } catch { /* empty */ }
      return { ok: false, error: `outlook_send_${sendResp.status}:${errBody?.error?.message || ""}`.slice(0, 500) };
    }
    return { ok: true, messageId: internetMessageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outlook_threw" };
  }
}

/**
 * Send a single HTML email through Resend (the connected system mailbox).
 *
 * Resend is API-key based — there is NO OAuth token to refresh. Mirrors the
 * Resend send path in send-campaign-email's sendEmail(): same endpoint, bearer
 * auth, `"Display Name <email>"` from-line, and message-id read (respJson.id).
 * The account's own email is used as the verified sender + reply_to.
 */
export async function sendViaResend(
  account: QuoteSenderAccount,
  args: { to: string; toName?: string | null; subject: string; html: string },
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const apiKey = Deno.env.get("LIT_RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "resend_not_configured" };

  const { to, subject, html } = args;
  const fromLine = `${account.display_name || "Logistic Intel"} <${account.email}>`;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromLine,
        to: [to],
        subject,
        html,
        reply_to: account.email,
      }),
    });
    const respJson: { id?: string; message?: string; name?: string } = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: `resend_${resp.status}:${respJson?.message || respJson?.name || ""}`.slice(0, 500) };
    }
    return { ok: true, messageId: respJson?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "resend_threw" };
  }
}

/**
 * Single entry point: pick the provider, send one email.
 *   - Gmail / Outlook: OAuth mailboxes — refresh the token, then send.
 *   - Resend: the connected system mailbox (API key, no OAuth). Skips the
 *     token path entirely.
 */
export async function sendQuoteEmail(
  admin: SupabaseClient,
  account: QuoteSenderAccount,
  msg: { to: string; toName?: string | null; subject: string; html: string },
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  // Resend uses an API key, not OAuth — do NOT call getAccessToken.
  if (account.provider === "resend") {
    return await sendViaResend(account, {
      to: msg.to,
      toName: msg.toName,
      subject: msg.subject,
      html: msg.html,
    });
  }

  if (account.provider !== "gmail" && account.provider !== "outlook") {
    return { ok: false, error: `unsupported_provider:${account.provider}` };
  }
  const tokenRes = await getAccessToken(admin, account);
  if (!tokenRes.ok) return { ok: false, error: `token:${tokenRes.error}` };

  if (account.provider === "gmail") {
    return await sendViaGmail(tokenRes.accessToken, {
      from: account,
      to: msg.to,
      toName: msg.toName,
      subject: msg.subject,
      html: msg.html,
    });
  }
  return await sendViaOutlook(tokenRes.accessToken, {
    to: msg.to,
    toName: msg.toName,
    subject: msg.subject,
    html: msg.html,
  });
}
