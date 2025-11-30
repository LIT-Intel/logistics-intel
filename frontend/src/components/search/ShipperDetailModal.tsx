import React from "react";
import type { IyShipperHit, IyRouteKpis } from "@/lib/api";

type ShipperDetailModalProps = {
  isOpen: boolean;
  shipper: IyShipperHit | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaveToCommandCenter: (shipper: IyShipperHit) => void;
  saveLoading: boolean;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function ShipperDetailModal(props: ShipperDetailModalProps) {
  const {
    isOpen,
    shipper,
    routeKpis,
    loading,
    error,
    onClose,
    onSaveToCommandCenter,
    saveLoading,
  } = props;

  if (!isOpen || !shipper) return null;

  const {
    title,
    countryCode,
    address,
    website,
    phone,
    domain,
    totalShipments,
    topSuppliers,
  } = shipper;

  const mostRecentShipmentRaw =
    (shipper as any)?.mostRecentShipment ??
    (shipper as any)?.lastShipment ??
    null;

  // ---------------- KPI + chart data ----------------

  const kpis = routeKpis ?? null;
  const kpisAny = (kpis as any) ?? null;

  const shipments12m =
    coerceNumber(kpis?.shipmentsLast12m) ??
    (typeof totalShipments === "number" ? totalShipments : null);

  const teu12m = coerceNumber(kpis?.teuLast12m);

  const estSpend12m = coerceNumber(kpisAny?.estSpendUsd);

  const fclShipments = coerceNumber(kpisAny?.fclShipmentsLast12m);
  const lclShipments = coerceNumber(kpisAny?.lclShipmentsLast12m);

  const lastShipmentDate =
    (kpisAny?.lastShipmentDate as string | null | undefined) ??
    (mostRecentShipmentRaw as string | null | undefined);

  const topRoute = (kpisAny?.topRouteLast12m as string | null | undefined) ?? null;
  const mostRecentRoute =
    (kpisAny?.mostRecentRoute as string | null | undefined) ?? null;

  const timeSeries =
    Array.isArray(kpisAny?.timeSeries) && kpisAny.timeSeries.length > 0
      ? (kpisAny.timeSeries as any[])
      : [];

  const routes =
    Array.isArray(kpisAny?.topRoutesLast12m) &&
    kpisAny.topRoutesLast12m.length > 0
      ? (kpisAny.topRoutesLast12m as any[])
      : [];

  const maxShipmentsForChart =
    timeSeries.length > 0
      ? Math.max(
          ...timeSeries.map((row: any) => {
            const fcl = coerceNumber(row.fclShipments) ?? 0;
            const lcl = coerceNumber(row.lclShipments) ?? 0;
            return fcl + lcl;
          }),
        )
      : 0;

  const [hoveredMonth, setHoveredMonth] = React.useState<number | null>(null);

  const normalizedWebsite =
    website || (domain ? `https://${domain}` : undefined) || undefined;

  const companyInitial =
    typeof title === "string" && title.trim().length
      ? title.trim().charAt(0).toUpperCase()
      : "C";

  const supplierList =
    Array.isArray(topSuppliers) && topSuppliers.length > 0
      ? topSuppliers
      : [];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter(shipper);
  };

  // ---------------- Render ----------------

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          <span className="sr-only">Close</span>
          ×
        </button>

        {/* Header */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white">
                {companyInitial}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {title || "Company"}
                  </h2>
                  {countryCode && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-700">
                      {countryCode}
                    </span>
                  )}
                </div>
                {address && (
                  <p className="text-xs text-slate-500">{address}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  {normalizedWebsite && (
                    <a
                      href={normalizedWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-indigo-600 hover:underline"
                    >
                      {normalizedWebsite.replace(/^https?:\/\//i, "")}
                    </a>
                  )}
                  {phone && <span>• {phone}</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={saveLoading}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveLoading ? "Saving…" : "Save to Command Center"}
              </button>
              {normalizedWebsite && (
                <a
                  href={normalizedWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View company site
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-6 px-6 py-5 md:grid-cols-3 md:px-8 md:py-6">
          {/* Left: KPIs + chart */}
          <div className="space-y-4 md:col-span-2">
            {/* KPI row – 6 cards, 2 per row on mobile */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {/* Shipments 12m */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px]">
                    📦
                  </span>
                  Shipments (12m)
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(shipments12m)}
                </p>
              </div>

              {/* Estimated TEU 12m */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px]">
                    🧱
                  </span>
                  Estimated TEU (12m)
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(teu12m)}
                </p>
              </div>

              {/* Est. spend 12m */}
              <div className="rounded-xl border border-slate-200 bg-emerald-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px]">
                    💵
                  </span>
                  Est. spend (12m)
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-900">
                  {formatMoney(estSpend12m)}
                </p>
              </div>

              {/* FCL shipments */}
              <div className="rounded-xl border border-slate-200 bg-indigo-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[10px]">
                    🚢
                  </span>
                  FCL shipments
                </p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">
                  {formatNumber(fclShipments)}
                </p>
              </div>

              {/* LCL shipments */}
              <div className="rounded-xl border border-slate-200 bg-emerald-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px]">
                    📦
                  </span>
                  LCL shipments
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-900">
                  {formatNumber(lclShipments)}
                </p>
              </div>

              {/* Last shipment */}
              <div className="rounded-xl border border-slate-200 bg-amber-50 px-4 py-3">
                <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px]">
                    ⏱
                  </span>
                  Last shipment
                </p>
                <p className="mt-1 text-xs font-medium text-amber-900">
                  {formatDate(lastShipmentDate)}
                </p>
              </div>
            </div>

            {/* Top route + most recent route */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Top route (last 12m)
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {topRoute ?? "Not available yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Most recent route
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {mostRecentRoute ?? "Not available yet"}
                </p>
              </div>
            </div>

            {/* Chart + lanes summary */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Activity last 12 months
                    </p>
                    <p className="text-xs text-slate-500">
                      Monthly shipments split between FCL and LCL services.
                    </p>
                  </div>
                  {loading && (
                    <p className="text-xs text-slate-400">Loading trend…</p>
                  )}
                </div>

                {error && (
                  <p className="mb-2 text-xs text-rose-500">
                    {error || "Failed to load route KPIs."}
                  </p>
                )}

                {timeSeries.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No lane-level trend data available yet for this shipper.
                  </p>
                ) : (
                  <>
                    {/* Legend */}
                    <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-6 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                        <span>FCL</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-6 rounded-full bg-emerald-400" />
                        <span>LCL</span>
                      </div>
                    </div>

                    {/* Hover label */}
                    {hoveredMonth != null && timeSeries[hoveredMonth] && (
                      <div className="mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50">
                        <span className="font-semibold">
                          {timeSeries[hoveredMonth].label ??
                            timeSeries[hoveredMonth].month ??
                            "Month"}
                        </span>
                        <span className="text-slate-300">
                          • FCL:{" "}
                          {formatNumber(
                            coerceNumber(
                              timeSeries[hoveredMonth].fclShipments,
                            ),
                          )}
                        </span>
                        <span className="text-slate-300">
                          • LCL:{" "}
                          {formatNumber(
                            coerceNumber(
                              timeSeries[hoveredMonth].lclShipments,
                            ),
                          )}
                        </span>
                      </div>
                    )}

                    {/* Bar chart */}
                    <div className="flex h-52 items-end gap-2">
                      {timeSeries.map((row: any, idx: number) => {
                        const fcl = coerceNumber(row.fclShipments) ?? 0;
                        const lcl = coerceNumber(row.lclShipments) ?? 0;
                        const total = fcl + lcl;
                        const heightPct =
                          maxShipmentsForChart > 0
                            ? Math.max(6, (total / maxShipmentsForChart) * 100)
                            : 0;

                        const isActive = hoveredMonth === idx;

                        return (
                          <button
                            key={row.label ?? row.month ?? idx}
                            type="button"
                            className="flex flex-1 flex-col items-center justify-end gap-1 focus:outline-none"
                            onMouseEnter={() => setHoveredMonth(idx)}
                            onMouseLeave={() =>
                              setHoveredMonth((current) =>
                                current === idx ? null : current,
                              )
                            }
                            onFocus={() => setHoveredMonth(idx)}
                            onBlur={() =>
                              setHoveredMonth((current) =>
                                current === idx ? null : current,
                              )
                            }
                          >
                            <div className="flex w-full items-end justify-center gap-1">
                              {/* FCL bar */}
                              <div
                                className={`flex-1 rounded-t-sm bg-gradient-to-b from-indigo-500 to-violet-500 transition-[height,transform] ${
                                  isActive ? "scale-[1.03]" : ""
                                }`}
                                style={{
                                  height: `${heightPct * (fcl / (total || 1))}%`,
                                }}
                              />

                              {/* LCL bar */}
                              <div
                                className={`flex-1 rounded-t-sm bg-emerald-400/90 transition-[height,transform] ${
                                  isActive ? "scale-[1.03]" : ""
                                }`}
                                style={{
                                  height: `${heightPct * (lcl / (total || 1))}%`,
                                }}
                              />
                            </div>

                            <div className="w-full truncate text-center text-[10px] text-slate-500">
                              {row.label ?? row.month ?? "—"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Top lanes summary */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top lanes (last 12m)
                </p>
                {routes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Lane-level shipment data is not available for this company
                    yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {routes.slice(0, 5).map((lane: any, idx: number) => (
                      <li
                        key={`${lane.route ?? idx}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {lane.route ?? "Lane"}
                        </span>
                        <span className="text-slate-500">
                          {formatNumber(
                            coerceNumber(lane.shipments) ??
                              coerceNumber(lane.teu),
                          )}{" "}
                          shipments
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Right: suppliers / metadata */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Top suppliers (sample)
              </p>
              {supplierList.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Supplier details will appear here once available from
                  ImportYeti.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  {supplierList.slice(0, 8).map((s, idx) => (
                    <li key={`${s}-${idx}`} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      <span className="truncate">{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-xs text-slate-500">
              <p className="font-medium text-slate-700">What you’re seeing</p>
              <p className="mt-1">
                Cards and KPIs are based on ImportYeti DMA data. As we add more
                stats (lanes, vendor mix, service levels), they’ll show up here
                automatically without changing your workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
