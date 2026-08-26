export type HarveyClaimKind = "FACT" | "INFERENCE";

export type HarveyProvenance = {
  source: string;
  field: string;
  observed_at?: string | null;
  record_id?: string | null;
};

export type HarveyGroundedClaim = {
  id: string;
  kind: HarveyClaimKind;
  statement: string;
  confidence: number;
  provenance: HarveyProvenance[];
  method?: string;
};

export type HarveyContact = {
  id: string | null;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  verified: boolean;
};

export type HarveyContext = {
  version: "1.0";
  generated_at: string;
  tenant: { org_id: string; user_id: string };
  company: {
    id: string | null;
    key: string | null;
    name: string;
    domain: string | null;
    industry: string | null;
    city: string | null;
    state: string | null;
  };
  freight: {
    shipments_12m: number | null;
    teu_12m: number | null;
    last_shipment: string | null;
    top_route: string | null;
    opportunity_score: number | null;
  };
  domestic: {
    estimated_truckloads_month: number | null;
    facilities: number;
    flows: number;
    confidence: number;
  };
  contacts: HarveyContact[];
  relationship: {
    is_saved: boolean;
    stage: string | null;
    activity_count: number;
    lead_crm_member: boolean;
    internal_lead_id: string | null;
  };
};

export type HarveyActionType =
  | "REVIEW_FREIGHT_CHANGE"
  | "CALL_RECOMMENDED_CONTACT"
  | "DRAFT_EMAIL"
  | "DRAFT_LINKEDIN"
  | "SAVE_TO_CRM"
  | "HAVE_HARVEY_WORK_LEAD";

export type HarveyAction = {
  type: HarveyActionType;
  label: string;
  rationale: string;
  available: boolean;
  requires_internal_access?: boolean;
};

export type HarveyCopilotOutput = {
  context: HarveyContext;
  summary: string;
  claims: HarveyGroundedClaim[];
  opportunity: {
    score: number;
    confidence: number;
    label: "low" | "medium" | "high";
  };
  recommended_contacts: Array<HarveyContact & { score: number; reason: string }>;
  meeting_brief: {
    objective: string;
    call_opener: string;
    talking_points: string[];
    discovery_questions: string[];
    risk_flags: string[];
  };
  drafts: {
    email: { subject: string; body: string; facts_used: string[] };
    linkedin: { body: string; facts_used: string[] };
  };
  actions: HarveyAction[];
};

function bounded(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function contactScore(c: HarveyContact): number {
  const title = (c.title ?? "").toLowerCase();
  let score = 0;
  if (/chief|vp|vice president|head/.test(title)) score += 35;
  if (/director/.test(title)) score += 30;
  if (/logistics|transportation|supply chain|freight|distribution|procurement|operations/.test(title)) score += 40;
  if (c.email) score += 12;
  if (c.linkedin_url) score += 8;
  if (c.verified) score += 5;
  return Math.min(100, score);
}

function formatNumber(value: number | null): string | null {
  return value == null ? null : Math.round(value).toLocaleString("en-US");
}

export function buildHarveyCopilotOutput(context: HarveyContext): HarveyCopilotOutput {
  const claims: HarveyGroundedClaim[] = [];
  const shipments = context.freight.shipments_12m;
  const teu = context.freight.teu_12m;
  if (shipments != null) {
    claims.push({
      id: "freight-shipments-12m",
      kind: "FACT",
      statement: `${context.company.name} recorded ${formatNumber(shipments)} international shipments in the available 12-month rollup.`,
      confidence: 1,
      provenance: [{ source: "lit_companies", field: "shipments_12m", record_id: context.company.id }],
    });
  }
  if (teu != null) {
    claims.push({
      id: "freight-teu-12m",
      kind: "FACT",
      statement: `The available 12-month ocean volume is ${formatNumber(teu)} TEU.`,
      confidence: 1,
      provenance: [{ source: "lit_companies", field: "teu_12m", record_id: context.company.id }],
    });
  }
  if (context.freight.top_route) {
    claims.push({
      id: "freight-top-route",
      kind: "FACT",
      statement: `The leading recorded trade lane is ${context.freight.top_route}.`,
      confidence: 0.95,
      provenance: [{ source: "lit_companies", field: "top_route_12m", record_id: context.company.id }],
    });
  }

  const domesticSignal = context.domestic.estimated_truckloads_month ?? 0;
  if (domesticSignal > 0 || context.domestic.facilities > 0 || context.domestic.flows > 0) {
    const tlText = domesticSignal > 0 ? `approximately ${formatNumber(domesticSignal)} truckloads per month` : "repeat inland movement";
    claims.push({
      id: "domestic-opportunity",
      kind: "INFERENCE",
      statement: `International activity indicates a potential domestic opportunity around ${tlText}.`,
      confidence: bounded(context.domestic.confidence),
      provenance: [
        { source: "lit_company_inland_freight", field: "totals.est_tl_month", record_id: context.company.key },
        { source: "lit_unified_shipments", field: "destination_city/container_count", record_id: context.company.key },
      ],
      method: "Modeled from import records, container/load-type signals, destination facilities, and inland flow estimates; not observed domestic tender data.",
    });
  }

  const recommended = context.contacts
    .map((contact) => ({
      ...contact,
      score: contactScore(contact),
      reason: /logistics|transportation|supply chain|freight|distribution|procurement|operations/i.test(contact.title ?? "")
        ? "Role is directly aligned with freight, transportation, or supply-chain ownership."
        : "Best available decision-maker based on seniority and reachable contact data.",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const evidenceScore = Math.min(55,
    (shipments != null ? 18 : 0) +
    (teu != null ? 10 : 0) +
    (context.freight.top_route ? 8 : 0) +
    (context.freight.last_shipment ? 7 : 0) +
    (context.domestic.flows > 0 ? 12 : 0));
  const opportunityBase = context.freight.opportunity_score == null
    ? evidenceScore
    : bounded(context.freight.opportunity_score / 100) * 70;
  const contactBoost = recommended.length ? Math.min(15, recommended[0].score * 0.15) : 0;
  const relationshipBoost = context.relationship.is_saved ? 10 : 0;
  const score = Math.round(Math.min(100, opportunityBase + contactBoost + relationshipBoost));
  const confidenceInputs = [
    shipments != null,
    teu != null,
    Boolean(context.freight.last_shipment),
    Boolean(context.freight.top_route),
    context.domestic.confidence > 0,
    recommended.length > 0,
  ].filter(Boolean).length;
  const confidence = bounded(0.35 + confidenceInputs * 0.1);

  const leadContact = recommended[0] ?? null;
  const freightHook = context.freight.top_route
    ? `your activity on ${context.freight.top_route}`
    : shipments != null
      ? `the ${formatNumber(shipments)} shipments visible in the current freight record`
      : "your current freight network";
  const domesticHook = domesticSignal > 0
    ? ` and a modeled inland need near ${formatNumber(domesticSignal)} truckloads per month`
    : "";
  const firstName = leadContact?.full_name?.split(/\s+/)[0] || "there";
  const subject = `${context.company.name} freight activity`;
  const emailBody = `Hi ${firstName},\n\nI was reviewing ${freightHook}${domesticHook}. I have a few ideas on where a freight partner may be able to support the operation.\n\nWould a short conversation next week be useful?\n\nBest,`;
  const linkedinBody = `Hi ${firstName} — I was looking at ${freightHook}${domesticHook}. I have a few freight-specific ideas that may be relevant. Open to connecting?`;

  const talkingPoints = claims.slice(0, 4).map((c) => c.statement);
  const riskFlags: string[] = [];
  if (shipments == null) riskFlags.push("No canonical 12-month shipment count is available.");
  if (!leadContact) riskFlags.push("No tenant-visible contact is available; enrich before outreach.");
  if (context.domestic.confidence < 0.65 && claims.some((c) => c.id === "domestic-opportunity")) {
    riskFlags.push("Domestic opportunity is modeled at lower confidence; validate on the call.");
  }

  const summaryParts = [
    shipments != null ? `${formatNumber(shipments)} shipments in the 12-month rollup` : null,
    context.freight.top_route ? `top lane ${context.freight.top_route}` : null,
    domesticSignal > 0 ? `modeled domestic need ~${formatNumber(domesticSignal)} TL/month` : null,
    leadContact ? `best contact: ${leadContact.full_name}${leadContact.title ? ` (${leadContact.title})` : ""}` : null,
  ].filter(Boolean);

  return {
    context,
    summary: summaryParts.length ? `${context.company.name}: ${summaryParts.join("; ")}.` : `${context.company.name}: limited verified freight context is currently available.`,
    claims,
    opportunity: { score, confidence, label: score >= 70 ? "high" : score >= 40 ? "medium" : "low" },
    recommended_contacts: recommended,
    meeting_brief: {
      objective: `Validate ${context.company.name}'s current freight priorities and identify one concrete lane or domestic follow-on opportunity.`,
      call_opener: `I reviewed the freight activity we have for ${context.company.name}, especially ${freightHook}. I wanted to compare that picture with how the operation actually runs today.`,
      talking_points: talkingPoints,
      discovery_questions: [
        "Which lanes or facilities are under the most service or cost pressure right now?",
        "Who owns international freight and the domestic move after arrival?",
        "Where are capacity, visibility, or handoff gaps showing up most often?",
      ],
      risk_flags: riskFlags,
    },
    drafts: {
      email: { subject, body: emailBody, facts_used: claims.slice(0, 2).map((c) => c.id) },
      linkedin: { body: linkedinBody, facts_used: claims.slice(0, 2).map((c) => c.id) },
    },
    actions: [
      { type: "REVIEW_FREIGHT_CHANGE", label: "Review freight signals", rationale: "Confirm the observed changes before outreach.", available: claims.length > 0 },
      { type: "CALL_RECOMMENDED_CONTACT", label: "Prepare the call", rationale: "Use the highest-ranked freight decision-maker and grounded meeting brief.", available: Boolean(leadContact) },
      { type: "DRAFT_EMAIL", label: "Draft email", rationale: "Create a draft using only the claims shown above.", available: Boolean(leadContact?.email) },
      { type: "DRAFT_LINKEDIN", label: "Draft LinkedIn", rationale: "Create a short connection/message draft using grounded freight context.", available: Boolean(leadContact?.linkedin_url) },
      { type: "SAVE_TO_CRM", label: "Add to CRM", rationale: "Persist the account for tenant-scoped follow-up.", available: !context.relationship.is_saved },
      { type: "HAVE_HARVEY_WORK_LEAD", label: "Have Harvey Work This Lead", rationale: "Hand the company to the existing internal assisted Harvey workflow.", available: context.relationship.lead_crm_member, requires_internal_access: true },
    ],
  };
}
