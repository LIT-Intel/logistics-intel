import * as React from "react";
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

const ShipperDetailModal: React.FC<ShipperDetailModalProps> = ({
  isOpen,
  shipper,
  routeKpis,
  loading,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading,
}) => {
  if (!isOpen || !shipper) return null;

  const { title, countryCode, address, totalShipments, mostRecentShipment, topSuppliers } = shipper;

  const shipments12m =
    routeKpis?.shipmentsLast12m ?? (typeof totalShipments === "number" ? totalShipments : null);
  const teu12m = typeof routeKpis?.teuLast12m === "number" ? routeKpis.teuLast12m : null;
  const estSpendUsd = typeof routeKpis?.estSpendUsd === "number" ? routeKpis.estSpendUsd : null;
  const topRoute = routeKpis?.topRouteLast12m ?? null;
  const mostRecentRoute = routeKpis?.mostRecentRoute ?? null;

  const suppliers = Array.isArray(topSuppliers) ? topSuppliers : [];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter(shipper);
  };

  const formatNumber = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    try {
      return value.toLocaleString();
    } catch {
      return String(value);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    try {
      return value.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
    } catch {
      return `$${value}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
                {title?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <div className="mt-0.5 text-xs text-gray-500">{address || "Address not available"}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {countryCode ? `Country: ${countryCode}` : "Country unknown"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saveLoading}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveLoading ? "Saving…" : "Save to Command Center"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {(loading || error) && (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
              {loading && <div className="text-gray-600">Loading shipment insights…</div>}
              {error && !loading && (
                <div className="text-red-600">
                  Unable to load route KPIs right now. <span className="text-xs text-gray-500">Details: {error}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Shipments (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(shipments12m)}</div>
              <div className="mt-1 text-xs text-gray-500">Using ImportYeti totals when available</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated TEU (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(teu12m)}</div>
              <div className="mt-1 text-xs text-gray-500">This will be refined once route KPIs are wired</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Est. Spend (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(estSpendUsd)}</div>
              <div className="mt-1 text-xs text-gray-500">Placeholder until full spend model is enabled</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Top route (last 12m)</div>
              <div className="mt-1 text-sm text-gray-900">{topRoute || "Route data coming soon"}</div>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Most recent route</div>
              <div className="mt-1 text-sm text-gray-900">{mostRecentRoute || "Most recent route not yet mapped"}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Last shipment</div>
              <div className="mt-1 text-sm text-gray-900">{mostRecentShipment || "No recent shipment date available"}</div>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Top suppliers (sample)</div>
              {suppliers.length === 0 ? (
                <div className="mt-1 text-sm text-gray-900">Supplier list not available yet.</div>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-gray-900">
                  {suppliers.slice(0, 5).map((s) => (
                    <li key={s} className="truncate">
                      • {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
            Route chart will render here once ImportYeti BOL-based KPIs are wired.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShipperDetailModal;
