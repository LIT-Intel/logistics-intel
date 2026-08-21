// ai-employee-console — backend for the internal "AI Employees" admin console.
//
// Platform admins chat with, task, monitor, and control internal AI agents
// (Harvey is the first; the design is multi-agent — every row is keyed by
// agent_name, and the controller/flag mapping is derived per agent). NO
// customer ever reaches this function: the security boundary is a server-side
// platform_admins check (requireUser + platform_admins lookup). Org admins and
// plain users get 403.
//
// Single POST endpoint, dispatched on body.action:
//   list         -> every agent's status card
//   detail       -> one agent's config + SQL-computed metrics + recent runs
//   chat         -> persist the user turn, call the dual-vendor LLM with a
//                   persona + knowledge + run-summary + history prompt, persist
//                   and return the assistant turn (never 500s the chat)
//   chat_history -> chronological chat log (oldest→newest), capped
//   assign_task  -> queue a lit_agent_tasks row (does NOT execute it)
//   list_tasks   -> tasks for an agent, newest first
//   update_task  -> admin flips a task's status
//   run_now      -> server-to-server POST to {agent}-controller (X-Internal-Cron)
//   set_config   -> whitelist-merge enabled/mode/testMode into config jsonb
//   set_flag     -> flip the agent's fail-closed kill switch
//
// Every action is wrapped so errors return a clean 500 with request_id and
// never leak a stack trace. The LLM call reuses the dual-vendor pattern from
// company-relationship-intel (OPENAI_API_KEY || ANTHROPIC_API_KEY; sk-ant →
// Anthropic Messages API, else OpenAI Responses API) minus the web-search tool.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import { isAgentFlagEnabled, loadAgentConfig } from "../_shared/agent.ts";
// Shared Harvey pieces (Batch 4 refactor — single source of truth for the
// persona, the dual-vendor LLM caller, and the knowledge/template grounding).
import { HARVEY_SYSTEM_PROMPT, buildHarveySystemPrompt } from "../_shared/harvey_persona.ts";
import { callLlm } from "../_shared/llm.ts";
import {
  fetchApprovedKnowledge,
  fetchApprovedTemplates,
  renderKnowledgeBlock,
  renderTemplateBodies,
  renderTemplateCatalog,
  selectRelevantTemplates,
  MAX_TEMPLATE_BODIES,
} from "../_shared/harvey_context.ts";

const FN_NAME = "ai-employee-console";

// Re-export the persona so any external importer of ai-employee-console keeps
// working after the move to _shared/harvey_persona.ts.
export { HARVEY_SYSTEM_PROMPT, buildHarveySystemPrompt };

// ─── flag mapping (multi-agent) ──────────────────────────────────────────────
function flagKeyFor(agentName: string, profile: Record<string, unknown> | null): string {
  const fromProfile = profile && typeof profile.flagKey === "string" ? profile.flagKey : null;
  return fromProfile || `${agentName}_internal_agent`;
}

function controllerFn(agentName: string): string {
  return `${agentName}-controller`;
}

// ─── config shape helpers (config is free-form jsonb) ────────────────────────
type Cfg = Record<string, unknown>;

function statusOf(cfg: Cfg): string {
  if (cfg.enabled !== true) return "off";
  if (cfg.testMode === true) return "test";
  return typeof cfg.mode === "string" ? cfg.mode : "unknown";
}

// ─── dual-vendor LLM (chat; no tools) ────────────────────────────────────────
// Moved to _shared/llm.ts (callLlm) — imported above so the writer reuses it.

// ─── action handlers ─────────────────────────────────────────────────────────

async function actionList(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("lit_agent_config")
    .select("agent_name, config")
    .order("agent_name", { ascending: true });
  if (error) throw new Error(`lit_agent_config read failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ agent_name: string; config: Cfg }>;
  const agents = await Promise.all(rows.map(async (r) => {
    const cfg = (r.config ?? {}) as Cfg;
    const profile = (cfg.profile ?? null) as Record<string, unknown> | null;
    const flag_enabled = await isAgentFlagEnabled(admin, flagKeyFor(r.agent_name, profile));
    return {
      agent_name: r.agent_name,
      profile,
      enabled: cfg.enabled === true,
      mode: typeof cfg.mode === "string" ? cfg.mode : null,
      test_mode: cfg.testMode === true,
      flag_enabled,
      status: statusOf(cfg),
    };
  }));
  return { ok: true, agents };
}

async function actionDetail(admin: SupabaseClient, agentName: string) {
  const config = await loadAgentConfig(admin, agentName);
  if (!config) return { ok: false, error: "agent not found" };
  const profile = (config.profile ?? null) as Record<string, unknown> | null;
  const flag_enabled = await isAgentFlagEnabled(admin, flagKeyFor(agentName, profile));

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [runsTodayRes, runsTotalRes, lastRunRes, tasksOpenRes, recentRunsRes] = await Promise.all([
    admin.from("lit_agent_runs").select("id", { count: "exact", head: true })
      .eq("agent_name", agentName).gte("created_at", startOfToday.toISOString()),
    admin.from("lit_agent_runs").select("id", { count: "exact", head: true })
      .eq("agent_name", agentName),
    admin.from("lit_agent_runs")
      .select("created_at, decision, status")
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("lit_agent_tasks").select("id", { count: "exact", head: true })
      .eq("agent_name", agentName).in("status", ["queued", "in_progress"]),
    admin.from("lit_agent_runs")
      .select("id, trigger_type, status, priority, decision, decision_reason, test_mode, started_at, completed_at, created_at")
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false }).limit(20),
  ]);

  if (runsTodayRes.error) throw new Error(`runs_today failed: ${runsTodayRes.error.message}`);
  if (runsTotalRes.error) throw new Error(`runs_total failed: ${runsTotalRes.error.message}`);
  if (tasksOpenRes.error) throw new Error(`tasks_open failed: ${tasksOpenRes.error.message}`);
  if (recentRunsRes.error) throw new Error(`recent_runs failed: ${recentRunsRes.error.message}`);

  const lastRun = (lastRunRes.data ?? null) as
    | { created_at: string; decision: string | null; status: string | null }
    | null;

  return {
    ok: true,
    agent: { agent_name: agentName, config },
    flag_enabled,
    metrics: {
      runs_today: runsTodayRes.count ?? 0,
      runs_total: runsTotalRes.count ?? 0,
      last_run_at: lastRun?.created_at ?? null,
      last_decision: lastRun?.decision ?? null,
      last_status: lastRun?.status ?? null,
      tasks_open: tasksOpenRes.count ?? 0,
    },
    recent_runs: recentRunsRes.data ?? [],
  };
}

// ─── outreach-template grounding ─────────────────────────────────────────────
// The OutreachTemplate type, MAX_TEMPLATE_BODIES cap, and scoreTemplate/select
// relevance logic moved to _shared/harvey_context.ts (Batch 4 refactor) so the
// writer and chat select templates identically. Imported above.

/** Assemble the LLM prompt: persona + knowledge + template catalog + relevant
 *  template bodies + recent runs + chat history. `message` is the current admin
 *  turn, used only for plain-string relevance selection of template bodies. */
async function buildChatContext(
  admin: SupabaseClient,
  agentName: string,
  config: Cfg,
  message: string,
): Promise<{ system: string; userBlock: string }> {
  const profile = (config.profile ?? {}) as Record<string, unknown>;

  // Service-role `admin` client is used throughout — RLS blocks anon from the
  // knowledge/templates tables, so this must never be the user-scoped client.
  const [knowledge, templates, runsRes, historyRes, leadsRes, leadsCountRes, stageRes] =
    await Promise.all([
      fetchApprovedKnowledge(admin),
      fetchApprovedTemplates(admin, agentName),
      admin.from("lit_agent_runs")
        .select("created_at, decision, decision_reason, status, output_json")
        .eq("agent_name", agentName)
        .order("created_at", { ascending: false }).limit(10),
      admin.from("lit_agent_chat_messages")
        .select("role, content, created_at")
        .eq("agent_name", agentName)
        .order("created_at", { ascending: false }).limit(10),
      // Compact snapshot of the agent's OWN leads from the LEAD CRM, so Harvey
      // can answer "give me N leads" with real rows instead of generic criteria.
      admin.from("lit_admin_leads")
        .select("full_name, title, company_name, stage_id, lead_score")
        .eq("primary_source", agentName)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(15),
      admin.from("lit_admin_leads")
        .select("id", { count: "exact", head: true })
        .eq("primary_source", agentName)
        .is("deleted_at", null),
      admin.from("lit_lead_pipeline_stages").select("id, name"),
    ]);

  const personaLine = buildHarveySystemPrompt(profile);

  const knowledgeBlock = renderKnowledgeBlock(knowledge);

  // ── outreach templates: compact catalog (all) + full bodies (most relevant) ──
  const templateCatalogBlock = renderTemplateCatalog(templates);
  // Pick up to MAX_TEMPLATE_BODIES most relevant to the current admin message.
  // Chat matches on the raw message text only (no channel/stage filter), so
  // behavior is equivalent to the original inline scoring.
  const ranked = selectRelevantTemplates(templates, { text: message, limit: MAX_TEMPLATE_BODIES });
  const templateBodiesBlock = ranked.length ? renderTemplateBodies(ranked) : "";

  const runs = (runsRes.data ?? []) as Array<{
    created_at: string; decision: string | null; decision_reason: string | null;
    status: string | null; output_json: Record<string, unknown> | null;
  }>;
  const runsBlock = runs.length
    ? runs.map((r) => {
        const counts = r.output_json && typeof r.output_json === "object"
          ? (r.output_json as Record<string, unknown>).counts
          : undefined;
        const countStr = counts ? ` counts=${JSON.stringify(counts)}` : "";
        return `- ${r.created_at} [${r.status}] ${r.decision ?? "n/a"}: ${r.decision_reason ?? ""}${countStr}`;
      }).join("\n")
    : "(no recorded runs yet)";

  // History arrives newest-first; reverse to chronological for the prompt.
  const history = ((historyRes.data ?? []) as Array<{ role: string; content: string }>).slice().reverse();
  const historyBlock = history.length
    ? history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")
    : "(no prior messages)";

  // ── the agent's own LEAD CRM snapshot (lead-awareness) ─────────────────────
  const stageNameById = new Map<string, string>();
  for (const s of (stageRes.data ?? []) as Array<{ id: string; name: string }>) {
    if (s.id) stageNameById.set(s.id, s.name ?? "");
  }
  const leadRows = (leadsRes.data ?? []) as Array<{
    full_name: string | null; title: string | null; company_name: string | null;
    stage_id: string | null; lead_score: number | null;
  }>;
  const leadsTotal = leadsCountRes.count ?? leadRows.length;
  const leadsBlock = leadRows.length
    ? leadRows
        .map((l, i) => {
          const stage = l.stage_id ? (stageNameById.get(l.stage_id) ?? "—") : "—";
          return `${i + 1}. ${l.full_name || "—"} · ${l.title || "—"} · ${l.company_name || "—"} · ${stage} · score ${l.lead_score ?? 0}`;
        })
        .join("\n")
    : "(no sourced leads yet)";
  const leadsSection =
    `HARVEY'S CURRENT LEADS (from the LEAD CRM — ${leadsTotal} total, showing ${leadRows.length} most recent):\n` +
    `${leadsBlock}\n\n` +
    "When the admin asks you to list/pull leads from the LEAD CRM, use THIS list — return real leads " +
    "by name/company/title, not generic criteria. If the list is empty, say you have no sourced leads " +
    "yet and offer to source some (prospecting).";

  // ── ACTUAL sending capability + current gating state ──────────────────────
  // Harvey has a REAL dispatch pipeline (harvey-email-dispatch sends approved
  // email drafts from harvey@logisticintel.com; LinkedIn via the connected
  // "Harvey Davis" account). It may be gated OFF right now — surface the exact
  // state so Harvey never falsely claims "I can't send emails."
  const sendingCfg = (config.sending ?? {}) as Record<string, unknown>;
  const cfgEnabled = config.enabled === true;
  const cfgMode = typeof config.mode === "string" ? config.mode : "unknown";
  const cfgPaused = sendingCfg.paused === true;
  const dryRun = sendingCfg.dryRun === true || config.testMode === true;
  const liveSending = cfgEnabled && !dryRun && !cfgPaused;
  const sendingSection =
    "YOUR ACTUAL SENDING CAPABILITY (ground truth — do NOT contradict this):\n" +
    "You CAN send email (from harvey@logisticintel.com) and LinkedIn (via your connected " +
    "'Harvey Davis' account) through your dispatch pipeline. This is a real send pipeline; it " +
    "may simply be gated right now.\n" +
    `Current sending state: enabled=${cfgEnabled}, mode=${cfgMode}, ` +
    `live_sending=${liveSending} (dryRun=${dryRun}), paused=${cfgPaused}.\n` +
    "When an admin asks you to send something:\n" +
    "- If you are enabled AND live (not dry-run, not paused): a draft you generate that is " +
    "approved WILL be sent by your dispatcher. Say you'll queue/prepare it and note it goes out " +
    "on the next dispatch — or that the admin can approve/send it from the Drafts tab, or use the " +
    "'Send test email' button to verify end-to-end.\n" +
    "- If you are in dry-run, paused, or disabled: tell the admin plainly that sending is currently " +
    "OFF/dry-run and exactly what to toggle (Live sending toggle, un-pause, or enable).\n" +
    "NEVER say 'I am not able to send emails directly' — that is false. You have a real send " +
    "pipeline; it may just be gated.";

  // Order: sending -> knowledge -> template catalog -> relevant template bodies -> runs -> leads -> history.
  const parts: string[] = [
    sendingSection,
    `APPROVED KNOWLEDGE:\n${knowledgeBlock}`,
    `APPROVED OUTREACH TEMPLATE CATALOG ([key] channel/stage/intent — subject; bodies omitted):\n${templateCatalogBlock}`,
  ];
  if (templateBodiesBlock) {
    parts.push(
      "RELEVANT APPROVED OUTREACH EXAMPLES (full body):\n" +
        "These are approved example messages that define Harvey's voice. Adapt them to the " +
        "specific prospect and their exact message; never paste them verbatim or reuse the same " +
        "phrasing repeatedly.\n\n" +
        templateBodiesBlock,
    );
  }
  parts.push(`RECENT AGENT RUNS (most recent first — your own decision log):\n${runsBlock}`);
  parts.push(leadsSection);
  parts.push(`RECENT CONVERSATION (chronological):\n${historyBlock}`);

  const userBlock = parts.join("\n\n");

  return { system: personaLine, userBlock };
}

async function actionChat(
  admin: SupabaseClient,
  agentName: string,
  message: string,
  userId: string,
  log: ReturnType<typeof createLogger>,
) {
  const config = await loadAgentConfig(admin, agentName);
  if (!config) return { ok: false, error: "agent not found" };

  // 1. Persist the user turn.
  const { data: userMsg, error: userErr } = await admin
    .from("lit_agent_chat_messages")
    .insert({ agent_name: agentName, role: "user", content: message, user_id: userId })
    .select("id")
    .single();
  if (userErr) throw new Error(`chat user insert failed: ${userErr.message}`);

  // 2. Build context + call the LLM.
  const { system, userBlock } = await buildChatContext(admin, agentName, config as Cfg, message);
  const composed = `${userBlock}\n\n─────\nADMIN MESSAGE:\n${message}`;
  const llm = await callLlm(system, composed);

  const replyText = llm.ok
    ? llm.text
    : "I couldn't reach the language model just now, so I can't answer that this moment. " +
      "The rest of the console (tasks, runs, config) still works — please try the chat again shortly.";
  if (!llm.ok) log.warn("chat_llm_failed", { agent_name: agentName, err: llm.error });

  // 3. Persist the assistant turn (record the failure cause in metadata).
  const { data: asstMsg, error: asstErr } = await admin
    .from("lit_agent_chat_messages")
    .insert({
      agent_name: agentName,
      role: "assistant",
      content: replyText,
      metadata_json: llm.ok ? { model: true } : { llm_error: llm.error },
    })
    .select("id")
    .single();
  if (asstErr) throw new Error(`chat assistant insert failed: ${asstErr.message}`);

  return { ok: true, reply: replyText, message_id: asstMsg.id, user_message_id: userMsg.id };
}

async function actionChatHistory(admin: SupabaseClient, agentName: string, limit: number) {
  const capped = Math.min(Math.max(1, limit || 50), 50);
  const { data, error } = await admin
    .from("lit_agent_chat_messages")
    .select("id, agent_name, role, content, user_id, metadata_json, created_at")
    .eq("agent_name", agentName)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new Error(`chat_history read failed: ${error.message}`);
  // Fetched newest-first for the cap; return chronological (newest-last).
  const messages = (data ?? []).slice().reverse();
  return { ok: true, messages };
}

async function actionAssignTask(
  admin: SupabaseClient,
  agentName: string,
  title: string,
  instructions: string | null,
  priority: number,
  userId: string,
) {
  const { data, error } = await admin
    .from("lit_agent_tasks")
    .insert({
      agent_name: agentName,
      title,
      instructions: instructions ?? null,
      priority: Number.isFinite(priority) ? priority : 0,
      created_by: userId,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) throw new Error(`assign_task insert failed: ${error.message}`);

  // Reflect the queued task in the conversation (best-effort; do not fail the
  // task if the chat write hiccups).
  const { error: chatErr } = await admin.from("lit_agent_chat_messages").insert({
    agent_name: agentName,
    role: "assistant",
    content: `Task queued: ${title}`,
    metadata_json: { task_id: data.id, kind: "task_queued" },
  });
  if (chatErr) {
    // non-fatal
  }

  return { ok: true, task_id: data.id };
}

async function actionListTasks(admin: SupabaseClient, agentName: string, status: string | null) {
  let q = admin
    .from("lit_agent_tasks")
    .select("id, agent_name, title, instructions, status, priority, created_by, assigned_run_id, result_json, created_at, updated_at, completed_at")
    .eq("agent_name", agentName)
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`list_tasks read failed: ${error.message}`);
  return { ok: true, tasks: data ?? [] };
}

const TASK_STATUSES = ["queued", "in_progress", "done", "cancelled", "failed"];

async function actionUpdateTask(admin: SupabaseClient, taskId: string, status: string) {
  if (!TASK_STATUSES.includes(status)) return { ok: false, error: "invalid status" };
  const patch: Record<string, unknown> = { status };
  if (status === "done" || status === "cancelled" || status === "failed") {
    patch.completed_at = new Date().toISOString();
  }
  const { error } = await admin.from("lit_agent_tasks").update(patch).eq("id", taskId);
  if (error) throw new Error(`update_task failed: ${error.message}`);
  return { ok: true };
}

async function actionRunNow(agentName: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const fn = controllerFn(agentName);
  const url = `${supabaseUrl}/functions/v1/${fn}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // The Supabase functions gateway requires a valid apikey/JWT to route the
        // request BEFORE the target fn's own X-Internal-Cron check runs. Without
        // this the gateway 401s the internal call. The target checks cron first.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({ trigger_type: "manual" }),
    });
  } catch (err) {
    return { ok: false, error: `controller unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  // A missing controller function returns 404 from the functions gateway.
  if (res.status === 404) return { ok: false, error: "no controller" };
  const controller = await res.json().catch(() => ({ raw: "non-JSON controller response" }));
  if (!res.ok) return { ok: false, error: `controller HTTP ${res.status}`, controller };
  return { ok: true, controller };
}

// ─── Harvey WRITER draft actions (Batch 4) ───────────────────────────────────
// These are the three actions the Drafts tab in AdminAIEmployees.tsx calls.
// generate_draft proxies to the harvey-writer edge fn (server-to-server with
// the internal cron secret); list_drafts / update_draft touch lit_agent_drafts
// directly with the service-role client.

type WriterContact = {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  persona?: string;
};

/** Server-to-server call to harvey-writer, injecting the authenticated admin id. */
async function actionGenerateDraft(
  agentName: string,
  channel: string,
  stage: string | null,
  intent: string | null,
  leadId: string | null,
  contact: WriterContact,
  instructions: string | null,
  adminUserId: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/harvey-writer`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // The Supabase functions gateway requires a valid apikey/JWT to route the
        // request BEFORE the target fn's own X-Internal-Cron check runs. Without
        // this the gateway 401s the internal call. The target checks cron first.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({
        agent_name: agentName || "harvey",
        channel,
        stage,
        intent,
        lead_id: leadId,
        contact: contact ?? {},
        instructions,
        created_by: adminUserId,
        trigger_type: "manual",
      }),
    });
  } catch (err) {
    return { ok: false, error: `writer unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.status === 404) return { ok: false, error: "no writer" };
  const writer = await res.json().catch(() => ({ raw: "non-JSON writer response" }));
  if (!res.ok || (writer && writer.ok === false)) {
    const errMsg = (writer && typeof writer.error === "string")
      ? writer.error
      : `writer HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return { ok: true, draft_id: writer.draft_id, draft: writer.draft };
}

async function actionListDrafts(admin: SupabaseClient, agentName: string, status: string | null) {
  let q = admin
    .from("lit_agent_drafts")
    .select(
      "id, channel, subject, body, angle, confidence, status, requires_approval, contact_json, stage, intent, template_key, created_at, edited_subject, edited_body",
    )
    .eq("agent_name", agentName || "harvey")
    .order("created_at", { ascending: false })
    .limit(50);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`list_drafts read failed: ${error.message}`);
  return { ok: true, drafts: data ?? [] };
}

const DRAFT_REVIEW_STATUSES = ["approved", "rejected", "edited"];

async function actionUpdateDraft(
  admin: SupabaseClient,
  draftId: string,
  status: string,
  subject: string | null,
  body: string | null,
  adminUserId: string,
) {
  if (!DRAFT_REVIEW_STATUSES.includes(status)) return { ok: false, error: "invalid status" };
  const patch: Record<string, unknown> = {
    status,
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
  };
  // On an edit, persist the human-corrected copy alongside the original body.
  // Do NOT send on approve — sending is a later batch; approving marks it ready.
  if (status === "edited") {
    if (typeof subject === "string") patch.edited_subject = subject;
    if (typeof body === "string") patch.edited_body = body;
  }
  const { error } = await admin.from("lit_agent_drafts").update(patch).eq("id", draftId);
  if (error) throw new Error(`update_draft failed: ${error.message}`);
  return { ok: true };
}

// ─── Harvey PROSPECTS / LEADS actions (Batch 5) ──────────────────────────────
// The Prospects tab drives four actions:
//   run_prospect  -> harvey-prospect (LIVE sourcing; forwards the admin JWT so
//                    Harvey's paid Apollo path is authorized)
//   run_research  -> harvey-research (builds a research brief for one lead)
//   list_leads    -> service-role read of lit_admin_leads (agent's own leads)
//   lead_detail   -> one lead + its latest research brief + its drafts
// list_leads / lead_detail read the service-role `admin` client directly
// (lit_admin_leads RLS is lead-CRM-member gated, so anon cannot read it).

/** Resolve a map of stage_id -> stage name from lit_lead_pipeline_stages. */
async function loadStageNames(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("lit_lead_pipeline_stages")
    .select("id, name");
  if (error) throw new Error(`lit_lead_pipeline_stages read failed: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    if (row.id) map.set(row.id, row.name ?? "");
  }
  return map;
}

/** Server-to-server call to harvey-prospect for a MANUAL admin sourcing run.
 *  Forwards the admin's Authorization header (member JWT) so harvey-prospect
 *  can authorize its paid Apollo path — the fn re-verifies platform-admin +
 *  lead-CRM membership and falls back to internal-only sourcing if no JWT is
 *  present. `created_by` records the actor for the audit trail. */
async function actionRunProspect(
  agentName: string,
  target: { count?: number; keywords?: string[]; location?: string } | null,
  authHeader: string,
  adminUserId: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");

  const url = `${supabaseUrl}/functions/v1/harvey-prospect`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Forward the caller's member JWT so live Apollo sourcing is authorized. This
  // routes harvey-prospect into its admin/manual (non-cron) branch, which reads
  // the JWT from Authorization. Without it the fn stays internal-only.
  if (authHeader && authHeader.startsWith("Bearer ")) headers["Authorization"] = authHeader;
  else {
    // No forwardable JWT — fall back to the internal cron path (no Apollo).
    const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };
    headers["X-Internal-Cron"] = cronSecret;
    // Gateway also needs a valid apikey/JWT to route the internal call.
    if (gatewayKey) { headers["Authorization"] = `Bearer ${gatewayKey}`; headers["apikey"] = gatewayKey; }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent_name: agentName || "harvey",
        trigger_type: "manual",
        target: target ?? {},
        created_by: adminUserId,
      }),
    });
  } catch (err) {
    return { ok: false, error: `prospect unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.status === 404) return { ok: false, error: "no prospector" };
  const p = await res.json().catch(() => ({ raw: "non-JSON prospect response" }));
  if (!res.ok || (p && p.ok === false)) {
    const errMsg = (p && typeof p.error === "string") ? p.error : `prospect HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return {
    ok: true,
    run_id: p.run_id ?? null,
    sourced: p.sourced ?? 0,
    created: p.created ?? 0,
    skipped: p.skipped ?? 0,
    test_mode: p.test_mode === true,
    leads: Array.isArray(p.leads) ? p.leads : [],
  };
}

/** Server-to-server call to harvey-research to build a brief for one lead. */
async function actionRunResearch(agentName: string, leadId: string, adminUserId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/harvey-research`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // The Supabase functions gateway requires a valid apikey/JWT to route the
        // request BEFORE the target fn's own X-Internal-Cron check runs. Without
        // this the gateway 401s the internal call. The target checks cron first.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({
        agent_name: agentName || "harvey",
        lead_id: leadId,
        trigger_type: "manual",
        created_by: adminUserId,
      }),
    });
  } catch (err) {
    return { ok: false, error: `research unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.status === 404) return { ok: false, error: "no researcher" };
  const r = await res.json().catch(() => ({ raw: "non-JSON research response" }));
  if (!res.ok || (r && r.ok === false)) {
    const errMsg = (r && typeof r.error === "string") ? r.error : `research HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return { ok: true, run_id: r.run_id ?? null, brief: r.brief ?? null };
}

/** List the agent's OWN leads (primary_source=agent), newest first, with
 *  has_research + draft_count decorations. */
async function actionListLeads(
  admin: SupabaseClient,
  agentName: string,
  limit: number,
  stage: string | null,
  status: string | null,
) {
  const source = agentName || "harvey";
  const capped = Math.min(Math.max(1, limit || 25), 100);

  let q = admin
    .from("lit_admin_leads")
    .select(
      "id, full_name, company_name, title, email, stage_id, status, lead_score, company_domain, company_city, company_state, created_at",
    )
    .eq("primary_source", source)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`list_leads read failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string; full_name: string | null; company_name: string | null; title: string | null;
    email: string | null; stage_id: string | null; status: string | null; lead_score: number | null;
    company_domain: string | null; company_city: string | null; company_state: string | null;
    created_at: string | null;
  }>;

  const stageNames = await loadStageNames(admin);

  // Optional stage-name filter (applied after name resolution).
  const filtered = stage
    ? rows.filter((r) => (r.stage_id ? stageNames.get(r.stage_id) : null) === stage)
    : rows;

  const ids = filtered.map((r) => r.id);
  const hasResearch = new Set<string>();
  const draftCounts = new Map<string, number>();
  if (ids.length > 0) {
    const [researchRes, draftsRes] = await Promise.all([
      admin.from("lit_agent_lead_research").select("lead_id").in("lead_id", ids),
      admin.from("lit_agent_drafts").select("lead_id").in("lead_id", ids),
    ]);
    if (researchRes.error) throw new Error(`lead_research read failed: ${researchRes.error.message}`);
    if (draftsRes.error) throw new Error(`lead_drafts read failed: ${draftsRes.error.message}`);
    for (const r of (researchRes.data ?? []) as Array<{ lead_id: string | null }>) {
      if (r.lead_id) hasResearch.add(r.lead_id);
    }
    for (const d of (draftsRes.data ?? []) as Array<{ lead_id: string | null }>) {
      if (d.lead_id) draftCounts.set(d.lead_id, (draftCounts.get(d.lead_id) ?? 0) + 1);
    }
  }

  const leads = filtered.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    company_name: r.company_name,
    title: r.title,
    email: r.email,
    stage: r.stage_id ? (stageNames.get(r.stage_id) ?? null) : null,
    status: r.status,
    lead_score: r.lead_score ?? 0,
    company_domain: r.company_domain,
    company_city: r.company_city,
    company_state: r.company_state,
    created_at: r.created_at,
    has_research: hasResearch.has(r.id),
    draft_count: draftCounts.get(r.id) ?? 0,
  }));

  return { ok: true, leads };
}

/** One lead + its latest research brief + its drafts. */
async function actionLeadDetail(admin: SupabaseClient, leadId: string) {
  const { data: leadRow, error: leadErr } = await admin
    .from("lit_admin_leads")
    .select(
      "id, full_name, company_name, title, email, stage_id, status, lead_score, company_domain, company_country, company_city, company_state, primary_source, created_at, archived_at, deleted_at",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw new Error(`lead_detail read failed: ${leadErr.message}`);
  if (!leadRow) return { ok: false, error: "lead not found" };

  const stageNames = await loadStageNames(admin);
  const lead = {
    ...leadRow,
    stage: leadRow.stage_id ? (stageNames.get(leadRow.stage_id) ?? null) : null,
  };

  const [researchRes, draftsRes] = await Promise.all([
    admin
      .from("lit_agent_lead_research")
      .select("id, brief_json, fit_score, confidence, recommended_channel, recommended_cta, risk_flags, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("lit_agent_drafts")
      .select(
        "id, channel, subject, body, angle, confidence, status, requires_approval, contact_json, stage, intent, template_key, created_at, edited_subject, edited_body",
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (researchRes.error) throw new Error(`lead_detail research read failed: ${researchRes.error.message}`);
  if (draftsRes.error) throw new Error(`lead_detail drafts read failed: ${draftsRes.error.message}`);

  return {
    ok: true,
    lead,
    research: researchRes.data ?? null,
    drafts: draftsRes.data ?? [],
  };
}

const ALLOWED_MODES = ["copilot", "assisted", "autonomous"];

async function actionSetConfig(
  admin: SupabaseClient,
  agentName: string,
  patch: Record<string, unknown>,
  userId: string,
) {
  const config = await loadAgentConfig(admin, agentName);
  if (!config) return { ok: false, error: "agent not found" };

  const clean: Record<string, unknown> = {};
  // Sending sub-object patches (config.sending.dryRun / .paused) are collected
  // separately so they MERGE into the existing config.sending object rather than
  // clobbering the daily/hourly limits already stored there.
  const sendingPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key === "enabled") {
      if (typeof value !== "boolean") return { ok: false, error: "enabled must be a boolean" };
      clean.enabled = value;
    } else if (key === "mode") {
      if (typeof value !== "string" || !ALLOWED_MODES.includes(value)) {
        return { ok: false, error: `mode must be one of ${ALLOWED_MODES.join("|")}` };
      }
      clean.mode = value;
    } else if (key === "testMode") {
      if (typeof value !== "boolean") return { ok: false, error: "testMode must be a boolean" };
      clean.testMode = value;
    } else if (key === "sendingDryRun") {
      if (typeof value !== "boolean") return { ok: false, error: "sendingDryRun must be a boolean" };
      sendingPatch.dryRun = value;
    } else if (key === "sendingPaused") {
      if (typeof value !== "boolean") return { ok: false, error: "sendingPaused must be a boolean" };
      sendingPatch.paused = value;
    } else {
      return { ok: false, error: `unknown config key: ${key}` };
    }
  }
  if (Object.keys(clean).length === 0 && Object.keys(sendingPatch).length === 0) {
    return { ok: false, error: "no valid config keys in patch" };
  }

  const merged = { ...(config as Cfg), ...clean };
  // Merge sending flags into the EXISTING config.sending object (preserving
  // emailDailyLimit / hourlyLimit / etc.). Only touched when a sending key is set.
  if (Object.keys(sendingPatch).length > 0) {
    const existingSending = (config as Cfg).sending;
    merged.sending = {
      ...(existingSending && typeof existingSending === "object" ? existingSending : {}),
      ...sendingPatch,
    };
  }
  const { error } = await admin
    .from("lit_agent_config")
    .update({ config: merged, updated_by: userId })
    .eq("agent_name", agentName);
  if (error) throw new Error(`set_config update failed: ${error.message}`);
  return { ok: true, config: merged };
}

async function actionSetFlag(admin: SupabaseClient, agentName: string, enabled: boolean) {
  const config = await loadAgentConfig(admin, agentName);
  const profile = (config?.profile ?? null) as Record<string, unknown> | null;
  const flagKey = flagKeyFor(agentName, profile);
  // enabled=true  => global_kill=false (agent may run)
  // enabled=false => global_kill=true  (killed)
  const { error } = await admin
    .from("lit_feature_flags")
    .update({ global_kill: !enabled })
    .eq("key", flagKey);
  if (error) throw new Error(`set_flag update failed: ${error.message}`);
  const flag_enabled = await isAgentFlagEnabled(admin, flagKey);
  return { ok: true, flag_enabled };
}

// ─── send_test_email — one-click end-to-end send verification ────────────────
// Creates an APPROVED test draft, then invokes harvey-email-dispatch
// server-to-server. This honors ALL dispatch gates (flag/enabled/paused/quiet
// hours/dryRun/suppression/cap) — it does NOT bypass them. If Harvey is disabled
// or in dry-run, the dispatch response tells us so and nothing sends.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function actionSendTestEmail(
  admin: SupabaseClient,
  agentName: string,
  to: string,
  adminUserId: string,
) {
  const recipient = (to || "").trim().toLowerCase();
  if (!recipient || !EMAIL_RE.test(recipient)) {
    return { ok: false, error: "a valid 'to' email address is required" };
  }
  const agent = agentName || "harvey";

  // 1. Create the approved test draft via the service-role client.
  const body =
    `Hi there,\n\n` +
    `This is a test message from Harvey to confirm outbound email is wired up ` +
    `end-to-end. If you're reading this in your inbox, live sending works.\n\n` +
    `Harvey / Logistics Intel`;
  const { data: draftRow, error: draftErr } = await admin
    .from("lit_agent_drafts")
    .insert({
      agent_name: agent,
      channel: "email",
      status: "approved",
      requires_approval: false,
      subject: "Harvey test — Logistics Intel",
      body,
      contact_json: { email: recipient, firstName: "there" },
      stage: "test",
      intent: "test_send",
      metadata_json: { test_send: true, created_by: adminUserId },
      created_by: adminUserId,
    })
    .select("id")
    .single();
  if (draftErr) throw new Error(`test draft insert failed: ${draftErr.message}`);
  const draftId = (draftRow as { id: string }).id;

  // 2. Invoke harvey-email-dispatch (same header pattern as run_now/generate_draft:
  //    Authorization Bearer service role + apikey + X-Internal-Cron). trigger_type
  //    'manual' so quiet hours are exempt but every other gate still applies.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured", draft_id: draftId };

  const url = `${supabaseUrl}/functions/v1/harvey-email-dispatch`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // Gateway needs a valid apikey/JWT to route BEFORE the target's cron check.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({ trigger_type: "manual" }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `dispatch unreachable: ${String((err as Error)?.message ?? err)}`,
      draft_id: draftId,
    };
  }
  if (res.status === 404) return { ok: false, error: "no dispatcher", draft_id: draftId };
  const dispatch = await res.json().catch(() => ({ raw: "non-JSON dispatch response" }));
  // Relay the dispatch response verbatim so the UI can distinguish
  // sent (dispatch.sent>=1) vs dry_run vs a top-level skip reason.
  return { ok: true, dispatch, draft_id: draftId };
}

// ─── Trial-Nurture actions (Project Harvey lifecycle) ────────────────────────
// list_trials -> per-stage segment counts + a page of not-upgraded trial users
//                (from lit_lifecycle_user_stages), decorated with names, whether
//                they've already been nurtured for their CURRENT stage, and how
//                many lifecycle drafts already exist for them.
// run_nurture -> server-to-server invoke of harvey-nurture (which drafts trial-
//                nurture emails into lit_agent_drafts). Same internal-cron header
//                pattern as run_now / send_test_email.

type LifecycleStageRow = {
  user_id: string;
  email: string | null;
  stage: string;
  event_type: string | null;
  current_plan: string | null;
  activity_count_30d: number | null;
  last_active_at: string | null;
  trial_started_at: string | null;
};

/** list_trials — segments (from lit_admin_lifecycle_segments()) + up to 50
 *  not-upgraded users from lit_lifecycle_user_stages with name / nurtured /
 *  draft_count decorations, plus rollup totals. Service-role reads throughout
 *  (the stage view + lifecycle sends table are service-role only). */
async function actionListTrials(admin: SupabaseClient) {
  // Per-stage segment counts. The RPC is is_platform_admin()-gated internally,
  // and we call it with the service-role client (which bypasses that check via
  // SECURITY DEFINER's caller). If it errors, fall back to a group-by so the
  // tab still renders counts.
  let segments: Array<{
    stage: string; event_type: string | null; total: number;
    eligible: number; already_nudged: number; suppressed: number;
  }> = [];
  const segRes = await admin.rpc("lit_admin_lifecycle_segments");
  if (!segRes.error && Array.isArray(segRes.data)) {
    segments = (segRes.data as any[]).map((r) => ({
      stage: r.stage,
      event_type: r.event_type ?? null,
      total: Number(r.total ?? 0),
      eligible: Number(r.eligible ?? 0),
      already_nudged: Number(r.already_nudged ?? 0),
      suppressed: Number(r.suppressed ?? 0),
    }));
  }

  // The not-upgraded user page (view already excludes converted-paid users).
  const { data: stageData, error: stageErr } = await admin
    .from("lit_lifecycle_user_stages")
    .select("user_id, email, stage, event_type, current_plan, activity_count_30d, last_active_at, trial_started_at")
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (stageErr) throw new Error(`lit_lifecycle_user_stages read failed: ${stageErr.message}`);
  const stageRows = (stageData ?? []) as LifecycleStageRow[];

  // If the segments RPC failed, derive counts from a broader group-by over the
  // view (best-effort; unbounded-ish but the view is small).
  if (segments.length === 0) {
    const { data: allRows } = await admin
      .from("lit_lifecycle_user_stages")
      .select("stage, event_type");
    const byStage = new Map<string, { event_type: string | null; total: number }>();
    for (const r of (allRows ?? []) as Array<{ stage: string; event_type: string | null }>) {
      const cur = byStage.get(r.stage) ?? { event_type: r.event_type ?? null, total: 0 };
      cur.total += 1;
      byStage.set(r.stage, cur);
    }
    segments = [...byStage.entries()]
      .map(([stage, v]) => ({ stage, event_type: v.event_type, total: v.total, eligible: 0, already_nudged: 0, suppressed: 0 }))
      .sort((a, b) => a.stage.localeCompare(b.stage));
  }

  const userIds = stageRows.map((r) => r.user_id);

  // Names (profiles), nurtured flags (lit_lifecycle_sends for this stage,
  // campaign 'lifecycle'), and lifecycle draft counts — all scoped to the page.
  const nameById = new Map<string, string | null>();
  const nurturedByUserStage = new Set<string>();       // key: `${user_id}|${stage}`
  const draftCountByUser = new Map<string, number>();

  if (userIds.length > 0) {
    const [profilesRes, sendsRes, draftsRes] = await Promise.all([
      admin.from("profiles").select("id, full_name").in("id", userIds),
      admin.from("lit_lifecycle_sends").select("user_id, stage").in("user_id", userIds).eq("campaign", "lifecycle"),
      // Lifecycle drafts carry metadata_json.lifecycle.user_id; filter by the
      // JSON path so we count only nurture drafts for these users.
      admin.from("lit_agent_drafts").select("metadata_json").in("metadata_json->lifecycle->>user_id", userIds),
    ]);
    for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? null);
    }
    for (const s of (sendsRes.data ?? []) as Array<{ user_id: string; stage: string }>) {
      nurturedByUserStage.add(`${s.user_id}|${s.stage}`);
    }
    for (const d of (draftsRes.data ?? []) as Array<{ metadata_json: Record<string, unknown> | null }>) {
      const lc = (d.metadata_json?.lifecycle ?? null) as Record<string, unknown> | null;
      const uid = lc && typeof lc.user_id === "string" ? lc.user_id : null;
      if (uid) draftCountByUser.set(uid, (draftCountByUser.get(uid) ?? 0) + 1);
    }
  }

  const users = stageRows.map((r) => ({
    user_id: r.user_id,
    email: r.email,
    full_name: nameById.get(r.user_id) ?? null,
    stage: r.stage,
    event_type: r.event_type,
    current_plan: r.current_plan,
    activity_count_30d: r.activity_count_30d ?? 0,
    last_active_at: r.last_active_at,
    trial_started_at: r.trial_started_at,
    nurtured: nurturedByUserStage.has(`${r.user_id}|${r.stage}`),
    draft_count: draftCountByUser.get(r.user_id) ?? 0,
  }));

  const total_not_upgraded = segments.reduce((s, seg) => s + seg.total, 0);
  const nurtured = segments.reduce((s, seg) => s + seg.already_nudged, 0);
  const pending_drafts = [...draftCountByUser.values()].reduce((s, n) => s + n, 0);

  return {
    ok: true,
    segments,
    users,
    totals: { total_not_upgraded, nurtured, pending_drafts },
  };
}

/** run_nurture — server-to-server invoke of harvey-nurture so it drafts trial-
 *  nurture emails. Same internal-cron header pattern as run_now. */
async function actionRunNurture(agentName: string, limit: number | undefined, adminUserId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/harvey-nurture`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // Gateway needs a valid apikey/JWT to route BEFORE the target's cron check.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({
        agent_name: agentName || "harvey",
        trigger_type: "manual",
        ...(Number.isFinite(limit) && (limit as number) > 0 ? { limit } : {}),
        created_by: adminUserId,
      }),
    });
  } catch (err) {
    return { ok: false, error: `nurture unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.status === 404) return { ok: false, error: "no nurture engine" };
  const n = await res.json().catch(() => ({ raw: "non-JSON nurture response" }));
  if (!res.ok || (n && n.ok === false)) {
    const errMsg = (n && typeof n.error === "string") ? n.error : `nurture HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return {
    ok: true,
    run_id: n.run_id ?? null,
    drafted: n.drafted ?? 0,
    candidates: n.candidates ?? 0,
    skipped: n.skipped ?? 0,
    by_stage: n.by_stage ?? {},
  };
}

// ─── Conversations / Inbox actions (Project Harvey Batch 8) ──────────────────
// list_conversations -> service-role read of lit_agent_inbound (Harvey's reply
//                       audit ledger), newest first, decorated with who replied
//                       (from lit_admin_leads by lead_id) and, when the row
//                       drafted a reply, the reply draft from lit_agent_drafts.
// run_replies        -> server-to-server invoke of harvey-reply so Harvey scans
//                       his synced inbox, classifies replies, and drafts/escalates/
//                       suppresses. Same internal-cron header pattern as run_now.

type InboundRow = {
  id: string;
  channel: string | null;
  from_email: string | null;
  lead_id: string | null;
  intent: string | null;
  action: string | null;
  classification_json: Record<string, unknown> | null;
  draft_id: string | null;
  created_at: string | null;
};

type ReplyDraftRow = {
  id: string;
  channel: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  requires_approval: boolean | null;
  edited_subject: string | null;
  edited_body: string | null;
};

/** list_conversations — Harvey's inbound reply ledger, newest first (cap 100),
 *  enriched with the lead who replied and the reply draft (when one exists). */
async function actionListConversations(admin: SupabaseClient, agentName: string, limit: number) {
  const agent = agentName || "harvey";
  const capped = Math.min(Math.max(1, limit || 50), 100);

  const { data, error } = await admin
    .from("lit_agent_inbound")
    .select(
      "id, channel, from_email, lead_id, intent, action, classification_json, draft_id, created_at",
    )
    .eq("agent_name", agent)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new Error(`list_conversations read failed: ${error.message}`);
  const rows = (data ?? []) as InboundRow[];

  // Enrich: who replied (lit_admin_leads by lead_id) + the reply draft (by draft_id).
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v))];
  const draftIds = [...new Set(rows.map((r) => r.draft_id).filter((v): v is string => !!v))];

  const leadById = new Map<string, { full_name: string | null; company_name: string | null; email: string | null }>();
  const draftById = new Map<string, ReplyDraftRow>();

  const [leadsRes, draftsRes] = await Promise.all([
    leadIds.length
      ? admin.from("lit_admin_leads").select("id, full_name, company_name, email").in("id", leadIds)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    draftIds.length
      ? admin
          .from("lit_agent_drafts")
          .select("id, channel, subject, body, status, requires_approval, edited_subject, edited_body")
          .in("id", draftIds)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
  ]);
  if ((leadsRes as { error: { message: string } | null }).error) {
    throw new Error(`list_conversations leads read failed: ${(leadsRes as { error: { message: string } }).error.message}`);
  }
  if ((draftsRes as { error: { message: string } | null }).error) {
    throw new Error(`list_conversations drafts read failed: ${(draftsRes as { error: { message: string } }).error.message}`);
  }
  for (const l of (leadsRes.data ?? []) as Array<{ id: string; full_name: string | null; company_name: string | null; email: string | null }>) {
    if (l.id) leadById.set(l.id, { full_name: l.full_name ?? null, company_name: l.company_name ?? null, email: l.email ?? null });
  }
  for (const d of (draftsRes.data ?? []) as ReplyDraftRow[]) {
    if (d.id) draftById.set(d.id, d);
  }

  const counts = {
    total: rows.length,
    escalated: 0,
    drafted: 0,
    suppressed: 0,
    auto_replied: 0,
    needs_review: 0,
  };

  const conversations = rows.map((r) => {
    const cls = (r.classification_json ?? {}) as Record<string, unknown>;
    const lead = r.lead_id ? leadById.get(r.lead_id) ?? null : null;
    const draftRow = r.draft_id ? draftById.get(r.draft_id) ?? null : null;

    if (r.action === "escalated") counts.escalated += 1;
    else if (r.action === "drafted") counts.drafted += 1;
    else if (r.action === "suppressed") counts.suppressed += 1;
    else if (r.action === "auto_replied") counts.auto_replied += 1;
    if (draftRow && draftRow.status === "pending_approval") counts.needs_review += 1;

    return {
      id: r.id,
      channel: r.channel ?? "email",
      from_email: r.from_email ?? null,
      from_name: (lead?.full_name && lead.full_name.trim()) ? lead.full_name : (r.from_email ?? "Unknown"),
      company_name: lead?.company_name ?? null,
      lead_id: r.lead_id ?? null,
      intent: r.intent ?? (typeof cls.intent === "string" ? cls.intent : null),
      action: r.action ?? null,
      sentiment: typeof cls.sentiment === "string" ? cls.sentiment : null,
      confidence: typeof cls.confidence === "number" ? cls.confidence : null,
      urgency: typeof cls.urgency === "string" ? cls.urgency : null,
      created_at: r.created_at ?? null,
      draft: draftRow
        ? {
            id: draftRow.id,
            channel: draftRow.channel ?? "email",
            subject: draftRow.subject ?? null,
            body: draftRow.body ?? "",
            status: draftRow.status ?? "pending_approval",
            requires_approval: draftRow.requires_approval ?? true,
            edited_subject: draftRow.edited_subject ?? null,
            edited_body: draftRow.edited_body ?? null,
          }
        : null,
    };
  });

  return { ok: true, conversations, counts };
}

/** run_replies — server-to-server invoke of harvey-reply so it scans the synced
 *  inbox and classifies/drafts/escalates/suppresses. Same internal-cron header
 *  pattern as run_now / run_nurture. */
async function actionRunReplies(agentName: string, limit: number | undefined, adminUserId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("LIT_CRON_SECRET");
  const gatewayKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
  if (!cronSecret) return { ok: false, error: "LIT_CRON_SECRET not configured" };

  const url = `${supabaseUrl}/functions/v1/harvey-reply`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Cron": cronSecret,
        // Gateway needs a valid apikey/JWT to route BEFORE the target's cron check.
        "Authorization": `Bearer ${gatewayKey}`,
        "apikey": gatewayKey,
      },
      body: JSON.stringify({
        agent_name: agentName || "harvey",
        trigger_type: "manual",
        ...(Number.isFinite(limit) && (limit as number) > 0 ? { limit } : {}),
        created_by: adminUserId,
      }),
    });
  } catch (err) {
    return { ok: false, error: `reply engine unreachable: ${String((err as Error)?.message ?? err)}` };
  }
  if (res.status === 404) return { ok: false, error: "no reply engine" };
  const r = await res.json().catch(() => ({ raw: "non-JSON reply response" }));
  if (!res.ok || (r && r.ok === false)) {
    const errMsg = (r && typeof r.error === "string") ? r.error : `reply HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return {
    ok: true,
    run_id: r.run_id ?? null,
    scanned: r.scanned ?? 0,
    drafted: r.drafted ?? 0,
    escalated: r.escalated ?? 0,
    suppressed: r.suppressed ?? 0,
    auto_replied: r.auto_replied ?? 0,
    ignored: r.ignored ?? 0,
  };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(FN_NAME, { request_id: rid });

  // ── auth: platform-admin ONLY (server-side security boundary) ─────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    log.error("server_misconfigured", { err: "missing Supabase env" });
    return json({ ok: false, error: "server_misconfigured", request_id: rid }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    log.warn("unauthorized", { err: authError?.message });
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const { data: adminRow, error: adminErr } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminErr) {
    log.error("admin_lookup_failed", { err: adminErr.message, user_id: user.id });
    return json({ ok: false, error: "internal_error", request_id: rid }, 500);
  }
  if (!adminRow) {
    log.warn("forbidden_not_platform_admin", { user_id: user.id });
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // ── parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const action = typeof body.action === "string" ? body.action : "";
  const agentName = typeof body.agent_name === "string" ? body.agent_name.trim() : "";

  try {
    switch (action) {
      case "list": {
        log.info("action", { action, user_id: user.id });
        return json(await actionList(admin));
      }
      case "detail": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionDetail(admin, agentName));
      }
      case "chat": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) return json({ ok: false, error: "message required" }, 400);
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionChat(admin, agentName, message, user.id, log));
      }
      case "chat_history": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const limit = typeof body.limit === "number" ? body.limit : 50;
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionChatHistory(admin, agentName, limit));
      }
      case "assign_task": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return json({ ok: false, error: "title required" }, 400);
        const instructions = typeof body.instructions === "string" ? body.instructions : null;
        const priority = typeof body.priority === "number" ? body.priority : 0;
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionAssignTask(admin, agentName, title, instructions, priority, user.id));
      }
      case "list_tasks": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const status = typeof body.status === "string" ? body.status : null;
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionListTasks(admin, agentName, status));
      }
      case "update_task": {
        const taskId = typeof body.task_id === "string" ? body.task_id : "";
        const status = typeof body.status === "string" ? body.status : "";
        if (!taskId) return json({ ok: false, error: "task_id required" }, 400);
        if (!status) return json({ ok: false, error: "status required" }, 400);
        log.info("action", { action, task_id: taskId, user_id: user.id });
        return json(await actionUpdateTask(admin, taskId, status));
      }
      case "run_now": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionRunNow(agentName));
      }
      case "set_config": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const patch = (body.patch && typeof body.patch === "object")
          ? body.patch as Record<string, unknown>
          : null;
        if (!patch) return json({ ok: false, error: "patch object required" }, 400);
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionSetConfig(admin, agentName, patch, user.id));
      }
      case "set_flag": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        if (typeof body.enabled !== "boolean") return json({ ok: false, error: "enabled boolean required" }, 400);
        log.info("action", { action, agent_name: agentName, user_id: user.id, enabled: body.enabled });
        return json(await actionSetFlag(admin, agentName, body.enabled));
      }
      case "send_test_email": {
        const to = typeof body.to === "string" ? body.to : "";
        if (!to) return json({ ok: false, error: "to required" }, 400);
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionSendTestEmail(admin, agentName, to, user.id));
      }
      case "run_prospect": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const rawTarget = (body.target && typeof body.target === "object")
          ? body.target as Record<string, unknown>
          : {};
        const count = Number(rawTarget.count);
        const keywords = Array.isArray(rawTarget.keywords)
          ? rawTarget.keywords.map((k) => String(k ?? "").trim()).filter(Boolean)
          : undefined;
        const location = typeof rawTarget.location === "string" ? rawTarget.location.trim() : undefined;
        const target = {
          ...(Number.isFinite(count) && count > 0 ? { count } : {}),
          ...(keywords && keywords.length ? { keywords } : {}),
          ...(location ? { location } : {}),
        };
        log.info("action", { action, agent_name: agentName, user_id: user.id });
        return json(await actionRunProspect(agentName, target, authHeader, user.id));
      }
      case "run_research": {
        if (!agentName) return json({ ok: false, error: "agent_name required" }, 400);
        const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
        if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);
        log.info("action", { action, agent_name: agentName, lead_id: leadId, user_id: user.id });
        return json(await actionRunResearch(agentName, leadId, user.id));
      }
      case "list_leads": {
        const limit = typeof body.limit === "number" ? body.limit : 25;
        const stage = typeof body.stage === "string" && body.stage ? body.stage : null;
        const status = typeof body.status === "string" && body.status ? body.status : null;
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionListLeads(admin, agentName || "harvey", limit, stage, status));
      }
      case "lead_detail": {
        const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
        if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);
        log.info("action", { action, lead_id: leadId, user_id: user.id });
        return json(await actionLeadDetail(admin, leadId));
      }
      case "generate_draft": {
        const channel = typeof body.channel === "string" ? body.channel.trim() : "";
        if (channel !== "email" && channel !== "linkedin") {
          return json({ ok: false, error: "channel must be 'email' or 'linkedin'" }, 400);
        }
        const stage = typeof body.stage === "string" ? body.stage : null;
        const intent = typeof body.intent === "string" ? body.intent : null;
        const leadId = typeof body.lead_id === "string" ? body.lead_id : null;
        const contact = (body.contact && typeof body.contact === "object")
          ? body.contact as WriterContact
          : {};
        const instructions = typeof body.instructions === "string" ? body.instructions : null;
        log.info("action", { action, agent_name: agentName || "harvey", channel, user_id: user.id });
        return json(await actionGenerateDraft(
          agentName || "harvey", channel, stage, intent, leadId, contact, instructions, user.id,
        ));
      }
      case "list_drafts": {
        const status = typeof body.status === "string" ? body.status : null;
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionListDrafts(admin, agentName, status));
      }
      case "update_draft": {
        const draftId = typeof body.draft_id === "string" ? body.draft_id : "";
        const status = typeof body.status === "string" ? body.status : "";
        if (!draftId) return json({ ok: false, error: "draft_id required" }, 400);
        if (!status) return json({ ok: false, error: "status required" }, 400);
        const subject = typeof body.subject === "string" ? body.subject : null;
        const draftBody = typeof body.body === "string" ? body.body : null;
        log.info("action", { action, draft_id: draftId, status, user_id: user.id });
        return json(await actionUpdateDraft(admin, draftId, status, subject, draftBody, user.id));
      }
      case "list_trials": {
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionListTrials(admin));
      }
      case "run_nurture": {
        const limit = typeof body.limit === "number" ? body.limit : undefined;
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionRunNurture(agentName || "harvey", limit, user.id));
      }
      case "list_conversations": {
        const limit = typeof body.limit === "number" ? body.limit : 50;
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionListConversations(admin, agentName || "harvey", limit));
      }
      case "run_replies": {
        const limit = typeof body.limit === "number" ? body.limit : undefined;
        log.info("action", { action, agent_name: agentName || "harvey", user_id: user.id });
        return json(await actionRunReplies(agentName || "harvey", limit, user.id));
      }
      default:
        return json({ ok: false, error: `unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("action_failed", { action, agent_name: agentName, err: message, user_id: user.id });
    return json({ ok: false, error: "internal_error", request_id: rid }, 500);
  }
});
