import { CompanyAvatar } from "@/components/CompanyAvatar";
import type { IyShipperHit } from "@/lib/api";
import { Calendar, MapPin, Package, Target } from "lucide-react";
import { getCompanyLogoUrl } from "@/lib/logo";

function countryCodeToEmoji(countryCode?: string | null): string | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  if (cc.length !== 2) return null;

  const codePoints = Array.from(cc).map((ch) => 127397 + ch.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

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
  const countryCode =
    shipper.countryCode ??
    (shipper as any)?.country_code ??
    (shipper as any)?.country ??
    null;

  const website =
    shipper.website ??
    (shipper as any)?.company_website ??
    (shipper as any)?.website ??
    null;

  const domain =
    shipper.domain ??
    (shipper as any)?.domain ??
    (shipper as any)?.website ??
    undefined;
  const logoUrl = getCompanyLogoUrl(domain ?? null);

  const fallbackAddress = [
    shipper.address,
    (shipper as any)?.city,
    (shipper as any)?.state,
    (shipper as any)?.country,
  ]
    .filter((part) => typeof part === "string" && part.trim().length)
    .map((part) => String(part).trim());

  const displayAddress =
    shipper.address ??
    (fallbackAddress.length ? fallbackAddress.join(", ") : undefined);

  const suppliers = Array.isArray(shipper.topSuppliers)
    ? shipper.topSuppliers.slice(0, 4)
    : [];

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

  const saveLabel = isSaved
    ? "Saved"
    : isSaving
      ? "Saving…"
      : "Save to Command Center";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-start gap-3">
          <CompanyAvatar
            name={shipper.title}
            size="md"
            className="shrink-0"
            logoUrl={logoUrl}
          />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {shipper.title}
          </h3>
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              {countryCode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">
                  <span aria-hidden="true">
                    {countryCodeToEmoji(countryCode)}
                  </span>
                  <span>{countryCode}</span>
                </span>
              )}
                {displayAddress && <span className="truncate">{displayAddress}</span>}
            </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Target className="h-3.5 w-3.5 text-indigo-500" />
            <span>Shipments (12m)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {totalShipmentsLabel}
          </p>
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
            <span>Last shipment</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {lastShipmentLabel}
          </p>
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
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {teusLabel}
          </p>
        </div>
      </div>

      {/* Top suppliers */}
      {suppliers.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Top suppliers
          </p>
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
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 mt-auto flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!onSave || isSaving}
        >
          {saveLabel}
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
