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

// Local extension to include estSpendUsd, which isn't in IyRouteKpis yet
type ExtendedRouteKpis = IyRouteKpis & {
  estSpendUsd?: number | null;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
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
    mostRecentShipment,
    topSuppliers,
  } = shipper;

  // ---------------- KPI + chart data ----------------

  const kpis = (routeKpis as ExtendedRouteKpis | null) ?? null;

  const shipments12m =
    (kpis?.shipmentsLast12m ?? null) ??
    (typeof totalShipments === "number" ? totalShipments : null);

  const teu12m = kpis?.teuLast12m ?? null;
  const topRoute = kpis?.topRouteLast12m ?? null;
  const mostRecentRoute = kpis?.mostRecentRoute ?? null;
  const sampleSize = kpis?.sampleSize ?? null;

  const routes =
    Array.isArray(kpis?.topRoutesLast12m) && kpis!.topRoutesLast12m.length > 0
      ? kpis!.topRoutesLast12m
      : [];

  const maxShipments =
    routes.length > 0
      ? Math.max(
          ...routes.map((r: any) =>
            typeof r.shipments === "number" ? r.shipments : 0,
          ),
        )
      : 0;

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const activeRoute =
    hoveredIndex != null && routes[hoveredIndex]
      ? (routes[hoveredIndex] as any)
      : null;

  const normalizedWebsite =
    website || (domain ? `https://${domain}` : undefined) || undefined;

  const companyInitial =
    typeof title === "string" && title.trim().length
      ? title.trim().charAt(0).toUpperCase()
      : "C";

  const estSpendUsd =
    typeof kpis?.estSpendUsd === "number" ? kpis.estSpendUsd : null;

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
            {/* KPI row */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Shipments 12m */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Shipments (12m)
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(shipments12m)}
                </p>
                {mostRecentShipment && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Last shipment: {formatDate(mostRecentShipment)}
                  </p>
                )}
              </div>

              {/* Total shipments */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Total shipments
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(totalShipments as number | null | undefined)}
                </p>
              </div>

              {/* TEU 12m */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  TEU (12m)
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatNumber(teu12m)}
                </p>
                {sampleSize != null && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Sample size: {formatNumber(sampleSize)}
                  </p>
                )}
              </div>

              {/* Est. spend */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Est. spend (12m)
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {estSpendUsd != null
                    ? `$${formatNumber(estSpendUsd)}`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Chart + tooltip */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Sea shipments by lane (last 12m)
                  </p>
                  <p className="text-xs text-slate-500">
                    Hover bars to inspect shipment volume per trade lane.
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

              {routes.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No route trend data available yet for this shipper.
                </p>
              ) : (
                <>
                  {/* Hover tooltip */}
                  {activeRoute && (
                    <div className="mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50">
                      <span className="font-semibold">
                        {activeRoute.route ?? "Route"}
                      </span>
                      <span className="text-slate-300">
                        • Shipments:{" "}
                        {formatNumber(
                          typeof activeRoute.shipments === "number"
                            ? activeRoute.shipments
                            : null,
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex h-44 items-end gap-2">
                    {routes.map((route: any, idx: number) => {
                      const shipments =
                        typeof route.shipments === "number"
                          ? route.shipments
                          : 0;
                      const heightPct =
                        maxShipments > 0
                          ? Math.max(6, (shipments / maxShipments) * 100)
                          : 0;

                      const isActive = hoveredIndex === idx;

                      return (
                        <button
                          key={route.route ?? idx}
                          type="button"
                          className="flex flex-1 flex-col items-center justify-end gap-1 focus:outline-none"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() =>
                            setHoveredIndex((current) =>
                              current === idx ? null : current,
                            )
                          }
                          onFocus={() => setHoveredIndex(idx)}
                          onBlur={() =>
                            setHoveredIndex((current) =>
                              current === idx ? null : current,
                            )
                          }
                        >
                          <div
                            className={`w-full rounded-t-md ${
                              isActive
                                ? "bg-indigo-600"
                                : "bg-indigo-500/80 hover:bg-indigo-600"
                            } transition-[height,background-color]`}
                            style={{ height: `${heightPct}%` }}
                          />
                          <div className="w-full text-center text-[10px] text-slate-500">
                            {shipments.toLocaleString()}
                          </div>
                          <div className="w-full truncate text-center text-[10px] text-slate-500">
                            {route.route ?? "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
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
                  {supplierList.slice(0, 6).map((s, idx) => (
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
                stats (lanes, Incoterms, vendor mix), they’ll show up here
                automatically without changing your workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
