// pulse-coach-v2 — unified account assistant.
//
// Two modes:
//   1. proactive_sweep   — scans user/account state, returns up to 5 ranked cards
//   2. answer_question   — user asks Pulse Coach anything; returns markdown + CTA
//
// Both modes share the same context loader (user, org, subscription,
// usage, campaigns, inbox, integrations, recent activity) and the same
// system prompt. Mode only changes the user-facing task.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const COACH_MODEL = Deno.env.get("OPENAI_COACH_MODEL") || "gpt-4o-mini";

// Plan limits — informational only, used in copy. Keep in sync with
// frontend/src/lib/planLimits.ts.
const PLAN_LABEL: Record<string, string> = {
  free_trial: "Free Trial", starter: "Starter", growth: "Growth",
  scale: "Scale", enterprise: "Enterprise", expired: "Expired",
};
const APOLLO_DAILY_CAP: Record<string, number> = {
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
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Context loader — runs once per request, caches in memory.
// ─────────────────────────────────────────────────────────────────────
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
      // Days remaining on trial
      if (sub.trial_ends_at) {
        const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
        ctx.subscription.trial_days_remaining = Math.max(0, Math.ceil(ms / 86400000));
      }
    }
  } catch {}

  // Usage — saved companies, recent searches, Apollo usage today
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [savedRes, searchRes, apolloRes, briefRes, enrichRes] = await Promise.all([
      supa.from("lit_saved_companies").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supa.from("lit_pulse_search_events").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthStart),
      supa.from("lit_apollo_daily_usage").select("apollo_company_searches, apollo_contact_searches").eq("user_id", userId).eq("usage_date", today).maybeSingle(),
      supa.from("lit_pulse_ai_reports").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthStart),
      supa.from("lit_contacts").select("id", { count: "exact", head: true }).eq("created_by", userId).gte("created_at", monthStart),
    ]);
    const plan = ctx.subscription.plan_code || "free_trial";
    ctx.usage = {
      saved_companies_count: savedRes.count ?? 0,
      pulse_searches_this_month: searchRes.count ?? 0,
      apollo_company_searches_today: apolloRes.data?.apollo_company_searches ?? 0,
      apollo_contact_searches_today: apolloRes.data?.apollo_contact_searches ?? 0,
      apollo_daily_cap: APOLLO_DAILY_CAP[plan] ?? 0,
      pulse_briefs_this_month: briefRes.count ?? 0,
      enrichments_this_month: enrichRes.count ?? 0,
    };
  } catch (err) { console.warn("[coach-v2] usage load failed:", err); }

  // Campaigns
  try {
    const { data: camps } = await supa
      .from("lit_campaigns")
      .select("id, name, status, created_at, updated_at, health")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (Array.isArray(camps)) {
      ctx.campaigns = {
        drafts: camps.filter((c) => c.status === "draft"),
        active: camps.filter((c) => c.status === "active"),
        paused: camps.filter((c) => c.status === "paused"),
        attention: camps.filter((c) => c.health === "attention"),
        total: camps.length,
        latest: camps[0] || null,
      };
    }
  } catch {}

  // Inbox
  try {
    const { data: replies } = await supa
      .from("lit_inbound_emails")
      .select("id, from_email, subject, created_at, is_read")
      .eq("recipient_user_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10);
    ctx.inbox = {
      unread_replies_count: Array.isArray(replies) ? replies.length : 0,
      latest_reply: Array.isArray(replies) && replies.length ? replies[0] : null,
    };
  } catch {
    ctx.inbox = { unread_replies_count: 0 };
  }

  // Saved companies meta — which lack contacts
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

  // Integrations — gmail / outlook / resend / apollo
  try {
    const { data: accounts } = await supa
      .from("lit_email_accounts")
      .select("provider, verified, is_default")
      .eq("user_id", userId);
    ctx.integrations = {
      gmail_connected: Array.isArray(accounts) && accounts.some((a) => a.provider === "gmail"),
      outlook_connected: Array.isArray(accounts) && accounts.some((a) => a.provider === "outlook"),
      resend_verified: Array.isArray(accounts) && accounts.some((a) => a.provider === "resend" && a.verified),
      apollo_connected: true, // platform-level
    };
  } catch {
    ctx.integrations = { gmail_connected: false, outlook_connected: false, resend_verified: false, apollo_connected: true };
  }

  // Recent activity
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

  // Help articles — pulled once for reactive mode RAG
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

// ─────────────────────────────────────────────────────────────────────
// Shared system prompt
// ─────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Pulse Coach, the in-app assistant for Logistic Intel (LIT) — a freight-sales intelligence platform for brokers and forwarders.

IDENTITY:
- Friendly, concise, freight-operator tone. Not corporate. Never say "as an AI".
- Second person ("you", "your") to the active user.
- Never invent data. If a metric isn't in the context block, say "I don't have that yet — check {route}".

YOU CAN SEE:
- user, org, subscription (status, trial_ends_at, plan_code, plan_label, trial_days_remaining)
- usage: saved_companies_count, pulse_searches_this_month, apollo_company_searches_today + apollo_daily_cap, enrichments_this_month
- campaigns.drafts / active / paused / attention
- inbox.unread_replies_count
- saved.total_count, saved.companies_without_contacts
- integrations: gmail_connected, outlook_connected, resend_verified
- recent_activity.recent_searches

YOU CANNOT SEE:
- Raw shipment records — redirect to Pulse search or a company profile
- Stripe internals beyond `subscription` — redirect to /settings/billing
- Other users' private data
- The product roadmap or unreleased features

LIT KNOWLEDGE (always available):
- Pulse: LIT's natural-language search. Hits saved → lit_company_directory (Panjiva BOL) → Apollo. Returns ranked companies with shipment metrics when known.
- Command Center: full company profile (supply chain, contacts, briefs, campaigns).
- Outbound Engine: multi-touch campaigns (email + LinkedIn + call). Sends via Gmail/Outlook/Resend.
- Pulse AI Brief: per-company AI summary + recommended outreach angle.
- Trial = 14 days. After expiration, account gates behind upgrade. Login + Settings stay accessible.
- TEU = twenty-foot equivalent unit (ocean container).
- LCL = less than container load; FCL = full container load.
- HS code = Harmonized System, 6+ digit commodity classification.
- BOL = bill of lading.
- Plans: free_trial → starter ($99/mo) → growth → scale → enterprise.
- Data: Panjiva BOL for shipment activity, Apollo for firmographics, Lusha for contact verification.
- Apollo daily caps: free_trial 10, starter 25, growth 100, scale 500, enterprise 5000.

REFUSE / REDIRECT:
- General industry trivia not tied to LIT product → "I focus on helping you use LIT. For industry deep-dives, run a Pulse search or open a company profile."
- Anything destructive (delete, cancel, pay) → confirm via CTA route, don't execute.

TONE:
- Lead with the answer, no preamble.
- Always cite real numbers from context when available.
- Include a route hint when the answer needs follow-up: "→ Open: /app/<route>".`;

// ─────────────────────────────────────────────────────────────────────
// Proactive sweep — generate cards from context (rules + LLM ranking)
// ─────────────────────────────────────────────────────────────────────
function generateRuleBasedCards(ctx: ContextBlock): CoachCard[] {
  const cards: CoachCard[] = [];
  const now = new Date().toISOString();

  // Subscription cards
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

  // Inbox replies
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

  // Apollo cap
  const cap = ctx.usage?.apollo_daily_cap ?? 0;
  const used = ctx.usage?.apollo_company_searches_today ?? 0;
  if (cap > 0 && used >= cap * 0.85) {
    cards.push({
      id: crypto.randomUUID(),
      category: "subscription",
      priority: used >= cap ? "critical" : "high",
      title: used >= cap ? "Apollo daily cap reached" : "85% of Apollo cap used",
      body: `You've used ${used} of ${cap} Apollo searches today. Cap resets at midnight UTC. Upgrade for a higher limit.`,
      cta_label: "View plans",
      cta_url: "/settings/billing",
      dismissible: true,
      source_table: "lit_apollo_daily_usage",
      created_at: now,
    });
  }

  // Contact gap on saved companies
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

  // Mailbox not connected but drafts exist
  const hasMailbox = ctx.integrations?.gmail_connected || ctx.integrations?.outlook_connected;
  if (!hasMailbox && (ctx.campaigns?.drafts?.length ?? 0) > 0) {
    cards.push({
      id: crypto.randomUUID(),
      category: "system",
      priority: "high",
      title: "Connect a mailbox before launch",
      body: `You have ${ctx.campaigns.drafts.length} campaign draft${ctx.campaigns.drafts.length === 1 ? "" : "s"} but no Gmail or Outlook connected.`,
      cta_label: "Connect mailbox",
      cta_url: "/settings/integrations",
      dismissible: false,
      source_table: "lit_email_accounts",
      created_at: now,
    });
  }

  // Aging draft campaigns (>7 days)
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

  // Health == attention
  if (Array.isArray(ctx.campaigns?.attention) && ctx.campaigns.attention.length > 0) {
    const c = ctx.campaigns.attention[0];
    cards.push({
      id: crypto.randomUUID(),
      category: "campaign",
      priority: "high",
      title: `Campaign "${c.name}" needs attention`,
      body: "Bounce rate, sending account, or audience issue. Open the campaign for the specific reason.",
      cta_label: "Review",
      cta_url: `/app/campaigns/new?edit=${c.id}`,
      dismissible: false,
      source_table: "lit_campaigns",
      source_id: c.id,
      created_at: now,
    });
  }

  // Saved 0 companies → activation card
  if ((ctx.usage?.saved_companies_count ?? 0) === 0 && sub.status === "trialing") {
    cards.push({
      id: crypto.randomUUID(),
      category: "opportunity",
      priority: "high",
      title: "Save your first shipper",
      body: "Run a Pulse search on a lane you sell, then save 2-3 companies to lock in their profiles for outreach.",
      cta_label: "Open Pulse",
      cta_url: "/app/pulse",
      dismissible: true,
      source_table: null as any,
      created_at: now,
    });
  }

  return cards;
}

// Rank + cap cards
function rankAndCapCards(cards: CoachCard[]): CoachCard[] {
  const priorityWeight: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };
  return cards
    .sort((a, b) => (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0))
    .slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────
// Reactive — answer user question
// ─────────────────────────────────────────────────────────────────────
async function answerQuestion(ctx: ContextBlock, question: string): Promise<{
  classification: string;
  answer_md: string;
  cta: { label: string; url: string } | null;
  matched_articles?: { slug: string; title: string }[];
}> {
  // Lightweight retrieval — keyword match against help articles + categories.
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

  // Build a context block for the LLM
  const ctxBlock = JSON.stringify({
    user: ctx.user,
    org: ctx.org,
    subscription: ctx.subscription,
    usage: ctx.usage,
    campaigns: {
      drafts_count: ctx.campaigns?.drafts?.length ?? 0,
      active_count: ctx.campaigns?.active?.length ?? 0,
      paused_count: ctx.campaigns?.paused?.length ?? 0,
      attention_count: ctx.campaigns?.attention?.length ?? 0,
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
    // Hard fallback — return the most relevant help article verbatim if any.
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
      content: `Here is the live context for the user asking the question.\n\n<context>\n${ctxBlock}\n</context>\n\nHere are the most relevant help articles I retrieved:\n\n<help>\n${helpBlock}\n</help>\n\nQUESTION: ${question}\n\nReturn JSON only:\n{\n  "classification": "product_help" | "account_status" | "billing_question" | "usage_question" | "campaign_question" | "search_question" | "contact_question" | "technical_issue" | "data_question" | "recommendation",\n  "answer_md": "<= 4 sentences, markdown ok, lead with the answer, cite real numbers from context",\n  "cta": null | { "label": "<= 4 words", "url": "/app/..." }\n}`,
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
    return {
      classification: String(parsed.classification || "product_help"),
      answer_md: String(parsed.answer_md || "I don't have enough to answer that yet."),
      cta: parsed.cta || null,
      matched_articles: matched.map((a) => ({ slug: a.slug, title: a.title })),
    };
  } catch (err) {
    console.warn("[coach-v2] answer LLM failed:", err);
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

// ─────────────────────────────────────────────────────────────────────
// Serve
// ─────────────────────────────────────────────────────────────────────
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
    const result = await answerQuestion(ctx, question);
    return new Response(JSON.stringify({
      ok: true, mode, question,
      ...result,
      context_snapshot: summarizeContext(ctx),
    }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }

  // proactive_sweep
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
    apollo_today: { used: ctx.usage?.apollo_company_searches_today ?? 0, cap: ctx.usage?.apollo_daily_cap ?? 0 },
    campaigns: {
      drafts: ctx.campaigns?.drafts?.length ?? 0,
      active: ctx.campaigns?.active?.length ?? 0,
      paused: ctx.campaigns?.paused?.length ?? 0,
      attention: ctx.campaigns?.attention?.length ?? 0,
    },
    unread_replies: ctx.inbox?.unread_replies_count ?? 0,
    mailbox_connected: !!(ctx.integrations?.gmail_connected || ctx.integrations?.outlook_connected),
  };
}
