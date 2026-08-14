// Shared mailbox token-refresh helper (Gmail + Microsoft Graph).
//
// Centralizes the "get a valid access token for a connected mailbox" dance
// that reply-receiver hand-rolled. Reads lit_oauth_tokens (service-role
// only), refreshes from the stored refresh_token when the access token is
// within 60s of expiry, writes the new token back, and — crucially —
// on an `invalid_grant` response marks the lit_email_accounts row
// status='error' + error_message so Settings surfaces a "reconnect" prompt.
//
// Used by: sync-inbox. reply-receiver keeps its own inline copy for now
// (it predates this helper); new code should import from here.

export type MailboxProvider = "gmail" | "outlook";

export interface TokenResult {
  ok: true;
  accessToken: string;
}
export interface TokenFailure {
  ok: false;
  error: string;
  /** True when the refresh token is dead (invalid_grant) — needs reconnect. */
  needsReconnect?: boolean;
}
export type TokenLookup = TokenResult | TokenFailure;

/**
 * Return a valid (refreshed if necessary) access token for `mailboxId`.
 * On invalid_grant, sets the account status='error' so the UI prompts a
 * reconnect, and returns { ok:false, needsReconnect:true }.
 */
export async function getMailboxAccessToken(
  supa: any,
  mailboxId: string,
  provider: MailboxProvider,
): Promise<TokenLookup> {
  const { data: tokenRow, error } = await supa
    .from("lit_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .eq("email_account_id", mailboxId)
    .maybeSingle();
  if (error || !tokenRow) return { ok: false, error: "no_token" };

  const expiresAt = tokenRow.expires_at
    ? new Date(tokenRow.expires_at as string).getTime()
    : 0;
  const needsRefresh = expiresAt - Date.now() < 60_000;
  if (!needsRefresh && tokenRow.access_token) {
    return { ok: true, accessToken: tokenRow.access_token as string };
  }
  if (!tokenRow.refresh_token) {
    await markAccountError(supa, mailboxId, "no_refresh_token");
    return { ok: false, error: "no_refresh_token", needsReconnect: true };
  }

  let refreshJson: any = null;
  let httpOk = false;
  if (provider === "gmail") {
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
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      httpOk = resp.ok;
      refreshJson = await resp.json().catch(() => null);
    } catch (e) {
      console.error("[mailbox_tokens] gmail refresh threw:", e);
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
            refresh_token: tokenRow.refresh_token,
            grant_type: "refresh_token",
          }),
        },
      );
      httpOk = resp.ok;
      refreshJson = await resp.json().catch(() => null);
    } catch (e) {
      console.error("[mailbox_tokens] outlook refresh threw:", e);
    }
  }

  // invalid_grant → refresh token revoked/expired. Mark the account so the
  // UI shows "reconnect" and stop trying.
  const errCode = String(refreshJson?.error || "");
  if (!httpOk && (errCode === "invalid_grant" || errCode === "invalid_request")) {
    await markAccountError(supa, mailboxId, errCode);
    return { ok: false, error: errCode, needsReconnect: true };
  }

  if (!refreshJson?.access_token) {
    return { ok: false, error: "token_refresh_failed" };
  }
  const newAccessToken = refreshJson.access_token as string;
  const expiresIn = Number(refreshJson.expires_in) || 3600;
  const update: Record<string, unknown> = {
    access_token: newAccessToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Google/Graph may issue a rotated refresh token — persist it if present.
  if (refreshJson.refresh_token) update.refresh_token = refreshJson.refresh_token;
  await supa.from("lit_oauth_tokens").update(update).eq("id", tokenRow.id);

  // If the account was previously flagged in error, clear it — we just
  // successfully refreshed.
  await supa
    .from("lit_email_accounts")
    .update({ status: "connected", error_message: null })
    .eq("id", mailboxId)
    .eq("status", "error");

  return { ok: true, accessToken: newAccessToken };
}

async function markAccountError(supa: any, mailboxId: string, reason: string) {
  try {
    await supa
      .from("lit_email_accounts")
      .update({
        status: "error",
        error_message: `token_refresh_failed: ${reason} — reconnect required`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mailboxId);
  } catch (e) {
    console.error("[mailbox_tokens] markAccountError failed:", e);
  }
}
