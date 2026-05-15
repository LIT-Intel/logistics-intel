import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type PulseAiMode = "company_profile" | "pulse_page";

type PulseAiRequest = {
  company_id?: string | null;
  source_company_key?: string | null;
  mode?: PulseAiMode;
  force_refresh?: boolean;
  freight_market_intelligence?: Record<string, any> | null;
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
 * Sources, all checked server-side with the service-role client:
 *   1. `public.platform_admins` table (canonical — same pattern the
 *      affiliate-admin function uses).
 *   2. `SUPER_ADMIN_EMAILS` env var (comma-separated allowlist).
 *   3. `app_metadata.is_super_admin` / `app_metadata.role` set on the
 *      auth user. (`app_metadata` is editable only by service role —
 *      never trust `user_metadata` for privilege escalation.)
 *   4. `org_members.role` IN ('owner','admin','super_admin') for the
 *      user's primary org. Workspace owners/admins should not be capped
 *      by their own plan-tier limits when generating intel reports.
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

  // 4. org workspace owner / admin — check across the three known
  //    membership tables so this works regardless of which one the
  //    deployment uses.
  try {
    const { data: m1 } = await adminClient
      .from("org_members")
      .select("role")
      .eq("user_id", user.id);
    if (Array.isArray(m1)) {
      for (const row of m1) {
        const r = String(row?.role || "").toLowerCase();
        if (r === "owner" || r === "admin" || r === "super_admin") return true;
      }
    }
  } catch (_) {
    // table may not exist
  }
  try {
    const { data: m2 } = await adminClient
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id);
    if (Array.isArray(m2)) {
      for (const row of m2) {
        const r = String(row?.role || "").toLowerCase();
        if (r === "owner" || r === "admin" || r === "super_admin") return true;
      }
    }
  } catch (_) {
    // table may not exist
  }
  try {
    const { data: m3 } = await adminClient
      .from("organization_memberships")
      .select("org_role")
      .eq("user_id", user.id);
    if (Array.isArray(m3)) {
      for (const row of m3) {
        const r = String(row?.org_role || "").toLowerCase();
        if (r === "owner" || r === "admin" || r === "super_admin") return true;
      }
    }
  } catch (_) {
    // table may not exist
  }

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

Freight market intelligence rules:
- When the payload contains a freight_market_intelligence block, treat its lane_matches list as ground-truth current spend per lane. The numbers were computed from the FBX (Freightos Baltic Index) plus LIT-extended reference rates at the as_of_date shown.
- Use those numbers naturally in sales_angle, why_now, lane_insights, and company_summary. Do not paste them verbatim like a stat dump.
- Use the per-lane market_spend_usd to anchor revenue-opportunity language. Example phrasing (do NOT copy verbatim — match the actual data):
  - "On Italy → US East Coast, they move ~1,881 TEU a year. At today's $1,100/TEU benchmark, that's roughly $2.07M of ocean spend you could compete for."
  - "Their carrier reports ~$330K in customs value on this lane, but the actual freight market value is closer to $2.07M — a 6× gap that usually means they're under-disclosing or working with a heavy NVOCC."
- When the total_market_spend_usd is materially larger than the snapshot's est_spend_12m, you may flag it as a buying signal: it usually means the buyer is consolidating or under-disclosing, both of which are useful angles.
- Keep tone like a senior account manager talking to another rep — confident, specific, never salesy.
- Never round below the nearest $10K when the value is over $1M; never invent a number that isn't in lane_matches.
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
  // The Responses API exposes `output_text` as a convenience join of all
  // assistant-message text content. Prefer that when present.
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const output = safeArray(response?.output);

  // Prefer items whose `type === "message"` and `role === "assistant"` — this
  // skips `web_search_call` / `reasoning` items that don't carry the JSON
  // payload. Inside a message, prefer `output_text` content blocks.
  const messageTexts: string[] = [];
  for (const item of output) {
    const itemType = String(item?.type || "").toLowerCase();
    if (itemType && itemType !== "message") continue;
    const role = String(item?.role || "").toLowerCase();
    if (role && role !== "assistant") continue;
    const content = safeArray(item?.content);
    for (const c of content) {
      const cType = String(c?.type || "").toLowerCase();
      if (cType && cType !== "output_text" && cType !== "text") continue;
      if (typeof c?.text === "string" && c.text.trim()) {
        messageTexts.push(c.text);
      }
    }
  }
  if (messageTexts.length) return messageTexts.join("");

  // Fallback: take any text content we can find.
  for (const item of output) {
    const content = safeArray(item?.content);
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) return c.text;
    }
  }

  return "";
}

function extractRefusal(response: any): string | null {
  const output = safeArray(response?.output);
  for (const item of output) {
    const content = safeArray(item?.content);
    for (const c of content) {
      const cType = String(c?.type || "").toLowerCase();
      if (cType === "refusal" && typeof c?.refusal === "string") {
        return c.refusal;
      }
    }
  }
  return null;
}

/**
 * Strip common wrappers OpenAI sometimes returns even under json_schema mode:
 * - Leading/trailing markdown fences (```json ... ```)
 * - BOMs / zero-width chars
 * - Leading prose before the first `{` and trailing prose after last `}`
 */
function sanitizeJsonText(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return text;

  // Strip BOM / zero-width
  text = text.replace(/^﻿/, "").replace(/^​+/, "");

  // Strip markdown fences
  text = text.replace(/^```(?:json|JSON)?\s*\n?/, "");
  text = text.replace(/\n?```\s*$/, "");
  text = text.trim();

  // If there's prose before/after the JSON object, slice to the outer braces.
  if (text && text[0] !== "{" && text[0] !== "[") {
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    const candidates = [firstBrace, firstBracket].filter((i) => i >= 0);
    if (candidates.length) {
      text = text.slice(Math.min(...candidates));
    }
  }
  const lastChar = text[text.length - 1];
  if (lastChar && lastChar !== "}" && lastChar !== "]") {
    const lastBrace = text.lastIndexOf("}");
    const lastBracket = text.lastIndexOf("]");
    const end = Math.max(lastBrace, lastBracket);
    if (end > 0) text = text.slice(0, end + 1);
  }

  return text.trim();
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
      // Responses API web_search tool — no `external_web_access` field; that
      // was an invalid key and caused silent fallbacks on some accounts.
      { type: "web_search" },
    ],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    // Bumped from 4500 → 8000 because web_search reasoning + structured JSON
    // routinely hit the cap and truncated the message mid-object, which is
    // what produced "OpenAI returned invalid JSON" before this fix.
    max_output_tokens: 8000,
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

  // Model refusal — surface a friendly error rather than "invalid JSON".
  const refusal = extractRefusal(data);
  if (refusal) {
    console.error("[pulse-ai-enrich] OpenAI refusal", { refusal });
    throw new Error(
      `Pulse AI couldn't generate this report (model refusal): ${refusal.slice(0, 200)}`,
    );
  }

  // Detect output truncation explicitly — token cap, content filter, etc.
  // The Responses API exposes status + incomplete_details on the response.
  const status = String(data?.status || "").toLowerCase();
  const incompleteReason = data?.incomplete_details?.reason ||
    data?.incomplete_details?.code || null;
  if (status === "incomplete" || incompleteReason) {
    console.error("[pulse-ai-enrich] OpenAI response incomplete", {
      status,
      incompleteReason,
      usage: data?.usage,
    });
    if (incompleteReason === "max_output_tokens" || status === "incomplete") {
      throw new Error(
        "Pulse AI response was truncated before completion. Please retry — if this persists, the report scope is too large for the current token budget.",
      );
    }
  }

  const rawOutputText = extractOutputText(data);

  if (!rawOutputText) {
    console.error("[pulse-ai-enrich] OpenAI returned empty output", {
      status: data?.status,
      output_types: safeArray(data?.output).map((o: any) => o?.type),
    });
    throw new Error("OpenAI returned no structured output text.");
  }

  const sanitized = sanitizeJsonText(rawOutputText);

  let report: JsonRecord;

  try {
    report = JSON.parse(sanitized);
  } catch (error) {
    const snippet = rawOutputText.slice(0, 200).replace(/\s+/g, " ");
    console.error("[pulse-ai-enrich] Failed to parse OpenAI JSON", {
      error: error instanceof Error ? error.message : String(error),
      rawLength: rawOutputText.length,
      sanitizedLength: sanitized.length,
      rawHead: rawOutputText.slice(0, 500),
      rawTail: rawOutputText.slice(-200),
    });
    throw new Error(
      `OpenAI returned invalid JSON (first 200 chars: ${snippet})`,
    );
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

    // Phase 4 — caller-supplied lane-matched freight market intelligence.
    // Computed by the Company Profile UI from lit_freight_rate_benchmarks +
    // the company's top routes, using the LCL-bounded TEU split. Optional;
    // when absent the model falls back to the snapshot's importer-reported
    // total_shipping_cost (which structurally undervalues high-TEU lanes).
    const freightMarketIntelligence =
      body && typeof body.freight_market_intelligence === "object"
        ? body.freight_market_intelligence
        : null;

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

    // Inject the caller-supplied freight market intelligence into the
    // context the model sees, so sales_angle / why_now / lane_insights /
    // company_summary can ground spend talk in current FBX rates.
    const enrichedContext = freightMarketIntelligence
      ? { ...loaded.context, freight_market_intelligence: freightMarketIntelligence }
      : loaded.context;

    const { report, response } = await callOpenAi({
      companyName: loaded.companyName,
      mode,
      context: enrichedContext,
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