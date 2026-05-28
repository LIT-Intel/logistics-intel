/**
 * Pulse domain — coach (proactive cards + chat), search, brief, refresh.
 *
 * Two coach functions, by design:
 *   - `pulse-coach` (v1) drives the proactive dashboard card surface.
 *   - `pulse-coach-v2` drives the chat composer (Q&A + data-query routing).
 * Don't conflate them.
 */
import { invokeEdge, EdgeFunctionError } from "./_client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface PulseCoachCardCta {
  label: string;
  href?: string;
  action?: string;
  payload?: unknown;
}

export interface PulseCoachCard {
  id: string;
  title: string;
  body_md: string;
  severity?: "info" | "success" | "warning";
  cta?: PulseCoachCardCta | null;
}

export interface PulseCoachV2Result {
  ok: boolean;
  mode: "proactive_sweep";
  cards: PulseCoachCard[];
  context_snapshot: unknown | null;
  error?: string;
}

export interface PulseCoachAnswer {
  ok: boolean;
  classification?: string;
  answer_md: string;
  cta: PulseCoachCardCta | null;
  error?: string;
}

export interface PulseCoachNudgesResult {
  ok: boolean;
  nudges: Array<{
    id: string;
    title: string;
    body_md: string;
    severity?: string;
    cta?: PulseCoachCardCta | null;
  }>;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Operations
// ──────────────────────────────────────────────────────────────────────────

/** Fetch proactive cards from `pulse-coach-v2`. */
export async function getPulseCoachV2(): Promise<PulseCoachV2Result> {
  try {
    const data = await invokeEdge<any>("pulse-coach-v2", { mode: "proactive_sweep" });
    return {
      ok: Boolean(data?.ok),
      mode: "proactive_sweep",
      cards: Array.isArray(data?.cards) ? data.cards : [],
      context_snapshot: data?.context_snapshot || null,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "proactive_sweep",
      cards: [],
      context_snapshot: null,
      error: err instanceof EdgeFunctionError ? err.message : String(err),
    };
  }
}

/** Ask Pulse Coach a question. Returns markdown answer + optional CTA. */
export async function askPulseCoach(question: string): Promise<PulseCoachAnswer> {
  try {
    const data = await invokeEdge<any>("pulse-coach-v2", {
      mode: "answer_question",
      question,
    });
    return {
      ok: Boolean(data?.ok),
      classification: data?.classification,
      answer_md: String(data?.answer_md || ""),
      cta: data?.cta || null,
    };
  } catch (err) {
    return {
      ok: false,
      answer_md: "I hit a snag — try again in a moment, or check the help center.",
      cta: null,
      error: err instanceof EdgeFunctionError ? err.message : String(err),
    };
  }
}

/** Fetch the legacy proactive nudges from `pulse-coach` (v1, dashboard surface). */
export async function getPulseCoachNudges(
  pageContext: Record<string, unknown>,
): Promise<PulseCoachNudgesResult> {
  try {
    const data = await invokeEdge<any>("pulse-coach", { page_context: pageContext });
    return {
      ok: Boolean(data?.ok),
      nudges: Array.isArray(data?.nudges) ? data.nudges : [],
    };
  } catch (err) {
    const msg = err instanceof EdgeFunctionError ? err.message : String(err);
    if (/not\s+found|404|FunctionsHttpError|FunctionsRelay/i.test(msg)) {
      return { ok: false, nudges: [] };
    }
    return { ok: false, nudges: [], error: msg };
  }
}
