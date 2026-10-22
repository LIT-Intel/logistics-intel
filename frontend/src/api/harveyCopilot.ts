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

/** Bounded stage-one Harvey tool. General trade-lane/TEU prompts are NOT
 * routed here; those require independently verified analytics tools.
 */
export function isDirectoryForwarderQuestion(question:string):boolean {
 const q=question.toLowerCase();
 return /\b(?:find|show|list|which|give me|identify|accounts?|companies|shippers|prospects)\b/.test(q)
    && /\b(?:dsv|expeditors|kuehne|direct to carrier|bco direct)\b/.test(q);
}
export async function searchHarveyHistoricalForwarders(question:string):Promise<HarveyAnswer> {
 const {data,error}=await supabase.functions.invoke("harvey-copilot",{
  body:{action:"search_forwarders",question},
 });
 if(error || !data)throw new Error(data?.error||error?.message||"Harvey directory lookup unavailable.");
 if(!data.ok){
  return {answer_md:data.clarification||"That specific forwarder search is not yet supported by the verified historical source.",classification:"search_question",confidence:1,evidence:[],inference_notes:[],cta:null};
 }
 const rows=Array.isArray(data.rows)?data.rows:[];
 const lines=rows.map((r:any,i:number)=>
  `${i+1}. ${String(r.company_name||"Unnamed company").slice(0,120)} — ${[r.city,r.state].filter(Boolean).join(", ")||"Location unverified"}`);
 const count=Number.isFinite(Number(data.count))?Number(data.count):rows.length;
 const md=[
  `Found ${count.toLocaleString()} historical company directory records matching ${data.plan.providerName}${data.plan.state?" in "+data.plan.state:""}.`,
  `Provider match: historical company-wide directory relationship, not verified current booking or a particular trade lane.`,
  ...(lines.length?["",...lines]:["","No matching records found."]),
  data.truncated?`Showing ${rows.length} of ${count} matches; the remaining results have not been loaded.`:"",
  "",
  "Source: LIT company directory / V6 CSV provider summary. Reported TEU and period-specific shares are not verified and are intentionally omitted.",
  "Next: open a company profile to inspect available BOL evidence, or refine the provider and location.",
 ].filter(Boolean).join("\n");
 return {answer_md:md,classification:"search_question",confidence:0.9,evidence:[],inference_notes:["Historical provider association; lane, annual window and TEU are not independently verified."],cta:null};
}
