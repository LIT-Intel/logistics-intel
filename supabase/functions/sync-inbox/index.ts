// supabase/functions/sync-inbox/index.ts
//
// The inbox sync engine. Populates public.lit_email_threads +
// lit_email_messages from each connected lit_email_accounts mailbox so the
// company-profile Inbox tab and /app/inbox render real conversations.
//
// Two invocation modes (see requireCronOrUser):
//   1. CRON  — pg_cron posts with the X-Internal-Cron secret header. Syncs
//              every 'connected' mailbox in the workspace.
//   2. USER  — the "Sync now" button posts a Supabase user JWT. Syncs only
//              the caller's own connected mailboxes (RLS-safe: we resolve
//              mailboxes by user_id from the verified token).
//
// Per mailbox:
//   Gmail   — users.messages.list. First run backfills ~90d (BACKFILL_DAYS);
//             subsequent runs are incremental via users.history from the
//             stored gmail_history_id. Threads by threadId.
//   Outlook — /me/messages delta query; delta link stored in
//             lit_email_accounts.metadata.graph_delta_link. Threads by
//             conversationId.
//
// Idempotent: threads unique on (email_account_id, provider_thread_id),
// messages unique on (email_account_id, provider_message_id). Re-runs upsert.
//
// Conversation-type tagging (Monday.com style):
//   campaign — a message in the thread matches a sent lit_outreach_history
//              row (provider_event_id == our injected Message-ID).
//   reply    — an inbound message In-Reply-To / References one of our sends.
//   direct   — everything else (organic mail).
//
// Company association: any participant email that matches lit_contacts.email
// sets thread.company_id (→ the profile Inbox tab filters correctly).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders, json } from "../_shared/auth.ts";
import { getMailboxAccessToken } from "../_shared/mailbox_tokens.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BACKFILL_DAYS = 90;
const MAX_MESSAGES_PER_SYNC = 150; // cap per mailbox per run to respect rate limits

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── Auth: cron secret OR user JWT ───────────────────────────────────
  const cronSecret = Deno.env.get("LIT_CRON_SECRET") || "";
  const cronHeader = req.headers.get("X-Internal-Cron") || "";
  let userId: string | null = null;
  const isCron = Boolean(cronSecret) && cronHeader === cronSecret;

  if (!isCron) {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return json({ ok: false, error: "unauthorized" }, 401);
    userId = data.user.id;
  }

  // Optional: a single mailbox id can be passed to sync just one account
  // (per-account "Sync now" in Settings).
  const body = await req.json().catch(() => ({}));
  const onlyAccountId: string | null = body?.email_account_id ?? null;

  // ── Select mailboxes ────────────────────────────────────────────────
  let q = admin
    .from("lit_email_accounts")
    .select("id, user_id, org_id, provider, email, gmail_history_id, gmail_watch_expiration, graph_subscription_id, graph_subscription_expiration, metadata")
    .eq("status", "connected")
    .in("provider", ["gmail", "outlook"]);
  if (userId) q = q.eq("user_id", userId);
  if (onlyAccountId) q = q.eq("id", onlyAccountId);
  const { data: mailboxes, error: mbErr } = await q;
  if (mbErr) return json({ ok: false, error: "mailbox_query_failed", detail: mbErr.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const mb of (mailboxes || [])) {
    try {
      const r = mb.provider === "gmail"
        ? await syncGmailMailbox(admin, mb)
        : await syncOutlookMailbox(admin, mb);
      results.push({ email: mb.email, provider: mb.provider, ...r });
    } catch (err) {
      console.error(`[sync-inbox] mailbox ${mb.email} threw:`, err);
      results.push({ email: mb.email, provider: mb.provider, ok: false, error: String((err as Error)?.message ?? err) });
    }
  }

  return json({ ok: true, mailboxes: results.length, results });
});

// ── Gmail ──────────────────────────────────────────────────────────────

async function syncGmailMailbox(admin: any, mb: any): Promise<Record<string, unknown>> {
  const tokenRes = await getMailboxAccessToken(admin, mb.id, "gmail");
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error, needsReconnect: tokenRes.needsReconnect };
  const accessToken = tokenRes.accessToken;

  // Keep the Gmail users.watch push subscription alive. Gmail expires it
  // after 7d; re-register when it's null or within 24h. Reuses reply-receiver's
  // Pub/Sub topic (GMAIL_PUBSUB_TOPIC). Non-fatal on failure.
  await maybeRenewGmailWatch(admin, mb, accessToken);

  // Collect message ids to fetch.
  let messageIds: string[] = [];
  let newHistoryId: string | null = null;
  const prevHistoryId = mb.gmail_history_id;
  // When the stored historyId is too old (Gmail 404s), fall back to a
  // bounded backfill so we still recover instead of stalling forever.
  let needBackfill = !prevHistoryId;

  if (prevHistoryId) {
    // Incremental via history.
    let pageToken: string | undefined;
    let guard = 0;
    do {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
      url.searchParams.set("startHistoryId", String(prevHistoryId));
      url.searchParams.set("historyTypes", "messageAdded");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) {
        // 404 = historyId too old; fall back to a bounded list backfill.
        if (resp.status === 404) { messageIds = []; needBackfill = true; break; }
        return { ok: false, error: `history_fetch_${resp.status}` };
      }
      const h = await resp.json();
      if (h.historyId) newHistoryId = String(h.historyId);
      for (const rec of (h.history || [])) {
        for (const ma of (rec.messagesAdded || [])) {
          if (ma.message?.id) messageIds.push(ma.message.id);
        }
      }
      pageToken = h.nextPageToken;
    } while (pageToken && ++guard < 10 && messageIds.length < MAX_MESSAGES_PER_SYNC);
  }

  if (needBackfill) {
    // First run (or recovered from a stale historyId) — backfill BACKFILL_DAYS.
    const afterEpoch = Math.floor((Date.now() - BACKFILL_DAYS * 86400_000) / 1000);
    let pageToken: string | undefined;
    let guard = 0;
    do {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", `after:${afterEpoch}`);
      url.searchParams.set("maxResults", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) return { ok: false, error: `list_fetch_${resp.status}` };
      const list = await resp.json();
      for (const m of (list.messages || [])) messageIds.push(m.id);
      pageToken = list.nextPageToken;
    } while (pageToken && ++guard < 3 && messageIds.length < MAX_MESSAGES_PER_SYNC);

    // Get the current profile historyId as our new baseline.
    const profResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profResp.ok) {
      const prof = await profResp.json();
      if (prof.historyId) newHistoryId = String(prof.historyId);
    }
  }

  // Dedup ids and cap.
  messageIds = Array.from(new Set(messageIds)).slice(0, MAX_MESSAGES_PER_SYNC);

  let upserted = 0;
  const touchedThreadIds = new Set<string>();
  for (const msgId of messageIds) {
    const full = await fetchGmailMessage(accessToken, msgId);
    if (!full) continue;
    const parsed = parseGmailMessage(full, mb.email);
    if (!parsed) continue;
    const threadRowId = await upsertThreadAndMessage(admin, mb, parsed);
    if (threadRowId) { upserted++; touchedThreadIds.add(threadRowId); }
  }

  // Recompute rollups + conversation-type + company link for touched threads.
  for (const tid of touchedThreadIds) await finalizeThread(admin, tid);

  // Persist new baseline historyId + last_synced_at.
  const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (newHistoryId) patch.gmail_history_id = newHistoryId;
  await admin.from("lit_email_accounts").update(patch).eq("id", mb.id);

  return { ok: true, fetched: messageIds.length, upserted, threads: touchedThreadIds.size };
}

async function fetchGmailMessage(accessToken: string, msgId: string): Promise<any | null> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return null;
  return await resp.json();
}

interface ParsedMessage {
  providerThreadId: string;
  providerMessageId: string; // RFC5322 Message-ID (falls back to provider id)
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  messageDate: string;
  isUnread: boolean;
  direction: "inbound" | "outbound";
  inReplyTo: string | null;
  references: string[];
  headers: Record<string, string>;
}

function parseGmailMessage(msg: any, mailboxEmail: string): ParsedMessage | null {
  const payload = msg.payload;
  if (!payload) return null;
  const headers: Array<{ name: string; value: string }> = payload.headers || [];
  const hmap: Record<string, string> = {};
  for (const h of headers) hmap[h.name.toLowerCase()] = h.value;
  const get = (n: string) => hmap[n.toLowerCase()] || "";

  const from = parseAddress(get("from"));
  const toEmails = parseAddressList(get("to"));
  const ccEmails = parseAddressList(get("cc"));
  const labelIds: string[] = msg.labelIds || [];
  const direction: "inbound" | "outbound" =
    (from.email && from.email.toLowerCase() === mailboxEmail.toLowerCase()) || labelIds.includes("SENT")
      ? "outbound"
      : "inbound";

  const { text, html } = extractBody(payload);
  const internalMs = Number(msg.internalDate);

  const refsRaw = get("references");
  return {
    providerThreadId: msg.threadId,
    providerMessageId: get("message-id") || msg.id,
    fromEmail: from.email,
    fromName: from.name,
    toEmails,
    ccEmails,
    subject: get("subject"),
    bodyText: text,
    bodyHtml: html,
    snippet: msg.snippet || "",
    messageDate: Number.isFinite(internalMs)
      ? new Date(internalMs).toISOString()
      : new Date().toISOString(),
    isUnread: labelIds.includes("UNREAD"),
    direction,
    inReplyTo: get("in-reply-to") || null,
    references: refsRaw ? refsRaw.split(/\s+/).filter(Boolean) : [],
    headers: hmap,
  };
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";
  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType || "";
    if (mime === "text/plain" && part.body?.data && !text) {
      text = decodeB64Url(part.body.data);
    } else if (mime === "text/html" && part.body?.data && !html) {
      html = decodeB64Url(part.body.data);
    }
    for (const p of (part.parts || [])) walk(p);
  };
  walk(payload);
  if (!text && !html && payload.body?.data) text = decodeB64Url(payload.body.data);
  return { text, html };
}

function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

// ── Outlook / Microsoft Graph ────────────────────────────────────────────

async function syncOutlookMailbox(admin: any, mb: any): Promise<Record<string, unknown>> {
  const tokenRes = await getMailboxAccessToken(admin, mb.id, "outlook");
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error, needsReconnect: tokenRes.needsReconnect };
  const accessToken = tokenRes.accessToken;

  // Keep the Graph change-subscription alive (Graph caps message subs at
  // ~71h; re-arm when null or within 12h). Non-fatal on failure.
  await maybeRenewGraphSubscription(admin, mb, accessToken);

  const meta = mb.metadata || {};
  let deltaLink: string | null = meta.graph_delta_link || null;

  // Build the initial delta URL when we have no stored link (first run):
  // scoped to the Inbox folder, bounded by BACKFILL_DAYS.
  let url: string;
  if (deltaLink) {
    url = deltaLink;
  } else {
    const sinceIso = new Date(Date.now() - BACKFILL_DAYS * 86400_000).toISOString();
    url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$filter=receivedDateTime ge ${sinceIso}&$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,bodyPreview,body,internetMessageHeaders`;
  }

  let fetched = 0;
  let upserted = 0;
  let newDeltaLink: string | null = null;
  const touchedThreadIds = new Set<string>();
  let guard = 0;
  while (url && guard++ < 10 && fetched < MAX_MESSAGES_PER_SYNC) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="html"' },
    });
    if (!resp.ok) {
      if (resp.status === 410) { // delta token expired — reset
        await admin.from("lit_email_accounts")
          .update({ metadata: { ...meta, graph_delta_link: null } }).eq("id", mb.id);
        return { ok: false, error: "delta_expired_reset" };
      }
      return { ok: false, error: `graph_fetch_${resp.status}` };
    }
    const page = await resp.json();
    for (const m of (page.value || [])) {
      fetched++;
      const parsed = parseGraphMessage(m, mb.email);
      if (!parsed) continue;
      const threadRowId = await upsertThreadAndMessage(admin, mb, parsed);
      if (threadRowId) { upserted++; touchedThreadIds.add(threadRowId); }
    }
    if (page["@odata.nextLink"]) { url = page["@odata.nextLink"]; }
    else { newDeltaLink = page["@odata.deltaLink"] || null; url = ""; }
  }

  for (const tid of touchedThreadIds) await finalizeThread(admin, tid);

  const patch: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (newDeltaLink) patch.metadata = { ...meta, graph_delta_link: newDeltaLink };
  await admin.from("lit_email_accounts").update(patch).eq("id", mb.id);

  return { ok: true, fetched, upserted, threads: touchedThreadIds.size };
}

function parseGraphMessage(m: any, mailboxEmail: string): ParsedMessage | null {
  if (!m.conversationId || !m.id) return null;
  const fromEmail = m.from?.emailAddress?.address || "";
  const fromName = m.from?.emailAddress?.name || "";
  const toEmails = (m.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);
  const ccEmails = (m.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean);
  const direction: "inbound" | "outbound" =
    fromEmail && fromEmail.toLowerCase() === mailboxEmail.toLowerCase() ? "outbound" : "inbound";

  const ih: Array<{ name: string; value: string }> = m.internetMessageHeaders || [];
  const hmap: Record<string, string> = {};
  for (const h of ih) hmap[h.name.toLowerCase()] = h.value;
  const refsRaw = hmap["references"] || "";
  const bodyHtml = m.body?.contentType === "html" ? (m.body?.content || "") : "";
  const bodyText = m.body?.contentType === "text" ? (m.body?.content || "") : "";

  return {
    providerThreadId: m.conversationId,
    providerMessageId: m.internetMessageId || m.id,
    fromEmail,
    fromName,
    toEmails,
    ccEmails,
    subject: m.subject || "",
    bodyText,
    bodyHtml,
    snippet: m.bodyPreview || "",
    messageDate: m.receivedDateTime || new Date().toISOString(),
    isUnread: m.isRead === false,
    direction,
    inReplyTo: hmap["in-reply-to"] || null,
    references: refsRaw ? refsRaw.split(/\s+/).filter(Boolean) : [],
    headers: hmap,
  };
}

// ── Upsert + finalize ────────────────────────────────────────────────────

async function upsertThreadAndMessage(admin: any, mb: any, p: ParsedMessage): Promise<string | null> {
  // Upsert the thread shell first (get its id).
  const { data: thread, error: thErr } = await admin
    .from("lit_email_threads")
    .upsert(
      {
        org_id: mb.org_id,
        user_id: mb.user_id,
        email_account_id: mb.id,
        provider: mb.provider,
        provider_thread_id: p.providerThreadId,
        subject: p.subject || null,
      },
      { onConflict: "email_account_id,provider_thread_id" },
    )
    .select("id")
    .single();
  if (thErr || !thread?.id) {
    console.error("[sync-inbox] thread upsert failed:", thErr);
    return null;
  }

  const { error: msgErr } = await admin
    .from("lit_email_messages")
    .upsert(
      {
        thread_id: thread.id,
        org_id: mb.org_id,
        user_id: mb.user_id,
        email_account_id: mb.id,
        provider_message_id: p.providerMessageId,
        direction: p.direction,
        from_email: p.fromEmail || null,
        from_name: p.fromName || null,
        to_emails: p.toEmails,
        cc_emails: p.ccEmails,
        subject: p.subject || null,
        body_text: p.bodyText || null,
        body_html: p.bodyHtml || null,
        snippet: p.snippet || null,
        message_date: p.messageDate,
        is_unread: p.isUnread,
        raw_headers: {
          "message-id": p.headers["message-id"] || p.providerMessageId,
          "in-reply-to": p.inReplyTo,
          references: p.references,
        },
      },
      { onConflict: "email_account_id,provider_message_id", ignoreDuplicates: false },
    );
  if (msgErr) {
    console.error("[sync-inbox] message upsert failed:", msgErr);
  }
  return thread.id;
}

/**
 * Recompute a thread's rollups (message_count, unread_count, last_message_at,
 * participants), associate it to a company via contact email, and tag its
 * conversation_type by cross-referencing lit_outreach_history.
 */
async function finalizeThread(admin: any, threadId: string): Promise<void> {
  const { data: msgs } = await admin
    .from("lit_email_messages")
    .select("id, from_email, from_name, to_emails, cc_emails, direction, is_unread, message_date, provider_message_id, raw_headers")
    .eq("thread_id", threadId);
  if (!msgs?.length) return;

  const messageCount = msgs.length;
  const unreadCount = msgs.filter((m: any) => m.is_unread).length;
  const lastMessageAt = msgs
    .map((m: any) => m.message_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  // Participants: dedup all addresses seen, prefer a name when available.
  const partMap = new Map<string, { email: string; name: string | null }>();
  const addParticipant = (email: string | null, name: string | null) => {
    if (!email) return;
    const key = email.toLowerCase();
    if (!partMap.has(key)) partMap.set(key, { email, name: name || null });
    else if (name && !partMap.get(key)!.name) partMap.get(key)!.name = name;
  };
  for (const m of msgs) {
    addParticipant(m.from_email, m.from_name);
    for (const e of (m.to_emails || [])) addParticipant(e, null);
    for (const e of (m.cc_emails || [])) addParticipant(e, null);
  }
  const participants = Array.from(partMap.values());

  // Company association: match any participant email to lit_contacts.email.
  let companyId: string | null = null;
  let contactId: string | null = null;
  const emails = participants.map((p) => p.email.toLowerCase());
  if (emails.length) {
    const { data: contacts } = await admin
      .from("lit_contacts")
      .select("id, company_id, email")
      .in("email", emails)
      .not("company_id", "is", null)
      .limit(1);
    if (contacts?.length) {
      contactId = contacts[0].id;
      companyId = contacts[0].company_id;
    }
  }

  // Conversation-type tagging via lit_outreach_history.
  //   campaign — one of this thread's outbound message-ids matches a sent
  //              campaign row's provider_event_id.
  //   reply    — an inbound message replies (In-Reply-To/References) to a
  //              sent campaign message-id.
  const outboundIds = msgs
    .filter((m: any) => m.direction === "outbound")
    .map((m: any) => m.provider_message_id)
    .filter(Boolean);
  const replyTargetIds = Array.from(new Set(
    msgs.flatMap((m: any) => [
      m.raw_headers?.["in-reply-to"],
      ...(Array.isArray(m.raw_headers?.references) ? m.raw_headers.references : []),
    ]).filter(Boolean),
  ));

  let conversationType: "direct" | "campaign" | "reply" = "direct";
  let campaignId: string | null = null;

  // send-campaign-email stamps the injected RFC5322 Message-ID into BOTH
  // provider_event_id and message_id, but some legacy rows only have
  // message_id. Match either column so campaign tagging doesn't miss.
  const inList = (col: string, ids: string[]) =>
    `${col}.in.(${ids.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;

  if (outboundIds.length) {
    const { data: sent } = await admin
      .from("lit_outreach_history")
      .select("campaign_id, contact_id, company_id")
      .eq("event_type", "sent")
      .or(`${inList("provider_event_id", outboundIds)},${inList("message_id", outboundIds)}`)
      .limit(1);
    if (sent?.length) {
      conversationType = "campaign";
      campaignId = sent[0].campaign_id ?? null;
      contactId = contactId || sent[0].contact_id || null;
      companyId = companyId || sent[0].company_id || null;
    }
  }

  if (replyTargetIds.length) {
    const hasInbound = msgs.some((m: any) => m.direction === "inbound");
    const { data: repliedTo } = await admin
      .from("lit_outreach_history")
      .select("campaign_id, contact_id, company_id")
      .eq("event_type", "sent")
      .or(`${inList("provider_event_id", replyTargetIds)},${inList("message_id", replyTargetIds)}`)
      .limit(1);
    if (repliedTo?.length) {
      // A reply to a campaign send is the strongest signal.
      conversationType = hasInbound ? "reply" : "campaign";
      campaignId = campaignId || repliedTo[0].campaign_id || null;
      contactId = contactId || repliedTo[0].contact_id || null;
      companyId = companyId || repliedTo[0].company_id || null;
    }
  }

  await admin
    .from("lit_email_threads")
    .update({
      participants,
      message_count: messageCount,
      unread_count: unreadCount,
      last_message_at: lastMessageAt,
      company_id: companyId,
      contact_id: contactId,
      campaign_id: campaignId,
      conversation_type: conversationType,
    })
    .eq("id", threadId);

  // Stamp conversation_type onto each message too (cheap UI convenience).
  await admin
    .from("lit_email_messages")
    .update({ conversation_type: conversationType, campaign_id: campaignId, contact_id: contactId })
    .eq("thread_id", threadId);
}

// ── Push-subscription renewal ─────────────────────────────────────────────

async function maybeRenewGmailWatch(admin: any, mb: any, accessToken: string): Promise<void> {
  const topic = Deno.env.get("GMAIL_PUBSUB_TOPIC");
  if (!topic) return; // no topic configured — reply-receiver push not in use
  const exp = mb.gmail_watch_expiration ? new Date(mb.gmail_watch_expiration).getTime() : 0;
  if (exp - Date.now() > 24 * 3600_000) return; // still valid > 24h
  try {
    const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
    });
    if (!resp.ok) { console.error("[sync-inbox] gmail watch renew failed:", resp.status); return; }
    const w = await resp.json();
    // Gmail watch expiration is epoch ms as a string.
    const expirationMs = Number(w.expiration) || (Date.now() + 7 * 86400_000);
    const patch: Record<string, unknown> = { gmail_watch_expiration: new Date(expirationMs).toISOString() };
    // If we had no baseline historyId yet, seed it from the watch response.
    if (!mb.gmail_history_id && w.historyId) patch.gmail_history_id = String(w.historyId);
    await admin.from("lit_email_accounts").update(patch).eq("id", mb.id);
  } catch (e) {
    console.error("[sync-inbox] gmail watch renew threw:", e);
  }
}

async function maybeRenewGraphSubscription(admin: any, mb: any, accessToken: string): Promise<void> {
  const exp = mb.graph_subscription_expiration ? new Date(mb.graph_subscription_expiration).getTime() : 0;
  if (mb.graph_subscription_id && exp - Date.now() > 12 * 3600_000) return; // still valid > 12h
  const supabaseUrl = SUPABASE_URL;
  const newExpiry = new Date(Date.now() + 60 * 3600_000).toISOString(); // 60h (< Graph 71h cap)
  try {
    // PATCH extends an existing subscription; if it's gone (404) re-create it.
    if (mb.graph_subscription_id) {
      const patchResp = await fetch(
        `https://graph.microsoft.com/v1.0/subscriptions/${mb.graph_subscription_id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ expirationDateTime: newExpiry }),
        },
      );
      if (patchResp.ok) {
        const s = await patchResp.json();
        await admin.from("lit_email_accounts")
          .update({ graph_subscription_expiration: s.expirationDateTime || newExpiry })
          .eq("id", mb.id);
        return;
      }
      if (patchResp.status !== 404) { console.error("[sync-inbox] graph sub patch failed:", patchResp.status); return; }
    }
    // Create a fresh subscription.
    const createResp = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: `${supabaseUrl}/functions/v1/reply-receiver?source=outlook`,
        resource: "me/mailFolders('Inbox')/messages",
        expirationDateTime: newExpiry,
        clientState: mb.id,
      }),
    });
    if (!createResp.ok) { console.error("[sync-inbox] graph sub create failed:", createResp.status); return; }
    const s = await createResp.json();
    await admin.from("lit_email_accounts")
      .update({ graph_subscription_id: s.id, graph_subscription_expiration: s.expirationDateTime || newExpiry })
      .eq("id", mb.id);
  } catch (e) {
    console.error("[sync-inbox] graph sub renew threw:", e);
  }
}

// ── Address parsing ──────────────────────────────────────────────────────

function parseAddress(raw: string): { email: string; name: string } {
  if (!raw) return { email: "", name: "" };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || "").trim(), email: (m[2] || "").trim().toLowerCase() };
  return { email: raw.trim().toLowerCase(), name: "" };
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseAddress(s).email)
    .filter(Boolean);
}
