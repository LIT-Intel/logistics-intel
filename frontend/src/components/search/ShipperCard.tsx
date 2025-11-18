import CompanyAvatar from "@/components/CompanyAvatar";
import type { IyShipperHit } from "@/lib/api";

type ShipperCardProps = {
  shipper: IyShipperHit;
  onViewDetails?: () => void;
  onSave?: () => void;
};

export default function ShipperCard({ shipper, onViewDetails, onSave }: ShipperCardProps) {
  const shipmentsLabel =
    typeof shipper.totalShipments === "number" ? shipper.totalShipments.toLocaleString() : "—";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <CompanyAvatar name={shipper.title} size="md" className="shrink-0" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">{shipper.title}</h3>
          {shipper.address && <p className="mt-1 text-xs text-slate-500">{shipper.address}</p>}
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
            COUNTRY: {shipper.countryCode || "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Shipments (12m)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{shipmentsLabel}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Last shipment</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{shipper.mostRecentShipment || "—"}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Top route</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 text-ellipsis whitespace-nowrap overflow-hidden">
            Top route data coming soon
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">TEUs (12m)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">—</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave}
        >
          Save to Command Center
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
