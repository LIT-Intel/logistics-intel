// send-test-email — Authenticated POST.
//
// Sends a test email from the user's primary connected mailbox (Gmail
// or Outlook). Refreshes the access token if needed. Writes an audit
// row to lit_email_send_tests and lit_outreach_history for every
// attempt (success or failure).
//
// Request body: { toEmail: string, subject?: string, body?: string }
// Success:      { ok: true, message_id, provider, from, to }
// Failure:      { ok: false, error: string }  (status 4xx / 502)
//
// Access tokens / refresh tokens are NEVER returned to the caller or
// written to any log. Use console.warn / console.error with redacted
// info only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OUTLOOK_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Base64url-encode a string (for Gmail raw message). */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── 1. Env vars ────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // ── 2. Auth: resolve calling user ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // ── 3. Parse and validate body ─────────────────────────────────────────────
  let reqBody: Record<string, unknown>;
  try {
    reqBody = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const toEmail = String(reqBody.toEmail || "").trim();
  if (!EMAIL_RE.test(toEmail)) {
    return json({ error: "invalid_to_email" }, 400);
  }
  const subject = String(reqBody.subject || "LIT test send");
  const body = String(
    reqBody.body || "This is a test message from your Logistic Intel mailbox.",
  );

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Helper: write an audit row to lit_email_send_tests.
  async function writeTestRow(
    accountId: string | null,
    provider: string,
    fromEmail: string | null,
    status: "sent" | "failed",
    opts: {
      message_id?: string | null;
      error_code?: string | null;
      error_message?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await admin.from("lit_email_send_tests").insert({
      user_id: user.id,
      email_account_id: accountId,
      provider,
      to_email: toEmail,
      from_email: fromEmail,
      subject,
      status,
      message_id: opts.message_id ?? null,
      error_code: opts.error_code ?? null,
      error_message: opts.error_message ?? null,
      metadata: opts.metadata ?? {},
    });
  }

  // Helper: write a row to lit_outreach_history.
  async function writeHistoryRow(
    provider: string,
    eventType: "test_sent" | "test_failed",
    status: "sent" | "failed",
    messageId: string | null,
  ) {
    await admin.from("lit_outreach_history").insert({
      user_id: user.id,
      campaign_id: null,
      campaign_step_id: null,
      company_id: null,
      contact_id: null,
      channel: "email",
      event_type: eventType,
      status,
      subject,
      message_id: messageId,
      provider,
      occurred_at: new Date().toISOString(),
      metadata: { to_email: toEmail },
    });
  }

  // ── 4. Find primary connected mailbox ──────────────────────────────────────
  let account: {
    id: string;
    user_id: string;
    provider: string;
    email: string;
    display_name: string | null;
    status: string;
    is_primary: boolean;
  } | null = null;

  const { data: primaryAccount } = await admin
    .from("lit_email_accounts")
    .select("id, user_id, provider, email, display_name, status, is_primary")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .eq("status", "connected")
    .maybeSingle();

  account = primaryAccount ?? null;

  if (!account) {
    // Fall back to most-recently-connected.
    const { data: fallback } = await admin
      .from("lit_email_accounts")
      .select("id, user_id, provider, email, display_name, status, is_primary")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    account = fallback ?? null;
  }

  if (!account) {
    await writeTestRow(null, "unknown", null, "failed", {
      error_code: "no_connected_mailbox",
      error_message: "No connected mailbox found for this user",
    });
    return json({ error: "no_connected_mailbox" }, 400);
  }

  // ── 5. Fetch token (service-role bypasses RLS) ─────────────────────────────
  const { data: tokenRow, error: tokenFetchErr } = await admin
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, provider")
    .eq("email_account_id", account.id)
    .maybeSingle();

  if (tokenFetchErr || !tokenRow) {
    console.warn("[send-test-email] no token found for account", account.id);
    await writeTestRow(account.id, account.provider, account.email, "failed", {
      error_code: "no_token",
      error_message: "No OAuth token found for this mailbox",
    });
    return json({ error: "no_token_found" }, 400);
  }

  // ── 6. Refresh token if expired (or expiring within 60s) ──────────────────
  let accessToken = tokenRow.access_token as string;
  const expiresAt = tokenRow.expires_at
    ? new Date(tokenRow.expires_at as string).getTime()
    : 0;
  const nowMs = Date.now();
  const needsRefresh = expiresAt - nowMs < 60_000;

  if (needsRefresh && tokenRow.refresh_token) {
    const refreshToken = tokenRow.refresh_token as string;

    let refreshResp: Response;
    let refreshJson: any;

    if (account.provider === "gmail") {
      const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID");
      const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
      if (!gmailClientId || !gmailClientSecret) {
        console.warn("[send-test-email] missing Gmail credentials for refresh");
        await writeTestRow(account.id, account.provider, account.email, "failed", {
          error_code: "server_misconfigured",
        });
        return json({ error: "server_misconfigured" }, 500);
      }
      try {
        refreshResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: gmailClientId,
            client_secret: gmailClientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        refreshJson = await refreshResp.json();
      } catch (e) {
        console.error("[send-test-email] Gmail refresh threw", e);
        refreshJson = null;
      }
    } else {
      // Outlook
      const outlookClientId = Deno.env.get("OUTLOOK_CLIENT_ID");
      const outlookClientSecret = Deno.env.get("OUTLOOK_CLIENT_SECRET");
      const outlookTenant = Deno.env.get("OUTLOOK_TENANT") || "common";
      if (!outlookClientId || !outlookClientSecret) {
        console.warn("[send-test-email] missing Outlook credentials for refresh");
        await writeTestRow(account.id, account.provider, account.email, "failed", {
          error_code: "server_misconfigured",
        });
        return json({ error: "server_misconfigured" }, 500);
      }
      try {
        refreshResp = await fetch(
          `https://login.microsoftonline.com/${outlookTenant}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: outlookClientId,
              client_secret: outlookClientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
              scope: OUTLOOK_SCOPES.join(" "),
            }),
          },
        );
        refreshJson = await refreshResp.json();
      } catch (e) {
        console.error("[send-test-email] Outlook refresh threw", e);
        refreshJson = null;
      }
    }

    if (!refreshJson?.access_token) {
      console.warn("[send-test-email] token refresh failed for account", account.id);
      // Mark account as error state.
      await admin
        .from("lit_email_accounts")
        .update({
          status: "error",
          metadata: { error: "token_refresh_failed" },
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      await writeTestRow(account.id, account.provider, account.email, "failed", {
        error_code: "token_refresh_failed",
      });
      return json({ error: "token_refresh_failed" }, 502);
    }

    accessToken = refreshJson.access_token as string;
    const newExpiresIn = Number(refreshJson.expires_in) || 3600;
    const newExpiresAt = new Date(nowMs + newExpiresIn * 1000).toISOString();

    // Update stored token row (never log the new token).
    await admin
      .from("lit_oauth_tokens")
      .update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);
  }

  // ── 7. Send the email ──────────────────────────────────────────────────────
  let messageId: string | null = null;
  let sendOk = false;
  let sendErrorCode: string | null = null;
  let sendErrorMessage: string | null = null;

  if (account.provider === "gmail") {
    const fromLine = account.display_name
      ? `"${account.display_name}" <${account.email}>`
      : account.email;

    const rawMessage = [
      `From: ${fromLine}`,
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    ].join("\r\n");

    const encodedMessage = toBase64Url(rawMessage);

    try {
      const sendResp = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedMessage }),
        },
      );
      const sendJson = await sendResp.json();
      if (sendResp.ok) {
        messageId = sendJson.id ?? null;
        sendOk = true;
      } else {
        sendErrorCode = String(sendResp.status);
        sendErrorMessage = String(sendJson?.error?.message || sendJson?.error || "").slice(0, 500);
        console.warn("[send-test-email] Gmail send failed", sendResp.status, sendErrorCode);
      }
    } catch (e) {
      sendErrorCode = "network_error";
      sendErrorMessage = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
      console.error("[send-test-email] Gmail send threw", e);
    }
  } else {
    // Outlook via Microsoft Graph
    try {
      const sendResp = await fetch(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: "Text", content: body },
              toRecipients: [{ emailAddress: { address: toEmail } }],
            },
            saveToSentItems: true,
          }),
        },
      );
      // Graph returns 202 Accepted with empty body on success.
      if (sendResp.ok) {
        messageId = sendResp.headers.get("client-request-id") ?? null;
        sendOk = true;
      } else {
        sendErrorCode = String(sendResp.status);
        let errBody: any = {};
        try { errBody = await sendResp.json(); } catch { /* empty */ }
        sendErrorMessage = String(errBody?.error?.message || "").slice(0, 500);
        console.warn("[send-test-email] Outlook send failed", sendResp.status, sendErrorCode);
      }
    } catch (e) {
      sendErrorCode = "network_error";
      sendErrorMessage = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
      console.error("[send-test-email] Outlook send threw", e);
    }
  }

  // ── 8 / 9. Write audit rows and return ────────────────────────────────────
  if (sendOk) {
    await writeTestRow(account.id, account.provider, account.email, "sent", {
      message_id: messageId,
      metadata: { provider: account.provider, to: toEmail },
    });
    await writeHistoryRow(account.provider, "test_sent", "sent", messageId);
    // Touch last_synced_at.
    await admin
      .from("lit_email_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", account.id);

    return json({
      ok: true,
      message_id: messageId,
      provider: account.provider,
      from: account.email,
      to: toEmail,
    });
  } else {
    await writeTestRow(account.id, account.provider, account.email, "failed", {
      error_code: sendErrorCode,
      error_message: sendErrorMessage,
    });
    await writeHistoryRow(account.provider, "test_failed", "failed", null);

    return json(
      { ok: false, error: sendErrorMessage || sendErrorCode || "send_failed" },
      502,
    );
  }
});