import React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Calendar,
  Globe,
  Loader2,
  MapPin,
} from "lucide-react";
import type { IyShipperHit } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";
import { CompanyAvatar } from "@/components/CompanyAvatar";

const formatNumber = (value: number | null | undefined) =>
  typeof value === "number" ? value.toLocaleString() : "—";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildAddress = (shipper: IyShipperHit) => {
  if (shipper.address) return shipper.address;
  const parts = [shipper.city, shipper.state, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Location unavailable";
};

const countryCodeToEmoji = (code?: string | null) => {
  if (!code) return null;
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const normalizeWebsite = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const href = /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const label = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return { href, label };
};

type Props = {
  shipper: IyShipperHit;
  onViewDetails?: (shipper: IyShipperHit) => void;
  isSaved?: boolean;
  onToggleSaved?: (shipper: IyShipperHit) => void;
  saving?: boolean;
};

export default function ShipperCard({
  shipper,
  onViewDetails,
  isSaved = false,
  onToggleSaved,
  saving = false,
}: Props) {
  const displayName = shipper.title || shipper.name || "LIT Search shipper";
  const flagEmoji = countryCodeToEmoji(shipper.countryCode);
  const address = buildAddress(shipper);
  const logoUrl = getCompanyLogoUrl(shipper.domain ?? shipper.website ?? undefined);
  const website = normalizeWebsite(shipper.website ?? shipper.domain ?? null);
  const topRoute =
    shipper.primaryRouteSummary ||
    (shipper as any).topRoute ||
    (shipper as any).mostRecentRoute ||
    "Route data available in profile";

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <CompanyAvatar
          name={displayName}
          logoUrl={logoUrl ?? undefined}
          className="rounded-full"
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900" title={displayName}>
              {displayName}
            </p>
            {flagEmoji && <span className="text-lg leading-none">{flagEmoji}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-slate-400" />
              <span className="truncate">{address}</span>
            </span>
            {website && (
              <a
                href={website.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <Globe className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{website.label}</span>
              </a>
            )}
          </div>
        </div>
        {onToggleSaved && (
          <button
            type="button"
            onClick={() => !saving && onToggleSaved(shipper)}
            className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={isSaved ? "Remove from saved" : "Save company"}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : isSaved ? (
              <BookmarkCheck className="h-4 w-4" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 text-xs md:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Total shipments</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatNumber(shipper.totalShipments ?? shipper.shipmentsLast12m)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
            <Calendar className="h-3 w-3 text-indigo-500" />
            <span>Most recent shipment</span>
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDate(shipper.lastShipmentDate ?? shipper.mostRecentShipment)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Top route</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 truncate" title={topRoute}>
            {topRoute || "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onViewDetails?.(shipper)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-900 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          View details
        </button>
      </div>
    </div>
  );
}
