// frontend/src/components/search/ShipperCard.tsx

import { CompanyAvatar } from "@/components/CompanyAvatar";
import type { IyShipperHit } from "@/lib/api";
import { Calendar, MapPin, Package, Target } from "lucide-react";

type ShipperCardProps = {
  shipper: IyShipperHit;
  topRoute?: string | null;
  teus12m?: number | null;
  shipments12m?: number | null;
  onViewDetails?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
};

<<<<<<< HEAD
export default function ShipperCard({ shipper, onViewDetails, onSave }: ShipperCardProps) {
  const shipmentsLabel =
    typeof shipper.totalShipments === "number" ? shipper.totalShipments.toLocaleString() : "—";
=======
export default function ShipperCard({
  shipper,
  topRoute,
  teus12m,
  shipments12m,
  onViewDetails,
  onSave,
  isSaving,
  isSaved,
}: ShipperCardProps) {
  const suppliers = Array.isArray(shipper.topSuppliers) ? shipper.topSuppliers.slice(0, 4) : [];
>>>>>>> 8dccf1fc (feat: LIT Search cards + ImportYeti modal)

  const totalShipmentsLabel =
    typeof shipments12m === "number"
      ? shipments12m.toLocaleString()
      : typeof shipper.totalShipments === "number"
        ? shipper.totalShipments.toLocaleString()
        : "—";

  const lastShipmentLabel = shipper.mostRecentShipment || "—";
  const topRouteLabel = topRoute || "Top route data coming…";
  const teusLabel =
    typeof teus12m === "number" ? teus12m.toLocaleString() : "—";

  const saveLabel = isSaved ? "Saved" : isSaving ? "Saving…" : "Save to Command Center";

  return (
<<<<<<< HEAD
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <CompanyAvatar name={shipper.title} size="md" className="shrink-0" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">{shipper.title}</h3>
          {shipper.address && <p className="mt-1 text-xs text-slate-500">{shipper.address}</p>}
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
            COUNTRY: {shipper.countryCode || "—"}
          </p>
=======
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-start gap-3">
        <CompanyAvatar name={shipper.title} size="md" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{shipper.title}</h3>
          {shipper.address && (
            <p className="mt-1 text-xs text-slate-500">{shipper.address}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
            {shipper.countryCode && <span>{shipper.countryCode}</span>}
            {shipper.type && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 normal-case">
                {shipper.type}
              </span>
            )}
          </div>
>>>>>>> 8dccf1fc (feat: LIT Search cards + ImportYeti modal)
        </div>
      </div>

      {/* KPI grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
<<<<<<< HEAD
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Shipments (12m)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{shipmentsLabel}</p>
=======
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5 text-indigo-500" />
            <span>Shipments (12m)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{totalShipmentsLabel}</p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
            <span>Last shipment</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {lastShipmentLabel}
          </p>
>>>>>>> 8dccf1fc (feat: LIT Search cards + ImportYeti modal)
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-indigo-500" />
            <span>Top route (12m)</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
            {topRouteLabel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Package className="h-3.5 w-3.5 text-indigo-500" />
            <span>TEUs (12m)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{teusLabel}</p>
        </div>
      </div>

<<<<<<< HEAD
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Top route</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 text-ellipsis whitespace-nowrap overflow-hidden">
            Top route data coming soon
          </p>
=======
      {/* Top suppliers */}
      {suppliers.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Top suppliers</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suppliers.map((supplier) => (
              <span
                key={supplier}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
              >
                {supplier}
              </span>
            ))}
          </div>
>>>>>>> 8dccf1fc (feat: LIT Search cards + ImportYeti modal)
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">TEUs (12m)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">—</p>
        </div>
      </div>

<<<<<<< HEAD
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave}
=======
      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row mt-auto">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave || isSaving}
>>>>>>> 8dccf1fc (feat: LIT Search cards + ImportYeti modal)
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex items-center justify-center rounded-full bg-indigo-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onViewDetails}
        >
          View details
        </button>
      </div>
    </div>
  );
}
