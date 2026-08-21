/**
 * /app/admin/ai-employees — the "AI Employees" admin console.
 *
 * An internal, platform-admin surface where LIT admins chat with, task,
 * monitor, and control internal AI agents. Harvey (autonomous SDR) is the
 * first agent; two more are planned, so this console renders EVERY agent
 * generically from the registry returned by {action:"list"} — nothing here
 * is hardcoded to Harvey. Adding a new agent server-side makes it appear
 * here automatically with a new roster card.
 *
 * Backed entirely by the `ai-employee-console` edge function, which is
 * platform-admin gated server-side. The <RequireSuperAdmin> route guard is
 * UX only; the security boundary is the edge function.
 *
 * Data pattern mirrors AdminSubscribers.tsx: useEffect + `cancelled` flag,
 * no TanStack Query. Every mutation (set_config / set_flag / run_now /
 * assign_task / update_task / chat) re-fetches detail so the UI reflects
 * server truth rather than trusting optimistic local state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  RefreshCw,
  AlertCircle,
  Play,
  Send,
  Power,
  ShieldAlert,
  Activity,
  MessageSquare,
  ListChecks,
  LayoutDashboard,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ─────────────────────────── Types (backend contract) ─────────────────── */

type AgentStatus = "off" | "test" | "copilot" | "assisted" | "autonomous";
type AgentMode = "copilot" | "assisted" | "autonomous";

type AgentProfile = {
  displayName: string;
  role: string;
  tagline: string;
  avatarKey?: string;
  accent?: string;
  capabilities?: string[];
};

type AgentListItem = {
  agent_name: string;
  profile: AgentProfile;
  enabled: boolean;
  mode: AgentMode;
  test_mode: boolean;
  flag_enabled: boolean;
  status: AgentStatus;
};

type AgentConfig = {
  enabled?: boolean;
  mode?: AgentMode;
  testMode?: boolean;
  sender?: { emailAccount?: string; [k: string]: unknown };
  sending?: { dailyLimit?: number; hourlyLimit?: number; [k: string]: unknown };
  quietHours?: { start?: string | number; end?: string | number; tz?: string; [k: string]: unknown };
  [k: string]: unknown;
};

type AgentMetrics = {
  runs_today: number;
  runs_total: number;
  last_run_at: string | null;
  last_decision: string | null;
  last_status: string | null;
  tasks_open: number;
};

type AgentRun = {
  id: string;
  agent_name: string;
  trigger_type: string | null;
  status: string | null;
  decision: string | null;
  decision_reason: string | null;
  output_json: Record<string, unknown> | null;
  test_mode: boolean;
  created_at: string | null;
  completed_at: string | null;
};

type AgentDetail = {
  ok: boolean;
  agent: { agent_name: string; config: AgentConfig };
  flag_enabled: boolean;
  metrics: AgentMetrics;
  recent_runs: AgentRun[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type AgentTask = {
  id: string;
  title: string;
  instructions: string | null;
  status: "queued" | "in_progress" | "done" | "cancelled" | "failed";
  priority: string | number | null;
  created_at: string | null;
  completed_at: string | null;
};

type RunControllerResult = {
  ok: boolean;
  run_id?: string;
  decision?: string;
  decision_reason?: string;
  counts?: Record<string, number>;
  test_mode?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type TabKey = "overview" | "chat" | "tasks" | "activity" | "knowledge";

/* ─────────────────────────── Helpers ──────────────────────────────────── */

async function callConsole<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-employee-console", {
    method: "POST",
    body,
  });
  if (error) throw error;
  if (data && data.ok === false && data.error) throw new Error(data.error);
  return data as T;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_TONE: Record<AgentStatus, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  off: { label: "Off", bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200", dot: "bg-slate-400" },
  test: { label: "Test", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", dot: "bg-amber-500" },
  copilot: { label: "Copilot", bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", dot: "bg-blue-500" },
  assisted: { label: "Assisted", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  autonomous: { label: "Autonomous", bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", dot: "bg-violet-500" },
};

const RUN_STATUS_TONE: Record<string, { text: string; icon: "ok" | "fail" | "wait" }> = {
  success: { text: "text-emerald-700", icon: "ok" },
  completed: { text: "text-emerald-700", icon: "ok" },
  ok: { text: "text-emerald-700", icon: "ok" },
  failed: { text: "text-rose-700", icon: "fail" },
  error: { text: "text-rose-700", icon: "fail" },
  skipped: { text: "text-slate-500", icon: "wait" },
  running: { text: "text-blue-700", icon: "wait" },
  queued: { text: "text-slate-500", icon: "wait" },
};

const TASK_STATUS_TONE: Record<string, { bg: string; text: string }> = {
  queued: { bg: "bg-slate-100", text: "text-slate-600" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700" },
  done: { bg: "bg-emerald-50", text: "text-emerald-700" },
  cancelled: { bg: "bg-slate-100", text: "text-slate-500" },
  failed: { bg: "bg-rose-50", text: "text-rose-700" },
};

/* ─────────────────────────── Page ─────────────────────────────────────── */

export default function AdminAIEmployees() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Roster: {action:"list"}
  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListErr(null);
    (async () => {
      try {
        const data = await callConsole<{ ok: boolean; agents: AgentListItem[] }>({ action: "list" });
        if (cancelled) return;
        if (!data?.ok) throw new Error("Failed to load AI employees");
        const list = data.agents ?? [];
        setAgents(list);
        setSelected((prev) => prev ?? (list[0]?.agent_name ?? null));
      } catch (e: any) {
        if (cancelled) return;
        setListErr(e?.message || "Failed to load AI employees");
        setAgents([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listRefreshKey]);

  const refreshList = useCallback(() => setListRefreshKey((k) => k + 1), []);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Bot className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Internal AI workforce
            </span>
          </div>
          <h1 className="font-display mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">
            AI Employees
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[14px] leading-relaxed text-slate-500">
            Chat with, task, monitor, and control the internal AI agents that run
            LIT operations. Each agent has its own controls, chat thread, task
            queue, and audit log. Arming an agent lets it act on the outside world —
            do it deliberately.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshList}
          disabled={listLoading}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {listErr && (
        <div
          className="mt-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{listErr}</span>
        </div>
      )}

      {/* Two-pane console */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* LEFT — roster */}
        <div>
          <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Roster
          </div>
          <div className="flex flex-col gap-3">
            {listLoading ? (
              <>
                <RosterSkeleton />
                <RosterSkeleton />
              </>
            ) : (
              <>
                {agents.map((a) => (
                  <RosterCard
                    key={a.agent_name}
                    agent={a}
                    active={selected === a.agent_name}
                    onSelect={() => setSelected(a.agent_name)}
                  />
                ))}
                {agents.length === 0 && !listErr && (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
                    No AI employees registered yet.
                  </div>
                )}
                {/* Placeholder slots — the owner plans 2 more agents. These
                    are non-functional and just express the multi-agent intent. */}
                <AddPlaceholder />
                <AddPlaceholder />
              </>
            )}
          </div>
        </div>

        {/* RIGHT — selected agent detail */}
        <div>
          {selected ? (
            <AgentDetailPane
              key={selected}
              agentName={selected}
              rosterItem={agents.find((a) => a.agent_name === selected) ?? null}
              onServerChange={refreshList}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
              <div className="px-6">
                <Bot className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
                <div className="mt-3 text-[15px] font-semibold text-slate-700">
                  Select an AI employee
                </div>
                <p className="mt-1 text-[13px] text-slate-500">
                  Pick an agent from the roster to view its controls.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Roster ───────────────────────────────────── */

function RosterCard({
  agent,
  active,
  onSelect,
}: {
  agent: AgentListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const accent = agent.profile.accent || "#2563EB";
  const tone = STATUS_TONE[agent.status] ?? STATUS_TONE.off;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group w-full rounded-2xl border bg-white p-3.5 text-left transition",
        active
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-slate-200 hover:border-slate-300 hover:shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.profile.displayName} accent={accent} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-slate-900">
              {agent.profile.displayName}
            </span>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${agent.flag_enabled ? "bg-emerald-500" : "bg-rose-400"}`}
              title={agent.flag_enabled ? "Live" : "Killed"}
              aria-hidden
            />
          </div>
          <div className="mt-0.5 truncate text-[12px] text-slate-500">{agent.profile.role}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
              {tone.label}
            </span>
            {agent.test_mode && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-200">
                <FlaskConical className="h-2.5 w-2.5" aria-hidden />
                Test
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function AddPlaceholder() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-3.5 text-left">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
        <Plus className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-400">Add AI employee</div>
        <div className="text-[11.5px] text-slate-400">Coming soon</div>
      </div>
    </div>
  );
}

function AgentAvatar({ name, accent, size = 40 }: { name: string; accent: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${accent} 0%, ${accent}cc 100%)`,
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Detail pane ──────────────────────────────── */

function AgentDetailPane({
  agentName,
  rosterItem,
  onServerChange,
}: {
  agentName: string;
  rosterItem: AgentListItem | null;
  onServerChange: () => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<TabKey>("overview");

  // Detail: {action:"detail", agent_name}
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const data = await callConsole<AgentDetail>({ action: "detail", agent_name: agentName });
        if (cancelled) return;
        if (!data?.ok) throw new Error("Failed to load agent detail");
        setDetail(data);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "Failed to load agent detail");
        setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentName, refreshKey]);

  // Re-fetch this agent's detail AND the roster (status pills live there).
  const refreshDetail = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onServerChange();
  }, [onServerChange]);

  const profile = rosterItem?.profile;
  const accent = profile?.accent || "#2563EB";
  const displayName = profile?.displayName || agentName;
  const config = detail?.agent.config ?? {};

  const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "chat", label: "Chat", icon: MessageSquare },
    { key: "tasks", label: "Tasks", icon: ListChecks },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "knowledge", label: "Knowledge", icon: BookOpen },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <AgentAvatar name={displayName} accent={accent} size={52} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em] text-slate-900">
                {displayName}
              </h2>
              {detail && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    detail.flag_enabled
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                  }`}
                >
                  {detail.flag_enabled ? "Live" : "Killed"}
                </span>
              )}
            </div>
            <div className="text-[13px] font-medium text-slate-600">{profile?.role}</div>
            {profile?.tagline && (
              <div className="mt-0.5 max-w-[520px] text-[12.5px] text-slate-500">{profile.tagline}</div>
            )}
          </div>
        </div>
      </div>

      {/* Control bar */}
      {loading && !detail ? (
        <div className="border-b border-slate-100 p-5">
          <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : detail ? (
        <ControlBar
          agentName={agentName}
          displayName={displayName}
          config={config}
          flagEnabled={detail.flag_enabled}
          onChanged={refreshDetail}
        />
      ) : null}

      {err && (
        <div
          className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition",
                on
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="p-5">
        {loading && !detail ? (
          <TabSkeleton />
        ) : tab === "overview" ? (
          <OverviewTab metrics={detail?.metrics ?? null} config={config} rosterItem={rosterItem} />
        ) : tab === "chat" ? (
          <ChatTab agentName={agentName} displayName={displayName} accent={accent} />
        ) : tab === "tasks" ? (
          <TasksTab agentName={agentName} onChanged={refreshDetail} />
        ) : tab === "activity" ? (
          <ActivityTab runs={detail?.recent_runs ?? []} />
        ) : (
          <KnowledgeTab />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Control bar ──────────────────────────────── */

function ControlBar({
  agentName,
  displayName,
  config,
  flagEnabled,
  onChanged,
}: {
  agentName: string;
  displayName: string;
  config: AgentConfig;
  flagEnabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmArm, setConfirmArm] = useState(false);
  const [runResult, setRunResult] = useState<RunControllerResult | null>(null);
  const [runResultError, setRunResultError] = useState<string | null>(null);

  const enabled = config.enabled ?? false;
  const mode: AgentMode = (config.mode as AgentMode) ?? "copilot";
  const testMode = config.testMode ?? false;

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      try {
        await fn();
      } catch (e: any) {
        setRunResultError(e?.message || "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const setFlag = (val: boolean) =>
    run("flag", async () => {
      await callConsole({ action: "set_flag", agent_name: agentName, enabled: val });
      onChanged();
    });

  const setConfig = (patch: { enabled?: boolean; mode?: AgentMode; testMode?: boolean }, key: string) =>
    run(key, async () => {
      await callConsole({ action: "set_config", agent_name: agentName, patch });
      onChanged();
    });

  const runNow = () =>
    run("run", async () => {
      setRunResult(null);
      setRunResultError(null);
      const data = await callConsole<{ ok: boolean; controller: RunControllerResult }>({
        action: "run_now",
        agent_name: agentName,
      });
      setRunResult(data?.controller ?? null);
      onChanged();
    });

  return (
    <div className="border-b border-slate-100 p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {/* Master kill switch */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Master switch
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => (flagEnabled ? setFlag(false) : setConfirmArm(true))}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-bold transition disabled:opacity-50",
                flagEnabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-rose-600 text-white hover:bg-rose-700",
              ].join(" ")}
            >
              <Power className="h-3.5 w-3.5" aria-hidden />
              {displayName} is {flagEnabled ? "LIVE" : "KILLED"}
            </button>
          </div>
        </div>

        {/* Enabled toggle */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">Enabled</span>
          <Toggle
            on={enabled}
            disabled={busy !== null}
            onClick={() => setConfig({ enabled: !enabled }, "enabled")}
            labelOn="On"
            labelOff="Off"
          />
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">Mode</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["copilot", "assisted", "autonomous"] as AgentMode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy !== null}
                onClick={() => setConfig({ mode: m }, "mode")}
                className={[
                  "rounded-md px-2.5 py-1.5 text-[12px] font-semibold capitalize transition disabled:opacity-50",
                  mode === m ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Test mode */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">Test mode</span>
          <Toggle
            on={testMode}
            disabled={busy !== null}
            onClick={() => setConfig({ testMode: !testMode }, "testMode")}
            labelOn="On"
            labelOff="Off"
            tone="amber"
          />
        </div>

        {/* Run controller now */}
        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-transparent">Run</span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={runNow}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${busy === "run" ? "animate-pulse" : ""}`} aria-hidden />
            Run controller now
          </button>
        </div>
      </div>

      {/* Autonomous warning */}
      {mode === "autonomous" && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-800">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <b>Autonomous mode:</b> {displayName} decides and acts on its own without a human
            approval step. Combined with the master switch LIVE, it can take external actions
            (e.g. send emails). Keep test mode on until you trust its decisions.
          </span>
        </div>
      )}

      {/* Test-mode banner */}
      {testMode && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-amber-800">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          Test mode — no external sends
        </div>
      )}

      {/* Run result strip */}
      {runResultError && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{runResultError}</span>
        </div>
      )}
      {runResult && <RunResultStrip result={runResult} />}

      {/* Arm confirm dialog */}
      {confirmArm && (
        <ConfirmDialog
          title={`Arm ${displayName}?`}
          body={`This sets the master switch to LIVE. Once live, ${displayName} can act on the outside world according to its mode and enabled settings. If test mode is off, it may send real external messages.`}
          confirmLabel="Arm — go LIVE"
          confirmTone="emerald"
          onCancel={() => setConfirmArm(false)}
          onConfirm={() => {
            setConfirmArm(false);
            setFlag(true);
          }}
        />
      )}
    </div>
  );
}

function RunResultStrip({ result }: { result: RunControllerResult }) {
  if (result.ok === false) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Controller did not run{result.error ? `: ${result.error}` : "."}</span>
      </div>
    );
  }
  if (result.skipped) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Run skipped{result.reason ? `: ${result.reason}` : "."}</span>
      </div>
    );
  }
  const counts = result.counts ?? {};
  return (
    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-900">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        <span className="font-semibold">
          Decision: {result.decision ?? "—"}
          {result.test_mode ? " (test mode)" : ""}
        </span>
        {result.run_id && (
          <span className="font-mono text-[10.5px] text-emerald-700/70">run {result.run_id.slice(0, 8)}…</span>
        )}
      </div>
      {result.decision_reason && <div className="mt-1 text-emerald-800/90">{result.decision_reason}</div>}
      {Object.keys(counts).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] text-emerald-800 ring-1 ring-emerald-200"
            >
              {k}: <b>{String(v)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({
  on,
  disabled,
  onClick,
  labelOn,
  labelOff,
  tone = "blue",
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  tone?: "blue" | "amber";
}) {
  const onColor = tone === "amber" ? "bg-amber-500" : "bg-blue-600";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={[
          "relative inline-flex h-5 w-9 items-center rounded-full transition",
          on ? onColor : "bg-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
            on ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </span>
      <span className="text-[12.5px] font-semibold text-slate-700">{on ? labelOn : labelOff}</span>
    </button>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmTone = "blue",
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: "blue" | "emerald" | "rose";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const toneCls =
    confirmTone === "emerald"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : confirmTone === "rose"
        ? "bg-rose-600 hover:bg-rose-700"
        : "bg-blue-600 hover:bg-blue-700";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div>
            <h3 className="font-display text-[16px] font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-semibold text-white ${toneCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Overview tab ─────────────────────────────── */

function OverviewTab({
  metrics,
  config,
  rosterItem,
}: {
  metrics: AgentMetrics | null;
  config: AgentConfig;
  rosterItem: AgentListItem | null;
}) {
  const capabilities = rosterItem?.profile.capabilities ?? [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile label="Runs today" value={metrics?.runs_today ?? 0} />
        <MetricTile label="Total runs" value={metrics?.runs_total ?? 0} />
        <MetricTile label="Last run" text={fmtRelative(metrics?.last_run_at ?? null)} title={fmtAbsolute(metrics?.last_run_at ?? null)} />
        <MetricTile label="Last decision" text={metrics?.last_decision ?? "—"} />
        <MetricTile label="Open tasks" value={metrics?.tasks_open ?? 0} tone="blue" />
      </div>

      {/* Config summary */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Config summary
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
          <ConfigRow label="Mode" value={(config.mode as string) ?? "—"} />
          <ConfigRow
            label="Last status"
            value={metrics?.last_status ?? "—"}
          />
          <ConfigRow label="Sender account" value={config.sender?.emailAccount ?? "—"} mono />
          <ConfigRow
            label="Sending limits"
            value={
              config.sending
                ? `${config.sending.dailyLimit ?? "—"}/day · ${config.sending.hourlyLimit ?? "—"}/hr`
                : "—"
            }
          />
          <ConfigRow
            label="Quiet hours"
            value={
              config.quietHours
                ? `${config.quietHours.start ?? "—"} – ${config.quietHours.end ?? "—"}${
                    config.quietHours.tz ? ` (${config.quietHours.tz})` : ""
                  }`
                : "—"
            }
          />
          <ConfigRow label="Test mode" value={config.testMode ? "On — no external sends" : "Off"} />
        </dl>
      </div>

      {capabilities.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Capabilities
          </div>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11.5px] font-medium text-blue-700 ring-1 ring-blue-100"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  text,
  title,
  tone,
}: {
  label: string;
  value?: number;
  text?: string;
  title?: string;
  tone?: "blue";
}) {
  return (
    <div className={`rounded-xl border bg-white px-4 py-3 ${tone === "blue" ? "border-blue-200" : "border-slate-200"}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      {typeof value === "number" ? (
        <div className={`mt-1 font-mono text-[22px] font-bold tracking-[-0.02em] ${tone === "blue" ? "text-blue-700" : "text-slate-900"}`}>
          {value.toLocaleString()}
        </div>
      ) : (
        <div className="mt-1 truncate text-[15px] font-semibold text-slate-800" title={title}>
          {text}
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
      <dt className="text-[12.5px] text-slate-500">{label}</dt>
      <dd className={`text-right text-[12.5px] font-semibold text-slate-800 ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/* ─────────────────────────── Chat tab ─────────────────────────────────── */

function ChatTab({
  agentName,
  displayName,
  accent,
}: {
  agentName: string;
  displayName: string;
  accent: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // chat_history: {action:"chat_history", agent_name, limit?}
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const data = await callConsole<{ ok: boolean; messages: ChatMessage[] }>({
          action: "chat_history",
          agent_name: agentName,
          limit: 50,
        });
        if (cancelled) return;
        if (!data?.ok) throw new Error("Failed to load chat history");
        setMessages(data.messages ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "Failed to load chat history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    // Optimistically append the user message.
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setTyping(true);
    try {
      const data = await callConsole<{ ok: boolean; reply: string; message_id: string; user_message_id: string }>({
        action: "chat",
        agent_name: agentName,
        message: text,
      });
      if (!data?.ok) throw new Error("Chat failed");
      setMessages((prev) => {
        // Reconcile the optimistic id with the server's user_message_id.
        const reconciled = prev.map((m) =>
          m.id === optimistic.id ? { ...m, id: data.user_message_id || m.id } : m,
        );
        return [
          ...reconciled,
          {
            id: data.message_id || `reply-${Date.now()}`,
            role: "assistant" as const,
            content: data.reply ?? "",
            created_at: new Date().toISOString(),
          },
        ];
      });
    } catch (e: any) {
      setErr(e?.message || "Chat failed");
    } finally {
      setTyping(false);
      setSending(false);
    }
  }, [input, sending, agentName]);

  return (
    <div className="flex h-[520px] flex-col">
      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="h-7 w-7 text-slate-300" aria-hidden />
            <p className="mt-2 text-[13px] text-slate-500">
              Ask {displayName} about his pipeline, or give him direction.
            </p>
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} msg={m} accent={accent} displayName={displayName} />)
        )}
        {typing && (
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <AgentAvatar name={displayName} accent={accent} size={26} />
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
            </span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={`Message ${displayName}…  (Enter to send, Shift+Enter for newline)`}
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ msg, accent, displayName }: { msg: ChatMessage; accent: string; displayName: string }) {
  if (msg.role === "system") {
    return (
      <div className="mx-auto max-w-[80%] rounded-md bg-slate-100 px-3 py-1.5 text-center text-[11.5px] text-slate-500">
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <AgentAvatar name={displayName} accent={accent} size={28} />}
      <div
        className={[
          "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
          isUser
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm border border-slate-200 bg-white text-slate-800",
        ].join(" ")}
      >
        {msg.content}
        <div className={`mt-1 text-[10px] ${isUser ? "text-blue-100/80" : "text-slate-400"}`}>
          {fmtRelative(msg.created_at)}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Tasks tab ────────────────────────────────── */

function TasksTab({ agentName, onChanged }: { agentName: string; onChanged: () => void }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  // list_tasks: {action:"list_tasks", agent_name, status?}
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const data = await callConsole<{ ok: boolean; tasks: AgentTask[] }>({
          action: "list_tasks",
          agent_name: agentName,
        });
        if (cancelled) return;
        if (!data?.ok) throw new Error("Failed to load tasks");
        setTasks(data.tasks ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "Failed to load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentName, refreshKey]);

  const localRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onChanged();
  }, [onChanged]);

  // assign_task: {action:"assign_task", agent_name, title, instructions?, priority?}
  const submit = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      await callConsole({
        action: "assign_task",
        agent_name: agentName,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        priority: priority.trim() || undefined,
      });
      setTitle("");
      setInstructions("");
      setPriority("");
      localRefresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to assign task");
    } finally {
      setSubmitting(false);
    }
  }, [title, instructions, priority, submitting, agentName, localRefresh]);

  // update_task: {action:"update_task", task_id, status}
  const updateTask = useCallback(
    async (taskId: string, status: AgentTask["status"]) => {
      setBusyTask(taskId);
      setErr(null);
      try {
        await callConsole({ action: "update_task", task_id: taskId, status });
        localRefresh();
      } catch (e: any) {
        setErr(e?.message || "Failed to update task");
      } finally {
        setBusyTask(null);
      }
    },
    [localRefresh],
  );

  return (
    <div className="space-y-5">
      {/* New task form */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">New task</div>
        <div className="space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title (required)"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="Instructions (optional)…"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="flex items-center gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Priority — normal</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !title.trim()}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Assign task
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="py-10 text-center">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-[13px] text-slate-500">
          No tasks yet. Assign one above.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const tone = TASK_STATUS_TONE[t.status] ?? TASK_STATUS_TONE.queued;
            const closed = t.status === "done" || t.status === "cancelled";
            return (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-900">{t.title}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${tone.bg} ${tone.text}`}>
                        {t.status.replace(/_/g, " ")}
                      </span>
                      {t.priority && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                          {String(t.priority)}
                        </span>
                      )}
                    </div>
                    {t.instructions && (
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-slate-600">{t.instructions}</p>
                    )}
                    <div className="mt-1.5 text-[11px] text-slate-400" title={fmtAbsolute(t.created_at)}>
                      Created {fmtRelative(t.created_at)}
                      {t.completed_at && ` · Completed ${fmtRelative(t.completed_at)}`}
                    </div>
                  </div>
                  {!closed && (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={busyTask === t.id}
                        onClick={() => updateTask(t.id, "done")}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Done
                      </button>
                      <button
                        type="button"
                        disabled={busyTask === t.id}
                        onClick={() => updateTask(t.id, "cancelled")}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Activity tab ─────────────────────────────── */

function ActivityTab({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-[13px] text-slate-500">
        No runs recorded yet. Use “Run controller now” to trigger the first one.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <th className="px-3 py-2.5 text-left">When</th>
            <th className="px-3 py-2.5 text-left">Trigger</th>
            <th className="px-3 py-2.5 text-left">Decision</th>
            <th className="px-3 py-2.5 text-left">Status</th>
            <th className="px-3 py-2.5 text-left">Reason</th>
            <th className="px-3 py-2.5 text-right">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((r) => (
            <ActivityRow key={r.id} run={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityRow({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(false);
  const statusKey = (run.status ?? "").toLowerCase();
  const tone = RUN_STATUS_TONE[statusKey] ?? { text: "text-slate-600", icon: "wait" as const };
  const StatusIcon = tone.icon === "ok" ? CheckCircle2 : tone.icon === "fail" ? XCircle : Clock;
  const counts =
    run.output_json && typeof run.output_json === "object"
      ? Object.entries(run.output_json).filter(([, v]) => typeof v === "number" || typeof v === "string")
      : [];

  return (
    <>
      <tr className="hover:bg-slate-50/60">
        <td className="px-3 py-2.5 align-top font-mono text-[11.5px] text-slate-500" title={fmtAbsolute(run.created_at)}>
          {fmtRelative(run.created_at)}
        </td>
        <td className="px-3 py-2.5 align-top">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] text-slate-600">
            {run.trigger_type ?? "—"}
          </span>
          {run.test_mode && (
            <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-amber-700 ring-1 ring-amber-200">
              test
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top font-semibold text-slate-800">{run.decision ?? "—"}</td>
        <td className="px-3 py-2.5 align-top">
          <span className={`inline-flex items-center gap-1 font-semibold ${tone.text}`}>
            <StatusIcon className="h-3.5 w-3.5" aria-hidden />
            {run.status ?? "—"}
          </span>
        </td>
        <td className="max-w-[240px] truncate px-3 py-2.5 align-top text-slate-600" title={run.decision_reason ?? undefined}>
          {run.decision_reason ?? <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right align-top">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-blue-600 hover:underline"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {open ? "Hide" : "View"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/50">
          <td colSpan={6} className="px-3 py-3">
            {counts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {counts.map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] text-slate-700 ring-1 ring-slate-200"
                  >
                    {k}: <b>{String(v)}</b>
                  </span>
                ))}
              </div>
            ) : (
              <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {run.output_json ? JSON.stringify(run.output_json, null, 2) : "No output recorded."}
              </pre>
            )}
            <div className="mt-2 text-[11px] text-slate-400">
              Completed {run.completed_at ? fmtAbsolute(run.completed_at) : "—"}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─────────────────────────── Knowledge tab ────────────────────────────── */

function KnowledgeTab() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
      <BookOpen className="mx-auto h-7 w-7 text-slate-300" aria-hidden />
      <div className="mt-2 text-[14px] font-semibold text-slate-700">Knowledge base</div>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] text-slate-500">
        This agent&apos;s knowledge is managed server-side via{" "}
        <span className="font-mono text-[11.5px] text-slate-700">lit_agent_knowledge</span>.
        A read/write editor for it is planned; nothing here yet.
      </p>
    </div>
  );
}

/* ─────────────────────────── Skeletons ────────────────────────────────── */

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
