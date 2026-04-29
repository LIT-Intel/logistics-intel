import React from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal, ArrowRight } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import LitFlag from "@/components/ui/LitFlag";
import { resolveEndpoint } from "@/lib/laneGlobe";
import { capFutureDate } from "@/lib/dateUtils";

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
  const hasRows = Array.isArray(rows) && rows.length > 0;
  return (
    <LitSectionCard
      title="What Matters Now"
      sub="Saved accounts ranked by recent shipment activity"
      action={
        <div className="flex gap-1.5">
          <button
            type="button"
            className="font-display inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-white"
          >
            <SlidersHorizontal className="h-2.5 w-2.5" />
            Filter
          </button>
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
            rows.map((row, idx) => {
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
  // Resolve "Origin → Destination" using the existing canonicalizer.
  const arrowSplit = lane.split("→");
  const fromRaw = arrowSplit[0]?.trim();
  const toRaw = arrowSplit.slice(1).join("→").trim();
  if (!fromRaw || !toRaw) {
    return (
      <span className="font-body whitespace-nowrap text-[11px] text-slate-500">
        {lane}
      </span>
    );
  }
  const from = resolveEndpoint(fromRaw);
  const to = resolveEndpoint(toRaw);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <LitFlag code={from?.countryCode} size={12} label={from?.countryName || fromRaw} />
      <span className="font-mono text-[11px] font-semibold text-slate-700">
        {from?.countryName || fromRaw}
      </span>
      <ArrowRight aria-hidden className="h-2 w-2 text-slate-300" />
      <LitFlag code={to?.countryCode} size={12} label={to?.countryName || toRaw} />
      <span className="font-mono text-[11px] font-semibold text-slate-700">
        {to?.countryName || toRaw}
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