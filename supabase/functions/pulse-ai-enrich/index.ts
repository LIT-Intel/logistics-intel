import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PulseAiMode = "company_profile" | "pulse_page";

type PulseAiRequest = {
  company_id?: string | null;
  source_company_key?: string | null;
  mode?: PulseAiMode;
  force_refresh?: boolean;
};

type JsonRecord = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

const REPORT_TTL_DAYS = Number(Deno.env.get("PULSE_AI_REPORT_TTL_DAYS") || 14);

const PLAN_LIMITS: Record<
  string,
  {
    pulseAiReportsMonthly: number;
  }
> = {
  free_trial: { pulseAiReportsMonthly: 3 },
  starter: { pulseAiReportsMonthly: 10 },
  growth: { pulseAiReportsMonthly: 35 },
  scale: { pulseAiReportsMonthly: 80 },
  enterprise: { pulseAiReportsMonthly: 999999 },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function normalizePlanCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "free_trial";
  if (raw === "standard") return "starter";
  if (raw === "trial") return "free_trial";
  if (raw === "free") return "free_trial";
  return raw;
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString();
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function compactObject(obj: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && Object.keys(value).length === 0) {
        return false;
      }
      return true;
    }),
  );
}

function trimLargeArray<T>(arr: T[], max = 25): T[] {
  return Array.isArray(arr) ? arr.slice(0, max) : [];
}

function getNested(obj: any, paths: string[]): any {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let found = true;

    for (const part of parts) {
      if (cur == null || typeof cur !== "object" || !(part in cur)) {
        found = false;
        break;
      }
      cur = cur[part];
    }

    if (found && cur != null) return cur;
  }

  return null;
}

function buildReportSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "company_summary",
      "why_now",
      "sales_angle",
      "web_research_summary",
      "buying_signals",
      "risk_flags",
      "carrier_opportunities",
      "forwarder_displacement_opportunities",
      "container_and_mode_insights",
      "lane_insights",
      "supplier_insights",
      "recommended_personas",
      "recommended_contacts",
      "campaign_recommendations",
      "email_openers",
      "linkedin_openers",
      "next_best_actions",
      "similar_companies",
      "web_sources",
      "confidence_score",
      "data_sources_used",
      "missing_data",
    ],
    properties: {
      company_summary: { type: "string" },
      why_now: { type: "string" },
      sales_angle: { type: "string" },
      web_research_summary: { type: "string" },
      buying_signals: {
        type: "array",
        items: { type: "string" },
      },
      risk_flags: {
        type: "array",
        items: { type: "string" },
      },
      carrier_opportunities: {
        type: "array",
        items: { type: "string" },
      },
      forwarder_displacement_opportunities: {
        type: "array",
        items: { type: "string" },
      },
      container_and_mode_insights: {
        type: "array",
        items: { type: "string" },
      },
      lane_insights: {
        type: "array",
        items: { type: "string" },
      },
      supplier_insights: {
        type: "array",
        items: { type: "string" },
      },
      recommended_personas: {
        type: "array",
        items: { type: "string" },
      },
      recommended_contacts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "title", "reason", "confidence"],
          properties: {
            name: { type: "string" },
            title: { type: "string" },
            reason: { type: "string" },
            confidence: { type: "number" },
          },
        },
      },
      campaign_recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["campaign_type", "audience", "message_angle", "priority"],
          properties: {
            campaign_type: { type: "string" },
            audience: { type: "string" },
            message_angle: { type: "string" },
            priority: { type: "string" },
          },
        },
      },
      email_openers: {
        type: "array",
        items: { type: "string" },
      },
      linkedin_openers: {
        type: "array",
        items: { type: "string" },
      },
      next_best_actions: {
        type: "array",
        items: { type: "string" },
      },
      similar_companies: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "reason", "search_query", "search_url"],
          properties: {
            name: { type: "string" },
            reason: { type: "string" },
            search_query: { type: "string" },
            search_url: { type: "string" },
          },
        },
      },
      web_sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url", "publisher", "published_at", "summary"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            publisher: { type: "string" },
            published_at: { type: "string" },
            summary: { type: "string" },
          },
        },
      },
      confidence_score: {
        type: "number",
        minimum: 0,
        maximum: 100,
      },
      data_sources_used: {
        type: "array",
        items: { type: "string" },
      },
      missing_data: {
        type: "array",
        items: { type: "string" },
      },
    },
  };
}

async function resolveUserAndOrg(
  req: Request,
  userClient: any,
  adminClient: any,
) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      error: jsonResponse(
        {
          ok: false,
          code: "NO_AUTH_TOKEN",
          message: "Missing Authorization bearer token.",
        },
        401,
      ),
    };
  }

  const { data: userData, error: userError } = await userClient.auth.getUser(
    token,
  );

  if (userError || !userData?.user?.id) {
    return {
      error: jsonResponse(
        {
          ok: false,
          code: "INVALID_USER",
          message: "Could not verify authenticated user.",
        },
        401,
      ),
    };
  }

  const user = userData.user;

  const { data: orgMember } = await adminClient
    .from("org_members")
    .select("org_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgMember?.org_id) {
    return {
      user,
      orgId: orgMember.org_id,
      membershipSource: "org_members",
      role: orgMember.role ?? null,
    };
  }

  const { data: orgMembership } = await adminClient
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (orgMembership?.org_id) {
    return {
      user,
      orgId: orgMembership.org_id,
      membershipSource: "org_memberships",
      role: orgMembership.role ?? null,
    };
  }

  const { data: organizationMembership } = await adminClient
    .from("organization_memberships")
    .select("organization_id, org_role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (organizationMembership?.organization_id) {
    return {
      user,
      orgId: organizationMembership.organization_id,
      membershipSource: "organization_memberships",
      role: organizationMembership.org_role ?? null,
    };
  }

  return {
    error: jsonResponse(
      {
        ok: false,
        code: "NO_ORG_MEMBERSHIP",
        message: "User does not belong to an organization.",
      },
      403,
    ),
  };
}

/**
 * Super-admin / platform-admin bypass. Returns true when the
 * authenticated user should bypass plan-based usage limits.
 *
 * Three sources, all checked server-side:
 *   1. `public.platform_admins` table (canonical — same pattern the
 *      affiliate-admin function uses).
 *   2. `SUPER_ADMIN_EMAILS` env var (comma-separated allowlist).
 *   3. `app_metadata.is_super_admin` / `app_metadata.role` set on the
 *      auth user. (`app_metadata` is editable only by service role —
 *      never trust `user_metadata` for privilege escalation.)
 */
async function isSuperAdmin(
  adminClient: any,
  user: any,
): Promise<boolean> {
  if (!user) return false;

  // 1. platform_admins row (canonical)
  try {
    const { data: adminRow } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (adminRow?.user_id) return true;
  } catch (_) {
    // table may not exist in some environments — fall through
  }

  // 2. env-allowlisted email
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const envList = (Deno.env.get("SUPER_ADMIN_EMAILS") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (envList.includes(email)) return true;
  }

  // 3. app_metadata flag set by service role at sign-up / promotion
  const appMeta = user.app_metadata || {};
  if (appMeta.is_super_admin === true) return true;
  const appRole = String(appMeta.role || "").toLowerCase();
  if (appRole === "super_admin" || appRole === "platform_admin") return true;

  return false;
}

async function getOrgPlan(adminClient: any, orgId: string): Promise<string> {
  const { data: orgRow } = await adminClient
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();

  if (orgRow?.plan) return normalizePlanCode(orgRow.plan);

  return "free_trial";
}

async function countMonthlyUsage(
  adminClient: any,
  orgId: string,
  feature: string,
): Promise<number> {
  const since = monthStartIso();

  const tables = [
    {
      name: "lit_usage_ledger",
      orgColumn: "org_id",
      featureColumn: "feature_key",
      dateColumn: "created_at",
    },
    {
      name: "usage_ledger",
      orgColumn: "org_id",
      featureColumn: "feature_key",
      dateColumn: "created_at",
    },
  ];

  for (const table of tables) {
    try {
      const { count, error } = await adminClient
        .from(table.name)
        .select("*", { count: "exact", head: true })
        .eq(table.orgColumn, orgId)
        .eq(table.featureColumn, feature)
        .gte(table.dateColumn, since);

      if (!error && typeof count === "number") return count;
    } catch {
      // Continue to fallback.
    }
  }

  const { count } = await adminClient
    .from("lit_pulse_ai_reports")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since)
    .eq("status", "completed");

  return typeof count === "number" ? count : 0;
}

async function logUsage(
  adminClient: any,
  payload: {
    orgId: string;
    userId: string;
    feature: string;
    units: number;
    metadata?: JsonRecord;
  },
) {
  const rows = [
    {
      org_id: payload.orgId,
      user_id: payload.userId,
      feature_key: payload.feature,
      quantity: payload.units,
      metadata: payload.metadata ?? {},
    },
    {
      org_id: payload.orgId,
      user_id: payload.userId,
      feature_key: payload.feature,
      quantity: payload.units,
      metadata: payload.metadata ?? {},
    },
  ];

  try {
    const { error } = await adminClient.from("lit_usage_ledger").insert(rows[0]);
    if (!error) return;
  } catch {
    // Continue.
  }

  try {
    await adminClient.from("usage_ledger").insert(rows[1]);
  } catch {
    // Usage logging should not break report generation.
  }
}

async function findCachedReport(
  adminClient: any,
  params: {
    orgId: string;
    companyId?: string | null;
    sourceCompanyKey?: string | null;
    mode: PulseAiMode;
  },
) {
  let query = adminClient
    .from("lit_pulse_ai_reports")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("mode", params.mode)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.companyId) {
    query = query.eq("company_id", params.companyId);
  } else if (params.sourceCompanyKey) {
    query = query.eq("source_company_key", params.sourceCompanyKey);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;

  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
  }

  return data;
}

async function loadCompanyContext(
  adminClient: any,
  params: {
    orgId: string;
    companyId?: string | null;
    sourceCompanyKey?: string | null;
  },
) {
  let company: JsonRecord | null = null;

  if (params.companyId) {
    const { data } = await adminClient
      .from("lit_companies")
      .select("*")
      .eq("id", params.companyId)
      .maybeSingle();

    company = data ?? null;
  }

  if (!company && params.sourceCompanyKey) {
    const { data } = await adminClient
      .from("lit_companies")
      .select("*")
      .eq("source_company_key", params.sourceCompanyKey)
      .maybeSingle();

    company = data ?? null;
  }

  const resolvedCompanyId = company?.id ?? params.companyId ?? null;
  const resolvedSourceKey =
    company?.source_company_key ?? params.sourceCompanyKey ?? null;

  let snapshot: JsonRecord | null = null;

  if (resolvedSourceKey) {
    const { data } = await adminClient
      .from("lit_importyeti_company_snapshot")
      .select("*")
      .eq("company_id", resolvedSourceKey)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    snapshot = data ?? null;
  }

  let savedCompany: JsonRecord | null = null;

  if (resolvedCompanyId) {
    const { data } = await adminClient
      .from("lit_saved_companies")
      .select("*")
      .eq("company_id", resolvedCompanyId)
      .eq("org_id", params.orgId)
      .maybeSingle();

    savedCompany = data ?? null;
  }

  let contacts: JsonRecord[] = [];

  if (resolvedCompanyId) {
    const { data } = await adminClient
      .from("lit_contacts")
      .select("*")
      .eq("company_id", resolvedCompanyId)
      .limit(25);

    contacts = safeArray(data);
  }

  let outreachHistory: JsonRecord[] = [];

  if (resolvedCompanyId) {
    const { data } = await adminClient
      .from("lit_outreach_history")
      .select("*")
      .eq("company_id", resolvedCompanyId)
      .eq("org_id", params.orgId)
      .order("created_at", { ascending: false })
      .limit(25);

    outreachHistory = safeArray(data);
  }

  const parsedSummary = snapshot?.parsed_summary ?? {};
  const rawPayload = snapshot?.raw_payload ?? {};
  const normalizedJson = parsedSummary;
  const kpisJson = parsedSummary;
  const rawJson = rawPayload;

  const companyName =
    company?.name ??
    company?.title ??
    getNested(normalizedJson, ["name", "title", "company.name"]) ??
    getNested(rawJson, ["name", "title", "company.name"]) ??
    resolvedSourceKey ??
    "Unknown company";

  const context = compactObject({
    company: compactObject({
      id: resolvedCompanyId,
      source_company_key: resolvedSourceKey,
      name: companyName,
      website: company?.website ?? company?.domain ?? null,
      address: company?.address ?? null,
      country_code: company?.country_code ?? null,
      crm_stage: savedCompany?.stage ?? null,
      crm_tags: savedCompany?.tags ?? null,
    }),
    snapshot: compactObject({
      id: snapshot?.id ?? null,
      fetched_at: snapshot?.fetched_at ?? snapshot?.created_at ?? null,
      expires_at: snapshot?.expires_at ?? null,
      normalized_json: compactObject({
        routeKpis:
          normalizedJson?.routeKpis ??
          normalizedJson?.route_kpis ??
          kpisJson?.routeKpis ??
          kpisJson?.route_kpis ??
          null,
        timeSeries: trimLargeArray(
          normalizedJson?.timeSeries ??
            normalizedJson?.time_series ??
            normalizedJson?.monthlyActivity ??
            [],
          18,
        ),
        topRoutes:
          normalizedJson?.topRoutes ??
          normalizedJson?.top_routes ??
          kpisJson?.topRoutes ??
          null,
        carrierMix:
          normalizedJson?.carrier_mix ??
          normalizedJson?.carrierMix ??
          normalizedJson?.topCarriers ??
          normalizedJson?.top_carriers ??
          null,
        forwarderMix:
          normalizedJson?.forwarder_mix ??
          normalizedJson?.forwarderMix ??
          normalizedJson?.topForwarders ??
          normalizedJson?.top_forwarders ??
          normalizedJson?.serviceProviders ??
          normalizedJson?.service_providers ??
          null,
        containerProfile:
          normalizedJson?.container_profile ??
          normalizedJson?.containerProfile ??
          normalizedJson?.containers ??
          normalizedJson?.container_lengths_breakdown ??
          null,
        laneIntelligence:
          normalizedJson?.trade_lane_intelligence ??
          normalizedJson?.tradeLaneIntelligence ??
          normalizedJson?.combinedLaneIntelligence ??
          null,
        hsProfile:
          normalizedJson?.hs_profile ??
          normalizedJson?.hsProfile ??
          normalizedJson?.topProducts ??
          normalizedJson?.top_products ??
          null,
        supplierIntelligence:
          normalizedJson?.supplier_intelligence ??
          normalizedJson?.supplierIntelligence ??
          normalizedJson?.topSuppliers ??
          normalizedJson?.top_suppliers ??
          null,
        recentBols: trimLargeArray(
          normalizedJson?.recentBols ??
            normalizedJson?.recent_bols ??
            rawJson?.recentBols ??
            rawJson?.recent_bols ??
            [],
          20,
        ),
      }),
    }),
    contacts: trimLargeArray(contacts, 20),
    outreach_history: trimLargeArray(outreachHistory, 15),
  });

  return {
    company,
    companyId: resolvedCompanyId,
    sourceCompanyKey: resolvedSourceKey,
    snapshot,
    snapshotId: null,
    companyName,
    context,
  };
}

function buildInstructions() {
  return `
You are LIT Pulse AI, a logistics sales intelligence agent.

Your job:
Analyze verified company, shipment, carrier, forwarder, container, supplier, contact, CRM, campaign, and web data to produce actionable account intelligence for freight sales teams.

Hard rules:
- Do not invent facts.
- Only use internal company/shipment/contact data provided in the payload or external web results from the web search tool.
- If data is missing, list it in missing_data.
- Never fabricate emails, phone numbers, job titles, company revenue, employee count, shipment volume, carriers, forwarders, suppliers, or contacts.
- Keep LIT trade data separate from external web signals.
- Use web search only for recent company news, announcements, expansions, layoffs, M&A, recalls, product launches, leadership changes, regulatory/tariff signals, and other relevant public context.
- Every web_sources item must be based on a real web result.
- similar_companies must contain exactly 5 companies.
- Each similar company must include search_url in this format: /search?q=Company%20Name
- Focus on practical freight sales opportunities.
- Prioritize why this company is worth contacting now.
- Identify carrier concentration, forwarder displacement, container mix, FCL/LCL opportunities, lane changes, supplier signals, and suggested outreach angles.
- Return only valid JSON matching the schema.
`;
}

function buildUserInput(payload: {
  mode: PulseAiMode;
  companyName: string;
  context: JsonRecord;
}) {
  return `
Generate a Pulse AI report for this company.

Mode:
${payload.mode}

Company:
${payload.companyName}

Internal LIT verified data:
${JSON.stringify(payload.context, null, 2)}

Return a structured report with:
- LIT Verified Trade Data insights
- External Web Signals
- Sales angle
- Suggested outreach
- 5 similar companies that the user can search in LIT
`;
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const output = safeArray(response?.output);

  for (const item of output) {
    const content = safeArray(item?.content);
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) return c.text;
    }
  }

  return "";
}

function normalizeSimilarCompanies(report: JsonRecord): JsonRecord {
  const similar = safeArray(report.similar_companies)
    .slice(0, 5)
    .map((item: any) => {
      const name = String(item?.name ?? "").trim();
      const searchQuery = String(item?.search_query ?? name).trim();
      const encoded = encodeURIComponent(searchQuery || name);
      return {
        name,
        reason: String(item?.reason ?? "").trim(),
        search_query: searchQuery || name,
        search_url: `/search?q=${encoded}`,
      };
    })
    .filter((item: any) => item.name);

  while (similar.length < 5) {
    similar.push({
      name: "",
      reason: "Similar company unavailable from current data.",
      search_query: "",
      search_url: "/search",
    });
  }

  return {
    ...report,
    similar_companies: similar,
  };
}

async function callOpenAi(payload: {
  companyName: string;
  mode: PulseAiMode;
  context: JsonRecord;
}) {
  const body = {
    model: OPENAI_MODEL,
    instructions: buildInstructions(),
    input: buildUserInput(payload),
    tools: [
      {
        type: "web_search",
        external_web_access: true,
      },
    ],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    max_output_tokens: 4500,
    text: {
      format: {
        type: "json_schema",
        name: "lit_pulse_ai_report",
        strict: true,
        schema: buildReportSchema(),
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("[pulse-ai-enrich] OpenAI error", data);
    throw new Error(data?.error?.message || `OpenAI request failed: ${res.status}`);
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new Error("OpenAI returned no structured output text.");
  }

  let report: JsonRecord;

  try {
    report = JSON.parse(outputText);
  } catch (error) {
    console.error("[pulse-ai-enrich] Failed to parse OpenAI JSON", {
      error,
      outputText,
    });
    throw new Error("OpenAI returned invalid JSON.");
  }

  return {
    response: data,
    report: normalizeSimilarCompanies(report),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Use POST.",
      },
      405,
    );
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          ok: false,
          code: "MISSING_SUPABASE_ENV",
          message:
            "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.",
        },
        500,
      );
    }

    if (!OPENAI_API_KEY) {
      return jsonResponse(
        {
          ok: false,
          code: "MISSING_OPENAI_API_KEY",
          message: "OPENAI_API_KEY is not configured.",
        },
        500,
      );
    }

    const body = (await req.json().catch(() => ({}))) as PulseAiRequest;

    const mode: PulseAiMode =
      body.mode === "pulse_page" ? "pulse_page" : "company_profile";

    const companyId =
      typeof body.company_id === "string" && body.company_id.trim()
        ? body.company_id.trim()
        : null;

    const sourceCompanyKey =
      typeof body.source_company_key === "string" &&
        body.source_company_key.trim()
        ? body.source_company_key.trim()
        : null;

    const forceRefresh = body.force_refresh === true;

    if (!companyId && !sourceCompanyKey) {
      return jsonResponse(
        {
          ok: false,
          code: "MISSING_COMPANY_IDENTIFIER",
          message: "Provide company_id or source_company_key.",
        },
        400,
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authResult = await resolveUserAndOrg(req, userClient, adminClient);

    if ("error" in authResult && authResult.error) {
      return authResult.error;
    }

    const user = authResult.user;
    const orgId = authResult.orgId;

    const planCode = await getOrgPlan(adminClient, orgId);
    const limit =
      PLAN_LIMITS[planCode]?.pulseAiReportsMonthly ??
      PLAN_LIMITS.free_trial.pulseAiReportsMonthly;

    // Super-admin bypass — checked server-side using service role. The
    // user's session JWT cannot fake this because we look at
    // `platform_admins`, env allowlist, and `app_metadata` (which is
    // service-role-only writable).
    const bypassLimits = await isSuperAdmin(adminClient, user);

    if (!forceRefresh) {
      const cached = await findCachedReport(adminClient, {
        orgId,
        companyId,
        sourceCompanyKey,
        mode,
      });

      if (cached) {
        return jsonResponse({
          ok: true,
          cached: true,
          report: cached.report_json,
          report_row: cached,
          plan: planCode,
          limit,
        });
      }
    }

    const used = await countMonthlyUsage(
      adminClient,
      orgId,
      "pulse_ai_report",
    );

    // Super-admin bypasses the cap (still logs usage below for audit
    // purposes via logUsage()). Normal users get the structured 403.
    if (used >= limit && !bypassLimits) {
      return jsonResponse(
        {
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: "pulse_ai_report",
          used,
          limit,
          plan: planCode,
          message:
            "Pulse AI report limit reached for this billing period. Upgrade or wait until the next reset.",
        },
        403,
      );
    }

    const loaded = await loadCompanyContext(adminClient, {
      orgId,
      companyId,
      sourceCompanyKey,
    });

    if (!loaded.companyId && !loaded.sourceCompanyKey) {
      return jsonResponse(
        {
          ok: false,
          code: "COMPANY_NOT_FOUND",
          message:
            "Could not resolve company from company_id or source_company_key.",
        },
        404,
      );
    }

    const { report, response } = await callOpenAi({
      companyName: loaded.companyName,
      mode,
      context: loaded.context,
    });

    const tokenUsage = response?.usage ?? null;

    const insertPayload = {
      org_id: orgId,
      company_id: loaded.companyId,
      source_company_key: loaded.sourceCompanyKey,
      generated_by_user_id: user.id,
      mode,
      report_json: report,
      input_snapshot_id: loaded.snapshotId,
      model: OPENAI_MODEL,
      token_usage_json: tokenUsage,
      status: "completed",
      error_message: null,
      expires_at: addDaysIso(REPORT_TTL_DAYS),
    };

    const { data: inserted, error: insertError } = await adminClient
      .from("lit_pulse_ai_reports")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError) {
      console.error("[pulse-ai-enrich] Insert error", insertError);
      return jsonResponse(
        {
          ok: false,
          code: "REPORT_SAVE_FAILED",
          message: insertError.message,
        },
        500,
      );
    }

    await logUsage(adminClient, {
      orgId,
      userId: user.id,
      feature: "pulse_ai_report",
      units: 1,
      metadata: {
        mode,
        company_id: loaded.companyId,
        source_company_key: loaded.sourceCompanyKey,
        model: OPENAI_MODEL,
        token_usage: tokenUsage,
      },
    });

    return jsonResponse({
      ok: true,
      cached: false,
      report,
      report_row: inserted,
      plan: planCode,
      used: used + 1,
      limit,
    });
  } catch (error) {
    console.error("[pulse-ai-enrich] Fatal error", error);

    return jsonResponse(
      {
        ok: false,
        code: "PULSE_AI_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Pulse AI report generation failed.",
      },
      500,
    );
  }
});