// Reverse-engineered from deployed v16 of resend-inbound-webhook on
// 2026-06-09 (drift audit found this function deployed in production
// with no git source — it receives Resend inbound `email.received`
// webhooks, matches replies to campaign contacts via 3-tier fallback
// match logic, marks outreach_history as replied, and forwards the
// reply to INBOUND_FORWARD_TO_EMAIL). Verified deployed EZBR sha256
// against this output; no behavior changes. The CI gate in
// .github/workflows/edge-fn-drift-check.yml will prevent recurrence
// once the operator wires SUPABASE_ACCESS_TOKEN as a repo secret.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

type ResendReceivedEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    message_id?: string;
    subject?: string;
    attachments?: unknown[];
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function parseEmailAddress(value?: string | null) {
  if (!value) return { name: null, email: null };

  const match = value.match(/^(.*?)<([^>]+)>$/);

  if (match) {
    return {
      name: match[1]?.trim().replace(/^"|"$/g, "") || null,
      email: match[2]?.trim().toLowerCase() || null,
    };
  }

  return {
    name: null,
    email: value.trim().toLowerCase(),
  };
}

function stripHtml(html?: string | null) {
  if (!html) return null;

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSubject(subject?: string | null) {
  return subject?.trim() || "(no subject)";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getReceivedEmailContent(emailId: string, resendApiKey: string) {
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "Failed to fetch received email content",
      response.status,
      errorText,
    );
    return null;
  }

  return await response.json();
}

async function matchInboundReply(params: {
  supabase: SupabaseClient;
  fromEmail: string | null;
}) {
  const { supabase, fromEmail } = params;

  if (!fromEmail) {
    return {
      matchedStatus: "unmatched",
      campaignId: null,
      contactId: null,
      companyId: null,
      campaignContactId: null,
      outreachHistoryId: null,
      matchMethod: "missing_from_email",
    };
  }

  const normalizedFrom = fromEmail.trim().toLowerCase();

  const { data: campaignContact, error: campaignContactError } = await supabase
    .from("lit_campaign_contacts")
    .select("id,campaign_id,contact_id,company_id,email")
    .ilike("email", normalizedFrom)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (campaignContactError) {
    console.error("Campaign contact match failed", campaignContactError);
  }

  if (!campaignContact) {
    return {
      matchedStatus: "unmatched",
      campaignId: null,
      contactId: null,
      companyId: null,
      campaignContactId: null,
      outreachHistoryId: null,
      matchMethod: "no_campaign_contact_email_match",
    };
  }

  let outreachHistory: { id: string; metadata?: Record<string, unknown> | null } | null =
    null;

  /*
    Primary match method:
    Campaign sends/open tracking currently stores the campaign recipient row id
    inside lit_outreach_history.metadata.recipient_id.
  */
  const { data: historyByRecipient, error: recipientHistoryError } = await supabase
    .from("lit_outreach_history")
    .select("id,metadata")
    .eq("campaign_id", campaignContact.campaign_id)
    .eq("event_type", "sent")
    .eq("metadata->>recipient_id", campaignContact.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recipientHistoryError) {
    console.error("Outreach history recipient_id match failed", recipientHistoryError);
  }

  outreachHistory = historyByRecipient || null;

  /*
    Fallback match method:
    If future sends populate contact_id, match campaign + contact_id.
  */
  if (!outreachHistory && campaignContact.contact_id) {
    const { data: historyByContact, error: contactHistoryError } = await supabase
      .from("lit_outreach_history")
      .select("id,metadata")
      .eq("campaign_id", campaignContact.campaign_id)
      .eq("contact_id", campaignContact.contact_id)
      .eq("event_type", "sent")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contactHistoryError) {
      console.error("Outreach history contact_id match failed", contactHistoryError);
    }

    outreachHistory = historyByContact || null;
  }

  /*
    Fallback match method:
    If metadata has recipient_email, match that too.
  */
  if (!outreachHistory) {
    const { data: historyByRecipientEmail, error: recipientEmailError } = await supabase
      .from("lit_outreach_history")
      .select("id,metadata")
      .eq("campaign_id", campaignContact.campaign_id)
      .eq("event_type", "sent")
      .eq("metadata->>recipient_email", normalizedFrom)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recipientEmailError) {
      console.error("Outreach history recipient_email match failed", recipientEmailError);
    }

    outreachHistory = historyByRecipientEmail || null;
  }

  let matchMethod = "campaign_contact_email_only";

  if (outreachHistory?.id) {
    const existingMetadata =
      outreachHistory.metadata &&
      typeof outreachHistory.metadata === "object" &&
      !Array.isArray(outreachHistory.metadata)
        ? outreachHistory.metadata
        : {};

    matchMethod =
      (existingMetadata as Record<string, unknown>).recipient_id === campaignContact.id
        ? "campaign_recipient_id"
        : (existingMetadata as Record<string, unknown>).recipient_email === normalizedFrom
          ? "campaign_recipient_email"
          : campaignContact.contact_id
            ? "campaign_contact_id"
            : "campaign_contact_email_only";

    const { error: updateHistoryError } = await supabase
      .from("lit_outreach_history")
      .update({
        status: "replied",
        replied_at: new Date().toISOString(),
        metadata: {
          ...existingMetadata,
          inbound_reply_matched_at: new Date().toISOString(),
          inbound_reply_from: normalizedFrom,
          match_method: matchMethod,
        },
      })
      .eq("id", outreachHistory.id);

    if (updateHistoryError) {
      console.error(
        "Failed to update outreach history replied status",
        updateHistoryError,
      );
    }
  }

  const { error: campaignContactUpdateError } = await supabase
    .from("lit_campaign_contacts")
    .update({
      status: "replied",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignContact.id);

  if (campaignContactUpdateError) {
    console.error(
      "Failed to update campaign contact replied status",
      campaignContactUpdateError,
    );
  }

  return {
    matchedStatus: outreachHistory?.id ? "matched_outreach" : "matched_contact",
    campaignId: campaignContact.campaign_id,
    contactId: campaignContact.contact_id,
    companyId: campaignContact.company_id,
    campaignContactId: campaignContact.id,
    outreachHistoryId: outreachHistory?.id || null,
    matchMethod,
  };
}

async function forwardEmail(params: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  originalFrom: string | null;
  originalTo: string | null;
  originalSubject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  matchedStatus: string;
  campaignId: string | null;
  contactId: string | null;
  companyId: string | null;
  matchMethod: string | null;
}) {
  const {
    resendApiKey,
    fromEmail,
    toEmail,
    originalFrom,
    originalTo,
    originalSubject,
    textBody,
    htmlBody,
    matchedStatus,
    campaignId,
    contactId,
    companyId,
    matchMethod,
  } = params;

  const cleanText =
    textBody ||
    stripHtml(htmlBody) ||
    "No readable message body was returned by Resend.";

  const subject = `New LIT reply: ${safeSubject(originalSubject)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.55;">
      <h2 style="margin:0 0 16px 0;">New LIT inbound reply</h2>

      <p><strong>From:</strong> ${escapeHtml(originalFrom || "Unknown")}</p>
      <p><strong>To:</strong> ${escapeHtml(originalTo || "Unknown")}</p>
      <p><strong>Subject:</strong> ${escapeHtml(safeSubject(originalSubject))}</p>
      <p><strong>Match status:</strong> ${escapeHtml(matchedStatus)}</p>
      ${matchMethod ? `<p><strong>Match method:</strong> ${escapeHtml(matchMethod)}</p>` : ""}
      ${campaignId ? `<p><strong>Campaign ID:</strong> ${escapeHtml(campaignId)}</p>` : ""}
      ${contactId ? `<p><strong>Contact ID:</strong> ${escapeHtml(contactId)}</p>` : ""}
      ${companyId ? `<p><strong>Company ID:</strong> ${escapeHtml(companyId)}</p>` : ""}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />

      <div style="white-space:pre-wrap;font-size:15px;">${escapeHtml(cleanText)}</div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `LIT Replies <${fromEmail}>`,
      to: [toEmail],
      subject,
      html,
      text: [
        "New LIT inbound reply",
        "",
        `From: ${originalFrom || "Unknown"}`,
        `To: ${originalTo || "Unknown"}`,
        `Subject: ${safeSubject(originalSubject)}`,
        `Match status: ${matchedStatus}`,
        matchMethod ? `Match method: ${matchMethod}` : "",
        campaignId ? `Campaign ID: ${campaignId}` : "",
        contactId ? `Contact ID: ${contactId}` : "",
        companyId ? `Company ID: ${companyId}` : "",
        "",
        cleanText,
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Forward failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const forwardToEmail = Deno.env.get("INBOUND_FORWARD_TO_EMAIL");
  const forwardFromEmail =
    Deno.env.get("INBOUND_FORWARD_FROM_EMAIL") ||
    "hello@updates.logisticintel.com";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      500,
    );
  }

  if (!resendApiKey) {
    return jsonResponse({ ok: false, error: "Missing RESEND_API_KEY" }, 500);
  }

  if (!forwardToEmail) {
    return jsonResponse(
      { ok: false, error: "Missing INBOUND_FORWARD_TO_EMAIL" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let event: ResendReceivedEvent;

  try {
    event = await req.json();
  } catch (error) {
    console.error("Invalid JSON", error);
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (event.type !== "email.received") {
    return jsonResponse({ ok: true, ignored: true, type: event.type || null });
  }

  const emailId = event.data?.email_id;

  if (!emailId) {
    return jsonResponse({ ok: false, error: "Missing event.data.email_id" }, 400);
  }

  const fromParsed = parseEmailAddress(event.data?.from || null);
  const toEmail = event.data?.to?.[0]?.toLowerCase() || null;

  const fullEmail = await getReceivedEmailContent(emailId, resendApiKey);

  const textBody =
    fullEmail?.text ||
    fullEmail?.data?.text ||
    fullEmail?.text_body ||
    fullEmail?.data?.text_body ||
    null;

  const htmlBody =
    fullEmail?.html ||
    fullEmail?.data?.html ||
    fullEmail?.html_body ||
    fullEmail?.data?.html_body ||
    null;

  const headersJson = fullEmail?.headers || fullEmail?.data?.headers || {};

  const match = await matchInboundReply({
    supabase,
    fromEmail: fromParsed.email,
  });

  const insertPayload = {
    provider: "resend",
    provider_email_id: emailId,
    event_type: event.type,
    from_email: fromParsed.email,
    from_name: fromParsed.name,
    to_email: toEmail,
    subject: event.data?.subject || null,
    text_body: textBody,
    html_body: htmlBody,
    headers_json: headersJson,
    raw_json: {
      webhook_event: event,
      received_email: fullEmail,
      match,
    },
    campaign_id: match.campaignId,
    contact_id: match.contactId,
    company_id: match.companyId,
    matched_status: match.matchedStatus,
  };

  const { data: inboundRow, error: insertError } = await supabase
    .from("lit_inbound_emails")
    .upsert(insertPayload, {
      onConflict: "provider,provider_email_id",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Inbound insert failed", insertError);
    return jsonResponse(
      {
        ok: false,
        error: "Failed to store inbound email",
        details: insertError.message,
      },
      500,
    );
  }

  let forwardResult: unknown = null;
  let forwardError: string | null = null;

  try {
    forwardResult = await forwardEmail({
      resendApiKey,
      fromEmail: forwardFromEmail,
      toEmail: forwardToEmail,
      originalFrom: event.data?.from || fromParsed.email,
      originalTo: toEmail,
      originalSubject: event.data?.subject || null,
      textBody,
      htmlBody,
      matchedStatus: match.matchedStatus,
      campaignId: match.campaignId,
      contactId: match.contactId,
      companyId: match.companyId,
      matchMethod: match.matchMethod,
    });

    await supabase
      .from("lit_inbound_emails")
      .update({
        forwarded_to: forwardToEmail,
        forwarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inboundRow.id);
  } catch (error) {
    forwardError = error instanceof Error ? error.message : String(error);
    console.error("Forwarding failed", forwardError);
  }

  return jsonResponse({
    ok: true,
    stored: true,
    inbound_email_id: inboundRow.id,
    matched_status: match.matchedStatus,
    match_method: match.matchMethod,
    campaign_id: match.campaignId,
    contact_id: match.contactId,
    company_id: match.companyId,
    campaign_contact_id: match.campaignContactId,
    outreach_history_id: match.outreachHistoryId,
    forwarded: !forwardError,
    forward_error: forwardError,
    forward_result: forwardResult,
  });
});
