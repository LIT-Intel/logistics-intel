import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Anchor, ArrowRight, Container, Loader2 } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitEmptyState from "@/components/ui/LitEmptyState";
import LitPill from "@/components/ui/LitPill";
import { supabase } from "@/lib/supabase";

/**
 * Dashboard tile — surfaces the next 7 days of predicted container
 * arrivals across the user's saved companies. Closes F3 of the app
 * review roadmap (`pulse-arrival-alerts` was previously a cron-only
 * function with no frontend trigger).
 *
 * Data flow
 * ---------
 * The `pulse-arrival-alerts` cron writes rows into `lit_pulse_alerts`
 * with `alert_type = 'arrival_window'`. Each row's `payload` carries
 * the predicted ETA range, container count, BOL number, destination,
 * and shipper. This tile queries the user's own alerts (RLS on the
 * table scopes by `user_id` automatically), filters to the next 7
 * days client-side, and renders the top 5 sorted by ETA.
 *
 * Why filter client-side instead of in the SQL query
 * --------------------------------------------------
 * `estimated_arrival_date` is inside a JSONB column. Filtering on it
 * in PostgREST works (`payload->>estimated_arrival_date::date`) but
 * requires either a server function or an index that we don't have
 * yet. With realistic alert volumes (≤200 per user per week), the
 * over-fetch is negligible. Add an RPC or computed column if this
 * tile starts dominating the Dashboard's first-paint budget.
 */

type ArrivalRow = {
  id: string;
  severity: "info" | "warning" | "critical" | string;
  payload: {
    company_name?: string;
    bol_number?: string;
    container_count?: number;
    estimated_arrival_date?: string;
    estimated_arrival_low?: string;
    estimated_arrival_high?: string;
    destination_port_guess?: string;
    dest_city?: string | null;
    dest_state?: string | null;
    shipper_name?: string | null;
  };
  source_company_key: string | null;
};

const MAX_ROWS = 5;

export default function ArrivingThisWeekTile() {
  const [rows, setRows] = useState<ArrivalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // RLS scopes to the current user automatically. No filter needed.
        const { data, error: err } = await supabase
          .from("lit_pulse_alerts")
          .select("id, severity, payload, source_company_key")
          .eq("alert_type", "arrival_window")
          .order("created_at", { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setRows([]);
          return;
        }
        setRows((data ?? []) as ArrivalRow[]);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load arrivals");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side filter: ETAs that fall in the next 7 days.
  const upcoming = useMemo(() => {
    if (!rows) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return rows
      .filter((r) => {
        const eta = r.payload?.estimated_arrival_date;
        if (!eta) return false;
        const t = new Date(eta + "T00:00:00").getTime();
        return Number.isFinite(t) && t >= today.getTime() && t <= horizon.getTime();
      })
      .sort((a, b) => {
        const at = new Date((a.payload.estimated_arrival_date || "") + "T00:00:00").getTime();
        const bt = new Date((b.payload.estimated_arrival_date || "") + "T00:00:00").getTime();
        return at - bt;
      })
      .slice(0, MAX_ROWS);
  }, [rows]);

  const totalContainers = upcoming.reduce(
    (s, r) => s + (Number(r.payload?.container_count) || 0),
    0,
  );

  // Loading: brief placeholder. Don't render anything heavier than a row
  // until the query resolves — Dashboard first-paint matters.
  if (rows === null) {
    return (
      <LitSectionCard
        title="Arriving this week"
        sub="Predicted container ETAs across your saved companies"
        action={<Anchor className="h-3.5 w-3.5 text-blue-500" />}
      >
        <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="font-body text-[11.5px]">Checking arrivals…</span>
        </div>
      </LitSectionCard>
    );
  }

  // Error state — still render the card so the layout doesn't jump,
  // but lean on LitEmptyState's vocabulary for clarity.
  if (error) {
    return (
      <LitSectionCard
        title="Arriving this week"
        action={<Anchor className="h-3.5 w-3.5 text-slate-400" />}
        padded={false}
      >
        <LitEmptyState
          size="sm"
          title="Couldn't load arrivals"
          body={error}
        />
      </LitSectionCard>
    );
  }

  // Empty: no rows = no saved companies have shipments arriving soon.
  if (upcoming.length === 0) {
    return (
      <LitSectionCard
        title="Arriving this week"
        action={<Anchor className="h-3.5 w-3.5 text-slate-400" />}
        padded={false}
      >
        <LitEmptyState
          size="sm"
          icon={<Anchor className="h-5 w-5" />}
          title="No predicted arrivals in the next 7 days"
          body="Save companies in the Command Center to start receiving arrival-window alerts from their BOL feeds."
          primary={{ label: "Open Command Center", to: "/app/command-center" }}
        />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard
      title="Arriving this week"
      sub={`${upcoming.length} shipment${upcoming.length === 1 ? "" : "s"} · ${totalContainers.toLocaleString()} container${totalContainers === 1 ? "" : "s"}`}
      action={<Anchor className="h-3.5 w-3.5 text-blue-500" />}
      padded={false}
    >
      <ul className="divide-y divide-slate-100">
        {upcoming.map((row) => (
          <ArrivalRowItem key={row.id} row={row} />
        ))}
      </ul>
    </LitSectionCard>
  );
}

function ArrivalRowItem({ row }: { row: ArrivalRow }) {
  const p = row.payload;
  const company = p.company_name || "Unknown company";
  const dest =
    p.destination_port_guess ||
    [p.dest_city, p.dest_state].filter(Boolean).join(", ") ||
    "destination";
  const eta = p.estimated_arrival_date
    ? formatEta(p.estimated_arrival_date)
    : null;
  const containerCount = Number(p.container_count) || 0;
  const companyId = row.source_company_key?.startsWith("company/")
    ? row.source_company_key.slice("company/".length)
    : null;

  const severityTone =
    row.severity === "critical"
      ? "red"
      : row.severity === "warning"
        ? "amber"
        : "slate";

  const Inner = (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
        <Container className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display truncate text-[12.5px] font-semibold text-slate-900">
            {company}
          </span>
          {containerCount > 0 && (
            <LitPill tone={severityTone as any}>
              {containerCount.toLocaleString()} container{containerCount === 1 ? "" : "s"}
            </LitPill>
          )}
        </div>
        <div className="font-mono mt-0.5 truncate text-[10.5px] text-slate-500">
          {dest}
          {p.shipper_name && <> · from {p.shipper_name}</>}
          {p.bol_number && <> · BOL {p.bol_number}</>}
        </div>
      </div>
      {eta && (
        <div className="font-mono shrink-0 text-right text-[11px] text-slate-700">
          <div className="font-display font-bold text-blue-600">{eta.label}</div>
          <div className="text-[9.5px] text-slate-400">{eta.absolute}</div>
        </div>
      )}
      {companyId && <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />}
    </div>
  );

  if (companyId) {
    return (
      <li>
        <Link to={`/app/companies/${encodeURIComponent(companyId)}`}>{Inner}</Link>
      </li>
    );
  }
  return <li>{Inner}</li>;
}

function formatEta(iso: string): { label: string; absolute: string } {
  const t = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((t.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const label =
    days <= 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : days <= 6
          ? `${days} days`
          : t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const absolute = t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label, absolute };
}
