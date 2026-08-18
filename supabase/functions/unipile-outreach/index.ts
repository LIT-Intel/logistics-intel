import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Agent, run, setDefaultOpenAIKey, withTrace } from "npm:@openai/agents@0.16.1";
import { z } from "npm:zod@4.2.0";
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { linkedinPublicIdentifier, unipileErrorCode, unipileRequest } from "../_shared/unipile.ts";

const DraftOption = z.object({
  tone: z.enum(["simple", "warm", "peer", "curious", "direct"]),
  message: z.string().min(1).max(1000),
  rationale: z.string().max(240),
});
const DraftOutput = z.object({ options: z.array(DraftOption).length(5) });

const AGENT_INSTRUCTIONS = `You write LinkedIn notes that sound like a real person starting a conversation, never like an AI, SDR sequence, or mass-mail bot.

Rules:
- Use only supplied facts. Never invent familiarity, shipment facts, pain points, licenses, customers, or mutual connections.
- Return exactly five meaningfully different options: simple, warm, peer, curious, and direct.
- Every option must be light, natural, and only 2-3 short sentences. Use contractions where natural.
- No hype, fake compliments, generic "I hope this finds you well", "unlock", "revolutionize", "game-changing", "synergy", emojis, or exclamation-heavy copy.
- Never stack company facts, service categories, acronyms, or freight keywords to prove personalization.
- Do not mention AI, enrichment, scraping, Apollo, Unipile, tracking, providers, scoring, or internal research.
- Connection invitation: 12-35 words, maximum 200 characters, no product pitch, no meeting request, no "learn how you're approaching" discovery question. Its only job is to make connecting feel normal.
- Post-acceptance message: 20-55 words, one easy question at most, no calendar ask in the first message.
- Prefer genuine relevance over manufactured personalization. If context is thin, be honest and simple.
- Do not say "I'd be interested", "I'd love to learn", "pick your brain", "connect and explore synergies", or "would you be open to connecting?"
- The five options must vary in framing, not merely swap adjectives. A human selects and may edit one before sending.`;

type Target = {
  orgId: string;
  leadId: string | null;
  campaignId: string | null;
  campaignStepId: string | null;
  campaignContactId: string | null;
  contactId: string | null;
  name: string;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  linkedinUrl: string;
  qualification: Record<string, unknown> | null;
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isOrgMember(admin: any, userId: string, orgId: string): Promise<boolean> {
  const { data } = await admin.from("org_members").select("id").eq("user_id", userId)
    .eq("org_id", orgId).eq("status", "active").maybeSingle();
  if (data) return true;
  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(pa);
}

async function resolveTarget(auth: any, body: Record<string, unknown>): Promise<Target | Response> {
  if (body.lead_id) {
    const { data: access } = await auth.userClient.rpc("lit_my_lead_crm_access");
    const gate = Array.isArray(access) ? access[0] : access;
    if (!gate?.is_member) return json({ ok: false, code: "LEAD_CRM_REQUIRED", error: "Lead CRM membership required" }, 403);
    const { data: lead } = await auth.admin.from("lit_admin_leads")
      .select("id,full_name,title,company_name,company_domain,website,apollo_organization_id,primary_source")
      .eq("id", String(body.lead_id)).maybeSingle();
    if (!lead) return json({ ok: false, code: "LEAD_NOT_FOUND", error: "Lead not found" }, 404);
    const linkedinUrl = String(body.linkedin_url || "").trim();
    if (!linkedinUrl) return json({ ok: false, code: "LINKEDIN_REQUIRED", error: "A LinkedIn profile URL is required" }, 400);
    let qualification: Record<string, unknown> | null = null;
    if (lead.apollo_organization_id) {
      const { data } = await auth.admin.from("lit_lead_company_qualifications")
        .select("status,confidence,company_type,reason,evidence,expires_at")
        .eq("provider", "apollo").eq("provider_company_id", lead.apollo_organization_id)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      qualification = data;
      if (!data || data.status !== "qualified" || Number(data.confidence) < 0.75) {
        return json({ ok: false, code: "QUALIFICATION_REQUIRED", error: "This company must pass the lead qualification gate before outreach" }, 409);
      }
    } else if (String(lead.primary_source || "").toLowerCase().includes("apollo")) {
      return json({ ok: false, code: "QUALIFICATION_REQUIRED", error: "Apollo leads must be matched to a qualified company before outreach" }, 409);
    }
    const { data: internalOrg } = await auth.admin.from("organizations").select("id").eq("is_internal", true).limit(1).maybeSingle();
    if (!internalOrg) return json({ ok: false, code: "INTERNAL_ORG_REQUIRED", error: "Internal LIT workspace is not configured" }, 503);
    return {
      orgId: internalOrg.id, leadId: lead.id, campaignId: null, campaignStepId: null,
      campaignContactId: null, contactId: null, name: lead.full_name || "there", title: lead.title,
      company: lead.company_name, companyDomain: lead.company_domain || lead.website,
      linkedinUrl, qualification,
    };
  }

  if (body.campaign_contact_id) {
    const { data: row } = await auth.admin.from("lit_campaign_contacts")
      .select("id,org_id,campaign_id,contact_id,display_name,first_name,last_name,title,linkedin_url,merge_vars,linkedin_provider_id")
      .eq("id", String(body.campaign_contact_id)).maybeSingle();
    if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) {
      return json({ ok: false, code: "CONTACT_NOT_FOUND", error: "Campaign recipient not found" }, 404);
    }
    const { data: campaign } = await auth.admin.from("lit_campaigns").select("name").eq("id", row.campaign_id).maybeSingle();
    const linkedinUrl = String(body.linkedin_url || row.linkedin_url || "").trim();
    if (!linkedinUrl) return json({ ok: false, code: "LINKEDIN_REQUIRED", error: "Recipient has no LinkedIn profile URL" }, 400);
    const merge = (row.merge_vars || {}) as Record<string, unknown>;
    return {
      orgId: row.org_id, leadId: null, campaignId: row.campaign_id,
      campaignStepId: body.campaign_step_id ? String(body.campaign_step_id) : null,
      campaignContactId: row.id, contactId: row.contact_id,
      name: row.display_name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "there",
      title: row.title, company: String(merge.company_name || merge.company || campaign?.name || "") || null,
      companyDomain: String(merge.company_domain || merge.website || "") || null,
      linkedinUrl, qualification: null,
    };
  }
  return json({ ok: false, code: "TARGET_REQUIRED", error: "lead_id or campaign_contact_id is required" }, 400);
}

async function chooseAccount(admin: any, target: Target, requestedId: unknown) {
  let query = admin.from("lit_unipile_accounts").select("*").eq("org_id", target.orgId).eq("status", "OK");
  if (requestedId) query = query.eq("id", String(requestedId));
  else query = query.eq(target.leadId ? "use_for_lead_crm" : "use_for_campaigns", true);
  const { data } = await query.order("connected_at", { ascending: true }).limit(1).maybeSingle();
  return data;
}

async function dispatch(auth: any, actionId: string) {
  const { data: action } = await auth.admin.from("lit_linkedin_outreach_actions")
    .select("*,account:lit_unipile_accounts(*)").eq("id", actionId).maybeSingle();
  if (!action || !(await isOrgMember(auth.admin, auth.user.id, action.org_id))) {
    return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
  }
  if (action.status === "sent") return json({ ok: true, action, already_sent: true });
  if (action.status !== "approved") return json({ ok: false, code: "APPROVAL_REQUIRED", error: "A human must approve this draft before it can be sent" }, 409);
  if (!action.account || action.account.status !== "OK") return json({ ok: false, code: "ACCOUNT_NOT_READY", error: "LinkedIn account needs reconnection" }, 409);

  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { count } = await auth.admin.from("lit_linkedin_outreach_actions").select("id", { count: "exact", head: true })
    .eq("unipile_account_id", action.unipile_account_id).eq("action_type", action.action_type)
    .eq("status", "sent").gte("sent_at", start.toISOString());
  const cap = action.action_type === "invite" ? action.account.daily_invite_cap : action.account.daily_message_cap;
  if ((count || 0) >= cap) return json({ ok: false, code: "DAILY_CAP_REACHED", error: "LinkedIn daily safety cap reached" }, 429);

  const publicId = linkedinPublicIdentifier(action.recipient_linkedin_url);
  if (!publicId) return json({ ok: false, code: "INVALID_LINKEDIN_URL", error: "LinkedIn profile URL is invalid" }, 400);
  await auth.admin.from("lit_linkedin_outreach_actions").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", action.id).eq("status", "approved");

  try {
    let providerId = action.recipient_provider_id;
    let profile: Record<string, unknown> | null = null;
    if (!providerId) {
      profile = await unipileRequest<Record<string, unknown>>(`/users/${encodeURIComponent(publicId)}?account_id=${encodeURIComponent(action.account.unipile_account_id)}`);
      providerId = String(profile.provider_id || "");
      if (!providerId) throw new Error("Could not resolve the LinkedIn recipient");
    }

    let response: Record<string, unknown>;
    if (action.action_type === "invite") {
      response = await unipileRequest<Record<string, unknown>>("/users/invite", {
        method: "POST",
        body: JSON.stringify({ provider_id: providerId, account_id: action.account.unipile_account_id, message: action.message }),
      });
    } else if (action.provider_chat_id) {
      const form = new FormData(); form.set("text", action.message);
      response = await unipileRequest<Record<string, unknown>>(`/chats/${encodeURIComponent(action.provider_chat_id)}/messages`, { method: "POST", body: form });
    } else {
      if (profile && profile.is_relationship === false && action.action_type !== "reply") {
        throw Object.assign(new Error("Connect with this person before sending a LinkedIn message"), { status: 422 });
      }
      const form = new FormData();
      form.set("account_id", action.account.unipile_account_id);
      form.set("text", action.message);
      form.append("attendees_ids", providerId);
      response = await unipileRequest<Record<string, unknown>>("/chats", { method: "POST", body: form });
    }

    const sentAt = new Date().toISOString();
    const providerEventId = String(response.invitation_id || response.id || response.message_id || response.chat_id || "") || null;
    const { data: sent } = await auth.admin.from("lit_linkedin_outreach_actions").update({
      status: "sent", sent_at: sentAt, recipient_provider_id: providerId,
      provider_chat_id: response.chat_id || response.id || action.provider_chat_id,
      provider_event_id: providerEventId, last_error: null, metadata: { ...(action.metadata || {}), provider_response: response },
      updated_at: sentAt,
    }).eq("id", action.id).select().single();

    await auth.admin.from("lit_outreach_history").insert({
      campaign_id: action.campaign_id, campaign_step_id: action.campaign_step_id,
      company_id: null, contact_id: action.contact_id, user_id: action.created_by,
      channel: "linkedin", event_type: action.action_type === "invite" ? "invitation_sent" : "sent",
      status: "sent", provider: "unipile", provider_event_id: providerEventId,
      occurred_at: sentAt,
      metadata: { action_id: action.id, campaign_contact_id: action.campaign_contact_id, recipient_provider_id: providerId },
    });
    if (action.lead_id) {
      await auth.admin.from("lit_lead_activity").insert({
        lead_id: action.lead_id, kind: action.action_type === "invite" ? "linkedin_invite_sent" : "linkedin_message_sent",
        body: { action_id: action.id, message: action.message }, actor_user_id: auth.user.id, source: "linkedin",
      });
    }
    if (action.campaign_contact_id && action.campaign_step_id) {
      const { data: currentStep } = await auth.admin.from("lit_campaign_steps")
        .select("step_order").eq("id", action.campaign_step_id).maybeSingle();
      let nextStep: any = null;
      if (currentStep) {
        const { data } = await auth.admin.from("lit_campaign_steps")
          .select("id,channel,step_type,delay_days,delay_hours,delay_minutes")
          .eq("campaign_id", action.campaign_id).gt("step_order", currentStep.step_order)
          .order("step_order", { ascending: true }).limit(1).maybeSingle();
        nextStep = data;
      }
      const nextIsWait = nextStep && (nextStep.channel === "wait" || nextStep.step_type === "wait");
      const delayMs = nextStep && !nextIsWait
        ? ((Number(nextStep.delay_days) || 0) * 86_400_000 + (Number(nextStep.delay_hours) || 0) * 3_600_000 + (Number(nextStep.delay_minutes) || 0) * 60_000)
        : 0;
      await auth.admin.from("lit_campaign_contacts").update({
        current_step_id: action.campaign_step_id,
        next_send_at: nextStep ? new Date(Date.now() + delayMs).toISOString() : null,
        status: nextStep ? "active" : "completed",
        last_error: null,
        updated_at: sentAt,
      }).eq("id", action.campaign_contact_id);
    }
    return json({ ok: true, action: sent });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const rawError = error instanceof Error ? error.message : "Unipile send failed";
    const displayError = /delay new invitation/i.test(rawError)
      ? "LinkedIn blocked this duplicate request because an invitation is already pending for this recipient."
      : rawError;
    await auth.admin.from("lit_linkedin_outreach_actions").update({
      status: "failed", failed_at: failedAt, last_error: displayError, updated_at: failedAt,
    }).eq("id", action.id);
    return json({ ok: false, code: /delay new invitation/i.test(rawError) ? "INVITATION_ALREADY_PENDING" : unipileErrorCode(error), error: displayError }, Number((error as any)?.status) || 502);
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req); if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" }, 405);
  const auth = await requireUser(req); if (auth instanceof Response) return auth;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, code: "BAD_JSON", error: "Invalid JSON" }, 400); }
  const operation = String(body.action || "list");

  try {
    if (operation === "list") {
      const target = await resolveTarget(auth, body); if (target instanceof Response) return target;
      let query = auth.admin.from("lit_linkedin_outreach_actions").select("*").eq("org_id", target.orgId);
      query = target.leadId ? query.eq("lead_id", target.leadId) : query.eq("campaign_contact_id", target.campaignContactId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ ok: true, actions: data || [] });
    }

    if (operation === "draft") {
      const target = await resolveTarget(auth, body); if (target instanceof Response) return target;
      const account = await chooseAccount(auth.admin, target, body.account_id);
      if (!account) return json({ ok: false, code: "LINKEDIN_ACCOUNT_REQUIRED", error: "Connect a LinkedIn account in Settings first" }, 409);
      const actionType = body.action_type === "message" ? "message" : "invite";
      const baseKey = await sha256([target.leadId || target.campaignContactId, target.campaignStepId || "manual", actionType].join(":"));
      const { data: existing } = await auth.admin.from("lit_linkedin_outreach_actions").select("*")
        .eq("idempotency_key", baseKey).maybeSingle();
      const hasFiveOptions = Array.isArray(existing?.metadata?.draft_options) && existing.metadata.draft_options.length === 5;
      const immutableExisting = existing && ["approved","sending","sent","replied"].includes(existing.status);
      if (existing && (immutableExisting || (existing.status === "pending_approval" && hasFiveOptions && body.regenerate !== true)) && body.regenerate !== true) {
        return json({ ok: true, action: existing, duplicate_prevented: true });
      }
      // Never rewrite a provider-accepted historical action when the user asks
      // for a fresh editable draft. Create a new idempotent record instead.
      const createFreshDraft = Boolean(immutableExisting && body.regenerate === true);

      const openaiKey = Deno.env.get("Outreach_agent") || Deno.env.get("OPENAI_API_KEY") || "";
      if (!openaiKey) return json({ ok: false, code: "AGENT_NOT_CONFIGURED", error: "Outreach agent is not configured" }, 503);
      setDefaultOpenAIKey(openaiKey);
      const model = Deno.env.get("OUTREACH_AGENT_MODEL") || "gpt-5.6-luna";
      const agent = new Agent({ name: "LIT Human Outreach Writer", model, instructions: AGENT_INSTRUCTIONS, outputType: DraftOutput });
      const context = {
        action_type: actionType,
        recipient: { name: target.name, title: target.title, linkedin_url: target.linkedinUrl },
        company: { name: target.company, domain: target.companyDomain },
        qualification: target.qualification,
        user_angle: String(body.angle || "Keep it simple. Establish relevance without pitching or forcing a business question."),
        hard_limit: actionType === "invite" ? "12-35 words; 200 characters" : "20-55 words",
      };
      const result = await withTrace("lit_linkedin_outreach_draft", async () => run(agent, JSON.stringify(context)));
      const draft = result.finalOutput;
      if (!draft?.options?.length) throw new Error("Outreach agent returned no draft options");
      const options = draft.options.map((option) => ({ ...option, message: option.message.trim() }));
      if (actionType === "invite" && options.some((option) => option.message.length > 200)) return json({ ok: false, code: "DRAFT_TOO_LONG", error: "Agent invitation draft exceeded 200 characters" }, 502);
      const selected = options[0];
      const draftRow = {
        org_id: target.orgId, created_by: auth.user.id, unipile_account_id: account.id,
        lead_id: target.leadId, campaign_id: target.campaignId, campaign_step_id: target.campaignStepId,
        campaign_contact_id: target.campaignContactId, contact_id: target.contactId,
        action_type: actionType, status: "pending_approval", recipient_name: target.name,
        recipient_linkedin_url: target.linkedinUrl, message: selected.message,
        agent_version: `outreach-human-v2:${model}`, agent_rationale: selected.rationale,
        idempotency_key: createFreshDraft ? `${baseKey}:${crypto.randomUUID()}` : baseKey,
        metadata: { company: target.company, title: target.title, qualification: target.qualification, draft_options: options, selected_tone: selected.tone },
        approved_by: null, approved_at: null, sent_at: null, failed_at: null,
        provider_event_id: null, last_error: null, updated_at: new Date().toISOString(),
      };
      const mutation = existing && !createFreshDraft
        ? auth.admin.from("lit_linkedin_outreach_actions").update(draftRow).eq("id", existing.id)
        : auth.admin.from("lit_linkedin_outreach_actions").insert(draftRow);
      const { data: created, error } = await mutation.select().single();
      if (error) throw error;
      return json({ ok: true, action: created });
    }

    if (operation === "update_draft") {
      const actionId = String(body.action_id || "");
      const message = String(body.message || "").trim();
      const { data: row } = await auth.admin.from("lit_linkedin_outreach_actions")
        .select("id,org_id,status,action_type,metadata").eq("id", actionId).maybeSingle();
      if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) {
        return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
      }
      if (row.status !== "pending_approval") {
        return json({ ok: false, code: "DRAFT_LOCKED", error: "Only a pending draft can be edited" }, 409);
      }
      if (!message || message.length > 1000 || (row.action_type === "invite" && message.length > 200)) {
        return json({ ok: false, code: "INVALID_MESSAGE", error: row.action_type === "invite" ? "Invitation must be 1–200 characters" : "Message must be 1–1000 characters" }, 400);
      }
      const { data: updated, error } = await auth.admin.from("lit_linkedin_outreach_actions").update({
        message, agent_rationale: null,
        metadata: { ...(row.metadata || {}), edited_by_human: true, edited_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", actionId).select().single();
      if (error) throw error;
      return json({ ok: true, action: updated });
    }

    if (operation === "approve_and_send") {
      const actionId = String(body.action_id || "");
      const { data: row } = await auth.admin.from("lit_linkedin_outreach_actions").select("id,org_id,status,lead_id,action_type")
        .eq("id", actionId).maybeSingle();
      if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
      if (row.lead_id) {
        const { data: access } = await auth.userClient.rpc("lit_my_lead_crm_access");
        const gate = Array.isArray(access) ? access[0] : access;
        if (!gate?.is_member) return json({ ok: false, code: "LEAD_CRM_REQUIRED", error: "Lead CRM membership required" }, 403);
      }
      if (row.status === "pending_approval") {
        const approvedMessage = typeof body.message === "string" ? body.message.trim() : "";
        if (approvedMessage && (approvedMessage.length > 1000 || (row.action_type === "invite" && approvedMessage.length > 200))) {
          return json({ ok: false, code: "INVALID_MESSAGE", error: "The approved LinkedIn text is outside the allowed length" }, 400);
        }
        await auth.admin.from("lit_linkedin_outreach_actions").update({
          ...(approvedMessage ? { message: approvedMessage, agent_rationale: null } : {}),
          status: "approved", approved_by: auth.user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", actionId).eq("status", "pending_approval");
      }
      return await dispatch(auth, actionId);
    }

    if (operation === "cancel") {
      const actionId = String(body.action_id || "");
      const { data: row } = await auth.admin.from("lit_linkedin_outreach_actions").select("org_id,status").eq("id", actionId).maybeSingle();
      if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
      if (!["pending_approval","approved","failed"].includes(row.status)) return json({ ok: false, code: "CANNOT_CANCEL", error: "This action can no longer be cancelled" }, 409);
      await auth.admin.from("lit_linkedin_outreach_actions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", actionId);
      return json({ ok: true });
    }
    if (operation === "delete") {
      const actionId = String(body.action_id || "");
      const { data: row } = await auth.admin.from("lit_linkedin_outreach_actions")
        .select("org_id,status,sent_at,provider_event_id,provider_chat_id").eq("id", actionId).maybeSingle();
      if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) {
        return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
      }
      const providerConfirmed = Boolean(row.sent_at || row.provider_event_id || row.provider_chat_id);
      if (!['cancelled', 'failed'].includes(row.status) || providerConfirmed) {
        return json({ ok: false, code: "CANNOT_DELETE", error: "Only cancelled or failed drafts that were never sent can be deleted" }, 409);
      }
      const { error } = await auth.admin.from("lit_linkedin_outreach_actions").delete().eq("id", actionId);
      if (error) throw error;
      return json({ ok: true });
    }
    if (operation === "dismiss") {
      const actionId = String(body.action_id || "");
      const { data: row } = await auth.admin.from("lit_linkedin_outreach_actions")
        .select("org_id,metadata").eq("id", actionId).maybeSingle();
      if (!row || !(await isOrgMember(auth.admin, auth.user.id, row.org_id))) {
        return json({ ok: false, code: "ACTION_NOT_FOUND", error: "Outreach action not found" }, 404);
      }
      const { error } = await auth.admin.from("lit_linkedin_outreach_actions").update({
        metadata: { ...(row.metadata || {}), hidden_in_lead_crm: true, hidden_at: new Date().toISOString(), hidden_by: auth.user.id },
        updated_at: new Date().toISOString(),
      }).eq("id", actionId);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ ok: false, code: "UNKNOWN_ACTION", error: "Unknown action" }, 400);
  } catch (error) {
    console.error("unipile-outreach failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, code: "OUTREACH_ERROR", error: error instanceof Error ? error.message : "Outreach operation failed" }, 502);
  }
});
