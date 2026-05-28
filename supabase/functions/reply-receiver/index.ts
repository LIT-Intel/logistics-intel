// supabase/functions/reply-receiver/index.ts
//
// Handles inbound push notifications from Gmail (via Pub/Sub) and Outlook
// (via Microsoft Graph subscriptions). Correlates new messages back to a
// sent lit_outreach_history row by the In-Reply-To / References headers,
// then:
//   1. Inserts a 'replied' event into lit_outreach_history (idempotent on
//      the (provider, provider_event_id) unique index).
//   2. Updates lit_campaign_contacts.status = 'replied' (pauses sequence).
//   3. Inserts a bell notification into lit_notifications.
//   4. (Future) logs a lit_company_timeline_events row — table not yet
//      created; see TODO in persistReply.
//
// Auth: Pub/Sub + Graph callbacks do not carry user JWTs. This function
// is deployed with verify_jwt=false; authenticity comes from the signed
// Pub/Sub OIDC token (TODO: verify) and Graph's clientState echo.
//
// Always returns 2xx so Pub/Sub / Graph do not retry permanently-broken
// payloads indefinitely.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { correlateReplyHeaders } from "../_shared/reply-correlate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get("source"); // 'gmail' | 'outlook'
  const action = url.searchParams.get("action");

  // Renewal action: invoked by pg_cron every 6h to refresh expiring
  // Gmail Watch / Graph subscriptions. Handled before any source/method
  // gating so the cron can POST without a source param.
  if (action === "renew") {
    if (req.method !== "POST") {
      return new Response("method_not_allowed", { status: 405 });
    }
    const supaRenew = createClient(SUPABASE_URL, SERVICE_ROLE);
    return await handleRenewal(supaRenew);
  }

  // Graph validation handshake comes via GET or POST with ?validationToken=.
  // Handle it before any auth / method gating so subscription creation in
  // oauth-outlook-callback succeeds. See Task 8.
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken && source === "outlook") {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (source === "gmail") {
      return await handleGmailPush(req, supa);
    }
    if (source === "outlook") {
      return await handleOutlookNotification(req, supa);
    }
    return new Response("unknown_source", { status: 400 });
  } catch (err) {
    console.error("[reply-receiver] unhandled error:", err);
    // Always return 200 — Pub/Sub + Graph retry on non-2xx and we don't
    // want them retrying a permanently broken payload.
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  }
});

// ── Gmail (Pub/Sub) ───────────────────────────────────────────────────

async function handleGmailPush(req: Request, supa: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  // Pub/Sub envelope: { message: { data: base64, attributes, messageId, publishTime } }
  const dataBase64 = body?.message?.data;
  if (!dataBase64) {
    return jsonOk({ ok: false, error: "no_data" });
  }

  let decoded: { emailAddress?: string; historyId?: string | number };
  try {
    decoded = JSON.parse(atob(dataBase64));
  } catch (e) {
    console.warn("[reply-receiver] gmail decode failed:", e);
    return jsonOk({ ok: false, error: "decode_failed" });
  }

  const userEmail = decoded.emailAddress;
  const newHistoryId = String(decoded.historyId ?? "");
  if (!userEmail || !newHistoryId) {
    return jsonOk({ ok: false, error: "missing_envelope_fields" });
  }

  // Find the mailbox row by email.
  const { data: mailbox, error: mbErr } = await supa
    .from("lit_email_accounts")
    .select("id, user_id, email, gmail_history_id")
    .eq("provider", "gmail")
    .eq("email", userEmail)
    .maybeSingle();
  if (mbErr) {
    console.warn("[reply-receiver] mailbox lookup failed:", mbErr);
    return jsonOk({ ok: false, error: "mailbox_lookup_failed" });
  }
  if (!mailbox) {
    return jsonOk({ ok: false, error: "mailbox_not_found" });
  }

  // Token lookup — second query (lit_oauth_tokens is service-role-only and
  // PostgREST embedding via FK may not be available).
  const tokenRes = await getMailboxAccessToken(supa, mailbox.id, "gmail");
  if (!tokenRes.ok) {
    return jsonOk({ ok: false, error: tokenRes.error });
  }
  const accessToken = tokenRes.accessToken;

  // Fetch history since the last processed historyId.
  const prevHistoryId = mailbox.gmail_history_id;
  if (!prevHistoryId) {
    // No baseline — just advance and exit (first push after connect).
    await supa
      .from("lit_email_accounts")
      .update({ gmail_history_id: newHistoryId })
      .eq("id", mailbox.id);
    return jsonOk({ ok: true, note: "no_baseline_history_id" });
  }

  const histResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${prevHistoryId}&historyTypes=messageAdded`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!histResp.ok) {
    console.warn(`[reply-receiver] gmail history fetch failed: ${histResp.status}`);
    return jsonOk({ ok: false, error: "history_fetch_failed" });
  }
  const hist = await histResp.json();

  for (const h of (hist.history || [])) {
    for (const ma of (h.messagesAdded || [])) {
      const msgId = ma.message?.id;
      if (!msgId) continue;
      // Fetch full message metadata so we can read reply headers.
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      if (!msgResp.ok) continue;
      const msg = await msgResp.json();
      const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
      const get = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
      const replyIds = correlateReplyHeaders({
        inReplyTo: get("In-Reply-To"),
        references: get("References"),
      });
      if (replyIds.length === 0) continue;
      await persistReply(supa, {
        mailboxId: mailbox.id,
        userId: mailbox.user_id,
        replyMessageIds: replyIds,
        provider: "gmail",
        providerMessageId: get("Message-ID") || msgId,
        snippet: msg.snippet || "",
        fromHeader: get("From") || "",
        subjectHeader: get("Subject") || "",
      });
    }
  }

  // Advance historyId regardless — we never want to re-process the same
  // window.
  await supa
    .from("lit_email_accounts")
    .update({ gmail_history_id: newHistoryId })
    .eq("id", mailbox.id);

  return jsonOk({ ok: true });
}

// ── Outlook (Graph) ───────────────────────────────────────────────────

async function handleOutlookNotification(req: Request, supa: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));

  for (const notif of (body.value || [])) {
    const mailboxId = notif.clientState;
    const messageRef = notif.resourceData?.id;
    if (!mailboxId || !messageRef) continue;

    const { data: mailbox } = await supa
      .from("lit_email_accounts")
      .select("id, user_id")
      .eq("id", mailboxId)
      .maybeSingle();
    if (!mailbox) continue;

    const tokenRes = await getMailboxAccessToken(supa, mailbox.id, "outlook");
    if (!tokenRes.ok) continue;
    const accessToken = tokenRes.accessToken;

    const msgResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageRef}?$select=internetMessageId,internetMessageHeaders,subject,from,bodyPreview`,
      { headers: { "Authorization": `Bearer ${accessToken}` } },
    );
    if (!msgResp.ok) continue;
    const msg = await msgResp.json();
    const headers = msg.internetMessageHeaders || [];
    const get = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
    const replyIds = correlateReplyHeaders({
      inReplyTo: get("In-Reply-To"),
      references: get("References"),
    });
    if (replyIds.length === 0) continue;
    await persistReply(supa, {
      mailboxId,
      userId: mailbox.user_id,
      replyMessageIds: replyIds,
      provider: "outlook",
      providerMessageId: msg.internetMessageId || messageRef,
      snippet: msg.bodyPreview || "",
      fromHeader: msg.from?.emailAddress?.address || "",
      subjectHeader: msg.subject || "",
    });
  }
  return new Response("", { status: 202, headers: corsHeaders() });
}

// ── Common persist logic ──────────────────────────────────────────────

async function persistReply(supa: any, args: {
  mailboxId: string;
  userId: string;
  replyMessageIds: string[];
  provider: string;
  providerMessageId: string;
  snippet: string;
  fromHeader: string;
  subjectHeader: string;
}) {
  // Find the original outbound message in lit_outreach_history by
  // Message-ID match. provider_event_id is the canonical column where the
  // dispatcher wrote the outbound Message-ID at send time.
  const { data: outbound } = await supa
    .from("lit_outreach_history")
    .select("id, campaign_id, campaign_step_id, contact_id, company_id, user_id, org_id")
    .in("provider_event_id", args.replyMessageIds)
    .eq("event_type", "sent")
    .limit(1);
  if (!outbound?.length) {
    console.log(
      `[reply-receiver] no matching outbound found for replyIds=${args.replyMessageIds.join(",")}`,
    );
    return;
  }
  const orig = outbound[0];
  const now = new Date().toISOString();

  // 1. Insert reply event. Idempotent via uq_lit_outreach_history_provider_event
  //    unique index on (provider, provider_event_id). upsert + ignoreDuplicates
  //    means concurrent Pub/Sub retries won't double-write.
  const { error: insErr } = await supa
    .from("lit_outreach_history")
    .upsert(
      {
        campaign_id: orig.campaign_id,
        campaign_step_id: orig.campaign_step_id,
        contact_id: orig.contact_id,
        company_id: orig.company_id,
        user_id: orig.user_id,
        org_id: orig.org_id,
        channel: "email",
        event_type: "replied",
        status: "received",
        provider: args.provider,
        provider_event_id: args.providerMessageId,
        subject: args.subjectHeader,
        occurred_at: now,
        replied_at: now,
        metadata: {
          snippet: args.snippet.slice(0, 500),
          from: args.fromHeader,
          subject: args.subjectHeader,
          in_reply_to: args.replyMessageIds,
        },
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    );
  if (insErr) {
    console.error("[reply-receiver] insert reply failed:", insErr);
    return;
  }

  // 2. Pause future steps for this recipient. We scope by (campaign_id,
  //    contact_id) — a contact may appear in multiple campaigns; only the
  //    one this reply belongs to gets paused.
  if (orig.campaign_id && orig.contact_id) {
    await supa
      .from("lit_campaign_contacts")
      .update({ status: "replied", updated_at: now })
      .eq("campaign_id", orig.campaign_id)
      .eq("contact_id", orig.contact_id);
  }

  // 3. Resolve contact / company for the bell notification + (future) timeline.
  const { data: contactRow } = await supa
    .from("lit_contacts")
    .select("company_id, full_name")
    .eq("id", orig.contact_id)
    .maybeSingle();

  // 4. Notification row for the bell. Schema uses `kind` (not `type`) and
  //    `metadata` (not `payload`). source_table/source_id link back to the
  //    outbound row so the UI can deep-link to the campaign thread.
  if (args.userId) {
    await supa.from("lit_notifications").insert({
      user_id: args.userId,
      kind: "campaign_reply",
      severity: "info",
      title: `${contactRow?.full_name || args.fromHeader || "A contact"} replied`,
      body: args.snippet.slice(0, 200),
      cta_label: "View reply",
      cta_url: orig.campaign_id ? `/campaigns/${orig.campaign_id}/replies` : null,
      source_table: "lit_outreach_history",
      source_id: orig.id,
      status: "unread",
      metadata: {
        campaign_id: orig.campaign_id,
        contact_id: orig.contact_id,
        company_id: contactRow?.company_id ?? orig.company_id,
        provider: args.provider,
      },
    });
  }

  // 5. TODO(outreach): once `lit_company_timeline_events` table exists,
  //    insert a row here keyed on contactRow.company_id (or orig.company_id)
  //    with event_type='campaign_reply'. Table not present as of
  //    2026-05-20 — skipping to avoid hard failure. See plan Task 5 /
  //    company-profile timeline work.
}

// ── Helpers ───────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

/**
 * Fetches the (possibly refreshed) access token for a mailbox. Mirrors
 * the getAccessToken helper in send-campaign-email but trimmed for the
 * reply path (we never need to send mail here, so a stale token is
 * acceptable — Gmail/Graph will 401 and we'll skip gracefully).
 *
 * Does a refresh if the token expires within 60s.
 */
async function getMailboxAccessToken(
  supa: any,
  mailboxId: string,
  provider: "gmail" | "outlook",
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
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
  if (!needsRefresh) {
    return { ok: true, accessToken: tokenRow.access_token as string };
  }
  if (!tokenRow.refresh_token) {
    return { ok: false, error: "no_refresh_token" };
  }

  let refreshJson: any = null;
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
      refreshJson = await resp.json();
    } catch (e) {
      console.error("[reply-receiver] gmail refresh threw:", e);
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
      refreshJson = await resp.json();
    } catch (e) {
      console.error("[reply-receiver] outlook refresh threw:", e);
    }
  }

  if (!refreshJson?.access_token) {
    return { ok: false, error: "token_refresh_failed" };
  }
  const newAccessToken = refreshJson.access_token as string;
  const expiresIn = Number(refreshJson.expires_in) || 3600;
  await supa
    .from("lit_oauth_tokens")
    .update({
      access_token: newAccessToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.id);
  return { ok: true, accessToken: newAccessToken };
}

// ── Subscription renewal (cron-driven) ────────────────────────────────
//
// Gmail Watch lasts at most 7 days; Graph subscriptions on /messages
// last at most ~71h59m. A pg_cron job posts to ?action=renew every 6h
// and we renew any subscription expiring within the next 24h. This
// keeps reply detection alive indefinitely without manual reconnects.

async function handleRenewal(supa: any): Promise<Response> {
  const renewBefore = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let renewed = 0;
  let failed = 0;

  // Gmail Watch renewals — also handles INITIAL PROVISIONING for any
  // connected Gmail mailbox that has no watch yet. The .or() picks up
  // both:
  //   (a) expiring soon (renewal case — gmail_watch_expiration < now+24h)
  //   (b) never provisioned (gmail_watch_expiration IS NULL — typically
  //       mailboxes connected before the oauth-gmail-callback Watch
  //       registration was deployed, OR cases where the callback's
  //       Watch POST failed and was logged but not retried)
  // Without this, mailboxes connected before Task 7 shipped never get
  // a Watch and silently drop all replies.
  //
  // Skip silently if GMAIL_PUBSUB_TOPIC env var isn't set — no point
  // calling users/me/watch without a topic to publish to.
  const pubsubTopic = Deno.env.get("GMAIL_PUBSUB_TOPIC");
  if (pubsubTopic) {
    const { data: gmailMboxes } = await supa
      .from("lit_email_accounts")
      .select("id, email, gmail_watch_expiration, warmup_started_at")
      .eq("provider", "gmail")
      .eq("status", "connected")
      .or(`gmail_watch_expiration.is.null,gmail_watch_expiration.lt.${renewBefore}`);

    for (const mailbox of (gmailMboxes || [])) {
      try {
        const tokenRes = await getMailboxAccessToken(supa, mailbox.id, "gmail");
        if (!tokenRes.ok) { failed++; continue; }
        const accessToken = tokenRes.accessToken;
        const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/watch`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topicName: pubsubTopic,
            labelIds: ["INBOX"],
            labelFilterBehavior: "INCLUDE",
          }),
        });
        if (resp.ok) {
          const w = await resp.json();
          // Initialize warmup_started_at on first-time provisioning
          // (null-only — re-watches don't reset the 30-day ramp).
          if (!mailbox.warmup_started_at) {
            await supa.from("lit_email_accounts").update({
              warmup_started_at: new Date().toISOString(),
            }).eq("id", mailbox.id).is("warmup_started_at", null);
          }
          await supa.from("lit_email_accounts").update({
            gmail_watch_expiration: new Date(Number(w.expiration)).toISOString(),
            gmail_history_id: String(w.historyId),
          }).eq("id", mailbox.id);
          renewed++;
        } else {
          const txt = await resp.text().catch(() => "");
          console.warn(`[renew] gmail watch failed for ${mailbox.email}: ${resp.status} ${txt.slice(0, 200)}`);
          failed++;
        }
      } catch (err) {
        console.error(`[renew] gmail mailbox ${mailbox.id} threw:`, err);
        failed++;
      }
    }
  }

  // Outlook Graph subscription renewals AND initial provisioning (max
  // 71h59m for /messages). Same back-fill pattern as Gmail above:
  //   (a) subscription exists + expiring soon  → PATCH to extend
  //   (b) subscription_id IS NULL  → POST to create
  // Mailboxes connected before the oauth-outlook-callback subscription
  // registration was deployed (or where that registration's initial
  // POST failed because reply-receiver didn't exist yet to answer the
  // Graph validation handshake) fall into case (b).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const { data: outlookMboxes } = await supa
    .from("lit_email_accounts")
    .select("id, email, graph_subscription_id, graph_subscription_expiration, warmup_started_at")
    .eq("provider", "outlook")
    .eq("status", "connected")
    .or(`graph_subscription_id.is.null,graph_subscription_expiration.lt.${renewBefore}`);

  for (const mailbox of (outlookMboxes || [])) {
    try {
      const tokenRes = await getMailboxAccessToken(supa, mailbox.id, "outlook");
      if (!tokenRes.ok) { failed++; continue; }
      const accessToken = tokenRes.accessToken;
      const newExp = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
      const needsCreate = !mailbox.graph_subscription_id;
      const resp = needsCreate
        ? await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              changeType: "created",
              notificationUrl: `${supabaseUrl}/functions/v1/reply-receiver?source=outlook`,
              resource: "me/mailFolders('Inbox')/messages",
              expirationDateTime: newExp,
              clientState: mailbox.id,
            }),
          })
        : await fetch(
            `https://graph.microsoft.com/v1.0/subscriptions/${mailbox.graph_subscription_id}`,
            {
              method: "PATCH",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ expirationDateTime: newExp }),
            },
          );
      if (resp.ok) {
        const respJson = needsCreate ? await resp.json() : null;
        if (!mailbox.warmup_started_at) {
          await supa.from("lit_email_accounts").update({
            warmup_started_at: new Date().toISOString(),
          }).eq("id", mailbox.id).is("warmup_started_at", null);
        }
        await supa.from("lit_email_accounts").update({
          graph_subscription_id: needsCreate ? respJson?.id : mailbox.graph_subscription_id,
          graph_subscription_expiration: needsCreate ? respJson?.expirationDateTime : newExp,
        }).eq("id", mailbox.id);
        renewed++;
      } else {
        const txt = await resp.text().catch(() => "");
        console.warn(`[renew] graph ${needsCreate ? "create" : "renew"} failed for ${mailbox.email}: ${resp.status} ${txt.slice(0, 200)}`);
        failed++;
      }
    } catch (err) {
      console.error(`[renew] outlook mailbox ${mailbox.id} threw:`, err);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, renewed, failed }), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}
