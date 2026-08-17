import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { Agent, run, setDefaultOpenAIKey, webSearchTool, withTrace } from "npm:@openai/agents@0.16.1";
import { z } from "npm:zod@4.2.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const cleanDomain = (value: unknown) => String(value || "")
  .replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase() || null;

const Evidence = z.object({
  title: z.string(),
  url: z.string(),
  finding: z.string(),
});
const Qualification = z.object({
  status: z.enum(["qualified", "disqualified", "review"]),
  company_type: z.enum([
    "freight_broker", "freight_forwarder", "freight_broker_and_forwarder",
    "other_logistics", "non_target", "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  verified_domain: z.string().nullable(),
  reason: z.string(),
  positive_signals: z.array(z.string()),
  exclusion_signals: z.array(z.string()),
  evidence: z.array(Evidence),
});

const instructions = `You are the LIT Lead Qualification Agent. Audit Apollo company candidates before LIT spends credits on contact enrichment or begins outreach.

Search the current web for every company. Prefer the official website, then an independent authoritative source such as FMCSA, FMC, a government registration, or a credible company profile. Confirm that the supplied domain belongs to the same company.

QUALIFY only when current evidence shows the company directly operates as a freight broker that arranges transportation between shippers and carriers, a freight forwarder, an international forwarder, or an NVOCC. A company may also provide 3PL, customs brokerage, warehousing, trucking, or technology services; those extras do not disqualify it if brokerage or forwarding is a real operating service.

DISQUALIFY schools, courses, bootcamps, academies, coaches, media brands, newsletters, podcasts, conferences, communities, influencers, consultants, recruiters, software/data vendors, insurance, factoring/payment companies, compliance/marketing vendors, shippers, importers, manufacturers, carrier-only trucking companies, and warehouse-only operators unless reliable evidence shows they actually broker or forward freight.

A name containing “freight” or “logistics” and an Apollo category are not proof. If sources conflict, the website cannot be verified, or evidence is thin, return REVIEW. Review is not safe for enrichment. Qualified requires at least one strong source and confidence >= 0.75. Keep reasons factual and concise. Never invent licenses or services.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const openaiKey = Deno.env.get("Outreach_agent") || Deno.env.get("OPENAI_API_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization || !url || !anon || !service) return json({ ok: false, error: "Unauthorized" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: access } = await caller.rpc("lit_my_lead_crm_access");
  const gate = Array.isArray(access) ? access[0] : access;
  if (!gate?.is_member) return json({ ok: false, error: "Lead CRM membership required" }, 403);
  if (!openaiKey) return json({ ok: false, error: "Outreach agent is not configured" }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const providerCompanyId = String(body.provider_company_id || "").trim();
  const companyName = String(body.company_name || "").trim();
  if (!providerCompanyId || !companyName) return json({ ok: false, error: "Company ID and name are required" }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: cached } = await admin.from("lit_lead_company_qualifications")
    .select("status,company_type,confidence,verified_domain,reason,positive_signals,exclusion_signals,evidence,checked_at,expires_at")
    .eq("provider", "apollo").eq("provider_company_id", providerCompanyId)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (cached && body.force !== true) {
    return json({ ok: true, qualification: { ...cached, safe_to_enrich: cached.status === "qualified" && Number(cached.confidence) >= 0.75 }, cached: true });
  }

  setDefaultOpenAIKey(openaiKey);
  const model = Deno.env.get("OUTREACH_AGENT_MODEL") || "gpt-5.6-luna";
  const agent = new Agent({
    name: "LIT Lead Qualification Agent",
    model,
    instructions,
    tools: [webSearchTool()],
    outputType: Qualification,
  });
  const input = JSON.stringify({
    provider: "apollo",
    provider_company_id: providerCompanyId,
    company_name: companyName,
    domain: cleanDomain(body.domain || body.website),
    website: body.website || null,
    linkedin_url: body.linkedin_url || null,
    industry: body.industry || null,
    location: body.location || null,
    target_types: ["freight_broker", "freight_forwarder"],
  });

  try {
    const result = await withTrace("lit_lead_qualification", async () => run(agent, input));
    const decision = result.finalOutput;
    if (!decision) throw new Error("Agent returned no qualification decision");
    const safeToEnrich = decision.status === "qualified" && decision.confidence >= 0.75;
    const record = {
      provider: "apollo",
      provider_company_id: providerCompanyId,
      company_name: companyName,
      domain: cleanDomain(body.domain || body.website),
      website: body.website ? String(body.website) : null,
      status: decision.status,
      company_type: decision.company_type,
      confidence: decision.confidence,
      verified_domain: cleanDomain(decision.verified_domain),
      reason: decision.reason,
      positive_signals: decision.positive_signals,
      exclusion_signals: decision.exclusion_signals,
      evidence: decision.evidence,
      model,
      agent_version: "lead-qualification-v1",
      checked_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await admin.from("lit_lead_company_qualifications")
      .upsert(record, { onConflict: "provider,provider_company_id" });
    if (saveError) throw saveError;
    return json({ ok: true, qualification: { ...record, safe_to_enrich: safeToEnrich }, cached: false });
  } catch (error) {
    console.error("lead qualification failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Qualification failed" }, 502);
  }
});
