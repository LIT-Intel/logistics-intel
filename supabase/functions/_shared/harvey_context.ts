// Harvey grounding context — single source of truth (Project Harvey).
//
// Moved out of ai-employee-console's buildChatContext (Batch 4 refactor) so the
// chat action AND harvey-writer select outreach templates + approved knowledge
// with identical logic. Both surfaces must ground Harvey the same way.
//
// All reads use a service-role client: RLS blocks anon from the knowledge /
// templates tables, so callers MUST pass the service-role `admin` client.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type OutreachTemplate = {
  template_key: string;
  channel: string | null;
  stage: string | null;
  intent: string | null;
  subject: string | null;
  body: string | null;
};

export type KnowledgeRow = { category: string; title: string; content: string };

// Cap on how many full template bodies we inject so the prompt stays reasonable.
export const MAX_TEMPLATE_BODIES = 6;

/** Fetch approved knowledge rows (service-role client). */
export async function fetchApprovedKnowledge(admin: SupabaseClient): Promise<KnowledgeRow[]> {
  const { data } = await admin
    .from("lit_agent_knowledge")
    .select("category, title, content")
    .eq("approved", true)
    .order("category", { ascending: true });
  return (data ?? []) as KnowledgeRow[];
}

/** Fetch approved outreach templates for an agent (service-role client). */
export async function fetchApprovedTemplates(
  admin: SupabaseClient,
  agentName: string,
): Promise<OutreachTemplate[]> {
  const { data } = await admin
    .from("lit_agent_outreach_templates")
    .select("template_key, channel, stage, intent, subject, body")
    .eq("agent_name", agentName)
    .eq("approved", true)
    .order("stage", { ascending: true });
  return (data ?? []) as OutreachTemplate[];
}

/**
 * Score a template against a free-text message using plain string matching (no
 * LLM). Higher score = more relevant. Channel/stage/intent/key mentions all
 * contribute. Identical scoring to the original buildChatContext.
 */
export function scoreTemplate(tpl: OutreachTemplate, msgLower: string): number {
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

/**
 * Select the most relevant templates for a free-text message. Optional
 * channel/stage/intent hints are appended to the match text (and filtered
 * on when provided) so the writer can bias toward the requested channel/stage.
 *
 * Returns ranked entries (highest score first, stable on ties) with score > 0,
 * capped at `limit`.
 */
export function selectRelevantTemplates(
  templates: OutreachTemplate[],
  opts: {
    channel?: string | null;
    stage?: string | null;
    intent?: string | null;
    text?: string | null;
    limit?: number;
  },
): Array<{ template: OutreachTemplate; score: number }> {
  const limit = opts.limit ?? MAX_TEMPLATE_BODIES;
  // When a channel is explicitly requested, only consider that channel's
  // templates as few-shot voice examples (email vs linkedin have distinct voice).
  const channel = opts.channel ? opts.channel.toLowerCase() : null;
  const pool = channel
    ? templates.filter((t) => (t.channel ?? "").toLowerCase() === channel)
    : templates;

  const matchText = [opts.channel, opts.stage, opts.intent, opts.text]
    .filter((s) => typeof s === "string" && s)
    .join(" ")
    .toLowerCase();

  return pool
    .map((t, i) => ({ template: t, i, score: scoreTemplate(t, matchText) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i)) // stable: preserve order on ties
    .slice(0, limit)
    .filter((r) => r.score > 0)
    .map(({ template, score }) => ({ template, score }));
}

/** Render approved knowledge rows into a prompt block. */
export function renderKnowledgeBlock(knowledge: KnowledgeRow[]): string {
  return knowledge.length
    ? knowledge.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n")
    : "(no approved knowledge on file)";
}

/** Render a compact one-line-per-template catalog (no bodies). */
export function renderTemplateCatalog(templates: OutreachTemplate[]): string {
  if (!templates.length) return "(no approved outreach templates on file)";
  return templates
    .map((t) => {
      const meta = [t.channel, t.stage, t.intent].filter(Boolean).join("/");
      const subj = t.subject ? ` — ${t.subject}` : "";
      return `- [${t.template_key}] ${meta}${subj}`;
    })
    .join("\n");
}

/** Render selected template full bodies into a few-shot voice block. */
export function renderTemplateBodies(
  ranked: Array<{ template: OutreachTemplate }>,
): string {
  return ranked
    .map(({ template: t }) => {
      const meta = [t.channel, t.stage, t.intent].filter(Boolean).join("/");
      const subj = t.subject ? `\nSubject: ${t.subject}` : "";
      return `### [${t.template_key}] ${meta}${subj}\n${t.body ?? ""}`.trim();
    })
    .join("\n\n");
}
