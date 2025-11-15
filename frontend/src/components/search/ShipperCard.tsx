import type { IyShipperHit } from "@/lib/api";

type ShipperCardProps = {
  data: IyShipperHit;
};

export default function ShipperCard({ data }: ShipperCardProps) {
  const suppliers = Array.isArray(data.topSuppliers) ? data.topSuppliers.slice(0, 3) : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{data.title}</h3>
        {data.address && <p className="mt-1 text-xs text-slate-500">{data.address}</p>}
        {data.countryCode && (
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
            Country: {data.countryCode}
          </p>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-400">Total shipments</dt>
          <dd className="font-semibold text-slate-900">
            {typeof data.totalShipments === "number" ? data.totalShipments.toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Last shipment</dt>
          <dd className="font-semibold text-slate-900">
            {data.mostRecentShipment || "—"}
          </dd>
        </div>
      </dl>

      {suppliers.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Top suppliers
          </p>
          <div className="flex flex-wrap gap-1">
            {suppliers.map((supplier) => (
              <span
                key={supplier}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
              >
                {supplier}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled
          title="Command Center wiring coming soon"
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 opacity-60"
        >
          Save to Command Center
        </button>
        <button
          type="button"
          disabled
          title="Shipment detail view coming soon"
          className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-60"
        >
          View shipments
        </button>
      </div>
    </div>
  );
}

