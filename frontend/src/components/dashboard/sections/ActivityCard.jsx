import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, SlidersHorizontal } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import LitFlag from "@/components/ui/LitFlag";
import { formatLaneShort, resolveEndpoint } from "@/lib/laneGlobe";
import { capFutureDate } from "@/lib/dateUtils";

const SORT_OPTIONS = [
  { id: "recent", label: "Most recent activity" },
  { id: "shipments", label: "Most shipments (12m)" },
  { id: "teu", label: "Most TEU (12m)" },
  { id: "name", label: "Alphabetical" },
];

/**
 * Phase 2 — Dashboard "What Matters Now" full-width table.
 *
 * Real saved companies, sorted upstream by `kpis.last_activity`. Renders
 * `"—"` for missing fields (lane / shipments / last shipment date) instead
 * of fabricating values. Empty state when the user has no saved accounts.
 *
 * Note: change-pill column is omitted because deltas require the scheduled
 * activity_30d_current/previous refresh job (Phase B.18) which has not
 * landed yet. Surfacing fake "+12%" values would violate the no-fake-data
 * rule, and a "Pending refresh" placeholder column would clutter the row.
 */
export default function ActivityCard({ rows, loading }) {
  const [sort, setSort] = useState("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // Apply the active sort. The dashboard passes us last_activity-sorted
  // rows; we either pass through or re-sort by shipments/TEU/name.
  const sortedRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    const copy = [...rows];
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -1;
    };
    if (sort === "shipments") {
      copy.sort(
        (a, b) =>
          num(b?.company?.kpis?.shipments_12m) - num(a?.company?.kpis?.shipments_12m),
      );
    } else if (sort === "teu") {
      copy.sort(
        (a, b) =>
          num(b?.company?.kpis?.teu_12m) - num(a?.company?.kpis?.teu_12m),
      );
    } else if (sort === "name") {
      copy.sort((a, b) =>
        String(a?.company?.name || "").localeCompare(
          String(b?.company?.name || ""),
        ),
      );
    }
    // "recent" → upstream order (already by last_activity)
    return copy;
  }, [rows, sort]);

  const hasRows = sortedRows.length > 0;
  const activeLabel =
    SORT_OPTIONS.find((o) => o.id === sort)?.label || "Most recent activity";

  return (
    <LitSectionCard
      title="What Matters Now"
      sub="Saved accounts ranked by recent shipment activity"
      action={
        <div className="flex items-center gap-1.5">
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={[
                "font-display inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                filterOpen
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white",
              ].join(" ")}
              aria-haspopup="menu"
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal className="h-2.5 w-2.5" />
              Sort: {activeLabel}
            </button>
            {filterOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-[200px] overflow-hidden rounded-md border border-slate-200 bg-white text-[11.5px] shadow-lg"
              >
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sort === o.id}
                    onClick={() => {
                      setSort(o.id);
                      setFilterOpen(false);
                    }}
                    className={[
                      "font-body flex w-full items-center justify-between gap-2 px-3 py-2 text-left",
                      sort === o.id
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span>{o.label}</span>
                    {sort === o.id ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            to="/app/command-center"
            className="font-display whitespace-nowrap text-[11px] font-semibold text-blue-500 hover:text-blue-700"
          >
            View all →
          </Link>
        </div>
      }
      padded={false}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFBFC]">
            {[
              "Company",
              "Shipments 12m",
              "Last activity",
              "Top lane",
              "TEU",
              "",
            ].map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="font-display whitespace-nowrap border-b border-slate-100 px-3.5 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasRows ? (
            <tr>
              <td colSpan={6} className="px-3.5 py-12 text-center">
                <p className="font-body text-[12px] text-slate-400">
                  {loading
                    ? "Loading saved accounts…"
                    : "No saved accounts yet — add companies in the Command Center to see what matters now."}
                </p>
              </td>
            </tr>
          ) : (
            sortedRows.map((row, idx) => {
              const company = row?.company || {};
              const kpis = company.kpis || {};
              const companyId =
                company.company_id ||
                company.companyId ||
                company.source_company_key ||
                row.company_id ||
                row.companyKey ||
                row.company_key;
              const name = company.name || row?.company_name || "Unknown company";
              const domain = company.domain || row?.domain || null;
              const shipments = Number(kpis.shipments_12m);
              const teu = Number(kpis.teu_12m);
              const lane = kpis.top_route_12m;
              const lastActivity = capFutureDate(kpis.last_activity);

              return (
                <tr
                  key={companyId || `${name}-${idx}`}
                  className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
                >
                  <td className="px-3.5 py-2.5">
                    <Link
                      to={companyId ? `/app/companies/${encodeURIComponent(companyId)}` : "#"}
                      className="flex min-w-0 items-center gap-2.5"
                    >
                      <CompanyAvatar name={name} domain={domain} size="sm" />
                      <div className="min-w-0">
                        <div className="font-display truncate text-[13px] font-semibold text-slate-900">
                          {name}
                        </div>
                        {domain && (
                          <div className="font-mono truncate text-[10px] text-slate-400">
                            {domain}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="font-mono text-[13px] font-semibold text-slate-900">
                      {Number.isFinite(shipments) && shipments > 0
                        ? shipments.toLocaleString()
                        : "—"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="font-body whitespace-nowrap text-[12px] text-slate-500">
                      {formatRelative(lastActivity)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <LaneCell lane={lane} />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="font-mono text-[12px] text-slate-700">
                      {Number.isFinite(teu) && teu > 0
                        ? Math.round(teu).toLocaleString()
                        : "—"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {companyId && (
                      <Link
                        to={`/app/companies/${encodeURIComponent(companyId)}`}
                        className="font-display inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-blue-500 hover:text-blue-700"
                      >
                        Open
                        <ArrowRight className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </LitSectionCard>
  );
}

function LaneCell({ lane }) {
  if (!lane || typeof lane !== "string") {
    return <span className="font-body text-[11px] text-slate-300">—</span>;
  }
  const short = formatLaneShort(lane);
  if (!short) {
    return (
      <span className="font-body whitespace-nowrap text-[11px] text-slate-500">
        {lane}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      title={lane}
    >
      {short.fromCountryCode && (
        <LitFlag
          code={short.fromCountryCode}
          size={12}
          label={short.fromCountryName || short.fromLabel}
        />
      )}
      <span className="font-mono text-[11px] font-semibold text-slate-700">
        {short.fromLabel}
      </span>
      <ArrowRight aria-hidden className="h-2 w-2 text-slate-300" />
      {short.toCountryCode && (
        <LitFlag
          code={short.toCountryCode}
          size={12}
          label={short.toCountryName || short.toLabel}
        />
      )}
      <span className="font-mono text-[11px] font-semibold text-slate-700">
        {short.toLabel}
      </span>
    </span>
  );
}

function formatRelative(value) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (delta < day) return "Today";
  const days = Math.round(delta / day);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}