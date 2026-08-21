// Shared helpers for internal agent edge functions (Project Harvey).
//
// Used by harvey-controller (Batch 2) and future harvey-* functions.
//
// Design invariants (do NOT relax):
//   - isAgentFlagEnabled fails CLOSED. This is the opposite of the
//     provider-flag helpers (`lit_provider_flag()` RPC / `isProviderEnabled()`
//     in provider_ledger.ts), which fail OPEN by design. An internal
//     autonomous sender must default OFF: a missing flag row, a killed flag,
//     or ANY query error all mean "disabled".
//   - loadAgentConfig returns null when the config row is missing (caller
//     treats that as disabled) and THROWS on query errors so the controller's
//     outer error handler records an 'error' run instead of silently running
//     with defaults.
//   - recordAgentRun / completeAgentRun throw on DB errors: an agent that
//     cannot write its audit log must not proceed.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

// ─── config ──────────────────────────────────────────────────────────────────

export interface AgentQuietHours {
  timezone: string; // IANA, e.g. "America/New_York"
  start: string; // "HH:MM" 24h — quiet period begins
  end: string; // "HH:MM" 24h — quiet period ends (may cross midnight)
}

export interface AgentConfig {
  enabled: boolean;
  mode?: string;
  testMode?: boolean;
  sender?: { emailAccount?: string | null; linkedinAccountId?: string | null };
  prospecting?: { enabled?: boolean; targetInventory?: number; minimumScore?: number };
  sending?: {
    emailDailyLimit?: number;
    linkedinInviteDailyLimit?: number;
    linkedinMessageDailyLimit?: number;
  };
  approval?: Record<string, boolean>;
  quietHours?: AgentQuietHours;
  [key: string]: unknown;
}

/**
 * Load an agent's config row from lit_agent_config.
 * Returns null when the row does not exist (caller must treat as disabled).
 * Throws on query error.
 */
export async function loadAgentConfig(
  supabase: SupabaseClient,
  agentName: string,
): Promise<AgentConfig | null> {
  const { data, error } = await supabase
    .from("lit_agent_config")
    .select("config")
    .eq("agent_name", agentName)
    .maybeSingle();
  if (error) throw new Error(`lit_agent_config load failed for '${agentName}': ${error.message}`);
  if (!data?.config) return null;
  return data.config as AgentConfig;
}

// ─── feature flag (fail CLOSED) ──────────────────────────────────────────────

/**
 * Fail-CLOSED agent flag check against lit_feature_flags.
 *
 * Enabled ONLY when the flag row EXISTS and global_kill is false.
 * Missing row, killed flag, or any query error ⇒ false (disabled).
 *
 * Deliberately does NOT use the lit_provider_flag() RPC — that helper fails
 * OPEN (missing row ⇒ enabled), which is the wrong default for an internal
 * autonomous agent.
 */
export async function isAgentFlagEnabled(
  supabase: SupabaseClient,
  flagName: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("lit_feature_flags")
      .select("global_kill")
      .eq("key", flagName)
      .maybeSingle();
    if (error) return false; // fail closed
    if (!data) return false; // missing row = OFF
    return data.global_kill === false;
  } catch (_err) {
    return false; // fail closed
  }
}

// ─── run recording (lit_agent_runs) ──────────────────────────────────────────

export interface AgentRunInsert {
  agent_name: string;
  trigger_type: "cron" | "webhook" | "manual" | "test";
  status?: "pending" | "running" | "ok" | "error" | "skipped";
  priority?: number | null;
  decision?: string | null;
  decision_reason?: string | null;
  input_json?: Record<string, unknown> | null;
  output_json?: Record<string, unknown> | null;
  error_json?: Record<string, unknown> | null;
  test_mode?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AgentRunPatch {
  status: "ok" | "error" | "skipped";
  priority?: number | null;
  decision?: string | null;
  decision_reason?: string | null;
  output_json?: Record<string, unknown> | null;
  error_json?: Record<string, unknown> | null;
  completed_at?: string | null;
}

/**
 * Insert a lit_agent_runs row. Returns the run id. Throws on DB error —
 * an agent that cannot write its audit log must not proceed.
 */
export async function recordAgentRun(
  supabase: SupabaseClient,
  run: AgentRunInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from("lit_agent_runs")
    .insert({
      agent_name: run.agent_name,
      trigger_type: run.trigger_type,
      status: run.status ?? "pending",
      priority: run.priority ?? null,
      decision: run.decision ?? null,
      decision_reason: run.decision_reason ?? null,
      input_json: run.input_json ?? null,
      output_json: run.output_json ?? null,
      error_json: run.error_json ?? null,
      test_mode: run.test_mode ?? false,
      started_at: run.started_at ?? new Date().toISOString(),
      completed_at: run.completed_at ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`lit_agent_runs insert failed: ${error.message}`);
  return data.id as string;
}

/** Finish a run row (status ok/error/skipped + outputs). Throws on DB error. */
export async function completeAgentRun(
  supabase: SupabaseClient,
  runId: string,
  patch: AgentRunPatch,
): Promise<void> {
  const { error } = await supabase
    .from("lit_agent_runs")
    .update({
      status: patch.status,
      priority: patch.priority ?? null,
      decision: patch.decision ?? null,
      decision_reason: patch.decision_reason ?? null,
      output_json: patch.output_json ?? null,
      error_json: patch.error_json ?? null,
      completed_at: patch.completed_at ?? new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(`lit_agent_runs update failed for ${runId}: ${error.message}`);
}

// ─── quiet hours ─────────────────────────────────────────────────────────────

function parseHHMM(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when `now` falls inside the agent's configured quiet-hours window
 * (timezone-aware; handles windows that cross midnight, e.g. 19:00 → 08:00).
 * Missing/invalid quietHours config ⇒ false (never quiet) — the enable gates
 * are the safety layer; quiet hours are a politeness layer.
 */
export function withinQuietHours(config: AgentConfig | null, now: Date = new Date()): boolean {
  const qh = config?.quietHours;
  if (!qh?.timezone) return false;
  const start = parseHHMM(qh.start);
  const end = parseHHMM(qh.end);
  if (start === null || end === null || start === end) return false;

  let localMinutes: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: qh.timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
    // Intl with hour12:false can emit "24" for midnight in some runtimes.
    localMinutes = (hh % 24) * 60 + mm;
  } catch (_err) {
    return false; // bad timezone string — don't block on politeness config
  }

  if (start < end) {
    // Same-day window, e.g. 12:00 → 14:00.
    return localMinutes >= start && localMinutes < end;
  }
  // Crosses midnight, e.g. 19:00 → 08:00.
  return localMinutes >= start || localMinutes < end;
}
