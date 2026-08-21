// harvey-sequence-tick — Project Harvey MULTICHANNEL SEQUENCE engine.
//
// This is the missing piece that makes Harvey "truly autonomous" on the LEAD
// CRM. Every tick it does two things:
//
//   1. ENROLL — harvest workable LEAD-CRM leads (lit_admin_leads in the 'New'
//      pipeline stage, open, with an email or LinkedIn URL, assigned to Harvey
//      or unassigned), classify each by ICP (freight broker / forwarder-NVOCC /
//      3PL), ASSIGN it to Harvey (lit_admin_leads.assigned_to), and enroll it
//      into the matching standing ICP campaign as a lit_campaign_contacts row
//      with status='harvey_active'.
//
//   2. EXECUTE — for each enrolled contact whose next_send_at is due, read the
//      current sequence step, render it for the lead, and emit an APPROVED
//      lit_agent_drafts row (channel email|linkedin). harvey-email-dispatch /
//      harvey-linkedin-dispatch then SEND it. The contact is advanced to the
//      next step (next_send_at += the next step's delay).
//
// WHY status='harvey_active' (NOT 'pending'/'queued'): the customer campaign
// cron (send-campaign-email) selects contacts WHERE status IN ('pending',
// 'queued'). Harvey's contacts must NOT be visible to it or email would
// double-send and LinkedIn would park unsent. 'harvey_active' is owned solely
// by THIS function.
//
// This function NEVER sends. It only enrolls + emits approved drafts; the
// dispatchers send (and re-check suppression / stop-on-reply / quiet-hours /
// daily caps at the send boundary). Fail-CLOSED: flag + config.enabled gate the
// run exactly like harvey-nurture.
//
// Daily emission caps (config.sending): emailDailyLimit / linkedinInviteDailyLimit
// / linkedinMessageDailyLimit bound how many drafts of each kind this function
// emits per calendar day (counted from its own drafts), so it never floods the
// dispatch queue.
//
// Auth (mirrors harvey-nurture): verified pg_cron (X-Internal-Cron) OR
// authenticated platform admin. Input JSON: { trigger_type?, limit?, created_by? }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  completeAgentRun,
  isAgentFlagEnabled,
  loadAgentConfig,
  recordAgentRun,
} from "../_shared/agent.ts";

const AGENT_NAME = "harvey-sequence";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";
const HARVEY_UID = "00000000-0000-4000-8000-000000000001";
const OWNER_UID = "79c81c33-3321-4e56-a442-80c74bb887b8";
const OWNER_ORG = "7a16be7f-b6b9-499e-8618-533373970f7c";

// ICP → standing campaign id (must match 20260821080000_harvey_campaign_engine).
const ICP_CAMPAIGN: Record<string, string> = {
  freight_broker: "c0a1efab-0000-4000-8000-000000000001",
  freight_forwarder: "c0a1efab-0000-4000-8000-000000000002",
  third_party_logistics: "c0a1efab-0000-4000-8000-000000000003",
};
const HARVEY_CAMPAIGN_IDS = Object.values(ICP_CAMPAIGN);

// Only enroll from the 'New' pipeline stage (mirrors harvey-controller's
// WORKABLE_STAGES). Deliberately conservative.
const WORKABLE_STAGES = ["New"];

const DEFAULT_ENROLL_LIMIT = 100;
const DEFAULT_EXECUTE_LIMIT = 150;

type TriggerType = "cron" | "webhook" | "manual" | "test";

interface StepRow {
  id: string;
  campaign_id: string;
  step_order: number;
  channel: string;
  subject: string | null;
  body: string | null;
  delay_days: number | null;
  delay_hours: number | null;
  metadata: Record<string, unknown> | null;
}

interface ContactRow {
  id: string;
  campaign_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  linkedin_provider_id: string | null;
  next_step_order: number | null;
  merge_vars: Record<string, unknown> | null;
}

// ─── ICP classification ──────────────────────────────────────────────────────

/** Classify a lead into an ICP campaign from company name + title. Broker is
 *  the default (largest freight-sales segment). Forwarder + 3PL are matched on
 *  specific signals first so they win over the generic broker default. */
function classifyIcp(company: string | null, title: string | null): string {
  const hay = `${company ?? ""} ${title ?? ""}`.toLowerCase();
  if (/forward|nvocc|ocean freight|air freight|customs broker|drayage|steamship|consolidat/.test(hay)) {
    return "freight_forwarder";
  }
  if (/\b3pl\b|third[- ]?party|warehous|fulfillment|fulfilment|distribution center|supply chain|contract logistics/.test(hay)) {
    return "third_party_logistics";
  }
  return "freight_broker";
}

function splitName(full: string | null): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

function render(text: string | null, firstName: string | null, company: string | null): string {
  return (text ?? "")
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName && firstName.trim() ? firstName.trim() : "there")
    .replace(/\{\{\s*company\s*\}\}/g, company && company.trim() ? company.trim() : "your team");
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // ── auth: verified cron OR platform-admin ──────────────────────────────────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook" ? requested : "cron";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing_supabase_env");
      return json({ ok: false, error: "server_misconfigured", request_id: rid }, 500);
    }
    admin = createClient(supabaseUrl, serviceKey);
  } else {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { isPlatformAdmin } = await isUserAdmin(auth.admin, auth.user.id);
    if (!isPlatformAdmin) {
      log.warn("forbidden_not_platform_admin", { user_id: auth.user.id });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    admin = auth.admin;
    actorUserId = auth.user.id;
    triggerType = body.trigger_type === "test" ? "test" : "manual";
  }

  const enrollLimit = (() => {
    const raw = typeof body.limit === "number" ? body.limit : Number(body.limit);
    if (Number.isFinite(raw) && raw > 0) return Math.min(500, Math.floor(raw));
    return DEFAULT_ENROLL_LIMIT;
  })();

  let runId: string | null = null;
  try {
    // ── gate 1: feature flag — fail CLOSED ─────────────────────────────────
    if (!(await isAgentFlagEnabled(admin, FLAG_KEY))) {
      const reason = `feature flag '${FLAG_KEY}' missing or killed (fail-closed)`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "skipped",
        decision_reason: reason, input_json: { request_id: rid, actor_user_id: actorUserId },
        completed_at: new Date().toISOString(),
      });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── gate 2: config must exist AND be enabled ───────────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      const reason = config ? "lit_agent_config['harvey'].enabled is false" : "lit_agent_config['harvey'] row missing (fail-closed)";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME, trigger_type: triggerType, status: "skipped",
        decision_reason: reason, test_mode: config?.testMode === true,
        input_json: { request_id: rid, actor_user_id: actorUserId }, completed_at: new Date().toISOString(),
      });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    const testMode = config.testMode === true;
    const sendingPaused = Boolean((config.sending as Record<string, unknown> | undefined)?.paused);
    const emailCap = Number((config.sending as Record<string, unknown> | undefined)?.emailDailyLimit ?? 50);
    const inviteCap = Number((config.sending as Record<string, unknown> | undefined)?.linkedinInviteDailyLimit ?? 25);
    const msgCap = Number((config.sending as Record<string, unknown> | undefined)?.linkedinMessageDailyLimit ?? 25);

    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME, trigger_type: triggerType, status: "running", test_mode: testMode,
      input_json: { request_id: rid, actor_user_id: actorUserId, enroll_limit: enrollLimit },
    });
    log.info("run_started", { run_id: runId, trigger_type: triggerType, test_mode: testMode });

    // ══ PHASE 1: ENROLL ═══════════════════════════════════════════════════
    // Resolve the 'New' stage id(s).
    const { data: stageRows, error: stageErr } = await admin
      .from("lit_lead_pipeline_stages").select("id, name");
    if (stageErr) throw new Error(`stage map failed: ${stageErr.message}`);
    const stageIds = (stageRows ?? [])
      .filter((s: { name: string }) => WORKABLE_STAGES.includes(s.name))
      .map((s: { id: string }) => s.id);

    let enrolled = 0;
    const enrolledByIcp: Record<string, number> = {};
    if (stageIds.length) {
      // Workable leads: New stage, open, not archived/deleted, has a channel,
      // unassigned or already Harvey's.
      const { data: leadRows, error: leadErr } = await admin
        .from("lit_admin_leads")
        .select("id, full_name, company_name, title, email, linkedin_url, assigned_to")
        .in("stage_id", stageIds)
        .eq("status", "open")
        .is("archived_at", null)
        .is("deleted_at", null)
        .order("lead_score", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (leadErr) throw new Error(`workable leads failed: ${leadErr.message}`);

      const leads = (leadRows ?? []).filter((l: Record<string, unknown>) => {
        const hasChannel = (typeof l.email === "string" && l.email.trim()) ||
          (typeof l.linkedin_url === "string" && (l.linkedin_url as string).trim());
        const assignee = l.assigned_to;
        const claimable = assignee == null || assignee === HARVEY_UID;
        return hasChannel && claimable;
      }) as Array<{
        id: string; full_name: string | null; company_name: string | null;
        title: string | null; email: string | null; linkedin_url: string | null; assigned_to: string | null;
      }>;

      // Already-enrolled lead ids (merge_vars.lead_id) across Harvey campaigns.
      const enrolledLeadIds = new Set<string>();
      {
        const { data: existing, error: exErr } = await admin
          .from("lit_campaign_contacts")
          .select("merge_vars")
          .in("campaign_id", HARVEY_CAMPAIGN_IDS)
          .limit(5000);
        if (exErr) throw new Error(`existing contacts read failed: ${exErr.message}`);
        for (const c of existing ?? []) {
          const lid = (c as { merge_vars?: Record<string, unknown> | null }).merge_vars?.lead_id;
          if (typeof lid === "string") enrolledLeadIds.add(lid);
        }
      }

      for (const lead of leads) {
        if (enrolled >= enrollLimit) break;
        if (enrolledLeadIds.has(lead.id)) continue;

        const icp = classifyIcp(lead.company_name, lead.title);
        const campaignId = ICP_CAMPAIGN[icp];
        const { first, last } = splitName(lead.full_name);

        // Assign to Harvey (only if unassigned — never steal a human's lead).
        if (lead.assigned_to == null) {
          await admin.from("lit_admin_leads")
            .update({ assigned_to: HARVEY_UID, updated_at: new Date().toISOString() })
            .eq("id", lead.id).is("assigned_to", null);
        }

        const { error: insErr } = await admin.from("lit_campaign_contacts").insert({
          campaign_id: campaignId,
          user_id: OWNER_UID,
          org_id: OWNER_ORG,
          email: lead.email,
          first_name: first,
          last_name: last,
          display_name: lead.full_name,
          title: lead.title,
          linkedin_url: lead.linkedin_url,
          status: "harvey_active",
          next_step_order: 1,
          next_send_at: new Date().toISOString(),
          merge_vars: { lead_id: lead.id, company: lead.company_name, first_name: first, icp },
        });
        if (insErr) {
          // Non-fatal: log + continue (unique clashes etc.).
          log.warn("enroll_insert_failed", { run_id: runId, lead_id: lead.id, err: insErr.message });
          continue;
        }
        enrolledLeadIds.add(lead.id);
        enrolled += 1;
        enrolledByIcp[icp] = (enrolledByIcp[icp] ?? 0) + 1;
      }
    }

    // ══ PHASE 2: EXECUTE ══════════════════════════════════════════════════
    // Today's already-emitted counts (this function only) — the emission caps.
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    let emailUsed = 0, inviteUsed = 0, msgUsed = 0;
    {
      const { data: today, error: tErr } = await admin
        .from("lit_agent_drafts")
        .select("channel, metadata_json")
        .eq("agent_name", AGENT_NAME)
        .gte("created_at", startOfDay.toISOString())
        .limit(5000);
      if (tErr) throw new Error(`today drafts read failed: ${tErr.message}`);
      for (const d of today ?? []) {
        const ch = (d as { channel: string }).channel;
        const kind = (d as { metadata_json?: Record<string, unknown> | null }).metadata_json?.kind;
        if (ch === "email") emailUsed += 1;
        else if (ch === "linkedin") { if (kind === "invite") inviteUsed += 1; else msgUsed += 1; }
      }
    }

    let emitted = 0, advanced = 0, completed = 0, capped = 0;
    const emitByChannel: Record<string, number> = { email: 0, linkedin_invite: 0, linkedin_message: 0 };

    if (!sendingPaused) {
      // Load steps for all Harvey campaigns (cache by campaign).
      const { data: allSteps, error: stepsErr } = await admin
        .from("lit_campaign_steps")
        .select("id, campaign_id, step_order, channel, subject, body, delay_days, delay_hours, metadata")
        .in("campaign_id", HARVEY_CAMPAIGN_IDS)
        .order("step_order", { ascending: true });
      if (stepsErr) throw new Error(`steps read failed: ${stepsErr.message}`);
      const stepsByCampaign = new Map<string, StepRow[]>();
      for (const s of (allSteps ?? []) as StepRow[]) {
        const arr = stepsByCampaign.get(s.campaign_id) ?? [];
        arr.push(s);
        stepsByCampaign.set(s.campaign_id, arr);
      }

      // Due contacts.
      const { data: dueRows, error: dueErr } = await admin
        .from("lit_campaign_contacts")
        .select("id, campaign_id, email, first_name, last_name, display_name, title, linkedin_url, linkedin_provider_id, next_step_order, merge_vars")
        .in("campaign_id", HARVEY_CAMPAIGN_IDS)
        .eq("status", "harvey_active")
        .lte("next_send_at", new Date().toISOString())
        .order("next_send_at", { ascending: true })
        .limit(DEFAULT_EXECUTE_LIMIT);
      if (dueErr) throw new Error(`due contacts read failed: ${dueErr.message}`);

      for (const contact of (dueRows ?? []) as ContactRow[]) {
        const steps = stepsByCampaign.get(contact.campaign_id) ?? [];
        const order = contact.next_step_order ?? 1;
        const step = steps.find((s) => s.step_order === order) ?? null;

        // No such step → sequence finished.
        if (!step) {
          await admin.from("lit_campaign_contacts")
            .update({ status: "completed", next_send_at: null, updated_at: new Date().toISOString() })
            .eq("id", contact.id);
          completed += 1;
          continue;
        }

        const kind = (step.metadata?.kind as string | undefined) ?? (step.channel === "linkedin" ? "message" : "email");
        const isInvite = step.channel === "linkedin" && kind === "invite";

        // Cap check — if this channel/kind is exhausted for today, leave the
        // contact due and retry next tick (do NOT advance).
        if (step.channel === "email" && emailUsed >= emailCap) { capped += 1; continue; }
        if (isInvite && inviteUsed >= inviteCap) { capped += 1; continue; }
        if (step.channel === "linkedin" && !isInvite && msgUsed >= msgCap) { capped += 1; continue; }

        const leadId = (contact.merge_vars?.lead_id as string | undefined) ?? null;
        const company = (contact.merge_vars?.company as string | undefined) ?? null;
        const icp = (contact.merge_vars?.icp as string | undefined) ?? "freight_broker";
        const firstName = contact.first_name;

        // Emit an APPROVED draft — plain INSERT (partial-unique lesson: never
        // upsert). Idempotency is guarded by advancing the contact after emit;
        // a retry that re-reads the same step_order is prevented because the
        // contact is advanced in the same loop iteration.
        const contactJson = {
          email: contact.email,
          linkedin_url: contact.linkedin_url,
          provider_id: contact.linkedin_provider_id,
          first_name: firstName,
          last_name: contact.last_name,
          company,
          title: contact.title,
        };
        const subject = step.channel === "email" ? render(step.subject, firstName, company) : null;
        const bodyText = render(step.body, firstName, company);

        const { error: draftErr } = await admin.from("lit_agent_drafts").insert({
          agent_name: AGENT_NAME,
          lead_id: leadId,
          contact_json: contactJson,
          channel: step.channel,
          stage: "cold_outreach",
          intent: "cold_outreach",
          template_key: `${icp}_step${step.step_order}_${kind}`,
          subject,
          body: bodyText,
          status: "approved",
          requires_approval: false,
          created_by: HARVEY_UID,
          metadata_json: {
            campaign_id: contact.campaign_id,
            contact_id: contact.id,
            step_id: step.id,
            step_order: step.step_order,
            kind,
            icp,
            sequence: true,
          },
        });

        if (draftErr) {
          // 23505 = a draft for this contact/step already exists → just advance.
          if (!String(draftErr.code) .includes("23505") && !/duplicate key/i.test(draftErr.message)) {
            log.warn("draft_insert_failed", { run_id: runId, contact_id: contact.id, err: draftErr.message });
            continue;
          }
        } else {
          emitted += 1;
          if (step.channel === "email") { emailUsed += 1; emitByChannel.email += 1; }
          else if (isInvite) { inviteUsed += 1; emitByChannel.linkedin_invite += 1; }
          else { msgUsed += 1; emitByChannel.linkedin_message += 1; }
        }

        // Advance the contact to the next step.
        const next = steps.find((s) => s.step_order === order + 1) ?? null;
        if (next) {
          const delayMs = ((next.delay_days ?? 0) * 86400 + (next.delay_hours ?? 0) * 3600) * 1000;
          await admin.from("lit_campaign_contacts").update({
            current_step_id: step.id,
            next_step_order: order + 1,
            last_sent_at: new Date().toISOString(),
            next_send_at: new Date(Date.now() + delayMs).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", contact.id);
          advanced += 1;
        } else {
          await admin.from("lit_campaign_contacts").update({
            current_step_id: step.id,
            last_sent_at: new Date().toISOString(),
            status: "completed",
            next_send_at: null,
            updated_at: new Date().toISOString(),
          }).eq("id", contact.id);
          completed += 1;
        }
      }
    }

    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "sequence_tick",
      decision_reason: `Enrolled ${enrolled}, emitted ${emitted} draft(s) (${emitByChannel.email} email, ${emitByChannel.linkedin_invite} invite, ${emitByChannel.linkedin_message} msg), advanced ${advanced}, completed ${completed}`,
      output_json: {
        enrolled, enrolled_by_icp: enrolledByIcp,
        emitted, emit_by_channel: emitByChannel, advanced, completed, capped,
        caps: { emailCap, inviteCap, msgCap }, used: { emailUsed, inviteUsed, msgUsed },
        sending_paused: sendingPaused, test_mode: testMode,
      },
    });
    log.info("run_ok", { run_id: runId, enrolled, emitted, advanced, completed, capped });

    return json({
      ok: true, run_id: runId, enrolled, enrolled_by_icp: enrolledByIcp,
      emitted, emit_by_channel: emitByChannel, advanced, completed, capped,
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    try {
      if (runId) {
        await completeAgentRun(admin, runId, { status: "error", error_json: { message, request_id: rid } });
      } else {
        runId = await recordAgentRun(admin, {
          agent_name: AGENT_NAME, trigger_type: triggerType, status: "error",
          error_json: { message, request_id: rid }, completed_at: new Date().toISOString(),
        });
      }
    } catch (auditErr) {
      log.error("run_audit_write_failed", { run_id: runId, err: String(auditErr) });
    }
    return json({ ok: false, error: "internal_error", run_id: runId, request_id: rid }, 500);
  }
});
