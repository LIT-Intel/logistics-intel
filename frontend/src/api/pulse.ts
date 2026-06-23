/**
 * Pulse domain — coach (proactive cards + chat), search, brief, refresh.
 *
 * Two coach functions, by design:
 *   - `pulse-coach` (v1) drives the proactive dashboard card surface AND
 *     the workspace trade-lanes globe (aggregated origin→dest lanes).
 *   - `pulse-coach-v2` drives the chat composer (Q&A + data-query routing).
 *
 * Don't conflate them. v1 returns workspace_lanes; v2 doesn't.
 *
 * Moved out of lib/api.ts on 2026-05-30 as part of the api domain split
 * (CEO review item 7). lib/api.ts re-exports these symbols for backwards
 * compatibility during the consumer-by-consumer migration.
 */
import { supabase } from "@/lib/supabase";

// ──────────────────────────────────────────────────────────────────────────
// Types — Pulse Coach v1 (proactive dashboard cards + workspace lanes)
// ──────────────────────────────────────────────────────────────────────────

export type CoachNudge = {
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

export type WorkspaceLane = {
  key: string;
  from_label: string;
  to_label: string;
  account_count: number;
  account_names: string[];
  shipments_total: number;
};

export type PulseCoachResult = {
  ok: boolean;
  nudges: CoachNudge[];
  workspace_lanes: WorkspaceLane[];
  source?: string;
  setupRequired?: boolean;
  error?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Types — Pulse Coach v2 (chat composer)
// ──────────────────────────────────────────────────────────────────────────

export type CoachCardV2 = {
  id: string;
  category:
    | "subscription"
    | "campaign"
    | "reply"
    | "contact"
    | "company"
    | "task"
    | "system"
    | "support"
    | "opportunity";
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

export type CoachContextSnapshot = {
  user_first_name: string | null;
  plan: string | null;
  plan_label: string | null;
  trial_days_remaining: number | null;
  saved_count: number;
  searches_this_month: number;
  apollo_today: { used: number; cap: number };
  campaigns: { drafts: number; active: number; paused: number; attention: number };
  unread_replies: number;
  mailbox_connected: boolean;
};

export type PulseCoachV2Result = {
  ok: boolean;
  mode: "proactive_sweep";
  cards: CoachCardV2[];
  context_snapshot: CoachContextSnapshot | null;
  error?: string;
};

/**
 * One company result inline-rendered in a Coach chat reply.
 * Populated when pulse-coach-v2 routes the question through the
 * pulse-explore-parse → pulse-explore pipeline (data query branch).
 * Empty / undefined for meta / account / help questions.
 */
export type CoachCompanyHit = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  opportunity_score?: number;
};

export type PulseCoachAnswer = {
  ok: boolean;
  classification?: string;
  answer_md: string;
  cta: { label: string; url: string } | null;
  matched_articles?: { slug: string; title: string }[];
  context_snapshot?: CoachContextSnapshot | null;
  /**
   * Inline search results — present when the Coach detected the question
   * as a data query (geography / industry / lane / mode / etc.) and ran
   * it through the Pulse search pipeline. The chat surface renders these
   * as a clickable list below the markdown answer.
   */
  companies?: CoachCompanyHit[];
  /** The structured filter object the server matched against. */
  filters_applied?: Record<string, unknown>;
  error?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

/** Fetch proactive cards from pulse-coach-v2. */
export async function getPulseCoachV2(): Promise<PulseCoachV2Result> {
  const { data, error } = await supabase.functions.invoke("pulse-coach-v2", {
    body: { mode: "proactive_sweep" },
  });
  if (error) {
    return {
      ok: false,
      mode: "proactive_sweep",
      cards: [],
      context_snapshot: null,
      error: String(error.message || "coach_v2_failed"),
    };
  }
  return {
    ok: Boolean(data?.ok),
    mode: "proactive_sweep",
    cards: Array.isArray(data?.cards) ? data.cards : [],
    context_snapshot: data?.context_snapshot || null,
  };
}

/** Ask Pulse Coach a question. Returns markdown answer + optional CTA. */
export async function askPulseCoach(question: string): Promise<PulseCoachAnswer> {
  const { data, error } = await supabase.functions.invoke("pulse-coach-v2", {
    body: { mode: "answer_question", question },
  });
  if (error) {
    return {
      ok: false,
      answer_md:
        "I hit a snag — try again in a moment, or check the help center.",
      cta: null,
      error: String(error.message || "coach_answer_failed"),
    };
  }
  return {
    ok: Boolean(data?.ok),
    classification: data?.classification,
    answer_md: String(data?.answer_md || ""),
    cta: data?.cta || null,
    matched_articles: data?.matched_articles || [],
    context_snapshot: data?.context_snapshot || null,
    companies: Array.isArray(data?.companies) ? data.companies : undefined,
    filters_applied: data?.filters_applied || undefined,
  };
}

/**
 * Explorer Coach — reason over the on-screen result set.
 *
 * Unlike askPulseCoach(question) (which concatenated a prose context
 * blurb into the question string and let the server re-parse / re-search
 * it — the path that returned the canned "didn't find any matching
 * accounts" reply), this sends STRUCTURED input the server reasons over
 * directly: the question, the active filters, precomputed aggregates over
 * ALL rows, and a capped, opportunity-sorted sample of rows. Zero
 * ImportYeti credits — the directory read was already paid for when the
 * Explorer ran the search.
 */
export async function reasonOverExplore(input: {
  question: string;
  filters: Record<string, unknown>;
  totals: Record<string, unknown>;
  sampleRows: Record<string, unknown>[];
}): Promise<PulseCoachAnswer> {
  const { data, error } = await supabase.functions.invoke("pulse-coach-v2", {
    body: {
      mode: "explore_reason",
      question: input.question,
      filters: input.filters,
      totals: input.totals,
      sample_rows: input.sampleRows,
    },
  });
  if (error) {
    return {
      ok: false,
      answer_md:
        "I hit a snag — try again in a moment, or check the help center.",
      cta: null,
      error: String(error.message || "coach_explore_reason_failed"),
    };
  }
  return {
    ok: Boolean(data?.ok),
    classification: data?.classification,
    answer_md: String(data?.answer_md || ""),
    cta: data?.cta || null,
    context_snapshot: data?.context_snapshot || null,
  };
}

/**
 * Fetch proactive nudges + workspace lanes from the legacy `pulse-coach`
 * function. The v1 surface aggregates origin→dest trade lanes that v2 does
 * NOT return — don't migrate this caller to v2.
 */
export async function getPulseCoachNudges(
  pageContext: string = "dashboard",
): Promise<PulseCoachResult> {
  const { data, error } = await supabase.functions.invoke("pulse-coach", {
    body: { page_context: pageContext },
  });
  if (error) {
    const msg = String(error.message || "");
    if (/not\s+found|404|FunctionsHttpError|FunctionsRelay/i.test(msg)) {
      return {
        ok: false,
        nudges: [],
        workspace_lanes: [],
        setupRequired: true,
        error: "Pulse Coach is not configured yet.",
      };
    }
    try {
      const ctx: any = (error as any).context;
      const cloned = ctx?.clone?.();
      const parsed = await cloned?.json?.();
      if (parsed && typeof parsed === "object") {
        return {
          ok: false,
          nudges: parsed.nudges || [],
          workspace_lanes: parsed.workspace_lanes || [],
          error: parsed.message || parsed.error || msg,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      ok: false,
      nudges: [],
      workspace_lanes: [],
      error: msg,
    };
  }
  return {
    ok: Boolean(data?.ok),
    nudges: Array.isArray(data?.nudges) ? data.nudges : [],
    workspace_lanes: Array.isArray(data?.workspace_lanes)
      ? data.workspace_lanes
      : [],
    source: data?.source,
  };
}

/** Map a v2 card to the legacy CoachNudge shape used by PulseCoachWidget. */
export function mapCardToLegacyNudge(card: CoachCardV2): CoachNudge {
  const accent =
    card.priority === "critical"
      ? "#DC2626"
      : card.priority === "high"
        ? "#EA580C"
        : card.priority === "medium"
          ? "#2563EB"
          : "#64748B";
  return {
    id: card.id,
    title: card.title,
    body: card.body,
    cta: card.cta_label || "Open",
    action: card.cta_url ? `route:${card.cta_url}` : null,
    accent,
    lane_focus: null,
    account_keys: [],
    contact_ids: [],
  };
}
