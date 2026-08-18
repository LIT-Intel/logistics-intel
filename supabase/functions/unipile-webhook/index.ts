import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { json } from "../_shared/auth.ts";
import { getUnipileConfig } from "../_shared/unipile.ts";

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stringAt(value: any, paths: string[]): string {
  for (const path of paths) {
    let current = value;
    for (const key of path.split(".")) current = current?.[key];
    if (typeof current === "string" && current) return current;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  let cfg;
  try { cfg = getUnipileConfig(); } catch { return json({ ok: false }, 503); }
  if (!cfg.webhookSecret || req.headers.get("Unipile-Auth") !== cfg.webhookSecret) return json({ ok: false }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !service) return json({ ok: false }, 503);
  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false }, 400); }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const serialized = JSON.stringify(payload);
  const eventType = stringAt(payload, ["event", "type", "source", "object", "AccountStatus.message"]) || "unknown";
  const accountId = stringAt(payload, ["account_id", "accountId", "AccountStatus.account_id", "message.account_id", "data.account_id"]);
  const eventId = stringAt(payload, ["id", "event_id", "message.id", "data.id"]) || await hash(serialized);
  const eventKey = `${eventType}:${accountId}:${eventId}`;
  const { data: inserted, error: insertError } = await admin.from("lit_unipile_webhook_events")
    .insert({ event_key: eventKey, event_type: eventType, account_id: accountId || null, payload })
    .select("id").maybeSingle();
  if (insertError?.code === "23505") return json({ ok: true, duplicate: true });
  if (insertError || !inserted) return json({ ok: false }, 500);

  try {
    const { data: account } = await admin.from("lit_unipile_accounts").select("*")
      .eq("unipile_account_id", accountId).maybeSingle();
    if (!account) {
      await admin.from("lit_unipile_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: "unknown_account" }).eq("id", inserted.id);
      return json({ ok: true });
    }

    if (payload.AccountStatus) {
      const rawStatus = String(payload.AccountStatus.message || "ERROR").toUpperCase();
      const status = ["OK","CONNECTING","CREDENTIALS","ERROR","STOPPED","DELETED"].includes(rawStatus) ? rawStatus : "ERROR";
      await admin.from("lit_unipile_accounts").update({ status, updated_at: new Date().toISOString(), metadata: { ...(account.metadata || {}), last_status_event: payload.AccountStatus } }).eq("id", account.id);
    }

    const message = String(eventType).toLowerCase().includes("message")
      ? payload
      : (payload.data?.message && typeof payload.data.message === "object" ? payload.data.message : null);
    if (message) {
      const providerMessageId = stringAt(message, ["id", "message_id", "provider_message_id"]);
      const providerChatId = stringAt(message, ["chat_id", "chat.id", "thread_id"]);
      const senderId = stringAt(message, ["sender_id", "sender.attendee_provider_id", "sender.provider_id", "from.provider_id", "attendee_id"]);
      const bodyText = stringAt(message, ["text", "body", "content", "message"]);
      const directionRaw = stringAt(message, ["direction", "is_sender"]);
      const accountOwnerProviderId = stringAt(message, ["account_info.user_id"]);
      const inbound = directionRaw === "inbound" || directionRaw === "false" || message.is_sender === false ||
        message.is_outgoing === false || Boolean(senderId && accountOwnerProviderId && senderId !== accountOwnerProviderId);
      if (providerMessageId && providerChatId) {
        let matchedAction: any = null;
        const { data: byChat } = await admin.from("lit_linkedin_outreach_actions").select("*")
          .eq("unipile_account_id", account.id).eq("provider_chat_id", providerChatId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        matchedAction = byChat;
        if (!matchedAction && senderId) {
          const { data: bySender } = await admin.from("lit_linkedin_outreach_actions").select("*")
            .eq("unipile_account_id", account.id).eq("recipient_provider_id", senderId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          matchedAction = bySender;
        }
        const { data: thread } = await admin.from("lit_linkedin_threads").upsert({
          org_id: account.org_id, account_id: account.id, provider_chat_id: providerChatId,
          lead_id: matchedAction?.lead_id || null, campaign_id: matchedAction?.campaign_id || null,
          contact_id: matchedAction?.contact_id || null,
          participants: message.attendees || message.participants || [],
          last_message_at: message.timestamp || message.date || new Date().toISOString(),
          unread_count: inbound ? 1 : 0, metadata: { provider: "unipile" }, updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,provider_chat_id" }).select("id").single();
        if (thread) {
          await admin.from("lit_linkedin_messages").upsert({
            thread_id: thread.id, org_id: account.org_id, account_id: account.id,
            provider_message_id: providerMessageId, direction: inbound ? "inbound" : "outbound",
            sender_provider_id: senderId || null, body_text: bodyText || null,
            message_date: message.timestamp || message.date || new Date().toISOString(),
            action_id: matchedAction?.id || null, raw_json: message,
          }, { onConflict: "account_id,provider_message_id" });
        }
        if (inbound && matchedAction) {
          await admin.from("lit_linkedin_outreach_actions").update({ status: "replied", provider_chat_id: providerChatId, updated_at: new Date().toISOString() }).eq("id", matchedAction.id);
          await admin.from("lit_outreach_history").insert({
            campaign_id: matchedAction.campaign_id, campaign_step_id: matchedAction.campaign_step_id,
            contact_id: matchedAction.contact_id, user_id: matchedAction.created_by,
            channel: "linkedin", event_type: "replied", status: "received", provider: "unipile",
            provider_event_id: providerMessageId, occurred_at: message.timestamp || new Date().toISOString(),
            metadata: { action_id: matchedAction.id, provider_thread_id: providerChatId, snippet: bodyText.slice(0, 240) },
          });
          if (matchedAction.campaign_contact_id) {
            await admin.from("lit_campaign_contacts").update({ status: "replied", next_send_at: null, updated_at: new Date().toISOString() }).eq("id", matchedAction.campaign_contact_id);
          }
          if (matchedAction.lead_id) {
            await admin.from("lit_lead_activity").insert({ lead_id: matchedAction.lead_id, kind: "linkedin_reply_received", body: { action_id: matchedAction.id, snippet: bodyText.slice(0, 240) }, source: "linkedin" });
          }
        }
      }
    }

    const relation = payload.new_relation || payload.relation || (String(eventType).toLowerCase().includes("relation") ? payload : null);
    if (relation) {
      const providerId = stringAt(relation, ["user_provider_id", "provider_id", "user.provider_id", "attendee.provider_id"]);
      if (providerId) {
        const { data: invite } = await admin.from("lit_linkedin_outreach_actions").select("*")
          .eq("unipile_account_id", account.id).eq("recipient_provider_id", providerId).eq("action_type", "invite")
          .order("sent_at", { ascending: false }).limit(1).maybeSingle();
        if (invite) {
          await admin.from("lit_linkedin_outreach_actions").update({
            metadata: { ...(invite.metadata || {}), relationship_status: "connected", connected_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq("id", invite.id);
          await admin.from("lit_outreach_history").insert({
            campaign_id: invite.campaign_id, campaign_step_id: invite.campaign_step_id,
            contact_id: invite.contact_id, user_id: invite.created_by, channel: "linkedin",
            event_type: "connection_accepted", status: "accepted", provider: "unipile",
            occurred_at: new Date().toISOString(), metadata: { action_id: invite.id, recipient_provider_id: providerId },
          });
        }
      }
    }

    await admin.from("lit_unipile_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", inserted.id);
    return json({ ok: true });
  } catch (error) {
    await admin.from("lit_unipile_webhook_events").update({ processing_error: error instanceof Error ? error.message : "processing_failed" }).eq("id", inserted.id);
    console.error("unipile webhook processing failed", error instanceof Error ? error.message : "unknown");
    // Return 200 so Unipile does not retry a permanently malformed event; the
    // durable inbox retains it for operator replay.
    return json({ ok: true, accepted: true });
  }
});
