import { CompanyAvatar } from "@/components/CompanyAvatar";
import type { IyShipperHit } from "@/lib/api";

type ShipperCardProps = {
  shipper: IyShipperHit;
  onViewDetails?: () => void;
  onSave?: () => void;
};

export default function ShipperCard({ shipper, onViewDetails, onSave }: ShipperCardProps) {
  const suppliers = Array.isArray(shipper.topSuppliers) ? shipper.topSuppliers.slice(0, 4) : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <CompanyAvatar name={shipper.title} size="md" className="shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{shipper.title}</h3>
          {shipper.address && <p className="mt-1 text-xs text-slate-500">{shipper.address}</p>}
          {shipper.countryCode && (
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">Country: {shipper.countryCode}</p>
          )}
          {shipper.type && (
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">Type: {shipper.type}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Total shipments</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {typeof shipper.totalShipments === "number" ? shipper.totalShipments.toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Last shipment</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{shipper.mostRecentShipment || "—"}</p>
        </div>
      </div>

      {suppliers.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Top suppliers</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suppliers.map((supplier) => (
              <span key={supplier} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                {supplier}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave}
        >
          Save to Command Center
        </button>
        <button
          type="button"
          onClick={onViewDetails}
          className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onViewDetails}
        >
          View details
        </button>
      </div>
    </div>
  );
}
