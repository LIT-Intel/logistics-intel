// DataFreshnessChip — operator-readable badge for the ImportYeti dataset
// freshness. Lives at the top of the Supply Chain tab header now.

import React from "react";
import { useDatabaseFreshness } from "@/api/intel";

export default function DataFreshnessChip() {
  const { data } = useDatabaseFreshness();
  if (!data || data.age_days == null) {
    return (
      <span
        className="font-display inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500"
        title="ImportYeti dataset freshness unavailable"
      >
        Data freshness: —
      </span>
    );
  }
  const tone =
    data.age_days <= 7
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : data.age_days <= 30
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <span
      className={`font-display inline-flex items-center rounded-full border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.06em] ${tone}`}
      title={`Source dataset last refreshed ${data.last_updated ?? "—"}`}
    >
      Data freshness: {data.age_days}d ago
    </span>
  );
}
