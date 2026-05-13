// Signals API client. Reads + mutates lit_signals via the standard
// supabase client; RLS limits to rows in the caller's org. Status
// transitions follow new -> seen -> (dismissed | acted).

import { supabase } from "@/lib/supabase";

export type SignalStatus = "new" | "seen" | "dismissed" | "acted";
export type SignalSeverity = "low" | "medium" | "high" | "critical";

export type SignalRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  company_id: string | null;
  source_company_key: string | null;
  signal_type: string;
  title: string;
  description: string | null;
  severity: SignalSeverity;
  status: SignalStatus;
  cta_label: string | null;
  cta_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
  acted_at: string | null;
};

export type ListSignalsOptions = {
  limit?: number;
  statuses?: SignalStatus[];
  companyId?: string;
  sourceCompanyKey?: string;
};

/** List signals for the active user's org. Defaults to top 20 active
 *  signals (new + seen) sorted by severity then recency. Returns an
 *  empty array on auth / RLS failure so the caller can render gracefully. */
export async function listSignals(opts: ListSignalsOptions = {}): Promise<SignalRow[]> {
  const statuses = opts.statuses ?? ["new", "seen"];
  const limit = opts.limit ?? 20;
  try {
    let q = supabase
      .from("lit_signals")
      .select(
        "id, org_id, user_id, company_id, source_company_key, signal_type, title, description, severity, status, cta_label, cta_url, metadata, created_at, seen_at, dismissed_at, acted_at",
      )
      .in("status", statuses)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.companyId) q = q.eq("company_id", opts.companyId);
    if (opts.sourceCompanyKey) q = q.eq("source_company_key", opts.sourceCompanyKey);
    const { data, error } = await q;
    if (error) {
      console.warn("[signals] listSignals failed:", error.message);
      return [];
    }
    return (data ?? []) as SignalRow[];
  } catch (err) {
    console.warn("[signals] listSignals threw:", err);
    return [];
  }
}

/** Mark a single signal as seen. Called when a card scrolls into view
 *  or is rendered for the first time. Idempotent. */
export async function markSignalSeen(id: string): Promise<boolean> {
  return updateStatus(id, { status: "seen", seen_at: nowIso(), onlyFrom: ["new"] });
}

/** User dismissed the signal — won't surface again. */
export async function dismissSignal(id: string): Promise<boolean> {
  return updateStatus(id, { status: "dismissed", dismissed_at: nowIso() });
}

/** User clicked the CTA — record action and stop showing this signal. */
export async function actOnSignal(id: string): Promise<boolean> {
  return updateStatus(id, { status: "acted", acted_at: nowIso() });
}

async function updateStatus(
  id: string,
  patch: { status: SignalStatus; seen_at?: string; dismissed_at?: string; acted_at?: string; onlyFrom?: SignalStatus[] },
): Promise<boolean> {
  try {
    const update: Record<string, unknown> = { status: patch.status };
    if (patch.seen_at) update.seen_at = patch.seen_at;
    if (patch.dismissed_at) update.dismissed_at = patch.dismissed_at;
    if (patch.acted_at) update.acted_at = patch.acted_at;
    let q = supabase.from("lit_signals").update(update).eq("id", id);
    if (patch.onlyFrom && patch.onlyFrom.length) q = q.in("status", patch.onlyFrom);
    const { error } = await q;
    if (error) {
      console.warn("[signals] update failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[signals] update threw:", err);
    return false;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Count of unread (status='new') signals across the org. Used by the
 *  dashboard badge. Falls back to 0 on error. */
export async function countNewSignals(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("lit_signals")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    if (error) {
      console.warn("[signals] countNewSignals failed:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.warn("[signals] countNewSignals threw:", err);
    return 0;
  }
}
