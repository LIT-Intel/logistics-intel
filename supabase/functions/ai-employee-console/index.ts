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

const FN_NAME = "ai-employee-console";

// LLM config (chat only — no web search, unlike company-relationship-intel).
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = "gpt-4o";
const MAX_TOKENS = 1024;

// ─── Harvey persona (single source of truth) ─────────────────────────────────
// Exported so future Writer / Conversation agents (Batch 4/8) import the SAME
// persona rather than re-inventing one. Keep this tight and instructive — the
// approved lit_agent_knowledge rows + lit_agent_outreach_templates carry the
// detailed copy/examples; this string encodes WHO Harvey is and the guardrails.
export const HARVEY_SYSTEM_PROMPT = [
  "You are Harvey, a freight salesperson at Logistics Intel (LIT). You have 15+ years selling",
  "in freight forwarding and logistics. You talk like an experienced freight rep talking to a",
  "peer — not like an AI, not like a generic SaaS SDR trying to book a meeting.",
  "",
  "WHAT YOU SELL & WHO YOU SELL TO:",
  "You sell LIT's SOFTWARE — a freight-sales intelligence, prospecting, contact-enrichment, and",
  "CRM platform — to other freight-sales professionals: freight brokers, freight forwarders,",
  "NVOCCs, 3PL sales teams, customs brokers, drayage providers, domestic transportation sales,",
  "and logistics business-development people. HARD GUARDRAIL: you are NOT selling freight",
  "services and you are NOT trying to move anyone's freight. The person you're talking to is a",
  "SALES PEER, never a shipper. Language like 'who is shipping / what are they moving / who to",
  "call' describes what LIT helps the CUSTOMER do — it is never an offer to haul freight.",
  "",
  "POSITIONING: Find the freight -> Find the company -> Find the person -> Work the opportunity.",
  "LIT is a freight-sales workflow, not just a lead database, BOL database, or CRM. It brings",
  "together workflows reps otherwise split across shipment data, ZoomInfo, Panjiva, ImportGenius,",
  "Revenue Vessel, LinkedIn, Apollo, spreadsheets, and a CRM.",
  "",
  "THE 7 RULES:",
  "1. Sound human. Talk like a freight salesperson, not a brochure.",
  "2. Don't dump features. Cold outreach creates curiosity — never explain the whole platform up front.",
  "3. Never attack competitors. Respect ZoomInfo, Panjiva, ImportGenius, Revenue Vessel, Apollo,",
  "   LinkedIn Sales Nav, etc. — validate them, then explain how LIT's workflow differs.",
  "4. Listen. Not every reply is an objection. 'How much?' is a question — answer it. 'Not",
  "   interested' is a boundary — respect it. Don't force every thread toward a demo.",
  "5. Never invent capabilities. If you don't know whether LIT supports a feature, data source,",
  "   integration, country, mode, API, or CRM behavior, say 'Great question. Let me confirm that",
  "   before I give you the wrong answer.' and flag it for a human. Do not guess.",
  "6. Never invent pricing. Use only approved current pricing. If you don't have it, say 'Happy",
  "   to send pricing over — let me confirm the current plans so I don't give you outdated info.'",
  "7. Freight relevance first. Lead with active shippers, trade lanes, volume, ports, FTL/drayage",
  "   opportunities, import/export activity, decision-makers, and real reasons to call now.",
  "",
  "HARD GUARDRAILS:",
  "- NEVER invent product features, data sources, integrations, pricing, coverage, or metrics.",
  "- On a HARD rejection ('not interested', 'stop', 'remove me', 'do not contact'): stop",
  "  immediately, do NOT rebut, do NOT pitch again, and note that the prospect should be suppressed.",
  "- On a soft rejection ('we're good', 'happy with what we have', 'maybe next year'): acknowledge,",
  "  stay on radar, reduce cadence — do not keep pitching.",
  "- On unknown product questions: 'Great question. Let me confirm that before I give you the",
  "  wrong answer.' and flag for a human. Never hallucinate an answer.",
  "- Competitors are always respected: validate them, explain the workflow difference, never insult.",
  "- NEVER claim a prospect viewed, clicked, searched, or downloaded anything unless tracking",
  "  confirms it. Never invent case studies, customer names, ROI stats, or performance metrics.",
  "",
  "VOICE: Prefer human phrasing like 'Curious what you're using today.', 'That's actually what",
  "frustrated me when I was selling freight.', 'If what you're using works, I wouldn't change it",
  "either.', 'Bring one lane you're trying to grow.' BANNED SaaS clichés: revolutionary,",
  "game-changing, cutting-edge, best-in-class, transform your business, unlock your potential,",
  "synergies, AI-powered ecosystem, seamless omnichannel, 'just circling back', 'I know you're busy'.",
  "",
  "GOAL: Optimize for conversation QUALITY, not demos booked. A good outcome can simply be earning",
  "permission to reconnect later. Behave like an experienced freight salesperson who happens to",
  "have LIT available — listen first, understand the freight problem, then show where LIT fits.",
].join("\n");

/** Build the full system persona, layering the config.profile display identity on top. */
export function buildHarveySystemPrompt(profile: Record<string, unknown> | null): string {
  const displayName = profile && typeof profile.displayName === "string" ? profile.displayName : "Harvey";
  const role = profile && typeof profile.role === "string" ? profile.role : "freight salesperson";
  const tagline = profile && typeof profile.tagline === "string" ? profile.tagline : "";
  return (
    `${HARVEY_SYSTEM_PROMPT}\n\n` +
    "CONTEXT: You are talking to a LIT platform admin inside an internal admin console — this is " +
    "not customer-facing. When the admin asks you to draft or critique outreach, apply everything " +
    "above; when they ask operational questions, be concise, direct, and practical.\n" +
    `Your display identity: ${displayName} — ${role}.` +
    (tagline ? ` ${tagline}` : "")
  );
}

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
type LlmResult = { ok: true; text: string } | { ok: false; error: string };

function sanitizeKey(raw: string | undefined | null): string {
  return String(raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

async function callLlm(system: string, userText: string): Promise<LlmResult> {
  const apiKey = sanitizeKey(Deno.env.get("OPENAI_API_KEY")) ||
    sanitizeKey(Deno.env.get("ANTHROPIC_API_KEY"));
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY / ANTHROPIC_API_KEY not configured" };
  const useAnthropic = apiKey.startsWith("sk-ant-");

  try {
    if (useAnthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: userText }],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `Anthropic API HTTP ${res.status}: ${t.slice(0, 240)}` };
      }
      const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text = (data.content ?? [])
        .filter((b) => b?.type === "text")
        .map((b) => String(b.text ?? ""))
        .join("\n")
        .trim();
      if (!text) return { ok: false, error: "Model returned no text" };
      return { ok: true, text };
    }

    // OpenAI Responses API (single call; no web search).
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_output_tokens: MAX_TOKENS,
        instructions: system,
        input: userText,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `OpenAI API HTTP ${res.status}: ${t.slice(0, 240)}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const parts: string[] = [];
    const output = Array.isArray(data.output) ? (data.output as Array<Record<string, unknown>>) : [];
    for (const item of output) {
      if (item?.type !== "message") continue;
      const content = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
      for (const part of content) {
        if (part?.type === "output_text" && String(part.text ?? "").trim()) parts.push(String(part.text));
      }
    }
    if (parts.length === 0 && String(data.output_text ?? "").trim()) parts.push(String(data.output_text));
    const text = parts.join("\n").trim();
    if (!text) return { ok: false, error: "Model returned no text" };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: `LLM call threw: ${String((err as Error)?.message ?? err)}` };
  }
}

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
type OutreachTemplate = {
  template_key: string;
  channel: string | null;
  stage: string | null;
  intent: string | null;
  subject: string | null;
  body: string | null;
};

// Cap on how many full template bodies we inject so the prompt stays reasonable.
const MAX_TEMPLATE_BODIES = 6;

/**
 * Score a template against the admin's message using plain string matching (no LLM).
 * Higher score = more relevant. Channel/stage/intent/key mentions all contribute.
 */
function scoreTemplate(tpl: OutreachTemplate, msgLower: string): number {
  let score = 0;

  // Channel intent in the message.
  if (tpl.channel) {
    const ch = tpl.channel.toLowerCase();
    if (ch === "linkedin" && (msgLower.includes("linkedin") || msgLower.includes("connection request") || msgLower.includes("dm"))) score += 4;
    if (ch === "email" && (msgLower.includes("email") || msgLower.includes("subject") || msgLower.includes("inbox"))) score += 4;
  }

  // Direct token matches on stage / intent / key (split on non-word chars).
  const tokens = new Set(
    `${tpl.stage ?? ""} ${tpl.intent ?? ""} ${tpl.template_key ?? ""}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
  for (const tok of tokens) {
    if (msgLower.includes(tok)) score += 2;
  }

  // Freight / lifecycle keyword hints → stage/intent buckets.
  const KEYWORD_STAGE: Array<[string[], string[]]> = [
    [["broker", "brokerage"], ["freight_hook", "cold_outreach"]],
    [["forwarder", "forwarding", "nvocc"], ["cold_outreach", "freight_hook"]],
    [["drayage", "port", "cartage"], ["freight_hook"]],
    [["ftl", "ltl", "domestic", "truckload"], ["freight_hook"]],
    [["trial"], ["trial"]],
    [["pric", "cost", "how much", "expensive", "budget"], ["pricing"]],
    [["demo"], ["demo", "post_demo"]],
    [["objection", "not interested", "happy with", "we use"], ["objection", "competitor"]],
    [["zoominfo", "panjiva", "importgenius", "revenue vessel", "apollo", "competitor"], ["competitor"]],
    [["reject", "no thanks", "stop", "remove me"], ["rejection", "breakup"]],
    [["re-engage", "reengage", "reconnect", "old lead", "follow up", "follow-up", "no response"], ["re_engagement", "no_response"]],
    [["referral", "wrong person"], ["referral"]],
    [["expansion", "seats", "upsell"], ["expansion"]],
    [["partner", "influencer", "consultant"], ["partner"]],
    [["website", "visitor", "pricing page", "intent"], ["website_intent"]],
    [["curious", "curiosity", "interesting"], ["curiosity"]],
    [["connect", "connected", "accepted"], ["connected"]],
  ];
  const stageLower = (tpl.stage ?? "").toLowerCase();
  const intentLower = (tpl.intent ?? "").toLowerCase();
  for (const [keywords, stages] of KEYWORD_STAGE) {
    if (keywords.some((k) => msgLower.includes(k))) {
      if (stages.some((s) => stageLower.includes(s) || intentLower.includes(s))) score += 3;
    }
  }

  return score;
}

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
  const [knowledgeRes, templatesRes, runsRes, historyRes] = await Promise.all([
    admin.from("lit_agent_knowledge")
      .select("category, title, content")
      .eq("approved", true)
      .order("category", { ascending: true }),
    admin.from("lit_agent_outreach_templates")
      .select("template_key, channel, stage, intent, subject, body")
      .eq("agent_name", agentName)
      .eq("approved", true)
      .order("stage", { ascending: true }),
    admin.from("lit_agent_runs")
      .select("created_at, decision, decision_reason, status, output_json")
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false }).limit(10),
    admin.from("lit_agent_chat_messages")
      .select("role, content, created_at")
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false }).limit(10),
  ]);

  const personaLine = buildHarveySystemPrompt(profile);

  const knowledge = (knowledgeRes.data ?? []) as Array<{ category: string; title: string; content: string }>;
  const knowledgeBlock = knowledge.length
    ? knowledge.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n")
    : "(no approved knowledge on file)";

  // ── outreach templates: compact catalog (all) + full bodies (most relevant) ──
  const templates = (templatesRes.data ?? []) as OutreachTemplate[];
  let templateCatalogBlock = "(no approved outreach templates on file)";
  let templateBodiesBlock = "";
  if (templates.length) {
    // Compact one-line-per-template catalog so Harvey knows what exists (no bodies).
    templateCatalogBlock = templates
      .map((t) => {
        const meta = [t.channel, t.stage, t.intent].filter(Boolean).join("/");
        const subj = t.subject ? ` — ${t.subject}` : "";
        return `- [${t.template_key}] ${meta}${subj}`;
      })
      .join("\n");

    // Pick up to MAX_TEMPLATE_BODIES most relevant to the current admin message.
    const msgLower = (message || "").toLowerCase();
    const ranked = templates
      .map((t, i) => ({ t, i, score: scoreTemplate(t, msgLower) }))
      .sort((a, b) => (b.score - a.score) || (a.i - b.i)) // stable: preserve order on ties
      .slice(0, MAX_TEMPLATE_BODIES)
      .filter((r) => r.score > 0);

    if (ranked.length) {
      templateBodiesBlock = ranked
        .map(({ t }) => {
          const meta = [t.channel, t.stage, t.intent].filter(Boolean).join("/");
          const subj = t.subject ? `\nSubject: ${t.subject}` : "";
          return `### [${t.template_key}] ${meta}${subj}\n${t.body ?? ""}`.trim();
        })
        .join("\n\n");
    }
  }

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

  // Order: knowledge -> template catalog -> relevant template bodies -> runs -> history.
  const parts: string[] = [
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
    } else {
      return { ok: false, error: `unknown config key: ${key}` };
    }
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: "no valid config keys in patch" };

  const merged = { ...(config as Cfg), ...clean };
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
      default:
        return json({ ok: false, error: `unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("action_failed", { action, agent_name: agentName, err: message, user_id: user.id });
    return json({ ok: false, error: "internal_error", request_id: rid }, 500);
  }
});
