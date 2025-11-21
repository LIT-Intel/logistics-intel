import React from "react";
import { MapPin, Ship, Package, Calendar } from "lucide-react";
import type { IyShipperHit } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";

type ShipperCardProps = {
  shipper: IyShipperHit;
  onViewDetails: () => void;
  onSave: () => void;
};

type ExtendedShipperHit = IyShipperHit & {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;

  shipments_12m?: number | string | null;
  total_teus?: number | null;
  last_shipment_date?: string | null;

  top_route_12m?: string | null;
};

function safe(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

export default function ShipperCard({
  shipper,
  onViewDetails,
  onSave,
}: ShipperCardProps) {
  const extended = shipper as ExtendedShipperHit;
  const title = safe((shipper as any).title ?? "");

  const address = (() => {
    const parts = [
      extended.address_line_1,
      extended.address_line_2,
      extended.city,
      extended.state,
      extended.postal_code,
      extended.country,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    if (parts.length > 0) return safe(parts.join(", "));
    return safe((shipper as any).address);
  })();

  const shipmentsLabel = (() => {
    if (typeof extended.shipments_12m === "number") {
      return extended.shipments_12m.toLocaleString();
    }
    if (typeof (extended as any).totalShipments === "number") {
      return (extended as any).totalShipments.toLocaleString();
    }
    return safe(extended.shipments_12m ?? (shipper as any).totalShipments);
  })();

  const teusLabel = (() => {
    if (typeof extended.total_teus === "number") {
      return extended.total_teus.toLocaleString();
    }
    if (typeof (shipper as any).teus_12m === "number") {
      return (shipper as any).teus_12m.toLocaleString();
    }
    return "—";
  })();

  const lastShipmentLabel =
    safe(
      extended.last_shipment_date ??
        (shipper as any).last_shipment_date ??
        (shipper as any).most_recent_shipment,
    );

  const topRouteLabel =
    safe(
      extended.top_route_12m ??
        (shipper as any).top_route_12m ??
        (shipper as any).topRouteLast12m,
    );

  const logoUrl = getCompanyLogoUrl(
    (shipper as any).website ?? (shipper as any).domain ?? (shipper as any).title,
  );
  const initials = getInitials(title);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header: logo + name + location */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-indigo-600 text-xs font-semibold text-white">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900" title={title}>
            {title}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="truncate">{address}</span>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Ship className="h-3 w-3 text-indigo-500" />
            <span>Shipments (12m)</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {shipmentsLabel}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Package className="h-3 w-3 text-indigo-500" />
            <span>TEUs (12m)</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {teusLabel}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Calendar className="h-3 w-3 text-indigo-500" />
            <span>Last shipment</span>
          </div>
          <div className="mt-1 text-xs font-medium text-slate-900">
            {lastShipmentLabel}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <MapPin className="h-3 w-3 text-indigo-500" />
            <span>Top route (12m)</span>
          </div>
          <div className="mt-1 text-xs font-medium text-slate-900">
            {topRouteLabel || "Top route data coming…"}
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          className="w-1/2 rounded-full border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Save to Command Center
        </button>
        <button
          type="button"
          onClick={onViewDetails}
          className="w-1/2 rounded-full bg-slate-900 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          View details
        </button>
      </div>
    </div>
  );
}
