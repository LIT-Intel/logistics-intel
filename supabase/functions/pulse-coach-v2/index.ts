// pulse-coach-v2 — unified account assistant.
//
// Two modes:
//   1. proactive_sweep   — scans user/account state, returns up to 5 ranked cards
//   2. answer_question   — user asks Pulse Coach anything; returns markdown + CTA
//
// Both modes share the same context loader (user, org, subscription,
// usage, campaigns, inbox, integrations, recent activity) and the same
// system prompt. Mode only changes the user-facing task.
//
// Vendor confidentiality: the user-facing surfaces (cards, answer_md,
// system prompt) NEVER name third-party data vendors or sending
// providers. Internal table / column names are unchanged.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("pulse-coach-v2");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const COACH_MODEL = Deno.env.get("OPENAI_COACH_MODEL") || "gpt-4o-mini";

const PLAN_LABEL: Record<string, string> = {
  free_trial: "Free Trial", starter: "Starter", growth: "Growth",
  scale: "Scale", enterprise: "Enterprise", expired: "Expired",
};
const DAILY_ENRICHMENT_CAP: Record<string, number> = {
  free_trial: 10, starter: 25, growth: 100, scale: 500, enterprise: 5000,
};

type CoachCard = {
  id: string;
  category:
    | "subscription" | "campaign" | "reply" | "contact"
    | "company" | "task" | "system" | "support" | "opportunity";
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  body: string;
  cta_label?: string;
  cta_url?: string;
  dismissible: boolean;
  source_table?: string;
  source_id?: string;
  created_at: string;
};

type ContextBlock = {
  user: any;
  org: any;
  subscription: any;
  usage: any;
  campaigns: any;
  inbox: any;
  saved: any;
  tasks: any;
  integrations: any;
  recent_activity: any;
  help_articles: any[];
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function loadContext(supa: any, userId: string): Promise<ContextBlock> {
  const ctx: ContextBlock = {
    user: {}, org: {}, subscription: {}, usage: {},
    campaigns: {}, inbox: {}, saved: {}, tasks: {},
    integrations: {}, recent_activity: {}, help_articles: [],
  };

  try {
    const { data: profile } = await supa
      .from("user_profiles")
      .select("user_id, full_name, first_name, role, organization_id, created_at")
      .eq("user_id", userId).maybeSingle();
    if (profile) {
      ctx.user = {
        id: profile.user_id,
        full_name: profile.full_name,
        first_name: profile.first_name || (profile.full_name || "").split(" ")[0] || null,
        role: profile.role,
      };
      if (profile.organization_id) {
        const { data: org } = await supa
          .from("organizations")
          .select("id, name, plan_code, member_count")
          .eq("id", profile.organization_id).maybeSingle();
        if (org) ctx.org = org;
      }
    }
  } catch {}

  try {
    const { data: au } = await supa.auth.admin.getUserById(userId);
    if (au?.user) {
      ctx.user.email = au.user.email;
      ctx.user.is_super_admin = (au.user.user_metadata as any)?.is_super_admin || false;
    }
  } catch {}

  try {
    const { data: sub } = await supa
      .from("subscriptions")
      .select("plan_code, status, trial_ends_at, current_period_end, cancel_at_period_end, started_at")
      .eq("user_id", userId).maybeSingle();
    if (sub) {
      ctx.subscription = sub;
      ctx.subscription.plan_label = PLAN_LABEL[sub.plan_code] || sub.plan_code;
      if (sub.trial_ends_at) {
        const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
        ctx.subscription.trial_days_remaining = Math.max(0, Math.ceil(ms / 86400000));
      }
    }
  } catch {}

  // Usage — saved companies, recent searches, daily enrichment usage.
  // The underlying table is named lit_apollo_daily_usage for legacy
  // reasons; we surface its counts as "enrichment lookups" everywhere
  // user-facing.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [savedRes, searchRes, dailyRes, briefRes, enrichRes] = await Promise.all([
      supa.from("lit_saved_companies").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supa.from("lit_pulse_search_events").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthStart),
      supa.from("lit_apollo_daily_usage").select("apollo_company_searches, apollo_contact_searches").eq("user_id", userId).eq("usage_date", today).maybeSingle(),
      supa.from("lit_pulse_ai_reports").select("id", { count: "exact", head: true }).eq("generated_by_user_id", userId).gte("created_at", monthStart),
      // lit_contacts has no created_by column; we attribute enrichments
      // via lit_activity_events.event_type = 'apollo_contact_enrich' which
      // is logged whenever a user enriches a contact.
      supa.from("lit_activity_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("event_type", "apollo_contact_enrich").gte("created_at", monthStart),
    ]);
    const plan = ctx.subscription.plan_code || "free_trial";
    ctx.usage = {
      saved_companies_count: savedRes.count ?? 0,
      pulse_searches_this_month: searchRes.count ?? 0,
      enrichment_lookups_today: (dailyRes.data?.apollo_company_searches ?? 0) + (dailyRes.data?.apollo_contact_searches ?? 0),
      daily_enrichment_cap: DAILY_ENRICHMENT_CAP[plan] ?? 0,
      pulse_briefs_this_month: briefRes.count ?? 0,
      enrichments_this_month: enrichRes.count ?? 0,
    };
  } catch (err) { log.warn("usage_load_failed", { err: String(err) }); }

  try {
    const { data: camps } = await supa
      .from("lit_campaigns")
      .select("id, name, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (Array.isArray(camps)) {
      ctx.campaigns = {
        drafts: camps.filter((c) => c.status === "draft"),
        active: camps.filter((c) => c.status === "active"),
        paused: camps.filter((c) => c.status === "paused"),
        attention: [],
        total: camps.length,
        latest: camps[0] || null,
      };
    }
  } catch {}

  // Scope inbound to this user's campaigns. lit_inbound_emails has no
  // recipient_user_id column, so we join via campaign_id. Without this
  // scoping, every user would see workspace-wide inbound counts, which
  // is a privacy leak across orgs.
  try {
    const { data: userCamps } = await supa
      .from("lit_campaigns")
      .select("id")
      .eq("user_id", userId);
    const campIds = Array.isArray(userCamps) ? userCamps.map((c: any) => c.id).filter(Boolean) : [];
    if (campIds.length === 0) {
      ctx.inbox = { unread_replies_count: 0, latest_reply: null };
    } else {
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: replies } = await supa
        .from("lit_inbound_emails")
        .select("id, from_email, subject, created_at")
        .in("campaign_id", campIds)
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(10);
      ctx.inbox = {
        unread_replies_count: Array.isArray(replies) ? replies.length : 0,
        latest_reply: Array.isArray(replies) && replies.length ? replies[0] : null,
      };
    }
  } catch {
    ctx.inbox = { unread_replies_count: 0, latest_reply: null };
  }

  try {
    const { data: savedRows } = await supa
      .from("lit_saved_companies")
      .select("id, source_company_key, snapshot, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (Array.isArray(savedRows)) {
      const keys = savedRows.map((r) => r.source_company_key).filter(Boolean);
      let contactCountByKey: Record<string, number> = {};
      if (keys.length) {
        try {
          const { data: contacts } = await supa
            .from("lit_contacts")
            .select("company_key", { count: "exact" })
            .in("company_key", keys);
          if (Array.isArray(contacts)) {
            for (const c of contacts) {
              const k = (c as any).company_key;
              if (k) contactCountByKey[k] = (contactCountByKey[k] || 0) + 1;
            }
          }
        } catch {}
      }
      const noContacts = savedRows.filter((r) => !contactCountByKey[r.source_company_key]);
      ctx.saved = {
        total_count: savedRows.length,
        companies_without_contacts: noContacts.length,
        recent_saved: savedRows.slice(0, 5).map((r) => ({
          id: r.id,
          name: r.snapshot?.company_name || r.snapshot?.name || "Unknown",
          saved_at: r.created_at,
        })),
      };
    }
  } catch {}

  // Mailbox state is exposed as a single boolean; the provider name is
  // deliberately hidden from user-facing context.
  try {
    const { data: accounts } = await supa
      .from("lit_email_accounts")
      .select("provider")
      .eq("user_id", userId);
    ctx.integrations = {
      mailbox_connected: Array.isArray(accounts) && accounts.length > 0,
    };
  } catch {
    ctx.integrations = { mailbox_connected: false };
  }

  try {
    const { data: searches } = await supa
      .from("lit_pulse_search_events")
      .select("raw_query, created_at, result_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    ctx.recent_activity = {
      recent_searches: Array.isArray(searches) ? searches : [],
    };
  } catch {}

  try {
    const { data: articles } = await supa
      .from("lit_help_articles")
      .select("slug, title, category, question, answer, keywords, route_url")
      .eq("is_active", true)
      .order("sort_order");
    ctx.help_articles = Array.isArray(articles) ? articles : [];
  } catch {}

  return ctx;
}

const SYSTEM_PROMPT = `You are Pulse Coach, the in-app assistant for Logistic Intel (LIT) — a freight-sales intelligence platform for brokers and forwarders.

IDENTITY:
- Friendly, concise, freight-operator tone. Not corporate. Never say "as an AI".
- Second person ("you", "your") to the active user.
- Never invent data. If a metric isn't in the context block, say "I don't have that yet — check {route}".
- NEVER name third-party data vendors or sending providers. Use "our enrichment partners", "our shipment-data sources", or "your sending mailbox". Names to AVOID in answers: Apollo, Lusha, Panjiva, ImportYeti, Resend, Gmail-by-name, Outlook-by-name.

YOU CAN SEE:
- user, org, subscription (status, trial_ends_at, plan_code, plan_label, trial_days_remaining)
- usage: saved_companies_count, pulse_searches_this_month, enrichment_lookups_today + daily_enrichment_cap, enrichments_this_month
- campaigns.drafts / active / paused
- inbox.unread_replies_count
- saved.total_count, saved.companies_without_contacts
- integrations: mailbox_connected (boolean; do not name the provider)
- recent_activity.recent_searches

DATA QUERIES (companies / lanes / shipments) ARE HANDLED UPSTREAM:
- Before you see the question, the server runs it through the Pulse search parser.
- If the question was a data query (geography, industry, lane, mode, carrier, commodity, etc), the server has ALREADY answered with a result list — you will not see those questions.
- The questions you DO see are about the user's account, plan, usage, campaigns, inbox, product help, or general "how do I" workflow — answer those from the context block + LIT KNOWLEDGE block below.
- Do NOT redirect users to Pulse search for data questions; the upstream pipeline already handles that path.

YOU CANNOT SEE:
- Stripe internals beyond subscription — redirect to /settings/billing
- Other users' private data
- The product roadmap or unreleased features

LIT KNOWLEDGE (always available):
- Pulse: LIT's natural-language search. Returns ranked companies with shipment metrics when known.
- Command Center: full company profile (supply chain, contacts, briefs, campaigns).
- Outbound Engine: multi-touch campaigns (email + LinkedIn + call). Sends through the user's connected mailbox.
- Pulse AI Brief: per-company AI summary + recommended outreach angle.
- Trial = 14 days. After expiration, account gates behind upgrade. Login + Settings stay accessible.
- TEU = twenty-foot equivalent unit (ocean container).
- LCL = less than container load; FCL = full container load.
- HS code = Harmonized System, 6+ digit commodity classification.
- BOL = bill of lading.
- Plans: free_trial → starter ($99/mo) → growth → scale → enterprise.
- Daily enrichment lookups: free_trial 10, starter 25, growth 100, scale 500, enterprise 5000.

REFUSE / REDIRECT:
- General industry trivia not tied to LIT product → "I focus on helping you use LIT. For industry deep-dives, run a Pulse search or open a company profile."
- Anything destructive (delete, cancel, pay) → confirm via CTA route, don't execute.

TONE:
- Lead with the answer, no preamble.
- Always cite real numbers from context when available.
- Include a route hint when the answer needs follow-up: "→ Open: /app/<route>".`;

function generateRuleBasedCards(ctx: ContextBlock): CoachCard[] {
  const cards: CoachCard[] = [];
  const now = new Date().toISOString();

  const sub = ctx.subscription || {};
  if (sub.status === "trialing" && sub.trial_days_remaining != null) {
    if (sub.trial_days_remaining <= 2) {
      cards.push({
        id: crypto.randomUUID(),
        category: "subscription",
        priority: "critical",
        title: `Trial ends in ${sub.trial_days_remaining} day${sub.trial_days_remaining === 1 ? "" : "s"}`,
        body: `You've searched ${ctx.usage?.pulse_searches_this_month ?? 0} companies and saved ${ctx.usage?.saved_companies_count ?? 0} prospects this month. Pick a plan to keep your workspace.`,
        cta_label: "Choose plan",
        cta_url: "/settings/billing",
        dismissible: false,
        source_table: "subscriptions",
        created_at: now,
      });
    } else if (sub.trial_days_remaining <= 5) {
      cards.push({
        id: crypto.randomUUID(),
        category: "subscription",
        priority: "high",
        title: `${sub.trial_days_remaining} days left on trial`,
        body: `Keep your saved companies, briefs, and campaigns alive — pick a plan before your trial ends.`,
        cta_label: "View plans",
        cta_url: "/settings/billing",
        dismissible: true,
        source_table: "subscriptions",
        created_at: now,
      });
    }
  } else if (["past_due", "incomplete", "unpaid"].includes(sub.status)) {
    cards.push({
      id: crypto.randomUUID(),
      category: "subscription",
      priority: "critical",
      title: "Payment needs attention",
      body: `Your subscription is in '${sub.status}' state. Update your payment method to keep access.`,
      cta_label: "Update payment",
      cta_url: "/settings/billing",
      dismissible: false,
      source_table: "subscriptions",
      created_at: now,
    });
  } else if (["expired", "cancelled", "canceled"].includes(sub.status)) {
    cards.push({
      id: crypto.randomUUID(),
      category: "subscription",
      priority: "critical",
      title: "Subscription inactive",
      body: "Your account is gated until you choose a plan. Login and Settings remain accessible.",
      cta_label: "Reactivate",
      cta_url: "/settings/billing",
      dismissible: false,
      source_table: "subscriptions",
      created_at: now,
    });
  }

  if ((ctx.inbox?.unread_replies_count ?? 0) >= 3) {
    cards.push({
      id: crypto.randomUUID(),
      category: "reply",
      priority: "high",
      title: `${ctx.inbox.unread_replies_count} replies need review`,
      body: `Inbound replies are sitting unread. Reply speed correlates with conversion — open the inbox.`,
      cta_label: "Open inbox",
      cta_url: "/app/inbox",
      dismissible: true,
      source_table: "lit_inbound_emails",
      created_at: now,
    });
  } else if ((ctx.inbox?.unread_replies_count ?? 0) >= 1) {
    cards.push({
      id: crypto.randomUUID(),
      category: "reply",
      priority: "medium",
      title: `${ctx.inbox.unread_replies_count} new repl${ctx.inbox.unread_replies_count === 1 ? "y" : "ies"}`,
      body: "Latest reply: " + (ctx.inbox.latest_reply?.subject || "subject unavailable"),
      cta_label: "Open inbox",
      cta_url: "/app/inbox",
      dismissible: true,
      source_table: "lit_inbound_emails",
      created_at: now,
    });
  }

  // Daily enrichment cap card — vendor-neutral copy.
  const cap = ctx.usage?.daily_enrichment_cap ?? 0;
  const used = ctx.usage?.enrichment_lookups_today ?? 0;
  if (cap > 0 && used >= cap * 0.85) {
    cards.push({
      id: crypto.randomUUID(),
      category: "subscription",
      priority: used >= cap ? "critical" : "high",
      title: used >= cap ? "Daily enrichment cap reached" : "85% of daily enrichment cap used",
      body: `You've used ${used} of ${cap} enrichment lookups today. Cap resets at midnight UTC. Upgrade for a higher limit.`,
      cta_label: "View plans",
      cta_url: "/settings/billing",
      dismissible: true,
      source_table: "lit_apollo_daily_usage",
      created_at: now,
    });
  }

  if ((ctx.saved?.companies_without_contacts ?? 0) >= 5) {
    cards.push({
      id: crypto.randomUUID(),
      category: "contact",
      priority: "medium",
      title: `${ctx.saved.companies_without_contacts} saved companies have no contacts`,
      body: "Enrich decision-makers before launching outreach so your campaigns have someone to send to.",
      cta_label: "Find contacts",
      cta_url: "/app/contacts",
      dismissible: true,
      source_table: "lit_saved_companies",
      created_at: now,
    });
  }

  const hasMailbox = ctx.integrations?.mailbox_connected;
  if (!hasMailbox && (ctx.campaigns?.drafts?.length ?? 0) > 0) {
    cards.push({
      id: crypto.randomUUID(),
      category: "system",
      priority: "high",
      title: "Connect a mailbox before launch",
      body: `You have ${ctx.campaigns.drafts.length} campaign draft${ctx.campaigns.drafts.length === 1 ? "" : "s"} but no sending mailbox connected yet.`,
      cta_label: "Connect mailbox",
      cta_url: "/settings/integrations",
      dismissible: false,
      source_table: "lit_email_accounts",
      created_at: now,
    });
  }

  if (Array.isArray(ctx.campaigns?.drafts)) {
    for (const d of ctx.campaigns.drafts.slice(0, 1)) {
      const ageMs = Date.now() - new Date(d.updated_at || d.created_at).getTime();
      if (ageMs > 7 * 86400000) {
        cards.push({
          id: crypto.randomUUID(),
          category: "campaign",
          priority: "medium",
          title: `Draft "${d.name}" is ${Math.floor(ageMs / 86400000)} days old`,
          body: "Finish setting up the campaign or archive it — drafts age out of context quickly.",
          cta_label: "Open draft",
          cta_url: `/app/campaigns/new?edit=${d.id}`,
          dismissible: true,
          source_table: "lit_campaigns",
          source_id: d.id,
          created_at: now,
        });
        break;
      }
    }
  }

  if ((ctx.usage?.saved_companies_count ?? 0) === 0 && sub.status === "trialing") {
    cards.push({
      id: crypto.randomUUID(),
      category: "opportunity",
      priority: "high",
      title: "Save your first shipper",
      body: "Run a Pulse search on a lane you sell, then save 2-3 companies to lock in their profiles for outreach.",
      cta_label: "Open Pulse",
      cta_url: "/app/prospecting",
      dismissible: true,
      source_table: null as any,
      created_at: now,
    });
  }

  return cards;
}

function rankAndCapCards(cards: CoachCard[]): CoachCard[] {
  const priorityWeight: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };
  return cards
    .sort((a, b) => (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0))
    .slice(0, 5);
}

// ──────────────────────────────────────────────────────────────────────────
// Inline search pipeline — wired 2026-06-19 per CEO Option A.
//
// Background: Before this commit, the Coach had no concept of a "data
// query." Every question — including "show me companies in georgia" —
// flowed through a free-form LLM whose system prompt explicitly said
// "YOU CANNOT SEE raw shipment records — redirect to Pulse search."
// Result: every data-shaped question returned the redirect string the
// user reported as "still not fixed" on day 5.
//
// The 108-dimension parser shipped in PR #112 (pulse-explore-parse)
// already understands geographic / industry / lane / mode / carrier
// queries. It was wired to the Pulse Search bar only — never to the
// Coach. This pipeline closes that gap:
//
//   1. tryParseDataQuery() — call pulse-explore-parse on the user's
//      question. If the parser returns a non-trivial filter object
//      (any data dimension populated), treat the question as a
//      data query.
//   2. runExplorerSearch() — call pulse-explore with the parsed
//      filters. Returns up to 8 matching companies.
//   3. buildDataAnswer() — synthesise a markdown answer that includes
//      the top 5 companies inline + a CTA to view the full result
//      set in the Pulse Explorer.
//
// Meta questions (account / plan / usage / campaigns / help) still
// flow through the existing OpenAI path unchanged.
// ──────────────────────────────────────────────────────────────────────────

type ParsedExplorerFilters = {
  query?: string;
  name?: string;
  industry?: string[];
  geo?: {
    regions?: string[];
    states?: string[];
    countries?: string[];
    cities?: string[];
    zips?: string[];
    counties?: string[];
    metros?: string[];
    ports_loading?: string[];
    ports_discharge?: string[];
  };
  trade_lane?: { origin?: string | null; destination?: string | null };
  mode?: string[];
  container?: {
    full_load?: boolean | null;
    refrigerated?: boolean;
    hazmat?: boolean;
    types?: string[];
  };
  commodity?: { hs_codes?: string[]; names?: string[] };
  opportunity_types?: string[];
  opportunity_score_min?: number | null;
  opportunity_score_max?: number | null;
  size?: {
    teu_min?: number | null;
    teu_max?: number | null;
    shipments_min?: number | null;
    shipments_max?: number | null;
    spend_min?: number | null;
    spend_max?: number | null;
  };
};

type CoachCompanyHit = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  opportunity_score?: number;
};

function hasDataDimensions(p: ParsedExplorerFilters | null): boolean {
  if (!p) return false;
  if (p.name && p.name.trim().length >= 2) return true;
  if (Array.isArray(p.industry) && p.industry.length > 0) return true;
  const g = p.geo ?? {};
  if ((g.regions?.length ?? 0) > 0) return true;
  if ((g.states?.length ?? 0) > 0) return true;
  if ((g.countries?.length ?? 0) > 0) return true;
  if ((g.cities?.length ?? 0) > 0) return true;
  if ((g.metros?.length ?? 0) > 0) return true;
  if ((g.zips?.length ?? 0) > 0) return true;
  if ((g.counties?.length ?? 0) > 0) return true;
  if ((g.ports_loading?.length ?? 0) > 0) return true;
  if ((g.ports_discharge?.length ?? 0) > 0) return true;
  if (p.trade_lane?.origin || p.trade_lane?.destination) return true;
  if (Array.isArray(p.mode) && p.mode.length > 0) return true;
  if ((p.commodity?.hs_codes?.length ?? 0) > 0) return true;
  if ((p.commodity?.names?.length ?? 0) > 0) return true;
  if (Array.isArray(p.opportunity_types) && p.opportunity_types.length > 0) return true;
  return false;
}

async function tryParseDataQuery(
  question: string,
  authToken: string,
): Promise<ParsedExplorerFilters | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/pulse-explore-parse`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "apikey": SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ query: question }),
    });
    if (!resp.ok) {
      log.warn("parser_non_ok", { status: resp.status });
      return null;
    }
    const data = await resp.json();
    return (data?.parsed ?? null) as ParsedExplorerFilters | null;
  } catch (err) {
    log.warn("parser_call_failed", { err: String(err) });
    return null;
  }
}

async function runExplorerSearch(
  parsed: ParsedExplorerFilters,
  authToken: string,
): Promise<{ companies: CoachCompanyHit[]; total: number }> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/pulse-explore`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
        "apikey": SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        filters: {
          name: parsed.name,
          industry: parsed.industry,
          geo: parsed.geo,
          size: parsed.size,
          opportunity_types: parsed.opportunity_types,
          opportunity_score_min: parsed.opportunity_score_min,
          opportunity_score_max: parsed.opportunity_score_max,
          trade_lane: parsed.trade_lane,
          mode: parsed.mode,
          container: parsed.container,
          commodity: parsed.commodity,
        },
        page: 1,
        page_size: 12,
      }),
    });
    if (!resp.ok) {
      log.warn("search_non_ok", { status: resp.status });
      return { companies: [], total: 0 };
    }
    const data = await resp.json();
    const rows = Array.isArray(data?.companies)
      ? data.companies
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data)
          ? data.data
          : [];
    const hits: CoachCompanyHit[] = rows.slice(0, 8).map((r: any) => ({
      id: String(r.id ?? r.company_id ?? r.uid ?? ""),
      name: String(r.name ?? r.company_name ?? r.display_name ?? "Unnamed account"),
      city: r.city ?? r.headquarters_city ?? undefined,
      state: r.state ?? r.headquarters_state ?? undefined,
      country: r.country ?? r.country_code ?? undefined,
      industry: r.industry ?? r.industry_label ?? undefined,
      opportunity_score: typeof r.opportunity_composite_score === "number"
        ? r.opportunity_composite_score
        : typeof r.opportunity_score === "number"
          ? r.opportunity_score
          : undefined,
    }));
    const total = typeof data?.total === "number"
      ? data.total
      : typeof data?.count === "number"
        ? data.count
        : hits.length;
    return { companies: hits, total };
  } catch (err) {
    log.warn("search_call_failed", { err: String(err) });
    return { companies: [], total: 0 };
  }
}

function describeFilters(p: ParsedExplorerFilters): string {
  const parts: string[] = [];
  if (p.name) parts.push(`"${p.name}"`);
  if (p.industry?.length) parts.push(p.industry.slice(0, 2).join(" / "));
  const g = p.geo ?? {};
  const place =
    g.cities?.[0] ||
    g.metros?.[0] ||
    g.states?.[0] ||
    g.countries?.[0] ||
    (g.regions?.[0] ? g.regions[0].replace(/_/g, " ") : null);
  if (place) parts.push(`in ${place}`);
  if (p.trade_lane?.origin || p.trade_lane?.destination) {
    parts.push(`${p.trade_lane.origin ?? "any"} → ${p.trade_lane.destination ?? "any"}`);
  }
  if (p.mode?.length) parts.push(`${p.mode[0]} freight`);
  if (p.commodity?.names?.length) parts.push(p.commodity.names[0]);
  return parts.length ? parts.join(" · ") : "your filters";
}

function buildExplorerCtaUrl(question: string): string {
  return `/app/prospecting?q=${encodeURIComponent(question)}`;
}

function buildDataAnswer(
  question: string,
  parsed: ParsedExplorerFilters,
  results: { companies: CoachCompanyHit[]; total: number },
): {
  classification: string;
  answer_md: string;
  cta: { label: string; url: string } | null;
  matched_articles?: { slug: string; title: string }[];
  companies?: CoachCompanyHit[];
  filters_applied?: ParsedExplorerFilters;
} {
  const { companies, total } = results;
  const filterLabel = describeFilters(parsed);

  if (!companies.length) {
    return {
      classification: "data_business_question",
      answer_md:
        `I searched for **${filterLabel}** and didn't find any matching accounts in your dataset. ` +
        `Try broadening the filter — for example, expand the geography or remove the industry constraint.`,
      cta: { label: "Open Pulse Explorer", url: buildExplorerCtaUrl(question) },
      companies: [],
      filters_applied: parsed,
    };
  }

  const top = companies.slice(0, 5);
  const lines = top.map((c, i) => {
    const loc = [c.city, c.state, c.country].filter(Boolean).join(", ");
    const tag = c.industry ? ` _(${c.industry})_` : "";
    return `${i + 1}. **${c.name}**${loc ? ` — ${loc}` : ""}${tag}`;
  });

  const more = total > top.length ? `\n\n_+${total - top.length} more — open the Pulse Explorer to view all._` : "";
  const answer_md =
    `Found **${total.toLocaleString()}** accounts matching **${filterLabel}**. Top matches:\n\n` +
    lines.join("\n") +
    more;

  return {
    classification: "data_business_question",
    answer_md,
    cta: { label: "View all in Pulse Explorer", url: buildExplorerCtaUrl(question) },
    companies,
    filters_applied: parsed,
  };
}

async function answerQuestion(
  ctx: ContextBlock,
  question: string,
  authToken: string,
): Promise<{
  classification: string;
  answer_md: string;
  cta: { label: string; url: string } | null;
  matched_articles?: { slug: string; title: string }[];
  companies?: CoachCompanyHit[];
  filters_applied?: ParsedExplorerFilters;
}> {
  // STEP 1 — Inline search pipeline. Run the parser first so we can
  // detect data-shaped queries ("companies in georgia", "pharma
  // importers", "Yantian → Long Beach") and answer them directly
  // instead of routing the user to a different surface. Meta /
  // account / billing / help queries return empty filter objects
  // and fall through to the existing LLM path below.
  if (authToken) {
    const parsed = await tryParseDataQuery(question, authToken);
    if (parsed && hasDataDimensions(parsed)) {
      const results = await runExplorerSearch(parsed, authToken);
      return buildDataAnswer(question, parsed, results);
    }
  }

  const q = question.toLowerCase();
  const matched = (ctx.help_articles || [])
    .map((a) => {
      let score = 0;
      const haystack = `${a.title} ${a.question} ${a.category} ${(a.keywords || []).join(" ")}`.toLowerCase();
      for (const word of q.split(/\s+/).filter((w) => w.length > 2)) {
        if (haystack.includes(word)) score += 1;
      }
      return { a, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ a }) => a);

  const ctxBlock = JSON.stringify({
    user: ctx.user,
    org: ctx.org,
    subscription: ctx.subscription,
    usage: ctx.usage,
    campaigns: {
      drafts_count: ctx.campaigns?.drafts?.length ?? 0,
      active_count: ctx.campaigns?.active?.length ?? 0,
      paused_count: ctx.campaigns?.paused?.length ?? 0,
      latest_name: ctx.campaigns?.latest?.name ?? null,
    },
    inbox: ctx.inbox,
    saved_summary: {
      total: ctx.saved?.total_count ?? 0,
      no_contacts: ctx.saved?.companies_without_contacts ?? 0,
    },
    integrations: ctx.integrations,
    recent_searches: ctx.recent_activity?.recent_searches?.slice(0, 3) ?? [],
  }, null, 2);

  const helpBlock = matched.length
    ? matched.map((a) => `## ${a.title}\n**Q:** ${a.question}\n**A:** ${a.answer}\n${a.route_url ? `**Route:** ${a.route_url}` : ""}`).join("\n\n")
    : "(no help articles matched — answer from the LIT KNOWLEDGE block in the system prompt)";

  if (!OPENAI_API_KEY) {
    if (matched.length) {
      const top = matched[0];
      return {
        classification: "product_help",
        answer_md: top.answer,
        cta: top.route_url ? { label: "Open", url: top.route_url } : null,
        matched_articles: matched.map((a) => ({ slug: a.slug, title: a.title })),
      };
    }
    return {
      classification: "product_help",
      answer_md: "I can't answer that right now — my AI assistant is offline. Try the help center or message support.",
      cta: null,
    };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Here is the live context for the user asking the question.\n\n<context>\n${ctxBlock}\n</context>\n\nHere are the most relevant help articles I retrieved:\n\n<help>\n${helpBlock}\n</help>\n\nQUESTION: ${question}\n\nReturn JSON only:\n{\n  "classification": "product_help" | "account_status" | "billing_question" | "usage_question" | "campaign_question" | "search_question" | "contact_question" | "technical_issue" | "data_business_question" | "recommendation",\n  "answer_md": "<= 4 sentences, markdown ok, lead with the answer, cite real numbers from context",\n  "cta": null | { "label": "<= 4 words", "url": "/app/..." }\n}\n\nCTA RULES (important):\n- If ANY retrieved help article has a Route, your cta.url MUST be that Route (the top-ranked one). Do NOT invent routes.\n- Valid routes ALWAYS start with "/app/" or "/settings/".\n- If no Route is available, set cta to null (the server will fall back).\n- Label should be verb-led and short, e.g. "Open Pulse", "View plans", "Find contacts".`,
    },
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: COACH_MODEL,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 600,
      }),
    });
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    let cta: { label: string; url: string } | null = parsed.cta || null;
    if (!cta && matched.length > 0) {
      const top = matched.find((a: any) => a.route_url);
      if (top) cta = { label: `Open ${top.title.toLowerCase()}`.slice(0, 30), url: top.route_url };
    }
    return {
      classification: String(parsed.classification || "product_help"),
      answer_md: String(parsed.answer_md || "I don't have enough to answer that yet."),
      cta,
      matched_articles: matched.map((a) => ({ slug: a.slug, title: a.title })),
    };
  } catch (err) {
    log.warn("answer_llm_failed", { err: String(err) });
    if (matched.length) {
      const top = matched[0];
      return {
        classification: "product_help",
        answer_md: top.answer,
        cta: top.route_url ? { label: "Open", url: top.route_url } : null,
        matched_articles: matched.map((a) => ({ slug: a.slug, title: a.title })),
      };
    }
    return {
      classification: "product_help",
      answer_md: "I hit a snag answering that. Try rephrasing, or message support if it persists.",
      cta: null,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  let body: any = {};
  try { body = await req.json(); } catch {}
  const mode = String(body?.mode || "proactive_sweep");

  const supaAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  let userId = "";
  try {
    const { data: userResp } = await supaAuth.auth.getUser(token);
    userId = userResp?.user?.id || "";
  } catch {}
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ctx = await loadContext(supa, userId);

  if (mode === "answer_question") {
    const question = String(body?.question || "").trim();
    if (!question) {
      return new Response(JSON.stringify({ ok: false, error: "question_required" }), {
        status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Server-side usage gate — every coach answer hits OpenAI, so trial
    // users could spam it and burn budget. check_usage_limit consults
    // plans.pulse_ai_limit per the caller's plan; platform admins bypass.
    // free_trial=5/mo, starter=0/mo, growth=100/mo, scale=500/mo,
    // enterprise=unlimited. Returns LIMIT_EXCEEDED on overflow.
    const { data: orgRow } = await supa
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const orgId = orgRow?.org_id ?? null;

    const { data: gate, error: gateErr } = await supa.rpc("check_usage_limit", {
      p_org_id: orgId,
      p_user_id: userId,
      p_feature_key: "pulse_ai",
      p_quantity: 1,
    });
    if (gateErr) {
      console.warn("[pulse-coach-v2] usage gate failed", gateErr.message);
    } else if (gate && (gate as any).ok === false) {
      return new Response(JSON.stringify(gate), {
        status: 403,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const result = await answerQuestion(ctx, question, token);

    // Record consumption so the counter increments toward the cap.
    // Best-effort — if the ledger insert fails we don't fail the request.
    await supa.from("lit_usage_ledger").insert({
      org_id: orgId,
      user_id: userId,
      feature_key: "pulse_ai",
      action_key: "coach_answer_question",
      quantity: 1,
      metadata: { question_chars: question.length },
    });

    return new Response(JSON.stringify({
      ok: true, mode, question,
      ...result,
      context_snapshot: summarizeContext(ctx),
    }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  const cards = rankAndCapCards(generateRuleBasedCards(ctx));
  return new Response(JSON.stringify({
    ok: true,
    mode: "proactive_sweep",
    cards,
    context_snapshot: summarizeContext(ctx),
  }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
});

function summarizeContext(ctx: ContextBlock) {
  return {
    user_first_name: ctx.user?.first_name || null,
    plan: ctx.subscription?.plan_code || null,
    plan_label: ctx.subscription?.plan_label || null,
    trial_days_remaining: ctx.subscription?.trial_days_remaining ?? null,
    saved_count: ctx.usage?.saved_companies_count ?? 0,
    searches_this_month: ctx.usage?.pulse_searches_this_month ?? 0,
    enrichment_today: { used: ctx.usage?.enrichment_lookups_today ?? 0, cap: ctx.usage?.daily_enrichment_cap ?? 0 },
    campaigns: {
      drafts: ctx.campaigns?.drafts?.length ?? 0,
      active: ctx.campaigns?.active?.length ?? 0,
      paused: ctx.campaigns?.paused?.length ?? 0,
    },
    unread_replies: ctx.inbox?.unread_replies_count ?? 0,
    mailbox_connected: !!(ctx.integrations?.mailbox_connected),
  };
}
