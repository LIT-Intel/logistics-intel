import React from "react";
import { Calendar, MapPin, Package, Ship } from "lucide-react";
import type { IyShipperSearchRow } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";

type ShipperCardProps = {
  shipper: IyShipperSearchRow;
  onViewDetails: () => void;
  onSave: () => void;
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

function buildAddress(shipper: IyShipperSearchRow): string {
  if (shipper.address) return shipper.address;
  const parts = [shipper.city, shipper.state, shipper.postalCode, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Location unavailable";
}

function getInitials(name: string): string {
  const tokens = name.split(/\s+/).filter(Boolean);
  if (!tokens.length) return "?";
  if (tokens.length === 1) return tokens[0]!.charAt(0).toUpperCase();
  return `${tokens[0]!.charAt(0)}${tokens[1]!.charAt(0)}`.toUpperCase();
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

export default function ShipperCard({ shipper, onViewDetails, onSave }: ShipperCardProps) {
  const displayName = shipper.normalizedName ?? shipper.name ?? "ImportYeti shipper";
  const address = buildAddress(shipper);
  const flagEmoji = countryCodeToEmoji(shipper.countryCode);
  const logoSource = shipper.domain ?? shipper.website ?? shipper.name;
  const logoUrl = logoSource ? getCompanyLogoUrl(logoSource) : null;
  const initials = getInitials(displayName);

  const totalShipmentsLabel = formatNumber(shipper.totalShipments ?? shipper.shipmentsLast12m);
  const shipmentsLast12mLabel = formatNumber(shipper.shipmentsLast12m);
  const teusLast12mLabel = formatNumber(shipper.teusLast12m);
  const lastShipmentLabel = formatDate(shipper.lastShipmentDate);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-indigo-600 text-sm font-semibold text-white">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">{initials}</div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-900" title={displayName}>
              {displayName}
            </div>
            {flagEmoji && <span className="text-lg leading-none">{flagEmoji}</span>}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="truncate">{address}</span>
          </div>
          {shipper.primaryRouteSummary && (
            <div className="text-[11px] text-slate-500">
              Route:{" "}
              <span className="font-medium text-slate-700">{shipper.primaryRouteSummary}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Ship className="h-3 w-3 text-indigo-500" />
            <span>Total shipments</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{totalShipmentsLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Ship className="h-3 w-3 text-indigo-500" />
            <span>Shipments (12m)</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{shipmentsLast12mLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Package className="h-3 w-3 text-indigo-500" />
            <span>TEUs (12m)</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{teusLast12mLabel}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Calendar className="h-3 w-3 text-indigo-500" />
            <span>Last shipment</span>
          </div>
          <div className="mt-1 text-xs font-medium text-slate-900">{lastShipmentLabel}</div>
        </div>
      </div>

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
