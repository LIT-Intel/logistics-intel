import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Pulse Coach — workspace-wide proactive nudges.
 *
 * Reads the user's account state (saved companies, recently enriched
 * contacts, campaigns, pulse briefs, activity), aggregates workspace
 * top lanes, and asks OpenAI to produce 3-5 short, actionable nudges
 * grounded in real account data. Returns structured JSON the UI can
 * render with deterministic action buttons + lane-focus references.
 *
 * Auth: requires a Supabase JWT bearer.
 * Data scope: server-side query is filtered to the user's saved
 * companies (lit_saved_companies.user_id = auth.uid()), so a session
 * never sees another user's accounts.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_COACH_MODEL") || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";

type SavedCompanyLite = {
  id: string;
  source_company_key: string | null;
  name: string;
  domain: string | null;
  shipments_12m: number | null;
  teu_12m: number | null;
  top_route_12m: string | null;
  last_shipment_date: string | null;
  saved_at: string | null;
};

type WorkspaceLane = {
  key: string;
  from_label: string;
  to_label: string;
  account_count: number;
  account_names: string[];
  shipments_total: number;
};

type Nudge = {
  id: string;
  title: string;
  body: string;
  cta: string;
  action: string | null;
  accent: string;
  lane_focus: { from: string | null; to: string | null } | null;
  account_keys: string[];
  contact_ids: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function aggregateLanes(saved: SavedCompanyLite[]): WorkspaceLane[] {
  const map = new Map<string, WorkspaceLane>();
  for (const c of saved) {
    const route = c.top_route_12m;
    if (!route) continue;
    const split = route.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
    if (split.length < 2) continue;
    const from = split[0];
    const to = split[1];
    const key = `${from.toLowerCase()}__${to.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.account_count += 1;
      existing.shipments_total += Number(c.shipments_12m) || 0;
      if (existing.account_names.length < 5) existing.account_names.push(c.name);
    } else {
      map.set(key, {
        key,
        from_label: from,
        to_label: to,
        account_count: 1,
        account_names: [c.name],
        shipments_total: Number(c.shipments_12m) || 0,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => {
      // Concentration first (multi-account lanes), then volume.
      if (b.account_count !== a.account_count) {
        return b.account_count - a.account_count;
      }
      return b.shipments_total - a.shipments_total;
    })
    .slice(0, 12);
}

const NUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nudges"],
  properties: {
    nudges: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "body",
          "cta",
          "action",
          "accent",
          "lane_focus",
          "account_keys",
          "contact_ids",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          action: {
            type: ["string", "null"],
            description:
              "Action key the UI handles. One of: campaign.create, campaign.add_contacts, contact.enrich, company.open, pulse.generate, lane.focus, none.",
          },
          accent: {
            type: "string",
            description:
              "Hex color hint for the nudge accent. Pick from #00F0FF, #3B82F6, #8B5CF6, #10B981, #F59E0B, #EF4444.",
          },
          lane_focus: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["from", "to"],
            properties: {
              from: { type: ["string", "null"] },
              to: { type: ["string", "null"] },
            },
          },
          account_keys: {
            type: "array",
            items: { type: "string" },
            description:
              "Subset of source_company_key values referenced by the nudge.",
          },
          contact_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Subset of lit_contacts.id values referenced by the nudge.",
          },
        },
      },
    },
  },
};

function buildSystemPrompt(): string {
  return `
You are LIT's Pulse Coach — a senior outbound BDR coach embedded in the user's logistics-intel workspace.

Your job is to scan the user's saved accounts, recently enriched contacts, campaigns, and trade lanes to surface 3 to 5 short, action-oriented nudges that move outbound forward. You are not a generic AI assistant; you're a colleague writing a quick Slack message.

Voice rules:
- 1 to 3 sentences per nudge. No filler. No "as an AI" anywhere.
- First-person familiar ("Worth a 5-min Pulse on Bernhardt — they popped onto your saved list Friday").
- Always reference real account names, contact names, dates, lanes, or numbers from the context. Never invent.
- CTA labels are verbs the user would say themselves ("Draft lane-launch campaign", "Add Sara to Q4 Outreach"). Avoid generic "Take action".
- One CTA per nudge.

When a nudge is about a specific lane, populate lane_focus with the from/to labels exactly as they appear in workspace_lanes. Otherwise lane_focus is null.

When a nudge references specific accounts, put their source_company_key values in account_keys. When it references contacts, put their ids in contact_ids.

Action key mapping:
- "campaign.create" — propose creating a new campaign
- "campaign.add_contacts" — propose adding specific enriched contacts to an existing campaign
- "contact.enrich" — propose enriching specific contacts
- "company.open" — propose deep-linking into a company profile
- "pulse.generate" — propose generating a Pulse AI brief for a specific company
- "lane.focus" — visual nudge only, just highlights a lane on the globe
- "none" — informational only

Honest empty state: if there's nothing worth saying, return at most 1 nudge with action "none" and a quiet message like "All clear — nothing urgent on your plate today."

Output strict JSON matching the schema. Do not wrap it in markdown.
`.trim();
}

function buildUserContext(payload: {
  pageContext?: string | null;
  saved: SavedCompanyLite[];
  workspaceLanes: WorkspaceLane[];
  recentEnriched: any[];
  contactsWithoutCampaign: any[];
  campaigns: any[];
  pulseBriefsMtd: number;
  searchesMtd: number;
  enrichedMtd: number;
  recentActivity: any[];
}): string {
  return `
Page the user is currently on: ${payload.pageContext || "dashboard"}

Workspace counts (this billing period):
- saved_companies: ${payload.saved.length}
- pulse_briefs_mtd: ${payload.pulseBriefsMtd}
- searches_mtd: ${payload.searchesMtd}
- enriched_contacts_mtd: ${payload.enrichedMtd}
- active_campaigns: ${payload.campaigns.filter((c: any) => /active|live/i.test(String(c.status || ""))).length}

Top workspace lanes (aggregated across saved accounts; concentration = how many of your accounts share the same lane):
${JSON.stringify(payload.workspaceLanes, null, 2)}

Saved companies (top 10 by recency):
${JSON.stringify(payload.saved.slice(0, 10), null, 2)}

Recently enriched contacts (last 7 days):
${JSON.stringify(payload.recentEnriched.slice(0, 12), null, 2)}

Enriched contacts NOT in any campaign:
${JSON.stringify(payload.contactsWithoutCampaign.slice(0, 10), null, 2)}

Campaigns (last 8 by updated_at):
${JSON.stringify(payload.campaigns.slice(0, 8), null, 2)}

Recent activity (last 7 days, last 15 events):
${JSON.stringify(payload.recentActivity.slice(0, 15), null, 2)}

Now produce 3 to 5 nudges in strict JSON.
`.trim();
}

function fallbackNudge(saved: number, drafts: number): Nudge[] {
  if (saved === 0) {
    return [
      {
        id: "fallback-empty-1",
        title: "Save your first company to start.",
        body: "Search for a company in your trade lane and save it — Pulse Coach turns on once you have at least one account on file.",
        cta: "Open search",
        action: "none",
        accent: "#3B82F6",
        lane_focus: null,
        account_keys: [],
        contact_ids: [],
      },
    ];
  }
  if (drafts > 0) {
    return [
      {
        id: "fallback-drafts-1",
        title: `${drafts} draft campaign${drafts === 1 ? "" : "s"} waiting on you.`,
        body: "Drafts don't send. Open one to add a sequence step or connect Gmail and launch.",
        cta: "Review drafts",
        action: "none",
        accent: "#3B82F6",
        lane_focus: null,
        account_keys: [],
        contact_ids: [],
      },
    ];
  }
  return [
    {
      id: "fallback-clear-1",
      title: "All clear — nothing urgent on your plate today.",
      body: "Coach refreshes when new contacts get enriched, briefs are generated, or shipment signals land.",
      cta: "Open search",
      action: "none",
      accent: "#3B82F6",
      lane_focus: null,
      account_keys: [],
      contact_ids: [],
    },
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = bearer(req);
    if (!token) {
      return jsonResponse(
        { ok: false, code: "UNAUTHENTICATED", error: "Missing bearer token." },
        401,
      );
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return jsonResponse(
        { ok: false, code: "UNAUTHENTICATED", error: "Invalid session." },
        401,
      );
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const pageContext: string = String(body?.page_context || "dashboard");

    // ── Fetch context (scoped to this user's saved companies) ─────────
    const { data: savedRows } = await supabase
      .from("lit_saved_companies")
      .select(
        "id, company_id, source_company_key, kpis, saved_at, company:lit_companies(id, name, domain, website)",
      )
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .limit(50);

    const saved: SavedCompanyLite[] = (savedRows || [])
      .map((r: any) => {
        const k = r?.kpis || {};
        const co = r?.company || {};
        return {
          id: String(r.company_id || co.id || ""),
          source_company_key: r.source_company_key ?? null,
          name: co.name || r.source_company_key || "Unknown company",
          domain: co.domain || co.website || null,
          shipments_12m: Number(k.shipments_12m) || null,
          teu_12m: Number(k.teu_12m) || null,
          top_route_12m: k.top_route_12m || null,
          last_shipment_date: k.last_shipment_date || null,
          saved_at: r.saved_at ?? null,
        };
      })
      .filter((c) => c.id);

    const workspaceLanes = aggregateLanes(saved);

    // Recent enriched contacts (last 7d, scoped to user's saved cos)
    const savedCompanyIds = saved.map((s) => s.id);
    let recentEnriched: any[] = [];
    let contactsWithoutCampaign: any[] = [];
    if (savedCompanyIds.length > 0) {
      const { data: cRows } = await supabase
        .from("lit_contacts")
        .select("id, company_id, full_name, title, email, linkedin_url, updated_at")
        .in("company_id", savedCompanyIds)
        .gte("updated_at", daysAgoIso(7))
        .order("updated_at", { ascending: false })
        .limit(20);
      recentEnriched = cRows || [];

      // Subset of recently enriched that have NO campaign membership.
      const ids = recentEnriched.map((c: any) => c.id).filter(Boolean);
      if (ids.length) {
        const { data: memberRows } = await supabase
          .from("campaign_contacts")
          .select("contact_id")
          .in("contact_id", ids);
        const inCampaign = new Set((memberRows || []).map((m: any) => m.contact_id));
        contactsWithoutCampaign = recentEnriched.filter((c: any) => !inCampaign.has(c.id));
      }
    }

    // Campaigns
    const { data: campaignRows } = await supabase
      .from("lit_campaigns")
      .select("id, name, status, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const campaigns = campaignRows || [];

    // Pulse briefs MTD
    const { count: pulseBriefsMtd } = await supabase
      .from("lit_pulse_ai_reports")
      .select("id", { count: "exact", head: true })
      .eq("generated_by_user_id", user.id)
      .gte("created_at", monthStartIso());

    // Searches MTD
    const { count: searchesMtd } = await supabase
      .from("lit_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "search")
      .gte("created_at", monthStartIso());

    // Enriched MTD
    const { count: enrichedMtd } = await supabase
      .from("lit_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "apollo_contact_enrich")
      .gte("created_at", monthStartIso());

    // Recent activity (last 7d)
    const { data: activityRows } = await supabase
      .from("lit_activity_events")
      .select("event_type, company_id, metadata, created_at")
      .eq("user_id", user.id)
      .gte("created_at", daysAgoIso(7))
      .order("created_at", { ascending: false })
      .limit(20);
    const recentActivity = activityRows || [];

    // ── Call OpenAI ───────────────────────────────────────────────────
    if (!OPENAI_API_KEY) {
      const drafts = campaigns.filter((c: any) =>
        /draft/i.test(String(c.status || "")),
      ).length;
      return jsonResponse({
        ok: true,
        nudges: fallbackNudge(saved.length, drafts),
        workspace_lanes: workspaceLanes,
        source: "fallback",
      });
    }

    const openaiBody = {
      model: OPENAI_MODEL,
      instructions: buildSystemPrompt(),
      input: buildUserContext({
        pageContext,
        saved,
        workspaceLanes,
        recentEnriched,
        contactsWithoutCampaign,
        campaigns,
        pulseBriefsMtd: typeof pulseBriefsMtd === "number" ? pulseBriefsMtd : 0,
        searchesMtd: typeof searchesMtd === "number" ? searchesMtd : 0,
        enrichedMtd: typeof enrichedMtd === "number" ? enrichedMtd : 0,
        recentActivity,
      }),
      max_output_tokens: 1500,
      text: {
        format: {
          type: "json_schema",
          name: "pulse_coach_nudges",
          strict: true,
          schema: NUDGE_SCHEMA,
        },
      },
    };

    const oaiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });
    const oaiData = await oaiRes.json().catch(() => ({}));
    if (!oaiRes.ok) {
      console.error("[pulse-coach] OpenAI error", oaiData);
      const drafts = campaigns.filter((c: any) =>
        /draft/i.test(String(c.status || "")),
      ).length;
      return jsonResponse({
        ok: true,
        nudges: fallbackNudge(saved.length, drafts),
        workspace_lanes: workspaceLanes,
        source: "fallback_openai_error",
        error: oaiData?.error?.message || `OpenAI ${oaiRes.status}`,
      });
    }

    let outputText = "";
    if (typeof oaiData?.output_text === "string" && oaiData.output_text.trim()) {
      outputText = oaiData.output_text;
    } else if (Array.isArray(oaiData?.output)) {
      for (const item of oaiData.output) {
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const c of content) {
          if (typeof c?.text === "string" && c.text.trim()) outputText = c.text;
        }
      }
    }
    let parsed: any = null;
    try {
      parsed = JSON.parse(outputText);
    } catch (_) {
      parsed = null;
    }
    const nudges: Nudge[] = Array.isArray(parsed?.nudges) ? parsed.nudges : [];

    return jsonResponse({
      ok: true,
      nudges:
        nudges.length > 0
          ? nudges
          : fallbackNudge(
              saved.length,
              campaigns.filter((c: any) => /draft/i.test(String(c.status || "")))
                .length,
            ),
      workspace_lanes: workspaceLanes,
      source: nudges.length > 0 ? "openai" : "fallback_empty",
      stats: {
        saved: saved.length,
        recent_enriched: recentEnriched.length,
        contacts_without_campaign: contactsWithoutCampaign.length,
        campaigns: campaigns.length,
        pulse_briefs_mtd: pulseBriefsMtd ?? 0,
        searches_mtd: searchesMtd ?? 0,
        enriched_mtd: enrichedMtd ?? 0,
      },
    });
  } catch (error: any) {
    console.error("[pulse-coach] fatal", error);
    return jsonResponse(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        error: error?.message || "Pulse Coach failed.",
      },
      500,
    );
  }
});
