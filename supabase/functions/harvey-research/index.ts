// harvey-research — Project Harvey Batch 5 (RESEARCH).
//
// The internal-only agent that builds a STRUCTURED research brief for ONE lead
// (a freight-sales professional we want to SELL LIT TO). It gathers ONLY facts
// that are actually present (the lead's company row, any relationship-intel row,
// directory info), grounds the dual-vendor LLM with Harvey's persona + approved
// knowledge for VOICE ONLY, and persists a brief to lit_agent_lead_research plus
// a lit_lead_activity 'research' note. It NEVER sends anything and NEVER
// fabricates facts.
//
// ICP framing (do NOT drift): the lead is a broker/forwarder/3PL/NVOCC/customs/
// drayage SALES peer. The "facts" are reasons LIT fits THEIR prospecting
// workflow — the lead is never treated as a shipper.
//
// INTERNAL-ONLY boundary (mirrors harvey-controller's dual auth):
//   - Verified pg_cron (X-Internal-Cron == LIT_CRON_SECRET) OR
//   - authenticated PLATFORM ADMIN who is also a lead-CRM member.
//
// Gate order (fail CLOSED): feature flag -> config.enabled -> quiet hours
// (manual/test exempt).
//
// Input JSON: { agent_name='harvey', lead_id (required), created_by?, trigger_type? }
// Response:   { ok, run_id, brief }.

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
  withinQuietHours,
} from "../_shared/agent.ts";
import { buildHarveySystemPrompt } from "../_shared/harvey_persona.ts";
import { callLlm, resolveLlmModel } from "../_shared/llm.ts";
import { fetchApprovedKnowledge, renderKnowledgeBlock } from "../_shared/harvey_context.ts";
import { recordProviderUsage } from "../_shared/provider_ledger.ts";
import { PROVIDERS, PROVIDER_OPERATIONS, TRIGGER_TYPES } from "../_shared/provider_operations.ts";

const AGENT_NAME = "harvey-research";
const FLAG_KEY = "harvey_internal_agent";
const CONFIG_KEY = "harvey";

type TriggerType = "cron" | "webhook" | "manual" | "test";

type Fact = { fact: string; source: string };

type ResearchBrief = {
  fitScore: number; // 0..100
  fitReasons: string[];
  facts: Fact[];
  recommendedAngle: string | null;
  likelyPain: string | null;
  recommendedChannel: "email" | "linkedin";
  recommendedCTA: string | null;
  riskFlags: string[];
  confidence: number; // 0..1
};

// ─── robust JSON parse (strip fences / surrounding prose) ────────────────────

function parseBriefJson(raw: string): ResearchBrief | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
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

  const num = (v: unknown, lo: number, hi: number, dflt: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim()) : [];
  const factArr = (v: unknown): Fact[] =>
    Array.isArray(v)
      ? v
          .map((x) => {
            const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return { fact: String(o.fact ?? "").trim(), source: String(o.source ?? "").trim() };
          })
          .filter((f) => f.fact)
      : [];

  const channelRaw = String(obj.recommendedChannel ?? "").toLowerCase();
  const recommendedChannel: "email" | "linkedin" = channelRaw === "linkedin" ? "linkedin" : "email";

  return {
    fitScore: Math.round(num(obj.fitScore, 0, 100, 0)),
    fitReasons: strArr(obj.fitReasons),
    facts: factArr(obj.facts),
    recommendedAngle: typeof obj.recommendedAngle === "string" ? obj.recommendedAngle.trim() || null : null,
    likelyPain: typeof obj.likelyPain === "string" ? obj.likelyPain.trim() || null : null,
    recommendedChannel,
    recommendedCTA: typeof obj.recommendedCTA === "string" ? obj.recommendedCTA.trim() || null : null,
    riskFlags: strArr(obj.riskFlags),
    confidence: num(obj.confidence, 0, 1, 0.5),
  };
}

/** Render the gathered facts into a grounding block. Empty => explicit "none". */
function renderFactsBlock(facts: string[]): string {
  return facts.length ? facts.map((f) => `- ${f}`).join("\n") : "(no verified facts on file for this lead)";
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const rid = requestId();
  const log = createLogger(AGENT_NAME, { request_id: rid });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json", request_id: rid }, 400);
  }

  // ── auth: verified cron OR platform-admin lead-CRM member ──────────────────
  let triggerType: TriggerType;
  let admin: SupabaseClient;
  let actorUserId: string | null = typeof body.created_by === "string" ? body.created_by : null;

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
    const { data: isMember, error: memberErr } = await auth.userClient.rpc("is_lead_crm_member", {
      p_user_id: auth.user.id,
    });
    if (memberErr || isMember !== true) {
      log.warn("forbidden_not_lead_crm_member", { user_id: auth.user.id, err: memberErr?.message });
      return json({ ok: false, error: "forbidden", request_id: rid }, 403);
    }
    admin = auth.admin;
    actorUserId = auth.user.id;
    const requested = typeof body.trigger_type === "string" ? body.trigger_type : "manual";
    triggerType = requested === "test" ? "test" : "manual";
  }

  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  if (!leadId) return json({ ok: false, error: "lead_id is required", request_id: rid }, 400);

  let runId: string | null = null;
  try {
    // ── gate 1: feature flag — fail CLOSED ──────────────────────────────────
    if (!(await isAgentFlagEnabled(admin, FLAG_KEY))) {
      const reason = `feature flag '${FLAG_KEY}' missing or killed (fail-closed)`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        input_json: { request_id: rid, actor_user_id: actorUserId, lead_id: leadId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_flag_disabled", { run_id: runId });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── gate 2: config exists AND enabled ───────────────────────────────────
    const config = await loadAgentConfig(admin, CONFIG_KEY);
    if (!config || config.enabled !== true) {
      const reason = config
        ? "lit_agent_config['harvey'].enabled is false"
        : "lit_agent_config['harvey'] row missing (fail-closed)";
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: config?.testMode === true,
        input_json: { request_id: rid, actor_user_id: actorUserId, lead_id: leadId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_config_disabled", { run_id: runId });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }
    const testMode = config.testMode === true;

    // ── gate 3: quiet hours (manual/test exempt) ────────────────────────────
    if (triggerType !== "manual" && triggerType !== "test" && withinQuietHours(config)) {
      const qh = config.quietHours;
      const reason = `within quiet hours (${qh?.start}-${qh?.end} ${qh?.timezone})`;
      runId = await recordAgentRun(admin, {
        agent_name: AGENT_NAME,
        trigger_type: triggerType,
        status: "skipped",
        decision_reason: reason,
        test_mode: testMode,
        input_json: { request_id: rid, actor_user_id: actorUserId, lead_id: leadId },
        completed_at: new Date().toISOString(),
      });
      log.info("skipped_quiet_hours", { run_id: runId });
      return json({ ok: true, skipped: true, reason, run_id: runId });
    }

    // ── load the lead ────────────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await admin
      .from("lit_admin_leads")
      .select(
        "id, full_name, title, company_name, primary_source, company_id, source_company_key, " +
          "company_domain, company_city, company_state, company_country, " +
          "apollo_organization_id, lead_score, notes",
      )
      .eq("id", leadId)
      .is("deleted_at", null)
      .maybeSingle();
    if (leadErr) throw new Error(`lead lookup failed: ${leadErr.message}`);
    if (!lead) return json({ ok: false, error: "lead not found", request_id: rid }, 404);

    // ── open the run before the LLM call ─────────────────────────────────────
    runId = await recordAgentRun(admin, {
      agent_name: AGENT_NAME,
      trigger_type: triggerType,
      status: "running",
      test_mode: testMode,
      input_json: { request_id: rid, actor_user_id: actorUserId, lead_id: leadId },
    });
    log.info("run_started", { run_id: runId, lead_id: leadId });

    // ── gather ONLY facts that are actually present (never fabricate) ─────────
    const facts: string[] = [];
    const companyId = (lead as { company_id: string | null }).company_id;
    const sourceKey = (lead as { source_company_key: string | null }).source_company_key;

    if (lead.company_name) facts.push(`Employer (a freight-sales company): ${lead.company_name}.`);
    if (lead.full_name) facts.push(`Contact name: ${lead.full_name}.`);
    if (lead.title) facts.push(`Contact title: ${lead.title}.`);
    const loc = [lead.company_city, lead.company_state, lead.company_country].filter(Boolean).join(", ");
    if (loc) facts.push(`Company location: ${loc}.`);
    if (lead.company_domain) facts.push(`Company domain: ${lead.company_domain}.`);

    // Company row (lit_companies) — shipment / mode facts, if linked.
    if (companyId) {
      const { data: company } = await admin
        .from("lit_companies")
        .select("name, industry, primary_mode, shipments_12m, teu_12m, top_route_12m, country_code")
        .eq("id", companyId)
        .maybeSingle();
      if (company) {
        if (typeof company.shipments_12m === "number" && company.shipments_12m > 0) {
          facts.push(`Company shipments (last 12m, from LIT data): ${company.shipments_12m}.`);
        }
        if (company.teu_12m != null && Number(company.teu_12m) > 0) {
          facts.push(`Company TEU (last 12m): ${company.teu_12m}.`);
        }
        if (company.primary_mode) facts.push(`Primary freight mode observed: ${company.primary_mode}.`);
        if (company.top_route_12m) facts.push(`Top trade lane (last 12m): ${company.top_route_12m}.`);
        if (company.industry) facts.push(`Company industry: ${company.industry}.`);
      }
    }

    // Relationship-intel row — keyed by the ImportYeti slug (source_company_key).
    if (sourceKey) {
      const { data: intel } = await admin
        .from("lit_company_relationship_intel")
        .select("company_type, summary, outbound_ftl_likelihood, outbound_ftl_rationale, research_status")
        .eq("company_id", sourceKey)
        .maybeSingle();
      if (intel && intel.research_status === "ok") {
        if (intel.company_type) facts.push(`Relationship-intel company type: ${intel.company_type}.`);
        if (intel.summary) facts.push(`Relationship-intel summary: ${intel.summary}`);
        if (typeof intel.outbound_ftl_likelihood === "number") {
          facts.push(
            `Outbound-FTL likelihood (0-100): ${intel.outbound_ftl_likelihood}` +
              (intel.outbound_ftl_rationale ? ` — ${intel.outbound_ftl_rationale}` : "") + ".",
          );
        }
      }
    }

    // ── grounding: approved knowledge (VOICE + product-fit framing only) ─────
    const knowledge = await fetchApprovedKnowledge(admin);
    const knowledgeBlock = renderKnowledgeBlock(knowledge);
    const factsBlock = renderFactsBlock(facts);

    const profile = (config.profile ?? null) as Record<string, unknown> | null;
    const system = buildHarveySystemPrompt(profile);

    const userBlock = [
      "TASK: Produce a STRUCTURED RESEARCH BRIEF for ONE lead. This lead is a freight-sales " +
        "professional (a broker / forwarder / 3PL / NVOCC / customs / drayage salesperson, BD, or " +
        "owner) that we want to SELL LIT SOFTWARE TO. The 'facts' below describe THEIR company; use " +
        "them ONLY to reason about why LIT fits THEIR prospecting/sales workflow. NEVER treat this " +
        "lead as a shipper, and NEVER offer to move their freight.",
      "",
      "APPROVED KNOWLEDGE (for product-fit framing + voice — do NOT invent beyond this):\n" + knowledgeBlock,
      "",
      "VERIFIED FACTS ABOUT THIS LEAD / THEIR COMPANY (the ONLY facts you may cite; each has a " +
        "source you must reuse — do NOT add facts that are not here):\n" + factsBlock,
      "",
      "RULES:",
      "- Every entry in `facts` MUST come from the VERIFIED FACTS above; cite its source. If there " +
        "are no verified facts, return an empty `facts` array and lower your confidence.",
      "- `fitReasons` explain why LIT fits THIS freight-sales team's workflow (e.g. they run outbound " +
        "prospecting, they need shipper/lane intelligence, they juggle several tools).",
      "- `likelyPain` is the freight-sales pain LIT relieves for THEM (finding/qualifying shippers, " +
        "scattered tooling), never a shipping/logistics pain of a shipper.",
      "- Recommend a channel ('email' or 'linkedin') and a concrete, low-pressure CTA in Harvey's voice.",
      "- `riskFlags` note anything that should route to a human or reduce cadence (thin data, " +
        "possible non-target company, pricing/enterprise/legal sensitivity).",
      "",
      "OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose, no code fences:",
      "{",
      '  "fitScore": <0-100 integer>,',
      '  "fitReasons": ["<why LIT fits this freight-sales team>"],',
      '  "facts": [{"fact": "<verified fact>", "source": "<its source from above>"}],',
      '  "recommendedAngle": "<one short phrase>",',
      '  "likelyPain": "<the freight-SALES pain LIT relieves for them>",',
      '  "recommendedChannel": "email" | "linkedin",',
      '  "recommendedCTA": "<a concrete, on-voice CTA>",',
      '  "riskFlags": ["<anything to route to a human / reduce cadence>"],',
      '  "confidence": <0..1 number>',
      "}",
      "Return the JSON object and nothing else.",
    ].join("\n");

    // ── call the LLM (retry once on parse failure) ───────────────────────────
    const model = resolveLlmModel();
    let llm = await callLlm(system, userBlock);
    let brief = llm.ok ? parseBriefJson(llm.text) : null;
    if (llm.ok && !brief) {
      log.warn("brief_parse_failed_retrying", { run_id: runId });
      const nudge = userBlock +
        "\n\nIMPORTANT: Your previous reply could not be parsed. Return ONLY the raw JSON object " +
        "described in the OUTPUT CONTRACT — no prose, no markdown, no code fences.";
      llm = await callLlm(system, nudge);
      brief = llm.ok ? parseBriefJson(llm.text) : null;
    }
    if (!llm.ok) throw new Error(`LLM call failed: ${llm.error}`);

    // Fallback: minimal brief with confidence 0 so the run still records usefully.
    let usedFallback = false;
    if (!brief) {
      usedFallback = true;
      brief = {
        fitScore: 0,
        fitReasons: [],
        facts: facts.map((f) => ({ fact: f, source: "lit_internal_data" })),
        recommendedAngle: null,
        likelyPain: null,
        recommendedChannel: "email",
        recommendedCTA: null,
        riskFlags: ["research_parse_failed"],
        confidence: 0,
      };
      log.warn("brief_parse_failed_fallback", { run_id: runId });
    }

    // ── persist the brief (service-role) ─────────────────────────────────────
    const { data: briefRow, error: briefErr } = await admin
      .from("lit_agent_lead_research")
      .insert({
        agent_name: typeof body.agent_name === "string" && body.agent_name.trim() ? body.agent_name.trim() : "harvey",
        lead_id: leadId,
        company_id: companyId,
        brief_json: brief,
        fit_score: brief.fitScore,
        confidence: brief.confidence,
        recommended_channel: brief.recommendedChannel,
        recommended_cta: brief.recommendedCTA,
        risk_flags: brief.riskFlags,
        model,
        created_by: actorUserId,
      })
      .select("id")
      .single();
    if (briefErr) throw new Error(`lit_agent_lead_research insert failed: ${briefErr.message}`);
    const briefId = briefRow.id as string;

    // ── lead-timeline note (kind 'research') summarizing the brief ───────────
    await admin.from("lit_lead_activity").insert({
      lead_id: leadId,
      kind: "research",
      body: {
        agent: "harvey",
        run_id: runId,
        research_id: briefId,
        fit_score: brief.fitScore,
        confidence: brief.confidence,
        recommended_channel: brief.recommendedChannel,
        recommended_cta: brief.recommendedCTA,
        recommended_angle: brief.recommendedAngle,
        likely_pain: brief.likelyPain,
        risk_flags: brief.riskFlags,
        fact_count: brief.facts.length,
      },
      actor_user_id: actorUserId,
      source: "system",
    });

    // ── meter the research LLM spend (operation harvey.research) ─────────────
    await recordProviderUsage(admin, {
      provider: PROVIDERS.APOLLO, // no dedicated LLM provider in PROVIDERS; attribute Harvey's research op here
      operation: PROVIDER_OPERATIONS.RESEARCH,
      status: usedFallback ? "error" : "success",
      trigger_type: TRIGGER_TYPES.SYSTEM,
      source: "harvey",
      request_id: rid,
      company_id: companyId,
      metadata: { run_id: runId, lead_id: leadId, research_id: briefId, model, parse_fallback: usedFallback },
    });

    // ── complete the run ─────────────────────────────────────────────────────
    await completeAgentRun(admin, runId, {
      status: "ok",
      decision: "researched",
      decision_reason: `Research brief for lead ${leadId} (fit ${brief.fitScore}, ${brief.facts.length} fact(s))` +
        (usedFallback ? " — parse fallback" : ""),
      output_json: {
        research_id: briefId,
        fit_score: brief.fitScore,
        confidence: brief.confidence,
        recommended_channel: brief.recommendedChannel,
        fact_count: brief.facts.length,
        parse_fallback: usedFallback,
        test_mode: testMode,
      },
    });
    log.info("run_ok", { run_id: runId, research_id: briefId, fit_score: brief.fitScore });

    return json({ ok: true, run_id: runId, brief });
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
