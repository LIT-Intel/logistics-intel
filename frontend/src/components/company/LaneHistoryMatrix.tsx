import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Download, Filter, History, X } from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import {
  useCompanyLaneMonths,
  type CompanyLaneMonthRow,
} from "@/api/laneHistory";
import { resolveEndpoint } from "@/lib/laneGlobe";

/**
 * Lane history matrix (P1 — CEO-approved retention feature).
 *
 * Panjiva-style lanes × months table with exact counts, backed by the
 * `lit_company_lane_months` rollup that the P0-L deep-history worker
 * accretes for saved companies. Pivot happens client-side: rows = lane
 * (origin country/city → dest state/city), columns = last 12–24 months,
 * cells = shipment counts (TEU on hover).
 *
 * When a company has no rollup rows yet (most companies — deep ingestion
 * is saved-companies-only and gradual), renders a graceful state that
 * explains the accretion model and shows the existing 50-BOL-derived
 * lanes clearly labeled as a sample (honesty label, f8dbf067).
 */

/** Country-pair filter handed down from the trade-lanes globe hero. */
export type LaneHistoryFilter = {
  /** Canonical country key from lib/laneGlobe, e.g. "vietnam". */
  originKey: string | null;
  originLabel: string;
  destKey: string | null;
  destLabel: string;
};

type MatrixLane = {
  key: string;
  originCountry: string;
  originKey: string | null;
  originCode: string | null;
  originCity: string | null;
  destCountry: string;
  destKey: string | null;
  destCode: string | null;
  destState: string | null;
  destCity: string | null;
  totalShipments: number;
  totalTeu: number;
  lastMonth: string | null;
  cells: Record<string, { shipments: number; teu: number }>;
};

function normCountry(raw: string | null | undefined): {
  name: string;
  key: string | null;
  code: string | null;
} {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return { name: "Unknown", key: null, code: null };
  }
  const resolved = resolveEndpoint(trimmed);
  if (resolved) {
    return {
      name: resolved.countryName,
      key: resolved.canonicalKey,
      code: resolved.countryCode || null,
    };
  }
  return { name: trimmed, key: null, code: null };
}

function monthKey(dateStr: string): string {
  return String(dateStr).slice(0, 7); // YYYY-MM
}

function monthShortLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function monthLongLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Sequential list of YYYY-MM keys from `from` to `to` inclusive. */
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  if (!y || !m || !ey || !em) return out;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 30) break; // safety
  }
  return out;
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function LaneHistoryMatrix({
  companyId,
  companyName,
  sampleLanes = [],
  recentBolCount = 0,
  laneFilter = null,
  onClearLaneFilter,
}: {
  /** ImportYeti slug (lit_saved_companies.source_company_key). */
  companyId: string | null;
  companyName?: string | null;
  /** Snapshot-derived lanes shown as the labeled sample in the empty state. */
  sampleLanes?: any[];
  recentBolCount?: number;
  /** Country-pair filter selected on the globe hero (null = no filter). */
  laneFilter?: LaneHistoryFilter | null;
  onClearLaneFilter?: () => void;
}) {
  const { data: rows, isLoading } = useCompanyLaneMonths(companyId);

  // ── Filters ──────────────────────────────────────────────────────────
  const [originCountry, setOriginCountry] = useState<string>("");
  const [originCity, setOriginCity] = useState<string>("");
  const [destState, setDestState] = useState<string>("");
  const [destCity, setDestCity] = useState<string>("");
  const [minShipments, setMinShipments] = useState<number>(0);
  const [windowMonths, setWindowMonths] = useState<12 | 24>(12);

  // ── Pivot: rows → lanes × months ─────────────────────────────────────
  const { lanes, months, refreshedAt, maxCell, totalLaneMonths } = useMemo(() => {
    const laneMap = new Map<string, MatrixLane>();
    let minM: string | null = null;
    let maxM: string | null = null;
    let refreshed: string | null = null;
    let maxCellV = 0;
    for (const r of rows ?? []) {
      const o = normCountry(r.origin_country);
      const d = normCountry(r.dest_country);
      const mk = monthKey(r.month);
      if (!minM || mk < minM) minM = mk;
      if (!maxM || mk > maxM) maxM = mk;
      if (r.refreshed_at && (!refreshed || r.refreshed_at > refreshed)) {
        refreshed = r.refreshed_at;
      }
      const key = [
        o.key || o.name,
        r.origin_city || "",
        d.key || d.name,
        r.dest_state || "",
        r.dest_city || "",
      ].join("|");
      let lane = laneMap.get(key);
      if (!lane) {
        lane = {
          key,
          originCountry: o.name,
          originKey: o.key,
          originCode: o.code,
          originCity: r.origin_city,
          destCountry: d.name,
          destKey: d.key,
          destCode: d.code,
          destState: r.dest_state,
          destCity: r.dest_city,
          totalShipments: 0,
          totalTeu: 0,
          lastMonth: null,
          cells: {},
        };
        laneMap.set(key, lane);
      }
      const cell = lane.cells[mk] || { shipments: 0, teu: 0 };
      cell.shipments += r.shipments;
      cell.teu += Number(r.teu) || 0;
      lane.cells[mk] = cell;
      lane.totalShipments += r.shipments;
      lane.totalTeu += Number(r.teu) || 0;
      if (cell.shipments > maxCellV) maxCellV = cell.shipments;
      if (!lane.lastMonth || mk > lane.lastMonth) lane.lastMonth = mk;
    }
    const allMonths = minM && maxM ? monthRange(minM, maxM) : [];
    return {
      lanes: [...laneMap.values()].sort(
        (a, b) =>
          b.totalShipments - a.totalShipments || b.totalTeu - a.totalTeu,
      ),
      months: allMonths,
      refreshedAt: refreshed,
      maxCell: Math.max(1, maxCellV),
      totalLaneMonths: (rows ?? []).length,
    };
  }, [rows]);

  // Column window: trim to the most recent 12/24 months of the data span.
  const visibleMonths = useMemo(
    () => (months.length > windowMonths ? months.slice(-windowMonths) : months),
    [months, windowMonths],
  );

  // Globe → matrix wiring: an incoming country-pair filter pre-selects the
  // origin-country dropdown (matching on canonical key so "United States"
  // vs "United States of America" rollup variants both hit).
  useEffect(() => {
    if (!laneFilter) return;
    if (laneFilter.originKey) {
      const match = lanes.find((l) => l.originKey === laneFilter.originKey);
      setOriginCountry(match ? match.originCountry : laneFilter.originLabel);
    }
    setOriginCity("");
  }, [laneFilter, lanes]);

  const distinct = useMemo(() => {
    const oc = new Set<string>();
    const ocity = new Set<string>();
    const ds = new Set<string>();
    const dcity = new Set<string>();
    for (const l of lanes) {
      oc.add(l.originCountry);
      if (!originCountry || l.originCountry === originCountry) {
        if (l.originCity) ocity.add(l.originCity);
      }
      if (l.destState) ds.add(l.destState);
      if (!destState || l.destState === destState) {
        if (l.destCity) dcity.add(l.destCity);
      }
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return {
      originCountries: sort(oc),
      originCities: sort(ocity),
      destStates: sort(ds),
      destCities: sort(dcity),
    };
  }, [lanes, originCountry, destState]);

  const filteredLanes = useMemo(
    () =>
      lanes.filter((l) => {
        if (originCountry && l.originCountry !== originCountry) return false;
        if (originCity && l.originCity !== originCity) return false;
        if (destState && l.destState !== destState) return false;
        if (destCity && l.destCity !== destCity) return false;
        if (minShipments > 0 && l.totalShipments < minShipments) return false;
        if (laneFilter?.destKey && l.destKey && l.destKey !== laneFilter.destKey)
          return false;
        return true;
      }),
    [lanes, originCountry, originCity, destState, destCity, minShipments, laneFilter],
  );

  const hasActiveFilters =
    Boolean(originCountry || originCity || destState || destCity) ||
    minShipments > 0 ||
    Boolean(laneFilter);

  const clearFilters = () => {
    setOriginCountry("");
    setOriginCity("");
    setDestState("");
    setDestCity("");
    setMinShipments(0);
    onClearLaneFilter?.();
  };

  const exportCsv = () => {
    const header = [
      "Origin country",
      "Origin city",
      "Dest country",
      "Dest state",
      "Dest city",
      "Total shipments",
      "Total TEU",
      ...visibleMonths.map((m) => monthLongLabel(m)),
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const l of filteredLanes) {
      lines.push(
        [
          l.originCountry,
          l.originCity ?? "",
          l.destCountry,
          l.destState ?? "",
          l.destCity ?? "",
          l.totalShipments,
          Math.round(l.totalTeu * 100) / 100,
          ...visibleMonths.map((m) => l.cells[m]?.shipments ?? 0),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lane-history-${companyId || "company"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LitSectionCard title="Lane history" sub="Monthly shipment counts per lane">
        <div className="animate-pulse space-y-2 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded bg-slate-100" />
          ))}
        </div>
      </LitSectionCard>
    );
  }

  // ── Empty state — no rollup rows yet (most companies) ────────────────
  if (lanes.length === 0) {
    const sample = (sampleLanes || []).slice(0, 10);
    return (
      <LitSectionCard
        title="Lane history"
        sub="Monthly shipment counts per lane"
        padded={false}
      >
        <div className="px-4 py-6 text-center sm:px-6">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <History className="h-5 w-5 text-blue-500" />
          </div>
          <p className="font-display m-0 text-[14px] font-semibold text-slate-900">
            Deep lane history builds automatically for saved companies
          </p>
          <p className="font-body mx-auto mt-1 max-w-[520px] text-[12px] leading-relaxed text-slate-500">
            {companyName ? `Once ${companyName} is saved, ` : "Once this company is saved, "}
            LIT pages through its full BOL archive in the background and a
            month-by-month lane matrix accretes here — exact shipment counts
            and TEU per origin → destination lane.
          </p>
        </div>
        {sample.length > 0 && (
          <div className="border-t border-slate-100">
            <div className="flex items-center justify-between px-4 py-2 sm:px-6">
              <span className="font-display text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Sample lanes
              </span>
              <span className="font-body text-[10.5px] text-slate-400">
                Derived from the {recentBolCount.toLocaleString()} most recent
                shipments — not the full history
              </span>
            </div>
            {sample.map((lane: any, i: number) => (
              <div
                key={lane.displayLabel || i}
                className="flex items-center gap-2.5 border-t border-slate-50 px-4 py-2 sm:px-6"
              >
                <span className="font-mono w-5 shrink-0 text-center text-[9px] font-bold text-slate-400">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <LitFlag
                  code={lane.fromMeta?.countryCode}
                  size={13}
                  label={lane.fromMeta?.countryName}
                />
                <span className="font-mono min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">
                  {String(lane.displayLabel || "").replace(/→/g, "→")}
                </span>
                <span className="font-mono shrink-0 text-[10px] text-slate-500">
                  {(Number(lane.shipments) || 0).toLocaleString()} ship
                </span>
                {Number(lane.teu) > 0 && (
                  <span className="font-mono hidden shrink-0 text-[10px] text-slate-400 sm:inline">
                    {Math.round(Number(lane.teu)).toLocaleString()} TEU
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </LitSectionCard>
    );
  }

  // ── Matrix ───────────────────────────────────────────────────────────
  const refreshedRel = relativeTime(refreshedAt);
  return (
    <LitSectionCard
      title="Lane history"
      sub={`${lanes.length.toLocaleString()} lanes × ${visibleMonths.length} months · exact monthly counts`}
      action={
        <div className="flex items-center gap-2">
          {refreshedRel && (
            <span
              className="font-display inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
              title={`Rollup last rebuilt ${new Date(refreshedAt as string).toLocaleString()}`}
            >
              <Clock3 className="h-2.5 w-2.5" />
              Updated {refreshedRel}
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      }
      padded={false}
    >
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 sm:px-4">
        <Filter className="h-3 w-3 text-slate-400" aria-hidden />
        <select
          value={originCountry}
          onChange={(e) => {
            setOriginCountry(e.target.value);
            setOriginCity("");
          }}
          className="font-display rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-700 focus:outline-none"
        >
          <option value="">Origin country</option>
          {distinct.originCountries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={originCity}
          onChange={(e) => setOriginCity(e.target.value)}
          className="font-display rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-700 focus:outline-none"
        >
          <option value="">Origin city</option>
          {distinct.originCities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={destState}
          onChange={(e) => {
            setDestState(e.target.value);
            setDestCity("");
          }}
          className="font-display rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-700 focus:outline-none"
        >
          <option value="">Dest state</option>
          {distinct.destStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={destCity}
          onChange={(e) => setDestCity(e.target.value)}
          className="font-display rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-700 focus:outline-none"
        >
          <option value="">Dest city</option>
          {distinct.destCities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="font-display inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
          Min
          <input
            type="number"
            min={0}
            value={minShipments || ""}
            placeholder="0"
            onChange={(e) =>
              setMinShipments(Math.max(0, Number(e.target.value) || 0))
            }
            className="font-mono w-14 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 focus:outline-none"
          />
        </label>
        {months.length > 12 && (
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
            {([12, 24] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowMonths(w)}
                className={[
                  "font-display px-2 py-1 text-[10.5px] font-semibold",
                  windowMonths === w
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                {w}m
              </button>
            ))}
          </div>
        )}
        {laneFilter && (
          <span className="font-display inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">
            {laneFilter.originLabel} → {laneFilter.destLabel}
            <button
              type="button"
              aria-label="Clear lane filter"
              onClick={clearFilters}
              className="text-blue-400 hover:text-blue-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        {hasActiveFilters && !laneFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="font-display text-[10.5px] font-semibold text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
        <span className="font-mono ml-auto text-[10px] text-slate-400">
          {filteredLanes.length.toLocaleString()} of {lanes.length.toLocaleString()} lanes
        </span>
      </div>

      {/* Matrix table */}
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[3]">
            <tr className="bg-[#FAFBFC]">
              <th className="font-display sticky left-0 z-[2] border-b border-slate-100 bg-[#FAFBFC] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:px-4">
                Lane
              </th>
              <th className="font-display border-b border-slate-100 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Total
              </th>
              {visibleMonths.map((m) => (
                <th
                  key={m}
                  className="font-mono whitespace-nowrap border-b border-slate-100 px-1.5 py-2 text-center text-[9.5px] font-semibold text-slate-400"
                >
                  {monthShortLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLanes.map((l) => (
              <tr key={l.key} className="group hover:bg-blue-50/40">
                <td className="sticky left-0 z-[1] max-w-[260px] border-b border-slate-50 bg-white px-3 py-1.5 group-hover:bg-blue-50/40 sm:px-4">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <LitFlag code={l.originCode} size={12} label={l.originCountry} />
                    <span className="font-mono truncate text-[11px] font-semibold text-slate-700">
                      {l.originCity ? `${l.originCity}, ` : ""}
                      {l.originCode || l.originCountry}
                    </span>
                    <ArrowRight className="h-2 w-2 shrink-0 text-slate-300" aria-hidden />
                    <span className="font-mono truncate text-[11px] font-semibold text-slate-700">
                      {l.destCity ? `${l.destCity}` : l.destCountry}
                      {l.destState ? `, ${l.destState}` : ""}
                    </span>
                  </div>
                </td>
                <td
                  className="font-mono border-b border-slate-50 px-2 py-1.5 text-right text-[11px] font-bold text-slate-900"
                  title={`${l.totalShipments.toLocaleString()} shipments · ${Math.round(l.totalTeu * 10) / 10} TEU across the visible window`}
                >
                  {l.totalShipments.toLocaleString()}
                </td>
                {visibleMonths.map((m) => {
                  const cell = l.cells[m];
                  if (!cell) {
                    return (
                      <td
                        key={m}
                        className="border-b border-slate-50 px-1.5 py-1.5 text-center"
                      >
                        <span className="font-mono text-[10px] text-slate-200">·</span>
                      </td>
                    );
                  }
                  const intensity = Math.min(1, cell.shipments / maxCell);
                  return (
                    <td
                      key={m}
                      className="border-b border-slate-50 px-1.5 py-1.5 text-center"
                      title={`${monthLongLabel(m)} · ${cell.shipments.toLocaleString()} shipment${cell.shipments === 1 ? "" : "s"} · ${Math.round(cell.teu * 10) / 10} TEU`}
                    >
                      <span
                        className="font-mono inline-block min-w-[24px] rounded px-1 py-0.5 text-[10.5px] font-bold"
                        style={{
                          background: `rgba(59,130,246,${0.08 + 0.5 * intensity})`,
                          color: intensity > 0.55 ? "#FFFFFF" : "#1D4ED8",
                        }}
                      >
                        {cell.shipments.toLocaleString()}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredLanes.length === 0 && (
              <tr>
                <td
                  colSpan={2 + visibleMonths.length}
                  className="font-body px-4 py-8 text-center text-[12px] text-slate-400"
                >
                  No lanes match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Coverage footnote — history accretes gradually via the 30-min cron */}
      <div className="border-t border-slate-100 px-3 py-2 sm:px-4">
        <p className="font-body m-0 text-[10.5px] leading-snug text-slate-400">
          Exact counts from {totalLaneMonths.toLocaleString()} lane-month records
          ingested from this company's BOL archive. Coverage deepens
          automatically as background ingestion pages further back in time.
        </p>
      </div>
    </LitSectionCard>
  );
}
