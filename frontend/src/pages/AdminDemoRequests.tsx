/**
 * /app/admin/demo-requests — In-LIT inbox for marketing-site demo
 * submissions. The Sanity `demoRequest` doc is the source of truth;
 * this page reads from `public.lit_demo_requests` (mirrored by the
 * marketing-site /api/demo-request fan-out) so admins can triage,
 * mark status, and email-reply directly inside LIT.
 *
 * Live updates via Supabase Realtime — new submissions appear at the
 * top without a refresh.
 *
 * Access: platform admins only (RLS policy enforces, route also gated
 * by <RequireAdmin>).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Mail,
  Phone,
  Globe2,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Filter,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type DemoRequest = {
  id: string;
  sanity_id: string;
  name: string;
  email: string;
  company: string | null;
  domain: string | null;
  phone: string | null;
  use_case: string | null;
  team_size: string | null;
  primary_goal: string | null;
  source: string | null;
  submitted_at: string;
  created_at: string;
  status: "new" | "contacted" | "scheduled" | "closed" | string;
};

const STATUS_OPTIONS: DemoRequest["status"][] = ["new", "contacted", "scheduled", "closed"];

const STATUS_TONE: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  new: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", dot: "bg-blue-500" },
  contacted: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  scheduled: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    dot: "bg-indigo-500",
  },
  closed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
  },
};

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SANITY_BASE = "https://logisticintel.com/studio/desk/demoRequest;";

export default function AdminDemoRequests() {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | DemoRequest["status"]>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  // Initial fetch + on refresh button click.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    supabase
      .from("lit_demo_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setErr(error.message || "Failed to load demo requests");
          setRows([]);
        } else {
          setRows((data || []) as DemoRequest[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Realtime — new submissions appear at the top without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("lit_demo_requests_inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lit_demo_requests" },
        (payload) => {
          const row = payload.new as DemoRequest;
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lit_demo_requests" },
        (payload) => {
          const row = payload.new as DemoRequest;
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const newCount = rows.filter((r) => r.status === "new").length;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const weekCount = rows.filter((r) => new Date(r.created_at).getTime() > weekAgo).length;
    return { total, newCount, weekCount };
  }, [rows]);

  const visibleRows = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const updateStatus = useCallback(
    async (id: string, next: DemoRequest["status"]) => {
      const prev = rows;
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
      const { error } = await supabase
        .from("lit_demo_requests")
        .update({ status: next })
        .eq("id", id);
      if (error) {
        setRows(prev);
        setErr(`Failed to update status: ${error.message}`);
      }
    },
    [rows],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Inbox className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              Marketing inbox
            </span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-slate-900">
            Demo requests
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
            Submissions from{" "}
            <a
              href="https://www.logisticintel.com/demo"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              logisticintel.com/demo
            </a>
            . Live via Supabase Realtime — new ones appear here without a refresh.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Awaiting reply" value={stats.newCount} tone="blue" />
        <StatCard label="Last 7 days" value={stats.weekCount} />
      </div>

      {/* Filter chips */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filter
        </span>
        {(["all", ...STATUS_OPTIONS] as const).map((s) => {
          const active = filter === s;
          const count =
            s === "all" ? rows.length : rows.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={[
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition",
                active
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              ].join(" ")}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="font-mono text-[10.5px] text-slate-400">{count}</span>
            </button>
          );
        })}
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

      {/* List */}
      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <div className="mt-3 text-[13px] text-slate-500">Loading…</div>
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState filter={filter} totalRows={rows.length} />
        ) : (
          <ul className="space-y-3">
            {visibleRows.map((r) => (
              <DemoRow key={r.id} row={r} onStatusChange={updateStatus} />
            ))}
          </ul>
        )}
      </div>
    </div>
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
          "mt-1 font-mono text-[24px] font-bold tracking-[-0.02em]",
          tone === "blue" ? "text-blue-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  filter,
  totalRows,
}: {
  filter: string;
  totalRows: number;
}) {
  if (totalRows === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
        <div className="text-[18px] font-semibold text-slate-900">No demo requests yet</div>
        <p className="mx-auto mt-2 max-w-[460px] text-[13.5px] leading-relaxed text-slate-500">
          When someone submits the form at{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://www.logisticintel.com/demo"
            target="_blank"
            rel="noreferrer"
          >
            logisticintel.com/demo
          </a>
          , it&apos;ll appear here within seconds via Supabase Realtime — and an email will hit
          your sales inbox if Resend is configured.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      <div className="text-[14px] font-semibold text-slate-700">
        No demo requests with status &quot;{filter}&quot;
      </div>
      <p className="mt-1.5 text-[13px] text-slate-500">
        Switch the filter to see other states.
      </p>
    </div>
  );
}

function DemoRow({
  row,
  onStatusChange,
}: {
  row: DemoRequest;
  onStatusChange: (id: string, status: DemoRequest["status"]) => void;
}) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.new;
  return (
    <li className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <div className="px-5 pt-4 sm:px-6">
        {/* Top row: name + company + status + time */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-[16.5px] font-semibold text-slate-900">{row.name}</h2>
              {row.company && (
                <span className="text-[13.5px] text-slate-500">· {row.company}</span>
              )}
              <span
                className={[
                  "ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] ring-1",
                  tone.bg,
                  tone.text,
                  tone.ring,
                ].join(" ")}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                {row.status}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-500">
              <a
                href={`mailto:${row.email}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Mail className="h-3 w-3" aria-hidden /> {row.email}
              </a>
              {row.phone && (
                <a
                  href={`tel:${row.phone}`}
                  className="inline-flex items-center gap-1 hover:text-slate-700"
                >
                  <Phone className="h-3 w-3" aria-hidden /> {row.phone}
                </a>
              )}
              {row.domain && (
                <a
                  href={
                    row.domain.startsWith("http") ? row.domain : `https://${row.domain}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-slate-700"
                >
                  <Globe2 className="h-3 w-3" aria-hidden /> {row.domain}
                </a>
              )}
            </div>
          </div>
          <div
            className="text-right text-[11.5px] text-slate-400"
            title={fmtAbsolute(row.created_at)}
          >
            {fmtRelative(row.created_at)}
          </div>
        </div>

        {/* Meta tags */}
        {(row.use_case || row.team_size || row.source) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.use_case && <Pill label="Use case" value={row.use_case} />}
            {row.team_size && <Pill label="Team" value={row.team_size} />}
            {row.source && <Pill label="Source" value={row.source} subtle />}
          </div>
        )}

        {/* Primary goal */}
        {row.primary_goal && (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-slate-700">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
              What they&apos;re hoping LIT will help with
            </div>
            <div className="mt-1">{row.primary_goal}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`mailto:${row.email}?subject=${encodeURIComponent(
              `Re: your Logistic Intel demo request${row.company ? ` — ${row.company}` : ""}`,
            )}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Reply via email
          </a>
          <a
            href={`${SANITY_BASE}${row.sanity_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open Sanity doc
          </a>
        </div>

        <div className="flex items-center gap-2">
          {row.status !== "contacted" && row.status === "new" && (
            <button
              type="button"
              onClick={() => onStatusChange(row.id, "contacted")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12.5px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mark contacted
            </button>
          )}
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Status
            </span>
            <select
              value={row.status}
              onChange={(e) =>
                onStatusChange(row.id, e.target.value as DemoRequest["status"])
              }
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] font-semibold text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </li>
  );
}

function Pill({
  label,
  value,
  subtle = false,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px]",
        subtle
          ? "border-slate-100 bg-slate-50/60 text-slate-500"
          : "border-slate-200 bg-white text-slate-700",
      ].join(" ")}
    >
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </span>
      <span className="font-mono">{value}</span>
    </span>
  );
}
