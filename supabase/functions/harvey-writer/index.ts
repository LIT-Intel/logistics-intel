// harvey-writer — Project Harvey Batch 4 (WRITER).
//
// The internal-only agent that produces on-voice outreach DRAFTS for Harvey.
// It NEVER sends anything — sending is a later batch. It calls the dual-vendor
// LLM with Harvey's persona + approved knowledge + the most relevant approved
// outreach templates as few-shot voice examples, requires a structured JSON
// draft back, and persists ONE lit_agent_drafts row (status pending_approval)
// plus a lit_agent_runs audit row.
//
// INTERNAL-ONLY boundary (customers can never invoke this — mirrors
// harvey-controller's dual auth):
//   - Caller must be EITHER verified pg_cron (X-Internal-Cron header ==
//     LIT_CRON_SECRET via _shared/cron_auth.ts)
//   - OR an authenticated PLATFORM ADMIN (requireUser + isUserAdmin
//     .isPlatformAdmin). Everyone else gets 401/403.
//
// Input JSON:
//   { agent_name='harvey', channel:'email'|'linkedin', stage?, intent?,
//     lead_id?, contact:{firstName?,lastName?,company?,title?,email?,persona?},
//     research?, instructions?, created_by?, trigger_type? }
//
// Guardrails enforced in the prompt (see buildWriterUserBlock):
//   - Never invent pricing / features / metrics / integrations / coverage.
//   - Only ever use the approved calendar link (config.meeting.calendarLink),
//     and ONLY when there is genuine interest — NEVER a calendar link in a cold
//     first-touch email.
//   - LinkedIn shorter than email; freight-salesperson voice.
//   - Sell LIT software to a freight-sales PEER; never sell freight services.
//
// Response: { ok, draft_id, draft:{ channel, subject, body, angle, facts_used,
//             confidence, requires_approval, template_key } }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { handlePreflight, json, requireUser, isUserAdmin } from "../_shared/auth.ts";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";
import {
  type AgentConfig,
  completeAgentRun,
  loadAgentConfig,
  recordAgentRun,
} from "../_shared/agent.ts";
import { buildHarveySystemPrompt } from "../_shared/harvey_persona.ts";
import { callLlm, resolveLlmModel } from "../_shared/llm.ts";
import {
  fetchApprovedKnowledge,
  fetchApprovedTemplates,
  renderKnowledgeBlock,
  renderTemplateBodies,
  selectRelevantTemplates,
} from "../_shared/harvey_context.ts";

const AGENT_NAME = "harvey-writer";
const CONFIG_KEY = "harvey";

type TriggerType = "cron" | "webhook" | "manual" | "test";

type WriterContact = {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  persona?: string;
};

type WriterInput = {
  agent_name: string;
  channel: "email" | "linkedin";
  stage: string | null;
  intent: string | null;
  lead_id: string | null;
  contact: WriterContact;
  research: string | null;
  instructions: string | null;
  created_by: string | null;
};

type ParsedDraft = {
  channel: string;
  subject: string | null;
  body: string;
  angle: string | null;
  facts_used: unknown[];
  confidence: number;
  requires_approval: boolean;
};

// Categories that ALWAYS force human approval (mapped from config.approval).
// If config.approval[topic] is explicitly false, that category is de-escalated;
// any other value (true or unset) keeps it sensitive when the draft matches.
const APPROVAL_SENSITIVE = ["pricing", "enterprise", "legal", "security", "billing"];

/**
 * Whether this stage/intent touches a sensitive approval topic — pricing,
 * enterprise, legal, security, billing, or an 'unknown' stage/intent. Sensitive
 * drafts ALWAYS require human approval regardless of mode.
 */
function isSensitive(stage: string | null, intent: string | null, config: AgentConfig): boolean {
  const rawStage = (stage ?? "").trim().toLowerCase();
  const rawIntent = (intent ?? "").trim().toLowerCase();
  const hay = `${rawStage} ${rawIntent}`;
  const approval = (config.approval ?? {}) as Record<string, boolean>;

  // Missing / 'unknown' classification → treat as sensitive (fail safe).
  if (rawStage === "unknown" || rawIntent === "unknown") return true;

  for (const topic of APPROVAL_SENSITIVE) {
    if (hay.includes(topic) && approval[topic] !== false) return true;
  }
  // enterprise sometimes surfaces as "expansion"/"seats" intents.
  if ((hay.includes("expansion") || hay.includes("seats")) && approval.enterprise !== false) return true;
  return false;
}

/** Whether this draft is a cold first-touch (no prior relationship). */
function isColdFirstTouch(stage: string | null, intent: string | null): boolean {
  const hay = `${stage ?? ""} ${intent ?? ""}`.toLowerCase();
  return hay.includes("cold") || hay.includes("first") || hay.includes("first_touch") ||
    hay.includes("first-touch");
}

interface ApprovalDecision {
  requires_approval: boolean;
  mode: string;
  sensitive: boolean;
  firstTouch: boolean;
  reason: string;
}

/**
 * Mode-driven approval decision. This is the real autonomy switch:
 *
 *   • copilot     → ALWAYS requires approval (human sends everything).
 *   • assisted    → requires approval (this phase keeps humans on outbound
 *                   sends), and sensitive is of course still true.
 *   • autonomous  → auto-approved (requires_approval=false) for non-sensitive
 *                   drafts, UNLESS the draft is sensitive OR it's a cold
 *                   first-touch and config.approval.firstTouch is on.
 *
 * Sensitive ALWAYS forces requires_approval=true regardless of mode.
 */
function decideApproval(config: AgentConfig, stage: string | null, intent: string | null): ApprovalDecision {
  const mode = typeof config.mode === "string" ? config.mode : "assisted";
  const sensitive = isSensitive(stage, intent, config);
  const approval = (config.approval ?? {}) as Record<string, boolean>;
  const firstTouchGate = approval.firstTouch === true;
  const coldFirstTouch = isColdFirstTouch(stage, intent);
  const firstTouch = firstTouchGate && coldFirstTouch;

  // Sensitive always escalates — short-circuit before any mode relaxation.
  if (sensitive) {
    return {
      requires_approval: true,
      mode,
      sensitive: true,
      firstTouch,
      reason: `sensitive category (pricing/enterprise/legal/security/billing/unknown) always requires approval`,
    };
  }

  if (mode === "autonomous") {
    if (firstTouch) {
      return {
        requires_approval: true,
        mode,
        sensitive: false,
        firstTouch: true,
        reason: "autonomous but config.approval.firstTouch requires human sign-off on cold first-touch",
      };
    }
    return {
      requires_approval: false,
      mode,
      sensitive: false,
      firstTouch: false,
      reason: "autonomous mode, non-sensitive, not a gated first-touch — auto-approved",
    };
  }

  // copilot / assisted (and any unknown mode) → human approval this phase.
  return {
    requires_approval: true,
    mode,
    sensitive: false,
    firstTouch,
    reason: mode === "copilot"
      ? "copilot mode — human sends everything"
      : "assisted mode — human approves outbound sends this phase",
  };
}

/** Strip ```json fences / prose and parse the first JSON object found. */
function parseDraftJson(raw: string): ParsedDraft | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip a leading/trailing code fence if present.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  // If there's still surrounding prose, grab the outermost {...} span.
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    text = text.slice(first, last + 1);
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  if (!body) return null;
  const subjectRaw = obj.subject;
  const subject = typeof subjectRaw === "string" && subjectRaw.trim() ? subjectRaw.trim() : null;
  const confRaw = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0.5;
  return {
    channel: typeof obj.channel === "string" ? obj.channel : "",
    subject,
    body,
    angle: typeof obj.angle === "string" ? obj.angle : null,
    facts_used: Array.isArray(obj.facts_used) ? obj.facts_used : [],
    confidence,
    requires_approval: obj.requires_approval === false ? false : true,
  };
}

/** Assemble the writer's user block (grounding + contact + guardrails + JSON contract). */
function buildWriterUserBlock(params: {
  channel: string;
  stage: string | null;
  intent: string | null;
  contact: WriterContact;
  research: string | null;
  instructions: string | null;
  knowledgeBlock: string;
  templateBodiesBlock: string;
  calendarLink: string | null;
}): string {
  const {
    channel, stage, intent, contact, research, instructions,
    knowledgeBlock, templateBodiesBlock, calendarLink,
  } = params;

  const isCold = (stage ?? "").toLowerCase().includes("cold") ||
    (intent ?? "").toLowerCase().includes("cold");

  const contactLines = [
    contact.firstName ? `First name: ${contact.firstName}` : null,
    contact.lastName ? `Last name: ${contact.lastName}` : null,
    contact.company ? `Company: ${contact.company}` : null,
    contact.title ? `Title: ${contact.title}` : null,
    contact.persona ? `Persona: ${contact.persona}` : null,
  ].filter(Boolean).join("\n");

  const parts: string[] = [];

  parts.push(`APPROVED KNOWLEDGE:\n${knowledgeBlock}`);

  if (templateBodiesBlock) {
    parts.push(
      "RELEVANT APPROVED OUTREACH EXAMPLES (full body) — these define Harvey's voice for this " +
        "channel/stage. Adapt them to THIS specific prospect. NEVER paste them verbatim or reuse " +
        "the same phrasing; write something fresh in the same voice.\n\n" + templateBodiesBlock,
    );
  }

  parts.push(
    "PROSPECT (a freight-sales PEER — a broker/forwarder/3PL/drayage/NVOCC sales person, " +
      "NOT a shipper and NOT someone whose freight you are trying to move):\n" +
      (contactLines || "(no contact details provided — keep it generic but on-voice)"),
  );

  if (research && research.trim()) {
    parts.push(
      "RESEARCH FACTS (verified — you MAY reference these; do not embellish beyond them):\n" +
        research.trim(),
    );
  }

  if (instructions && instructions.trim()) {
    parts.push(`ADMIN INSTRUCTIONS FOR THIS DRAFT:\n${instructions.trim()}`);
  }

  // Guardrails specific to the writer.
  const guardrails: string[] = [
    `Channel: ${channel}.` + (channel === "linkedin"
      ? " LinkedIn — keep it SHORTER than an email; no subject line."
      : " Email — write a natural subject and a concise body."),
    stage ? `Lifecycle stage: ${stage}.` : "",
    intent ? `Intent: ${intent}.` : "",
    "NEVER invent pricing, product features, data sources, integrations, coverage, country/mode " +
      "support, customer names, case studies, ROI stats, or performance metrics. If a fact isn't in " +
      "the approved knowledge or research above, do not state it — write around it.",
    "You are selling LIT SOFTWARE to a freight-sales peer. You are NEVER selling freight services " +
      "or offering to move their freight.",
  ];

  // Calendar-link policy.
  if (calendarLink) {
    if (channel === "email" && isCold) {
      guardrails.push(
        "Do NOT include any calendar/booking link in this message — it is a cold first-touch " +
          "email. Cold outreach creates curiosity; it never asks for a meeting up front.",
      );
    } else {
      guardrails.push(
        `A booking link is available (${calendarLink}) but include it ONLY if the context shows ` +
          "GENUINE interest (e.g. they asked for a demo/time or replied positively). Never drop a " +
          "calendar link into a cold or unprompted message.",
      );
    }
  } else {
    guardrails.push(
      "No approved booking link is configured — do NOT invent or include any scheduling/calendar link.",
    );
  }

  parts.push("GUARDRAILS:\n- " + guardrails.filter(Boolean).join("\n- "));

  // Structured-output contract.
  parts.push(
    "OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose, no code fences:\n" +
      "{\n" +
      `  "channel": "${channel}",\n` +
      '  "subject": ' + (channel === "linkedin" ? "null" : '"<email subject>"') + ",\n" +
      '  "body": "<the message body>",\n' +
      '  "angle": "<one short phrase describing the angle you took>",\n' +
      '  "facts_used": ["<each concrete approved fact/research point you relied on>"],\n' +
      '  "confidence": <number 0..1>,\n' +
      '  "requires_approval": true\n' +
      "}\n" +
      "facts_used must list ONLY facts that appear in the approved knowledge or research above. " +
      "If you used none, return an empty array. Return the JSON object and nothing else.",
  );

  return parts.join("\n\n");
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  // ── parse body first so cron callers can pass trigger_type/created_by ──────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json", request_id: rid }, 400);
  }

  // ── auth: verified cron OR platform-admin — else 401/403 ───────────────────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null =
    typeof body.created_by === "string" ? body.created_by : null;

  if (req.headers.get("X-Internal-Cron")) {
    const cron = verifyCronAuth(req);
    if (!cron.ok) return cron.response;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "cron";
    triggerType = requested === "manual" || requested === "test" || requested === "webhook"
      ? requested
      : "cron";
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
    triggerType = "manual";
  }

  // ── validate input ─────────────────────────────────────────────────────────
  const channelRaw = typeof body.channel === "string" ? body.channel.trim() : "";
  if (channelRaw !== "email" && channelRaw !== "linkedin") {
    return json({ ok: false, error: "channel must be 'email' or 'linkedin'", request_id: rid }, 400);
  }
  const input: WriterInput = {
    agent_name: typeof body.agent_name === "string" && body.agent_name.trim() ? body.agent_name.trim() : "harvey",
    channel: channelRaw,
    stage: typeof body.stage === "string" ? body.stage : null,
    intent: typeof body.intent === "string" ? body.intent : null,
    lead_id: typeof body.lead_id === "string" ? body.lead_id : null,
    contact: (body.contact && typeof body.contact === "object") ? body.contact as WriterContact : {},
    research: typeof body.research === "string" ? body.research : null,
    instructions: typeof body.instructions === "string" ? body.instructions : null,
    created_by: actorUserId,
  };

  let runId: string | null = null;
  try {
    // ── config (mode, testMode, profile, meeting.calendarLink) ──────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config) {
      return json({ ok: false, error: "harvey config not found", request_id: rid }, 500);
    }
    const testMode = config.testMode === true;
    const profile = (config.profile ?? null) as Record<string, unknown> | null;
    const meeting = (config.meeting ?? null) as Record<string, unknown> | null;
    const calendarLink = meeting && typeof meeting.calendarLink === "string" && meeting.calendarLink.trim()
      ? meeting.calendarLink.trim()
      : null;

    const approvalDecision = decideApproval(config, input.stage, input.intent);
    const requiresApproval = approvalDecision.requires_approval;

    // ── open the run before the LLM call so an error still has a run id ──────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: testMode,
      input_json: {
        request_id: rid,
        actor_user_id: actorUserId,
        channel: input.channel,
        stage: input.stage,
        intent: input.intent,
        lead_id: input.lead_id,
      },
    });
    log.info("run_started", { run_id: runId, channel: input.channel, trigger_type: triggerType });

    // ── grounding: approved knowledge + relevant templates (few-shot voice) ──
    const [knowledge, templates] = await Promise.all([
      fetchApprovedKnowledge(admin),
      fetchApprovedTemplates(admin, input.agent_name),
    ]);
    const knowledgeBlock = renderKnowledgeBlock(knowledge);

    const relevanceText = [
      input.stage, input.intent, input.instructions,
      input.contact.persona, input.contact.title, input.contact.company,
    ].filter(Boolean).join(" ");
    const ranked = selectRelevantTemplates(templates, {
      channel: input.channel,
      stage: input.stage,
      intent: input.intent,
      text: relevanceText,
    });
    const topTemplateKey = ranked.length ? ranked[0].template.template_key : null;
    const templateBodiesBlock = ranked.length ? renderTemplateBodies(ranked) : "";

    // ── build prompt + call the LLM ─────────────────────────────────────────
    const system = buildHarveySystemPrompt(profile);
    const userBlock = buildWriterUserBlock({
      channel: input.channel,
      stage: input.stage,
      intent: input.intent,
      contact: input.contact,
      research: input.research,
      instructions: input.instructions,
      knowledgeBlock,
      templateBodiesBlock,
      calendarLink,
    });

    const model = resolveLlmModel();
    let llm = await callLlm(system, userBlock);
    let parsed = llm.ok ? parseDraftJson(llm.text) : null;

    // Retry once with a "return only JSON" nudge on parse failure.
    if (llm.ok && !parsed) {
      log.warn("draft_parse_failed_retrying", { run_id: runId });
      const nudge = userBlock +
        "\n\nIMPORTANT: Your previous reply could not be parsed. Return ONLY the raw JSON object " +
        "described in the OUTPUT CONTRACT — no prose, no markdown, no code fences.";
      llm = await callLlm(system, nudge);
      parsed = llm.ok ? parseDraftJson(llm.text) : null;
    }

    if (!llm.ok) {
      throw new Error(`LLM call failed: ${llm.error}`);
    }

    // Fallback: store raw text as body, confidence 0, requires_approval true.
    let usedFallback = false;
    if (!parsed) {
      usedFallback = true;
      parsed = {
        channel: input.channel,
        subject: null,
        body: llm.text.trim(),
        angle: null,
        facts_used: [],
        confidence: 0,
        requires_approval: true,
      };
      log.warn("draft_parse_failed_fallback", { run_id: runId });
    }

    // Never trust the model to relax approval; OR with the config-derived value.
    // If the config decision says approval IS required, that always wins. If the
    // config decision cleared it (autonomous, non-sensitive), still honor a model
    // that flags approval — the model may only raise the bar, never lower it.
    const finalRequiresApproval = requiresApproval || parsed.requires_approval;
    // A parse fallback is low-confidence raw text — never auto-approve it.
    const autoApproved = !finalRequiresApproval && !usedFallback;
    // pending_approval when a human must sign off; approved = auto-approved and
    // ready for the FUTURE dispatcher. NOTHING is sent here.
    const draftStatus = autoApproved ? "approved" : "pending_approval";
    // The rationale the config produced may have cleared approval that the model
    // then re-raised; capture whichever reason is truthful.
    const approvalReason = finalRequiresApproval && !requiresApproval
      ? "model raised requires_approval on an otherwise-cleared draft"
      : (usedFallback && !requiresApproval
        ? "parse fallback — low-confidence raw text held for approval"
        : approvalDecision.reason);
    // LinkedIn never carries a subject.
    const subject = input.channel === "linkedin" ? null : parsed.subject;
    const confidence = usedFallback ? 0 : parsed.confidence;

    // ── persist the draft row (service-role) — NEVER sends anything ──────────
    const { data: draftRow, error: draftErr } = await admin
      .from("lit_agent_drafts")
      .insert({
        agent_name: input.agent_name,
        lead_id: input.lead_id,
        contact_json: input.contact,
        channel: input.channel,
        stage: input.stage,
        intent: input.intent,
        template_key: topTemplateKey,
        subject,
        body: parsed.body,
        angle: parsed.angle,
        facts_used: parsed.facts_used,
        confidence,
        status: draftStatus,
        requires_approval: finalRequiresApproval,
        created_by: input.created_by,
        metadata_json: {
          model,
          test_mode: testMode,
          parse_fallback: usedFallback,
          request_id: rid,
          auto_approved: autoApproved,
          ...(autoApproved ? { auto_approved_reason: approvalReason } : {}),
          approval: {
            mode: approvalDecision.mode,
            sensitive: approvalDecision.sensitive,
            firstTouch: approvalDecision.firstTouch,
            requires_approval: finalRequiresApproval,
            reason: approvalReason,
          },
        },
      })
      .select("id")
      .single();
    if (draftErr) throw new Error(`lit_agent_drafts insert failed: ${draftErr.message}`);
    const draftId = draftRow.id as string;

    // ── complete the run ────────────────────────────────────────────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "draft_generated",
      decision_reason: `Generated ${input.channel} draft (${input.stage ?? "no-stage"}/${input.intent ?? "no-intent"})`,
      output_json: {
        draft_id: draftId,
        channel: input.channel,
        stage: input.stage,
        confidence,
        template_key: topTemplateKey,
        parse_fallback: usedFallback,
        status: draftStatus,
        requires_approval: finalRequiresApproval,
        auto_approved: autoApproved,
        mode: approvalDecision.mode,
        sensitive: approvalDecision.sensitive,
      },
    });
    log.info("run_ok", {
      run_id: runId,
      draft_id: draftId,
      channel: input.channel,
      confidence,
      status: draftStatus,
      requires_approval: finalRequiresApproval,
      auto_approved: autoApproved,
    });

    return json({
      ok: true,
      draft_id: draftId,
      draft: {
        channel: input.channel,
        subject,
        body: parsed.body,
        angle: parsed.angle,
        facts_used: parsed.facts_used,
        confidence,
        requires_approval: finalRequiresApproval,
        status: draftStatus,
        template_key: topTemplateKey,
      },
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    log.error("run_failed", { run_id: runId, err: message, trigger_type: triggerType });
    try {
      if (runId) {
        await completeAgentRun(admin, runId, {
          status: "error",
          error_json: { message, request_id: rid },
        });
      } else {
        runId = await recordAgentRun(admin, {
          agent_name: AGENT_NAME,
          trigger_type: triggerType,
          status: "error",
          error_json: { message, request_id: rid },
          completed_at: new Date().toISOString(),
        });
      }
    } catch (auditErr) {
      log.error("run_audit_write_failed", { run_id: runId, err: String(auditErr) });
    }
    return json({ ok: false, error: "internal_error", run_id: runId, request_id: rid }, 500);
  }
});
