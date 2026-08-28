import { supabase } from "@/lib/supabase";

export const HARVEY_COMPANY_CONTEXT_EVENT = "lit:harvey-company-context";
export const HARVEY_COMPANY_CONTEXT_STORAGE_KEY = "lit.harvey.company-context.v1";

export type HarveyCompanyContext = {
  companyId: string | null;
  sourceCompanyKey: string | null;
  companyName: string;
  domain: string | null;
};

export type HarveyCopilotRequest = {
  action?: "context" | "handoff" | "ask";
  company_id?: string | null;
  source_company_key?: string | null;
  company_name?: string | null;
  domain?: string | null;
};

export type HarveyChatTurn = { role: "user" | "assistant"; content: string };

export type HarveyAnswer = {
  answer_md: string;
  classification: string;
  confidence: number;
  evidence: HarveyCopilotData["claims"];
  inference_notes: string[];
  cta: { label: string; url: string } | null;
  model?: string;
};

export type HarveyCopilotData = {
  summary: string;
  claims: Array<{
    id: string;
    kind: "FACT" | "INFERENCE";
    statement: string;
    confidence: number;
    provenance: Array<{ source: string; field: string }>;
    method?: string;
  }>;
  opportunity: { score: number; confidence: number; label: "low" | "medium" | "high" };
  recommended_contacts: Array<{
    id: string | null;
    full_name: string;
    title: string | null;
    email: string | null;
    linkedin_url: string | null;
    score: number;
    reason: string;
  }>;
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
  actions: Array<{ type: string; label: string; rationale: string; available: boolean }>;
};

export async function loadHarveyCopilot(req: HarveyCopilotRequest): Promise<HarveyCopilotData | null> {
  const { data, error } = await supabase.functions.invoke("harvey-copilot", { body: { ...req, action: "context" } });
  if (error || !data?.ok) return null;
  return data.data as HarveyCopilotData;
}

export async function askHarveyCopilot(
  req: HarveyCopilotRequest,
  question: string,
  history: HarveyChatTurn[] = [],
  pageContext?: string,
): Promise<HarveyAnswer> {
  const { data, error } = await supabase.functions.invoke("harvey-copilot", {
    body: {
      ...req,
      action: "ask",
      question,
      history: history.slice(-8),
      page_context: pageContext ?? null,
    },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "Harvey couldn't answer right now.");
  return data.data as HarveyAnswer;
}

export async function handoffToHarvey(req: HarveyCopilotRequest): Promise<{ lead_id?: string; created?: boolean; merged?: boolean }> {
  const { data, error } = await supabase.functions.invoke("harvey-copilot", { body: { ...req, action: "handoff" } });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "Harvey handoff failed");
  return data.handoff ?? {};
}
