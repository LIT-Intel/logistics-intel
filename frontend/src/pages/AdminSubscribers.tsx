/**
 * /app/admin/subscribers — the cross-tool moat panel.
 *
 * One row per LIT user, enriched with:
 *   - LIT product usage (saves, searches, last activity)
 *   - Attio CRM deal stage + last touch
 *
 * Backed by the `admin-list-subscribers` edge function which does the
 * three-system join server-side. Platform-admin only (route guarded
 * by <RequireAdmin>; edge function re-checks platform_admins).
 *
 * Why this lives in LIT, not Attio: sales already lives in Attio, but
 * product usage (saves, searches, last_login) is LIT-side and a sales
 * rep should not need to open Looker / Metabase to see it. This page
 * is "what Attio can't show you on its own."
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  RefreshCw,
  Filter,
  AlertCircle,
  ExternalLink,
  Mail,
  Search as SearchIcon,
  Bookmark,
  Clock,
  CircleDot,
  Activity,
  CheckCircle2,
  XCircle,
  SkipForward,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type AttioSummary = {
  personId: string | null;
  dealId: string | null;
  dealName: string | null;
  stage: string | null;
  lastTouchAt: string | null;
};

type SubscriberRow = {
  userId: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  plan: string;
  orgName: string | null;
  saves: number;
  lastSaveAt: string | null;
  searches: number;
  lastSearchAt: string | null;
  attio: AttioSummary;
};

type Meta = {
  totalUsers: number;
  attioPersonMatches: number;
  attioDealMatches: number;
  attioError: string | null;
  generatedAt: string;
};

type SyncLogRow = {
  id: string;
  created_at: string;
  list_id: string;
  membership_type: string;
  membership_id: string;
  attio_record_id: string | null;
  attio_object_type: string | null;
  status: "succeeded" | "failed" | "skipped";
  error: string | null;
  retry_count: number | null;
};

const STAGE_TONE: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  Lead: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200", dot: "bg-slate-400" },
  Qualified: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", dot: "bg-blue-500" },
  "Demo Scheduled": {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    dot: "bg-indigo-500",
  },
  "Trial Started": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  "Trial Active": {
    bg: "bg-orange-50",
    text: "text-orange-700",
    ring: "ring-orange-200",
    dot: "bg-orange-500",
  },
  Negotiation: {
    bg: "bg-fuchsia-50",
    text: "text-fuchsia-700",
    ring: "ring-fuchsia-200",
    dot: "bg-fuchsia-500",
  },
  Won: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  Lost: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200", dot: "bg-rose-500" },
};

const PLAN_TONE: Record<string, { bg: string; text: string; ring: string }> = {
  free_trial: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200" },
  starter: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" },
  growth: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200" },
  scale: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", ring: "ring-fuchsia-200" },
};

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

type StageFilter = "all" | "no_deal" | string;
type ActivityFilter = "all" | "active_7d" | "active_30d" | "dormant" | "never";

// Human-readable names for the two system Pulse lists that sync to Attio.
const PULSE_LIST_NAMES: Record<string, string> = {
  "71df54d9-56d3-4ba3-823d-d367f7e9affd": "Forwarders",
  "99b046f1-1885-449f-9441-2128be55895f": "Brokers",
};

export default function AdminSubscribers() {
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");

  // Pulse → Attio sync log
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([]);
  const [syncLogsLoading, setSyncLogsLoading] = useState(true);
  const [syncLogsErr, setSyncLogsErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-list-subscribers", {
          method: "POST",
          body: {},
        });
        if (cancelled) return;
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Failed to load subscribers");
        setRows(data.rows as SubscriberRow[]);
        setMeta(data.meta as Meta);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message || "Failed to load subscribers");
        setRows([]);
        setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Fetch the last 20 Pulse → Attio sync log entries (most recent first).
  // This is a direct Supabase query — admins only (RLS enforces platform_admins).
  useEffect(() => {
    let cancelled = false;
    setSyncLogsLoading(true);
    setSyncLogsErr(null);
    supabase
      .from("pulse_attio_sync_log")
      .select(
        "id,created_at,list_id,membership_type,membership_id,attio_record_id,attio_object_type,status,error,retry_count",
      )
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncLogsErr(error.message);
        } else {
          setSyncLogs((data ?? []) as SyncLogRow[]);
        }
        setSyncLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let noDeal = 0;
    for (const r of rows) {
      if (!r.attio.stage) noDeal += 1;
      else counts[r.attio.stage] = (counts[r.attio.stage] || 0) + 1;
    }
    return { counts, noDeal };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter !== "all") {
        if (stageFilter === "no_deal") {
          if (r.attio.stage) return false;
        } else if (r.attio.stage !== stageFilter) {
          return false;
        }
      }
      if (activityFilter !== "all") {
        const ts = r.lastSignInAt ? Date.parse(r.lastSignInAt) : 0;
        const ageDays = ts ? (Date.now() - ts) / 86_400_000 : Infinity;
        if (activityFilter === "active_7d" && !(ageDays <= 7)) return false;
        if (activityFilter === "active_30d" && !(ageDays <= 30)) return false;
        if (activityFilter === "dormant" && !(ageDays > 30 && ageDays !== Infinity)) return false;
        if (activityFilter === "never" && ageDays !== Infinity) return false;
      }
      if (q) {
        const hay = `${r.email ?? ""} ${r.orgName ?? ""} ${r.attio.dealName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, stageFilter, activityFilter, search]);

  const summary = useMemo(() => {
    const totalSaves = rows.reduce((acc, r) => acc + r.saves, 0);
    const totalSearches = rows.reduce((acc, r) => acc + r.searches, 0);
    const active7d = rows.filter((r) => {
      const ts = r.lastSignInAt ? Date.parse(r.lastSignInAt) : 0;
      return ts > 0 && Date.now() - ts <= 7 * 86_400_000;
    }).length;
    return { totalSaves, totalSearches, active7d };
  }, [rows]);

  const onCsvExport = useCallback(() => {
    const header = [
      "email",
      "org",
      "plan",
      "createdAt",
      "lastSignInAt",
      "saves",
      "lastSaveAt",
      "searches",
      "lastSearchAt",
      "attioStage",
      "attioDealName",
      "attioLastTouchAt",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of visibleRows) {
      lines.push(
        [
          r.email,
          r.orgName,
          r.plan,
          r.createdAt,
          r.lastSignInAt,
          r.saves,
          r.lastSaveAt,
          r.searches,
          r.lastSearchAt,
          r.attio.stage,
          r.attio.dealName,
          r.attio.lastTouchAt,
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lit-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [visibleRows]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Cross-tool moat panel
            </span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">
            Subscribers
          </h1>
          <p className="mt-1.5 max-w-[640px] text-[14px] leading-relaxed text-slate-500">
            Every LIT user, joined with their product usage and their Attio CRM deal
            in one view. Sales sees what Attio can&apos;t show on its own — the saves,
            searches, and last-login signals that come from the LIT product itself.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCsvExport}
            disabled={loading || rows.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Total users" value={meta?.totalUsers ?? rows.length} />
        <StatCard label="Active last 7d" value={summary.active7d} tone="blue" />
        <StatCard label="Saves (total)" value={summary.totalSaves} />
        <StatCard label="Searches (total)" value={summary.totalSearches} />
      </div>

      {meta?.attioError && (
        <div
          className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Attio enrichment unavailable</div>
            <div className="text-amber-700/90">{meta.attioError}</div>
            <div className="mt-0.5 text-amber-700/70">
              LIT-side usage data is still shown below; Attio columns will read &quot;—&quot;.
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Stage
          </span>
          {(["all", "no_deal", "Lead", "Qualified", "Demo Scheduled", "Trial Started", "Trial Active", "Negotiation", "Won", "Lost"] as StageFilter[]).map(
            (s) => {
              const count =
                s === "all"
                  ? rows.length
                  : s === "no_deal"
                  ? stageCounts.noDeal
                  : stageCounts.counts[s] ?? 0;
              const active = stageFilter === s;
              return (
                <FilterChip
                  key={s}
                  label={s === "all" ? "All" : s === "no_deal" ? "No deal" : s}
                  count={count}
                  active={active}
                  onClick={() => setStageFilter(s)}
                />
              );
            },
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Activity
          </span>
          {(
            [
              ["all", "All"],
              ["active_7d", "Active 7d"],
              ["active_30d", "Active 30d"],
              ["dormant", "Dormant"],
              ["never", "Never signed in"],
            ] as Array<[ActivityFilter, string]>
          ).map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              active={activityFilter === key}
              onClick={() => setActivityFilter(key)}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <SearchIcon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, org, or deal name…"
            className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="font-mono text-[11px] text-slate-400">
            {visibleRows.length} / {rows.length}
          </span>
        </div>
      </div>

      {/* Error state */}
      {err && (
        <div
          className="mt-6 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{err}</span>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {loading ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <div className="mt-3 text-[13px] text-slate-500">
              Loading subscribers + Attio enrichment…
            </div>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold text-slate-700">No subscribers match these filters</div>
            <p className="mt-1.5 text-[13px] text-slate-500">
              Try clearing stage / activity filters or the search box.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-slate-50/70 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-right">Last sign-in</th>
                  <th className="px-4 py-3 text-right">Saves</th>
                  <th className="px-4 py-3 text-right">Searches</th>
                  <th className="px-4 py-3 text-left">Attio deal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((r) => (
                  <SubscriberTableRow key={r.userId} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta?.generatedAt && (
        <p className="mt-3 text-right font-mono text-[10.5px] text-slate-400">
          Generated {fmtAbsolute(meta.generatedAt)} · {meta.attioPersonMatches} Attio people · {meta.attioDealMatches} deals matched
        </p>
      )}

      {/* ── Pulse → Attio Sync Log ─────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center gap-2 text-blue-600">
          <Activity className="h-4 w-4" aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
            Pulse → Attio sync
          </span>
        </div>
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-slate-900">
          Sync log
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Last 20 sync attempts for the Forwarders and Brokers Pulse lists.
          Each new member triggers one entry via{" "}
          <span className="font-mono text-[11.5px] text-slate-700">pulse-attio-sync</span>.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {syncLogsLoading ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
              <div className="mt-2 text-[12px] text-slate-500">Loading sync log…</div>
            </div>
          ) : syncLogsErr ? (
            <div className="flex items-start gap-2 px-4 py-4 text-[12.5px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{syncLogsErr}</span>
            </div>
          ) : syncLogs.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="text-[14px] font-semibold text-slate-700">No sync attempts yet</div>
              <p className="mt-1 text-[12px] text-slate-500">
                Entries appear here as soon as a contact or company is added to
                a Pulse list with <span className="font-mono">syncs_to_attio = true</span>.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">List</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">Attio record</th>
                    <th className="px-4 py-2.5 text-left">Error</th>
                    <th className="px-4 py-2.5 text-right">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncLogs.map((row) => (
                    <SyncLogTableRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncLogTableRow({ row }: { row: SyncLogRow }) {
  const statusIcon =
    row.status === "succeeded" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
    ) : row.status === "skipped" ? (
      <SkipForward className="h-3.5 w-3.5 text-slate-400" aria-hidden />
    ) : (
      <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden />
    );
  const statusText =
    row.status === "succeeded"
      ? "text-emerald-700"
      : row.status === "skipped"
        ? "text-slate-500"
        : "text-rose-700";

  const listName = PULSE_LIST_NAMES[row.list_id] ?? row.list_id.slice(0, 8) + "…";
  const attioLink =
    row.attio_record_id && row.attio_object_type
      ? `https://app.attio.com/lit/${row.attio_object_type}/record/${row.attio_record_id}`
      : null;

  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-4 py-2.5 align-middle">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${statusText}`}>
          {statusIcon}
          {row.status}
        </span>
      </td>
      <td className="px-4 py-2.5 align-middle text-slate-700">{listName}</td>
      <td className="px-4 py-2.5 align-middle">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10.5px] text-slate-600">
          {row.membership_type}
        </span>
      </td>
      <td className="px-4 py-2.5 align-middle">
        {attioLink ? (
          <a
            href={attioLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 hover:underline"
            title={row.attio_record_id ?? undefined}
          >
            {row.attio_record_id!.slice(0, 8)}…
            <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          </a>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="max-w-[260px] truncate px-4 py-2.5 align-middle font-mono text-[10.5px] text-rose-600">
        {row.error ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right align-middle font-mono text-[11px] text-slate-500">
        <span title={fmtAbsolute(row.created_at)}>{fmtRelative(row.created_at)}</span>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "blue";
}) {
  return (
    <div
      className={[
        "rounded-xl border bg-white px-4 py-3 sm:px-5 sm:py-4",
        tone === "blue" ? "border-blue-200" : "border-slate-200",
      ].join(" ")}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div
        className={[
          "mt-1 font-mono text-[22px] font-bold tracking-[-0.02em]",
          tone === "blue" ? "text-blue-700" : "text-slate-900",
        ].join(" ")}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition",
        active
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
      ].join(" ")}
    >
      {label}
      {typeof count === "number" && (
        <span className="font-mono text-[10.5px] text-slate-400">{count}</span>
      )}
    </button>
  );
}

function SubscriberTableRow({ row }: { row: SubscriberRow }) {
  const stage = row.attio.stage;
  const stageTone = stage ? STAGE_TONE[stage] ?? STAGE_TONE.Lead : null;
  const planTone = PLAN_TONE[row.plan] ?? PLAN_TONE.free_trial;
  const attioUrl = row.attio.dealId
    ? `https://app.attio.com/lit/deals/record/${row.attio.dealId}`
    : row.attio.personId
    ? `https://app.attio.com/lit/people/record/${row.attio.personId}`
    : null;

  return (
    <tr className="hover:bg-slate-50/60">
      {/* User */}
      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <div className="truncate font-mono text-[12.5px] text-slate-900">
              {row.email ?? <span className="text-slate-400">(no email)</span>}
            </div>
            {row.orgName && (
              <div className="mt-0.5 truncate text-[11.5px] text-slate-500">
                {row.orgName}
              </div>
            )}
          </div>
        </div>
      </td>
      {/* Plan */}
      <td className="px-4 py-3 align-top">
        <span
          className={[
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ring-1",
            planTone.bg,
            planTone.text,
            planTone.ring,
          ].join(" ")}
        >
          {row.plan.replace(/_/g, " ")}
        </span>
      </td>
      {/* Last sign-in */}
      <td className="px-4 py-3 text-right align-top">
        <span
          className="font-mono text-[12px] text-slate-700"
          title={fmtAbsolute(row.lastSignInAt)}
        >
          {fmtRelative(row.lastSignInAt)}
        </span>
      </td>
      {/* Saves */}
      <td className="px-4 py-3 text-right align-top">
        <UsagePill icon={Bookmark} count={row.saves} latest={row.lastSaveAt} />
      </td>
      {/* Searches */}
      <td className="px-4 py-3 text-right align-top">
        <UsagePill icon={SearchIcon} count={row.searches} latest={row.lastSearchAt} />
      </td>
      {/* Attio deal */}
      <td className="px-4 py-3 align-top">
        {stage && stageTone ? (
          <div className="flex flex-col gap-1">
            <span
              className={[
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ring-1",
                stageTone.bg,
                stageTone.text,
                stageTone.ring,
              ].join(" ")}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stageTone.dot}`} aria-hidden />
              {stage}
            </span>
            {row.attio.dealName && (
              <div className="truncate text-[11.5px] text-slate-600" title={row.attio.dealName}>
                {row.attio.dealName}
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span title={fmtAbsolute(row.attio.lastTouchAt)}>
                Last touch · {fmtRelative(row.attio.lastTouchAt)}
              </span>
              {attioUrl && (
                <a
                  href={attioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                >
                  Open <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <CircleDot className="h-3 w-3" aria-hidden />
            No Attio deal
            {row.email && (
              <a
                href={`https://app.attio.com/lit/people/?search=${encodeURIComponent(row.email)}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 text-blue-600 hover:underline"
              >
                Search <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              </a>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function UsagePill({
  icon: Icon,
  count,
  latest,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  count: number;
  latest: string | null;
}) {
  if (count === 0) {
    return <span className="font-mono text-[11.5px] text-slate-300">0</span>;
  }
  return (
    <div className="flex flex-col items-end">
      <span className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-slate-900">
        <Icon className="h-3 w-3 text-slate-400" aria-hidden />
        {count.toLocaleString()}
      </span>
      {latest && (
        <span className="mt-0.5 text-[10.5px] text-slate-400" title={fmtAbsolute(latest)}>
          {fmtRelative(latest)}
        </span>
      )}
    </div>
  );
}
