import React from "react";
import { Calendar, Factory, MapPin } from "lucide-react";
import type { IyShipperHit } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";
import { CompanyAvatar } from "@/components/CompanyAvatar";

type Props = {
  shipper: IyShipperHit;
  onViewDetails?: (shipper: IyShipperHit) => void;
};

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildAddress(shipper: IyShipperHit): string {
  if (shipper.address) return shipper.address;
  const parts = [shipper.city, shipper.state, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Location unavailable";
}

function countryCodeToEmoji(code?: string | null): string | null {
  if (!code) return null;
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export default function ShipperCard({ shipper, onViewDetails }: Props) {
  const displayName = shipper.title || shipper.name || "ImportYeti shipper";
  const flagEmoji = countryCodeToEmoji(shipper.countryCode);
  const address = buildAddress(shipper);
  const logoUrl = getCompanyLogoUrl(shipper.domain ?? shipper.website ?? undefined);
  const supplierCount = shipper.topSuppliers?.length ?? 0;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <CompanyAvatar
          name={displayName}
          logoUrl={logoUrl ?? undefined}
          className="rounded-full"
          size="lg"
        />
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900" title={displayName}>
              {displayName}
            </p>
            {flagEmoji && <span className="text-lg leading-none">{flagEmoji}</span>}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="truncate">{address}</span>
          </div>
          {shipper.primaryRouteSummary && (
            <p className="text-[11px] text-slate-500">
              Lane: <span className="font-medium text-slate-700">{shipper.primaryRouteSummary}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Shipments (12m)</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatNumber(shipper.shipmentsLast12m)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Total shipments</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatNumber(shipper.totalShipments ?? shipper.shipmentsLast12m)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Top suppliers</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {supplierCount > 0 ? supplierCount : "—"}
          </p>
        </div>
        <div className="col-span-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Calendar className="h-3 w-3 text-indigo-500" />
            <span>Most recent shipment</span>
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDate(shipper.lastShipmentDate)}
          </p>
        </div>
        <div className="col-span-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Factory className="h-3 w-3 text-indigo-500" />
            <span>Est. spend</span>
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {shipper.estSpendLast12m ? `$${formatNumber(shipper.estSpendLast12m)}` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onViewDetails?.(shipper)}
          className="w-full rounded-full bg-slate-900 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          View details
        </button>
      </div>
    </div>
  );
}
