// Page-level tutorial content map. Source of truth for Pulse Coach's
// page-aware onboarding and quick-prompt surfaces.
//
// Each entry powers two surfaces in the floating coach drawer:
//   1. Tutorial card  — prepended to nudges on first visit to the
//      matching route; persists completion to lit_user_onboarding_state
//      so it does not re-show unless reset.
//   2. Quick prompts  — rendered as chips above the chat composer
//      whenever the user is on a matching route; click pre-fills the
//      composer with the prompt text.
//
// Adding a new tutorial: append an entry, ensure `page_key` is unique,
// confirm `route_pattern` matches `useLocation().pathname` (segment
// prefix). `active: false` hides the tutorial card but still surfaces
// the quick prompts when the user lands on the route.

export type TutorialStep = {
  title: string;
  body: string;
};

export type TutorialConfig = {
  /** Stable identifier persisted to lit_user_onboarding_state.page_key. */
  page_key: string;
  /** Match against window.location.pathname. Matches if the pathname
   *  EQUALS this string OR starts with this string + "/". */
  route_patterns: string[];
  /** Friendly title for the tutorial card. */
  title: string;
  /** One- or two-sentence framing — what this page is for. Markdown ok. */
  intro_md: string;
  /** 3–5 quick steps. Rendered as a numbered list inside the card. */
  steps: TutorialStep[];
  /** Action the user should take first. Becomes the primary CTA on the card. */
  first_action: {
    label: string;
    /** Internal route (e.g. /app/companies) or an explicit external URL. */
    route?: string;
    /** If true, this is a "Show me how" affordance — open a video / brief. */
    show_me_how?: boolean;
  };
  /** 2–4 page-aware prompts surfaced as chips above the chat composer.
   *  Clicking pre-fills the chat input with this text. */
  quick_prompts: string[];
  /** Optional explainer video. Null when not produced yet. */
  video_url: string | null;
  /** Pulse Coach intro line spoken when the tutorial card opens. */
  coach_intro: string;
  /** Set false when the page does not exist in the app yet (e.g. Deal
   *  Builder). The card is suppressed; quick prompts skipped. */
  active: boolean;
  /** Restrict to specific roles when set. Otherwise visible to every
   *  authenticated user. */
  required_role?: "super_admin" | "admin";
};

export const TUTORIALS: TutorialConfig[] = [
  // ──────────────────────────────────────────────────────────────────
  // Dashboard
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "dashboard",
    route_patterns: ["/app/dashboard"],
    title: "Welcome to LIT",
    intro_md:
      "The dashboard is your morning briefing — saved-company activity, new signals, and the next action LIT recommends today.",
    steps: [
      { title: "Scan trade lanes", body: "The globe aggregates every lane your saved companies move on. Click any lane to filter the workspace." },
      { title: "Open Pulse Coach", body: "The cyan pill bottom-right surfaces alerts (replies waiting, contacts to enrich, accounts losing freight)." },
      { title: "Pick a thread", body: "What Matters Now ranks saved accounts by recent shipment activity. Open the top one to start your day." },
      { title: "Watch enrichments", body: "Recent Enrichments shows decision-makers added in the last 7 days — add them to a sequence with one click." },
    ],
    first_action: { label: "Open the top account", route: "/app/companies" },
    quick_prompts: [
      "Show me what changed this week",
      "Where should I start today?",
      "Explain my usage this month",
      "Which saved companies need attention?",
    ],
    video_url: null,
    coach_intro:
      "Quick tour — 30 seconds. The dashboard is built around the question \"what's worth my time today?\"",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Discover / Search
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "discover",
    route_patterns: ["/app/search"],
    title: "Find your first freight lead",
    intro_md:
      "Search starts with a company, industry, lane, or HS code. LIT pulls shipment activity, scoring fit before you spend an enrichment credit.",
    steps: [
      { title: "Type a phrase", body: "\"Cold-chain shippers in Texas\" or \"furniture importers from Vietnam\" — Pulse parses natural language." },
      { title: "Read the signals", body: "Each card shows 12-month shipments, top lanes, and carrier mix. Stronger signals score higher." },
      { title: "Save the strongest", body: "Saved companies land in Command Center. Pulse Coach starts watching them for new shipment activity." },
    ],
    first_action: { label: "Run your first search", route: "/app/search" },
    quick_prompts: [
      "Help me find freight leads",
      "Search for importers in cold-chain logistics",
      "What makes a good prospect?",
      "Find companies shipping from Vietnam to the US",
    ],
    video_url: null,
    coach_intro: "Search is signal-first. Tell me a lane or industry and I'll spot active shippers.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Pulse (lead prospecting / Pulse AI)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "pulse",
    route_patterns: ["/app/prospecting", "/app/pulse"],
    title: "Pulse — your prospecting engine",
    intro_md:
      "Pulse builds prospecting lists from real shipment activity. Pick a market, refine the filter, and turn the matches into outreach.",
    steps: [
      { title: "Define the market", body: "Industry, lane, HS chapter, port — any combination narrows the pool." },
      { title: "Inspect the cards", body: "Every prospect carries a fit score, shipment cadence, and top contacts when known." },
      { title: "Bulk-add to Command Center", body: "Multi-select rows and save the cohort. Pulse Coach watches them for changes." },
      { title: "Ask Pulse for context", body: "Open any company and ask Pulse Coach \"why does this fit?\" for a one-paragraph rationale." },
    ],
    first_action: { label: "Build a prospecting list", route: "/app/prospecting" },
    quick_prompts: [
      "Build a prospecting list for Mexico cross-border",
      "Find companies shipping from Vietnam to the US",
      "Explain this company's freight signal",
      "Who else moves freight on this lane?",
    ],
    video_url: null,
    coach_intro: "Pulse is built for repeatable lists. Tell me your target and I'll shape the filter.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Command Center (saved companies)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "command_center",
    route_patterns: ["/app/companies", "/app/command-center"],
    title: "Command Center — your accounts",
    intro_md:
      "Command Center is the CRM for everything you've saved. Filter by lane, score, or status; one click drills into the company profile.",
    steps: [
      { title: "Sort by activity", body: "Last shipment + 12-month volume sit at the right. Sort to find the freshest movers." },
      { title: "Drill into a profile", body: "Click any row → Supply Chain, Contacts, Pulse AI, Rate Benchmark, Campaign tabs." },
      { title: "Enrich + add to campaign", body: "From the profile, find contacts, then drop them into an Outbound Engine sequence." },
    ],
    first_action: { label: "Open your saved accounts", route: "/app/companies" },
    quick_prompts: [
      "Who should I follow up with this week?",
      "Show my hottest saved companies",
      "Create a campaign from this list",
      "Which saved accounts have no contacts?",
    ],
    video_url: null,
    coach_intro: "Command Center is your roster. I'll keep it sorted by what's actually moving.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Outbound Engine (campaigns)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "outbound_engine",
    route_patterns: [
      "/app/campaigns",
      "/app/campaigns/new",
      "/app/campaigns/analytics",
      "/app/inbox",
    ],
    title: "Outbound Engine",
    intro_md:
      "Multi-touch sequences across email, LinkedIn, and calls. Audience comes from saved companies + enriched contacts.",
    steps: [
      { title: "Pick a play", body: "Lane Launch, Conquest, Win-back, RFP follow-up — each comes with a pre-written cadence." },
      { title: "Select your audience", body: "Pull from saved companies. Filters narrow by lane, industry, recent activity." },
      { title: "Connect a mailbox", body: "Link your sending mailbox in Settings before launch. Domain auth + warmup status visible there." },
      { title: "Launch + monitor", body: "Replies route to /app/inbox. Pulse Coach surfaces unread replies on the dashboard." },
    ],
    first_action: { label: "Start a new campaign", route: "/app/campaigns/new" },
    quick_prompts: [
      "Write a sequence for cold-chain importers",
      "Create a follow-up email",
      "Explain why this audience fits the play",
      "Which campaigns need my attention?",
    ],
    video_url: null,
    coach_intro: "Campaigns are best when the audience is tight. I'll help shape the list first.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Deal Builder (page does not exist yet — config ready)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "deal_builder",
    route_patterns: ["/app/deals", "/app/deal-builder"],
    title: "Deal Builder",
    intro_md:
      "Turn a saved account into a quote — rate context, lane benchmark, suggested terms, and a one-click hand-off to outreach.",
    steps: [
      { title: "Pick the account", body: "Pull from Command Center or open a fresh prospect." },
      { title: "Set the lane", body: "Origin / destination / mode pulls the FBX or LIT-bench rate." },
      { title: "Suggest next steps", body: "LIT recommends a follow-up sequence + Pulse AI rationale." },
    ],
    first_action: { label: "Open Deal Builder", route: "/app/deals" },
    quick_prompts: [
      "Help me build a quote for this account",
      "Suggest next steps to close",
      "Turn this company into an opportunity",
    ],
    video_url: null,
    coach_intro: "Deal Builder turns research into a quote. Tell me the account and lane.",
    // Page does not exist yet — tutorial card suppressed until route ships.
    active: false,
  },

  // ──────────────────────────────────────────────────────────────────
  // Settings / Integrations
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "settings_integrations",
    route_patterns: ["/app/settings"],
    title: "Settings & integrations",
    intro_md:
      "Connect your mailbox, manage enrichment credits, invite teammates, and reset your onboarding tour any time.",
    steps: [
      { title: "Connect a mailbox", body: "Required before launching campaigns. Walk through the connect flow in Integrations." },
      { title: "Set your signature", body: "Personal signature renders at the end of every campaign email." },
      { title: "Invite teammates", body: "Send seats via Team. Roles: member, admin, super-admin." },
    ],
    first_action: { label: "Open Settings", route: "/app/settings" },
    quick_prompts: [
      "How do I connect my mailbox?",
      "Where do I invite a teammate?",
      "Reset my onboarding tour",
      "Why is my mailbox disconnected?",
    ],
    video_url: null,
    coach_intro: "Settings is where you wire LIT to your work tools.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Billing (optional)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "billing",
    route_patterns: ["/app/billing"],
    title: "Billing",
    intro_md:
      "Plans, usage, and invoices. Toggle to annual for a 20% discount; usage caps for Pulse and enrichment live here.",
    steps: [
      { title: "Check usage", body: "Searches, enrichments, briefs — all metered against your plan." },
      { title: "Compare plans", body: "Free trial → Starter → Growth → Scale → Enterprise. See current vs. next tier." },
      { title: "Manage in Stripe", body: "Card, address, invoices — Stripe portal handles all of it." },
    ],
    first_action: { label: "Open Billing", route: "/app/billing" },
    quick_prompts: [
      "How much have I used this month?",
      "What does Growth unlock that I don't have today?",
      "Switch to annual billing",
    ],
    video_url: null,
    coach_intro: "Quick read on your plan and usage.",
    active: true,
  },

  // ──────────────────────────────────────────────────────────────────
  // Admin (super-admin only)
  // ──────────────────────────────────────────────────────────────────
  {
    page_key: "admin",
    route_patterns: ["/app/admin"],
    title: "Admin dashboard",
    intro_md:
      "Workspace-wide view: users, plan distribution, demo requests, partner approvals, and onboarding completion.",
    steps: [
      { title: "Review demo requests", body: "Triage marketing-site signups." },
      { title: "Manage partners", body: "Approve affiliate applications, edit commission, see referrals." },
      { title: "Track onboarding", body: "Per-page completion across all users." },
    ],
    first_action: { label: "Open Admin", route: "/app/admin" },
    quick_prompts: [
      "Show me trial users this week",
      "Which partners need attention?",
      "Onboarding completion across the workspace",
    ],
    video_url: null,
    coach_intro: "Admin is workspace-wide. I'll surface what needs your call this week.",
    active: true,
    required_role: "super_admin",
  },
];

/** Resolve the active tutorial for a given pathname. Matches by
 *  exact route OR prefix-with-slash, so /app/companies/:id maps to
 *  the command_center tutorial. */
export function findTutorialForPath(pathname: string): TutorialConfig | null {
  if (!pathname) return null;
  for (const t of TUTORIALS) {
    if (!t.active) continue;
    for (const pattern of t.route_patterns) {
      if (pathname === pattern || pathname.startsWith(pattern + "/")) return t;
    }
  }
  return null;
}

/** Resolve a page_key from a pathname, regardless of active state.
 *  Used for completion tracking even on inactive routes. */
export function pageKeyForPath(pathname: string): string | null {
  if (!pathname) return null;
  for (const t of TUTORIALS) {
    for (const pattern of t.route_patterns) {
      if (pathname === pattern || pathname.startsWith(pattern + "/")) return t.page_key;
    }
  }
  return null;
}
