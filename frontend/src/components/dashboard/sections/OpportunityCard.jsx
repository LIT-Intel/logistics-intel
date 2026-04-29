import React from "react";
import { Zap } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";

/**
 * Phase 2 — Dashboard "High-Opportunity Companies" card.
 *
 * The design surfaces saved accounts that match a "signal" condition
 * (activity spike / new lane / rapid growth / carrier switch). The
 * underlying signal model isn't live yet — Phase B.18 documented this gap.
 * Until the signal aggregator lands, the card renders an honest empty
 * state explaining why no rows appear. We intentionally do NOT fabricate
 * "high-opportunity" rows from arbitrary saved-account heuristics.
 *
 * When `rows` is populated by a real signal source, the table layout
 * below renders without further changes.
 */
export default function OpportunityCard({ rows }) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  return (
    <LitSectionCard
      title="High-Opportunity Companies"
      sub="High volume · Recent activity spike · Not yet engaged"
      action={
        <span className="font-display whitespace-nowrap text-[11px] font-semibold text-slate-300">
          {hasRows ? `${rows.length} signal${rows.length === 1 ? "" : "s"}` : "—"}
        </span>
      }
      padded={false}
    >
      {!hasRows ? (
        <div className="px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
            <Zap className="h-4 w-4 text-purple-700" />
          </div>
          <p className="font-display mb-1 text-[13px] font-semibold text-slate-700">
            No opportunity signals yet
          </p>
          <p className="font-body mx-auto max-w-md text-[12px] text-slate-400">
            Signal detection runs on a scheduled refresh. As your saved accounts
            accumulate shipment activity, opportunities will surface here.
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFBFC]">
              {["Company", "Shipments", "TEU", "Spend", "Signal", "Action"].map(
                (h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="font-display whitespace-nowrap border-b border-slate-100 px-3.5 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.company_id || `${row.company}-${i}`}
                className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
              >
                <td className="font-display px-3.5 py-2.5 text-[13px] font-semibold text-slate-900">
                  {row.company || "—"}
                </td>
                <td className="font-mono px-3.5 py-2.5 text-[13px] font-semibold text-slate-900">
                  {row.shipments ?? "—"}
                </td>
                <td className="font-mono px-3.5 py-2.5 text-[12px] text-slate-700">
                  {row.teu ?? "—"}
                </td>
                <td className="font-mono px-3.5 py-2.5 text-[12px] text-slate-700">
                  {row.spend ?? "—"}
                </td>
                <td className="px-3.5 py-2.5">
                  <span className="font-display inline-flex items-center gap-1 whitespace-nowrap rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                    <Zap className="h-2 w-2" />
                    {row.signal || "Signal"}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  <button
                    type="button"
                    className="font-display inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                  >
                    + Campaign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LitSectionCard>
  );
}